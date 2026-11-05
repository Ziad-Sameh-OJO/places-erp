"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoredFile, UnitDetail, UnitPhotoView } from "@places/contracts";
import { fillsUnitFolder } from "@places/domain";
import { FileUpload } from "@/components/file-upload";
import { Chip, Icon, Modal, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";

const usePhotos = (unitId: string) => useQuery({ queryKey: ["unit-photos", unitId], queryFn: () => api.get<UnitPhotoView[]>(`/inventory/units/${unitId}/photos`) });
const when = (iso: string) => new Date(iso).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });

/**
 * 2.4 · 2.22 · «Pic & Info»: the unit's folder on its page instead of the Drive (M-03 1.2). Everyone who sees the unit
 * opens it, a file full size or downloaded, or the whole folder as one ZIP; Manar, Randa and the inventory team add,
 * order and remove. The first photo is the main one (the card, the PDF's cover). The API decides; the buttons follow.
 */
export function UnitFolder({ u }: { u: Pick<UnitDetail, "id" | "code" | "project" | "area"> }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="btn ghost" onClick={() => setOpen(true)}><Icon name="folder" />فولدر الصور (Pic & Info)</button>
    {open && <Modal title={`فولدر ${u.code} · Pic & Info`} onClose={() => setOpen(false)}><Folder u={u} /></Modal>}
  </>;
}

function Folder({ u }: { u: Pick<UnitDetail, "id" | "code" | "project" | "area"> }) {
  const qc = useQueryClient();
  const run = useAction();
  const { me, can } = useMe();
  const up = !!me && fillsUnitFolder(me.roles, { can });
  const photos = usePhotos(u.id).data ?? [];
  const base = `/inventory/units/${u.id}/photos`;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["unit-photos", u.id] }), qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["unit"] })]);
  const add = (f: StoredFile) => void run(async () => { await api.post(base, { fileIds: [f.id] }); await refresh(); }, `اترفع ملف في فولدر ${u.code} · الـ PDF مستني Confirm`);
  const order = (ids: string[], ok: string) => void run(async () => { await api.put(`${base}/order`, { fileIds: ids }); await refresh(); }, ok);
  const move = (i: number, by: number) => {
    const ids = photos.map((p) => p.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    order(ids, "الترتيب اتحفظ");
  };
  const main = (i: number) => order([photos[i]!.id, ...photos.filter((_, j) => j !== i).map((p) => p.id)], "بقت الصورة الرئيسية");
  const remove = (p: UnitPhotoView) => {
    if (!window.confirm("تمسح الملف ده من فولدر الوحدة؟")) return;
    void run(async () => { await api.del(`${base}/${p.id}`); await refresh(); }, "الملف اتمسح");
  };

  return <>
    <div className="row">
      <span className="hint">{u.project} · {u.area} · {photos.length} ملف</span><span className="spacer" />
      {/* the API streams it with its name (<code> - Pic & Info.zip) and audits the download */}
      {!!photos.length && <a className="btn ghost" href={`/api/v1${base}/zip`} download><Icon name="download" />نزّل الفولدر كله (ZIP)</a>}
    </div>
    {photos.length ? (
      <div className="ufolder">
        {photos.map((p, i) => (
          <figure className="uf" key={p.id}>
            <a href={p.url} target="_blank" rel="noopener noreferrer" title="افتح"><img src={p.url} alt={p.name} loading="lazy" /></a>
            {p.main && <Chip tone="ok">الرئيسية</Chip>}
            <figcaption>
              <span>{p.name}</span>
              <small>{when(p.at)}{p.by ? ` · ${p.by}` : ""}</small>
              <a className="uf-dl" href={p.download} download={p.name}><Icon name="download" />تحميل</a>
              {up && (
                <div className="row">
                  <button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)}>قدّم</button>
                  <button className="btn ghost sm" disabled={i === photos.length - 1} onClick={() => move(i, 1)}>أخّر</button>
                  {!p.main && <button className="btn ghost sm" onClick={() => main(i)}>خليها الرئيسية</button>}
                </div>
              )}
            </figcaption>
            {up && <button className="uf-del" aria-label={`امسح ${p.name}`} onClick={() => remove(p)}><Icon name="x" /></button>}
          </figure>
        ))}
      </div>
    ) : (
      <div className="ufolder empty"><Icon name="folder" /><b>الفولدر فاضي</b><span className="hint">{up ? "ارفع كل صور الوحدة هنا." : "لسه محدش رفع صور للوحدة دي."}</span></div>
    )}
    {up && <FileUpload kind="image" label="ارفع صور" onUploaded={add} />}
    <Note>الصور دي بتتشاف من خانة Pic & Info في الشيت ومن صفحة الوحدة، ومنها بيتعمل الـ PDF والـ slide (أول صورة هي الغلاف). أول رفع بيتسجّل وقته وبيتحسب في «رفع الصور خلال 24 ساعة».</Note>
  </>;
}
