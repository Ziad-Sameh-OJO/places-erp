"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadRequest, type PostMedia, type StoredFile, type UploadTicket } from "@places/contracts";
import { Icon, useAction } from "@/components/ui";
import { put } from "@/components/file-upload";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";

/**
 * 4.21 · uploads a post's images / videos straight to storage (purpose "post" allows a video) and adds them to it.
 * Anything that isn't an image or a video is refused before any upload.
 */
export async function uploadPostMedia(postId: string, files: File[], onlyMedia: string): Promise<number> {
  const list = files.filter((f) => f.size);
  if (!list.length) return 0;
  if (list.some((f) => !/^(image|video)\//.test(f.type))) throw new Error(onlyMedia);
  const ids: string[] = [];
  for (const file of list) {
    const req = { name: file.name, mime: file.type, size: file.size, purpose: "post" as const };
    const check = UploadRequest.safeParse(req);
    if (!check.success) throw new Error(check.error.issues[0]!.message);
    const t = await api.post<UploadTicket>("/files/uploads", req);
    await put(t, file, () => undefined);
    ids.push((await api.post<StoredFile>(`/files/${t.id}/complete`)).id);
  }
  await api.post(`/marketing/posts/${postId}/media`, { fileIds: ids });
  return ids.length;
}

/** The demo's «التصميم / الفيديو» in the post (marketing.js `postOpen`): tiles, the video plays in place, download, delete, add. */
export function PostMediaFolder({ postId }: { postId: string }) {
  const t = useTranslations("marketing.content.media");
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const media = useQuery({ queryKey: ["post-media", postId], queryFn: () => api.get<PostMedia[]>(`/marketing/posts/${postId}/media`) });
  const list = media.data ?? [];
  const up = can("marketing", "create");
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["post-media", postId] }), qc.invalidateQueries({ queryKey: ["posts"] })]);
  const add = (files: FileList | null) => {
    const picked = [...(files ?? [])];
    if (!picked.length) return;
    setBusy(true);
    void run(async () => { const n = await uploadPostMedia(postId, picked, t("onlyMedia")); await refresh(); return n; }, t("uploaded", { n: picked.length })).finally(() => setBusy(false));
  };
  const remove = (f: PostMedia) => { if (confirm(t("confirmDel"))) void run(async () => { await api.del(`/marketing/posts/${postId}/media/${f.id}`); await refresh(); }, t("deleted")); };
  return (
    <>
      <div className="row">
        <b>{t("title")}</b><span className="hint">{t("count", { n: list.length })}</span><span className="spacer" />
        {up && (
          <label className={`btn ghost sm ${busy ? "disabled" : ""}`}><Icon name="upload" />{t("add")}
            <input type="file" multiple accept="image/*,video/*" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {list.length ? (
        <div className="ufolder">
          {list.map((f) => (
            <figure key={f.id} className="uf">
              {f.mime.startsWith("video/") ? <video src={f.url ?? undefined} controls preload="metadata" /> : <a href={f.url ?? undefined} target="_blank" rel="noopener noreferrer"><img src={f.url ?? undefined} alt={f.name} /></a>}
              <figcaption>
                <span>{f.name}</span><small>{day(f.at)} · {f.by}</small>
                {f.download && <a className="uf-dl" href={f.download} download={f.name}><Icon name="download" />{t("download")}</a>}
              </figcaption>
              {up && <button className="uf-del" aria-label={t("deleteLabel", { name: f.name })} onClick={() => remove(f)}><Icon name="x" /></button>}
            </figure>
          ))}
        </div>
      ) : (
        <div className="ufolder empty"><Icon name="image" /><b>{t("empty")}</b>{up && <span className="hint">{t("emptyUp")}</span>}</div>
      )}
    </>
  );
}
