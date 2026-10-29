import { z } from "zod";

const MB = 1024 * 1024;
/** What can be uploaded, and how big (0.9): photos for units and IDs, PDFs for contracts and receipts. */
export const FILE_KINDS = {
  image: { mimes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10 * MB, label: "الصورة", max: "10 ميجا" },
  pdf: { mimes: ["application/pdf"], maxBytes: 20 * MB, label: "الملف", max: "20 ميجا" },
} as const;
export type FileKind = keyof typeof FILE_KINDS;
export const fileKind = (mime: string): FileKind | undefined =>
  (Object.keys(FILE_KINDS) as FileKind[]).find((k) => (FILE_KINDS[k].mimes as readonly string[]).includes(mime));

/** Checked before any upload link is handed out; the size and type are checked again once the file is in storage. */
export const UploadRequest = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.string(),
  size: z.number().int().positive(),
}).superRefine((f, ctx) => {
  const kind = fileKind(f.mime);
  if (!kind) return ctx.addIssue({ code: "custom", path: ["mime"], message: "نوع الملف مش مسموح · صور jpg/png/webp أو PDF" });
  if (f.size > FILE_KINDS[kind].maxBytes) ctx.addIssue({ code: "custom", path: ["size"], message: `${FILE_KINDS[kind].label} أكبر من ${FILE_KINDS[kind].max}` });
});
export type UploadRequest = z.infer<typeof UploadRequest>;

/** The browser PUTs the bytes to `url` with exactly these headers, then calls complete. */
export interface UploadTicket { id: string; url: string; headers: Record<string, string>; expiresIn: number }
export interface StoredFile { id: string; name: string; mime: string; size: number; status: "PENDING" | "READY" | "REJECTED"; createdAt: string }
