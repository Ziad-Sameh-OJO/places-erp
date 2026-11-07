"use client";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { FILE_KINDS, UploadRequest, type StoredFile, type UnitDetail, type UnitPhotoView, type UploadTicket } from "@places/contracts";
import { MAX_UNIT_PHOTOS, fillsUnitFolder } from "@places/domain";
import { put } from "@/components/file-upload";
import { Chip, Icon, Modal, Note, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { dateLocale } from "@/lib/format";

const usePhotos = (unitId: string) => useQuery({ queryKey: ["unit-photos", unitId], queryFn: () => api.get<UnitPhotoView[]>(`/inventory/units/${unitId}/photos`) });
const when = (iso: string) => new Date(iso).toLocaleString(dateLocale(), { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });

/**
 * 2.4 · 2.22 · «Pic & Info»: the unit's folder on its page instead of the Drive (M-03 1.2). Everyone who sees the unit
 * opens it, a file full size or downloaded, or the whole folder as one ZIP; Manar, Randa and the inventory team add,
 * order and remove. The first photo is the main one (the card, the PDF's cover). The API decides; the buttons follow.
 */
export function UnitFolder({ u, label }: { u: Pick<UnitDetail, "id" | "code" | "project" | "area">; label?: ReactNode }) {
  const t = useTranslations("inventory.photos");
  const [open, setOpen] = useState(false);
  // inside a sheet row: opening (and using) the folder isn't a click on the row
  return <span onClick={(e) => e.stopPropagation()}>
    {label ? <button className="lnk" title={t("folderTitle")} onClick={() => setOpen(true)}>{label}</button>
      : <button className="btn ghost" onClick={() => setOpen(true)}><Icon name="folder" />{t("folderButton")}</button>}
    {open && <Modal title={t("modalTitle", { code: u.code })} onClose={() => setOpen(false)}><Folder u={u} /></Modal>}
  </span>;
}

function Folder({ u }: { u: Pick<UnitDetail, "id" | "code" | "project" | "area"> }) {
  const t = useTranslations("inventory.photos");
  const qc = useQueryClient();
  const run = useAction();
  const { me, can } = useMe();
  const up = !!me && fillsUnitFolder(me.roles, { can });
  const photos = usePhotos(u.id).data ?? [];
  const base = `/inventory/units/${u.id}/photos`;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["unit-photos", u.id] }), qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["unit"] })]);
  const order = (ids: string[], ok: string) => void run(async () => { await api.put(`${base}/order`, { fileIds: ids }); await refresh(); }, ok);
  const move = (i: number, by: number) => {
    const ids = photos.map((p) => p.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    order(ids, t("ordered"));
  };
  const main = (i: number) => order([photos[i]!.id, ...photos.filter((_, j) => j !== i).map((p) => p.id)], t("madeMain"));
  const remove = (p: UnitPhotoView) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    void run(async () => { await api.del(`${base}/${p.id}`); await refresh(); }, t("deleted"));
  };

  return <>
    <div className="row">
      <span className="hint">{u.project} · {u.area} · {t("files", { count: photos.length })}</span><span className="spacer" />
      {/* the API streams it with its name (<code> - Pic & Info.zip) and audits the download */}
      {!!photos.length && <a className="btn ghost" href={`/api/v1${base}/zip`} download><Icon name="download" />{t("zip")}</a>}
      {up && <FolderUpload left={MAX_UNIT_PHOTOS - photos.length} onDone={(ids) => run(async () => { await api.post(base, { fileIds: ids }); await refresh(); }, t("uploaded", { count: ids.length, code: u.code }))} />}
    </div>
    {photos.length ? (
      <div className="ufolder">
        {photos.map((p, i) => (
          <figure className="uf" key={p.id}>
            <a href={p.url} target="_blank" rel="noopener noreferrer" title={t("open")}>{p.pdf ? <span className="uf-doc"><Icon name="file" />PDF</span> : <img src={p.url} alt={p.name} loading="lazy" />}</a>
            {p.main && <Chip tone="ok">{t("main")}</Chip>}
            <figcaption>
              <span>{p.name}</span>
              <small>{when(p.at)}{p.by ? ` · ${p.by}` : ""}</small>
              <a className="uf-dl" href={p.download} download={p.name}><Icon name="download" />{t("download")}</a>
              {up && (
                <div className="uf-acts">
                  <button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)}>{t("up")}</button>
                  <button className="btn ghost sm" disabled={i === photos.length - 1} onClick={() => move(i, 1)}>{t("down")}</button>
                  {!p.main && !p.pdf && <button className="lnk" onClick={() => main(i)}>{t("makeMain")}</button>}
                </div>
              )}
            </figcaption>
            {up && <button className="uf-del" aria-label={t("delete", { name: p.name })} onClick={() => remove(p)}><Icon name="x" /></button>}
          </figure>
        ))}
      </div>
    ) : (
      <div className="ufolder empty"><Icon name="folder" /><b>{t("empty")}</b><span className="hint">{up ? t("emptyUp") : t("emptyView")}</span></div>
    )}
    <Note>{t("note")}</Note>
  </>;
}

/**
 * The demo's one «ارفع صور / PDF» (invwork.js): several photos and PDFs at once, each straight to storage (like
 * FileUpload), then added to the folder together. A file that fails its check is skipped with a message; the rest go up.
 */
function FolderUpload({ left, onDone }: { left: number; onDone: (ids: string[]) => Promise<void> }) {
  const t = useTranslations("inventory.photos");
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const pick = async (files: File[]) => {
    if (files.length > left) return toast(t("tooMany", { max: MAX_UNIT_PHOTOS, left }), "bad");
    const ids: string[] = [];
    for (const [i, file] of files.entries()) {
      const req = { name: file.name, mime: file.type, size: file.size };
      const check = UploadRequest.safeParse(req);
      if (!check.success) { toast(`${file.name}: ${serverText(check.error.issues[0]!.message)}`, "bad"); continue; }
      try {
        const ticket = await api.post<UploadTicket>("/files/uploads", req);
        await put(ticket, file, (pct) => setBusy(t("uploading", { at: i + 1, of: files.length, pct })));
        const f = await api.post<StoredFile>(`/files/${ticket.id}/complete`);
        if (f.status === "READY") ids.push(f.id); else toast(`${file.name}: ${t("broken")}`, "bad");
      } catch (e) {
        toast(`${file.name}: ${e instanceof Error ? e.message : t("failed")}`, "bad");
      }
    }
    setBusy(null);
    if (ids.length) await onDone(ids);
  };
  return <label className={`btn${busy ? " disabled" : ""}`} title={t("limits", { image: serverText(FILE_KINDS.image.max), pdf: serverText(FILE_KINDS.pdf.max) })}>
    <Icon name="upload" />{busy ?? t("upload")}
    <input type="file" multiple hidden accept={[...FILE_KINDS.image.mimes, ...FILE_KINDS.pdf.mimes].join(",")} disabled={!!busy}
      onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; void pick(fs); }} />
  </label>;
}
