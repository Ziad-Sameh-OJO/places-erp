"use client";
import { useEffect, useState } from "react";
import { FILE_KINDS, UploadRequest, type FileKind, type StoredFile, type UploadTicket } from "@places/contracts";
import { api } from "@/lib/api";
import { Icon, useToast } from "@/components/ui";

/** PUT straight to storage with progress (fetch has no upload progress, XHR does). */
function put(t: UploadTicket, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((ok, fail) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", t.url);
    for (const [k, v] of Object.entries(t.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? ok() : fail(new Error("الرفع فشل · جرّب تاني")));
    xhr.onerror = () => fail(new Error("مفيش اتصال بمكان التخزين"));
    xhr.send(file);
  });
}

/**
 * Pick → preview → progress bar → done. The file goes straight to storage with a short link from the API, which checks
 * the type and size before (here and on the server) and after the upload.
 */
export function FileUpload({ kind, label, onUploaded }: { kind: FileKind; label?: string; onUploaded?: (f: StoredFile) => void }) {
  const toast = useToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [done, setDone] = useState<StoredFile | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const req = { name: file.name, mime: file.type, size: file.size };
    const check = UploadRequest.safeParse(req);
    if (!check.success || !(FILE_KINDS[kind].mimes as readonly string[]).includes(file.type)) {
      return toast(check.success ? `لازم ${FILE_KINDS[kind].label === "الصورة" ? "صورة" : "PDF"}` : check.error.issues[0]!.message);
    }
    setDone(null);
    setPreview(kind === "image" ? URL.createObjectURL(file) : null);
    setPct(0);
    try {
      const t = await api.post<UploadTicket>("/files/uploads", req);
      await put(t, file, setPct);
      const f = await api.post<StoredFile>(`/files/${t.id}/complete`);
      setDone(f);
      onUploaded?.(f);
    } catch (e) {
      toast(e instanceof Error ? e.message : "الرفع فشل");
    } finally {
      setPct(null);
    }
  };

  return (
    <div className="upload">
      <label className="btn ghost">
        <Icon name={kind === "image" ? "camera" : "file"} />{label ?? (kind === "image" ? "ارفع صورة" : "ارفع PDF")}
        <input type="file" hidden accept={FILE_KINDS[kind].mimes.join(",")} disabled={pct !== null} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <span className="hint">لحد {FILE_KINDS[kind].max}</span>
      {preview && <img src={preview} alt="" style={{ display: "block", maxWidth: 220, maxHeight: 160, borderRadius: 10, marginTop: 10, objectFit: "cover" }} />}
      {pct !== null && <div className="bar" role="progressbar" aria-valuenow={pct} aria-label="الرفع" style={{ marginTop: 10 }}><i style={{ width: `${pct}%` }} /></div>}
      {done && <p className="hint"><Icon name="check" /> اترفع · {done.name}</p>}
    </div>
  );
}
