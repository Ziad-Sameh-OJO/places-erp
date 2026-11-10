import { z } from "zod";

const MB = 1024 * 1024;
/** What can be uploaded, and how big (0.9): photos for units and IDs, PDFs for contracts and receipts. */
export const FILE_KINDS = {
  image: { mimes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 10 * MB, label: "الصورة", max: "10 ميجا" },
  pdf: { mimes: ["application/pdf"], maxBytes: 20 * MB, label: "الملف", max: "20 ميجا" },
  /** 2.35 · AutoCAD drawings, for a unit's Layout file folder only (`folder: "layout"`) */
  drawing: { mimes: ["image/vnd.dwg", "image/vnd.dxf"], maxBytes: 50 * MB, label: "ملف الـ DWG", max: "50 ميجا" },
  // 4.21 · a Content plan post's video (mp4 / mov): only with `purpose: "post"`, and only a post takes it (FilesService.attach)
  video: { mimes: ["video/mp4", "video/quicktime"], maxBytes: 200 * MB, label: "الفيديو", max: "200 ميجا" },
} as const;
export type FileKind = keyof typeof FILE_KINDS;
export const fileKind = (mime: string): FileKind | undefined =>
  (Object.keys(FILE_KINDS) as FileKind[]).find((k) => (FILE_KINDS[k].mimes as readonly string[]).includes(mime));
/** Browsers give a DWG / DXF no type (or octet-stream): it's named by its extension. */
export const uploadMime = (name: string, type: string): string =>
  /\.dwg$/i.test(name) ? "image/vnd.dwg" : /\.dxf$/i.test(name) ? "image/vnd.dxf" : type;

/** Checked before any upload link is handed out; the size and type are checked again once the file is in storage. */
export const UploadRequest = z.object({
  name: z.string().trim().min(1, "اسم الملف ناقص").max(200, "اسم الملف طويل"),
  mime: z.string(),
  size: z.number({ invalid_type_error: "حجم الملف ناقص" }).int().positive("الملف فاضي"),
  /** 2.35 · the only place a DWG / DXF may go */
  folder: z.literal("layout").optional(),
  /** what it's for: "post" also allows a video (4.21) */
  purpose: z.enum(["post"]).optional(),
}).superRefine((f, ctx) => {
  const kind = fileKind(f.mime);
  if (kind === "video" && f.purpose !== "post") return ctx.addIssue({ code: "custom", path: ["mime"], message: "نوع الملف مش مسموح · صور jpg/png/webp أو PDF" });
  if (!kind) return ctx.addIssue({ code: "custom", path: ["mime"], message: "نوع الملف مش مسموح · صور jpg/png/webp أو PDF" });
  if (kind === "drawing" && f.folder !== "layout") return ctx.addIssue({ code: "custom", path: ["mime"], message: "ملفات الـ DWG / DXF لفولدر الـ Layout بس" });
  if (f.size > FILE_KINDS[kind].maxBytes) ctx.addIssue({ code: "custom", path: ["size"], message: `${FILE_KINDS[kind].label} أكبر من ${FILE_KINDS[kind].max}` });
});
export type UploadRequest = z.infer<typeof UploadRequest>;

/** The browser PUTs the bytes to `url` with exactly these headers, then calls complete. */
export interface UploadTicket { id: string; url: string; headers: Record<string, string>; expiresIn: number }
export interface StoredFile { id: string; name: string; mime: string; size: number; status: "PENDING" | "READY" | "REJECTED"; createdAt: string }
