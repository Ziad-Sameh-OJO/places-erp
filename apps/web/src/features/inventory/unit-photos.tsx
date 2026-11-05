"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoredFile, UnitPhotoView } from "@places/contracts";
import { FileUpload } from "@/components/file-upload";
import { Chip, Icon, useAction } from "@/components/ui";
import { api } from "@/lib/api";

const usePhotos = (unitId: string) => useQuery({ queryKey: ["unit-photos", unitId], queryFn: () => api.get<UnitPhotoView[]>(`/inventory/units/${unitId}/photos`) });

/**
 * 2.4 · «Pic or info»: the unit's photos on its page instead of the Drive (M-03 1.2). The first one is the main photo
 * (the card). Manar and Randa add, order and remove; everyone who sees the unit sees them (the API decides).
 */
export function UnitPhotos({ unitId, editable }: { unitId: string; editable: boolean }) {
  const qc = useQueryClient();
  const run = useAction();
  const photos = usePhotos(unitId).data ?? [];
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["unit-photos", unitId] }), qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["unit"] })]);
  const add = (f: StoredFile) => void run(async () => { await api.post(`/inventory/units/${unitId}/photos`, { fileIds: [f.id] }); await refresh(); }, "الصورة اتضافت للوحدة");
  const order = (ids: string[], ok: string) => void run(async () => { await api.put(`/inventory/units/${unitId}/photos/order`, { fileIds: ids }); await refresh(); }, ok);
  const move = (i: number, by: number) => {
    const ids = photos.map((p) => p.id);
    [ids[i], ids[i + by]] = [ids[i + by]!, ids[i]!];
    order(ids, "الترتيب اتحفظ");
  };
  const main = (i: number) => order([photos[i]!.id, ...photos.filter((_, j) => j !== i).map((p) => p.id)], "بقت الصورة الرئيسية");
  const remove = (p: UnitPhotoView) => {
    if (!window.confirm(`تشيل «${p.name}» من صور الوحدة؟`)) return;
    void run(async () => { await api.del(`/inventory/units/${unitId}/photos/${p.id}`); await refresh(); }, "الصورة اتشالت");
  };

  if (!photos.length && !editable) return null;
  return (
    <section className="card flat">
      <div className="row"><b>الصور</b><span className="hint">{photos.length ? "الأولى هي الصورة الرئيسية" : "مفيش صور لسه"}</span></div>
      {!!photos.length && (
        <div className="photo-grid">
          {photos.map((p, i) => (
            <figure key={p.id}>
              <a href={p.url} target="_blank" rel="noopener noreferrer"><img src={p.url} alt={p.name} loading="lazy" /></a>
              {p.main && <Chip tone="ok">الرئيسية</Chip>}
              {editable && (
                <figcaption className="row">
                  <button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)}>قدّم</button>
                  <button className="btn ghost sm" disabled={i === photos.length - 1} onClick={() => move(i, 1)}>أخّر</button>
                  {!p.main && <button className="btn ghost sm" onClick={() => main(i)}>خليها الرئيسية</button>}
                  <button className="btn ghost sm" title="امسح" aria-label="امسح الصورة" onClick={() => remove(p)}><Icon name="x" /></button>
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      {editable && <FileUpload kind="image" label="ضيف صور (ترفع على السيستم)" onUploaded={add} />}
    </section>
  );
}
