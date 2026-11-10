"use client";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { UnitDetail, UnitLayoutView } from "@places/contracts";
import { fillsUnitFolder } from "@places/domain";
import { Icon, Modal, Note, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useFields, useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { dateLocale } from "@/lib/format";
import { FolderUpload } from "./unit-photos";

type U = Pick<UnitDetail, "id" | "code" | "project" | "area">;
const when = (iso: string) => new Date(iso).toLocaleString(dateLocale(), { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });
const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "file").toUpperCase();

/**
 * 2.35 · the unit's «Layout file» folder (invwork.js unitFolder({kind:"layout"})): like Pic & Info, whoever sees the
 * unit opens it; a PDF shows in place, an image shows, a DWG downloads (the browser can't show it). The inventory's
 * editors and team upload, replace and remove. The API decides; the buttons follow.
 */
export function UnitLayoutFolder({ u, label }: { u: U; label?: ReactNode }) {
  const t = useTranslations("inventory.layout");
  const [open, setOpen] = useState(false);
  return <span onClick={(e) => e.stopPropagation()}>
    {label ? <button className="lnk" title={t("folderTitle")} onClick={() => setOpen(true)}>{label}</button>
      : <button className="btn ghost" onClick={() => setOpen(true)}><Icon name="file" />{t("folderButton")}</button>}
    {open && <Modal title={t("modalTitle", { code: u.code })} onClose={() => setOpen(false)}><Folder u={u} /></Modal>}
  </span>;
}

function Folder({ u }: { u: U }) {
  const t = useTranslations("inventory.layout");
  const qc = useQueryClient();
  const run = useAction();
  const toast = useToast();
  const { me, can } = useMe();
  const fields = useFields("inventory");
  const up = !!me && fillsUnitFolder(me.roles, { can }) && fields.edits("layout");
  const base = `/inventory/units/${u.id}/layout`;
  const files = useQuery({ queryKey: ["unit-layout", u.id], queryFn: () => api.get<UnitLayoutView[]>(base) }).data ?? [];
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["unit-layout", u.id] }), qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["unit"] })]);
  const remove = (f: UnitLayoutView) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    void run(async () => { await api.del(`${base}/${f.id}`); await refresh(); }, t("deleted", { name: f.name }));
  };

  return <>
    <div className="row">
      <span className="hint">{u.project} · {serverText(u.area)} · {t("files", { count: files.length })}</span><span className="spacer" />
      {!!files.length && <a className="btn ghost" href={`/api/v1${base}/zip`} download><Icon name="download" />{t("zip")}</a>}
      {up && <FolderUpload layout left={20} label={<><Icon name="upload" />{t("upload")}</>}
        onDone={(ids) => run(async () => { await api.post(base, { fileIds: ids }); await refresh(); }, t("uploaded", { count: ids.length, code: u.code }))} />}
    </div>
    {files.length ? (
      <div className="ufolder layout">
        {files.map((f) => {
          const preview = f.kind === "image" ? <img src={f.url} alt={f.name} loading="lazy" />
            : f.kind === "pdf" ? <object className="uf-pdf" data={`${f.url}#toolbar=0&navpanes=0&view=Fit`} type="application/pdf" aria-label={f.name}><span className="uf-doc"><Icon name="file" />PDF</span></object>
            : <span className="uf-doc"><Icon name="file" />{extOf(f.name)}</span>;
          return <figure className="uf" key={f.id}>
            {f.kind === "drawing" ? preview : <a href={f.url} target="_blank" rel="noopener noreferrer" title={t("view")}>{preview}</a>}
            <figcaption>
              <span>{f.name}</span>
              <small>{when(f.at)}{f.by ? ` · ${f.by}` : ""}{f.kind === "drawing" ? ` · ${t("dwg")}` : ""}</small>
              {f.kind !== "drawing" && <a className="uf-dl" href={f.url} target="_blank" rel="noopener noreferrer"><Icon name="file" />{t("view")}</a>}
              <a className="uf-dl" href={f.download} download={f.name}><Icon name="download" />{t("download")}</a>
              {up && <FolderUpload layout left={1} className="uf-dl uf-rep" label={<><Icon name="swap" />{t("replace")}</>}
                onDone={([id]) => run(async () => { const now = await api.put<UnitLayoutView[]>(`${base}/${f.id}`, { fileId: id }); await refresh(); toast(t("replaced", { old: f.name, name: now.find((x) => x.id === id)?.name ?? "" })); })} />}
            </figcaption>
            {up && <button className="uf-del" aria-label={t("delete", { name: f.name })} onClick={() => remove(f)}><Icon name="x" /></button>}
          </figure>;
        })}
      </div>
    ) : (
      <div className="ufolder empty"><Icon name="folder" /><b>{t("empty")}</b><span className="hint">{up ? t("emptyUp") : t("emptyView")}</span></div>
    )}
    <Note>{t("note")}</Note>
  </>;
}
