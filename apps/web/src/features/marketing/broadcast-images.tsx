"use client";
import { useEffect, useMemo, useState } from "react";
import { BROADCAST_MAX_IMAGES, UploadRequest, type BroadcastImage, type StoredFile, type UploadTicket } from "@places/contracts";
import { Icon } from "@/components/ui";
import { put } from "@/components/file-upload";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";

/** Uploads the picked images straight to storage and returns their file ids, for the Broadcast to take (M-04 2.1 step 7). */
export async function uploadBroadcastImages(files: File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    const req = { name: file.name, mime: file.type, size: file.size };
    const check = UploadRequest.safeParse(req);
    if (!check.success) throw new Error(check.error.issues[0]!.message);
    const t = await api.post<UploadTicket>("/files/uploads", req);
    await put(t, file, () => undefined);
    ids.push((await api.post<StoredFile>(`/files/${t.id}/complete`)).id);
  }
  return ids;
}

/** «الصور» in the new Broadcast: drop or pick images (previews before sending), remove any; uploaded on «ابعت للسيلز». */
export function BroadcastImagePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const t = useTranslations("marketing.broadcast.new.images");
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    const picked = [...(list ?? [])].filter((f) => f.size);
    if (!picked.length) return;
    const images = picked.filter((f) => f.type.startsWith("image/"));
    const room = BROADCAST_MAX_IMAGES - files.length;
    setError(images.length < picked.length ? t("onlyImages") : images.length > room ? t("max", { n: BROADCAST_MAX_IMAGES }) : "");
    onChange([...files, ...images.slice(0, Math.max(0, room))]);
  };

  return (
    <div className="bc-images">
      {files.length > 0 && (
        <div className="bc-grid">
          {files.map((f, i) => (
            <figure key={`${f.name}-${i}`} className="bc-img">
              <img src={previews[i]} alt={f.name} />
              <button type="button" className="bc-del" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={t("remove", { name: f.name })}><Icon name="x" /></button>
            </figure>
          ))}
        </div>
      )}
      {files.length < BROADCAST_MAX_IMAGES && (
        <label className={`bc-drop ${over ? "over" : ""} ${files.length ? "slim" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
          <Icon name="upload" />
          <b>{files.length ? t("more") : t("drop")}</b>
          <small>{t("hint", { n: BROADCAST_MAX_IMAGES })}</small>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </label>
      )}
      {error && <span className="hint bad">{error}</span>}
    </div>
  );
}

/** A sent Broadcast's images: thumbnails that open full size, with a save link for the salesperson to send them on. */
export function BroadcastImages({ images, sm, save }: { images: BroadcastImage[]; sm?: boolean; save?: string }) {
  if (!images.length) return null;
  return (
    <div className={`bc-thumbs ${sm ? "sm" : ""}`}>
      {images.map((im) => (
        <figure key={im.id} className="bc-thumb">
          <a href={im.url ?? undefined} target="_blank" rel="noopener noreferrer">{im.url ? <img src={im.url} alt={im.name} loading="lazy" /> : <Icon name="image" />}</a>
          {save && im.download && <a className="bc-save" href={im.download} download={im.name}><Icon name="download" />{save}</a>}
        </figure>
      ))}
    </div>
  );
}
