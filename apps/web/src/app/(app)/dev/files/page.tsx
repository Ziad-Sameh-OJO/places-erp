"use client";
import { useState } from "react";
import { notFound } from "next/navigation";
import type { StoredFile } from "@places/contracts";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";

/** Dev only: try the upload component end to end (upload, then show it back from storage). */
export default function DevFiles() {
  const [shown, setShown] = useState<{ f: StoredFile; url: string }[]>([]);
  if (process.env.NODE_ENV === "production") notFound();
  const add = async (f: StoredFile) => {
    const { url } = await api.get<{ url: string }>(`/files/${f.id}/url`);
    setShown((s) => [{ f, url }, ...s]);
  };
  return (
    <div className="cols">
      <Card title="رفع صورة" icon="camera" sub="jpg / png / webp لحد 10 ميجا"><FileUpload kind="image" onUploaded={add} /></Card>
      <Card title="رفع PDF" icon="file" sub="لحد 20 ميجا"><FileUpload kind="pdf" onUploaded={add} /></Card>
      <Card title="من التخزين" icon="image" sub="رابط تحميل قصير العمر من الـ API">
        {shown.length === 0 && <p className="hint">ارفع حاجة الأول</p>}
        {shown.map(({ f, url }) => f.mime.startsWith("image/")
          ? <img key={f.id} src={url} alt={f.name} style={{ maxWidth: "100%", borderRadius: 10, marginBottom: 8 }} />
          : <p key={f.id}><a href={url} target="_blank" rel="noreferrer">{f.name}</a></p>)}
      </Card>
    </div>
  );
}
