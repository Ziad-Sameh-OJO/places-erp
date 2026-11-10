import { z } from "zod";
import { NOT_ACTIVE_STATUSES } from "@places/domain";
import { Id, Page } from "./common.ts";

/**
 * M-03 1.1 · Not Active Inventory: sheets Manar uploads (e.g. CFC). Their columns aren't fixed yet (the client will
 * send them), so a sheet keeps the headers it came with and rows are header → text.
 */

const column = (missing: string) => z.string({ required_error: missing, invalid_type_error: missing }).trim().min(1, missing).max(120);
/** 2.40 · the column(s) a repeat is told by: a multipart field is one column's name or a JSON list of them. */
const columns = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  try { const j: unknown = JSON.parse(v); return Array.isArray(j) ? j : [v]; } catch { return [v]; }
}, z.array(column("اختار خانة منع التكرار"), { invalid_type_error: "اختار خانة منع التكرار" }).min(1, "اختار خانة واحدة على الأقل").max(20).transform((c) => [...new Set(c)]));
const yes = z.preprocess((v) => v === true || v === "true" || v === "skip", z.boolean());

/**
 * The upload's fields next to the file: the sheet's name (a new one, or the one it merges into), Manar's column that
 * tells rows apart, and the «Number» column compared with the inventory's owners (2.15).
 */
export const NotActiveImport = z.object({
  name: z.string({ required_error: "اكتب اسم الشيت", invalid_type_error: "اكتب اسم الشيت" }).trim().min(1, "اكتب اسم الشيت").max(60, "اسم الشيت طويل"),
  dedupeBy: columns,
  numberBy: z.preprocess((v) => (v === "" ? undefined : v), column("اختار خانة الرقم").optional()),
  /** 2.40 · «الصفوف المكررة»: false = they go in, marked (the default) · true = «متدخلش» */
  skipDupes: yes.default(false),
});
export type NotActiveImport = z.infer<typeof NotActiveImport>;
/** 2.40 · «غيّر خانة منع التكرار» for a file already uploaded. */
export const NotActiveDedupe = z.object({ columns });
export type NotActiveDedupe = z.infer<typeof NotActiveDedupe>;

/** The tabs under a sheet (M-03 1.1): All Sheet · No Answer · Not True · Done. */
export const NotActiveTab = z.enum(["all", ...NOT_ACTIVE_STATUSES]);
export type NotActiveTab = z.infer<typeof NotActiveTab>;
/** 2.40 · «التكرار»: every row · the repeats only · the rows without a repeat */
export const NotActiveRowFilters = Page.extend({
  pageSize: z.coerce.number().int().min(1).max(200).default(100), tab: NotActiveTab.default("all"), dup: z.enum(["", "any", "none"]).default(""),
});
export type NotActiveRowFilters = z.infer<typeof NotActiveRowFilters>;

/** «ابعتهم Task لمروة» (M-03 1.1): the picked rows to one person. */
export const NotActiveAssign = z.object({
  rowIds: z.array(Id, { required_error: "حدد صفوف", invalid_type_error: "حدد صفوف" }).min(1, "حدد صف واحد على الأقل").max(1000, "1000 صف بالكتير").transform((r) => [...new Set(r)]),
  to: Id,
});
export type NotActiveAssign = z.infer<typeof NotActiveAssign>;

/** No Answer / Not True (+ the feedback it needs, M-03 2.3); Done for a number already in the inventory (Manar). */
export const NotActiveClassify = z.object({
  status: z.enum(NOT_ACTIVE_STATUSES, { errorMap: () => ({ message: "اختار No Answer أو Not True أو Done" }) }),
  feedback: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().trim().max(500, "الـ Feedback طويل").optional()),
});
export type NotActiveClassify = z.infer<typeof NotActiveClassify>;

/** 2.39 · «ملف جديد» / «تغيير الاسم / الفولدر»: the file's name (one of a kind) and its folder (an existing one or a new name). */
export const NotActiveFileInput = z.object({
  name: z.string({ required_error: "اكتب اسم الملف", invalid_type_error: "اكتب اسم الملف" }).trim().min(1, "اكتب اسم الملف").max(60, "اسم الملف طويل"),
  folder: z.preprocess((v) => (typeof v === "string" && !v.trim() ? undefined : v), z.string().trim().max(60, "اسم الفولدر طويل").optional()),
});
export type NotActiveFileInput = z.infer<typeof NotActiveFileInput>;

/**
 * A file (sheet): `rows` all its rows, `pending` the ones not classified yet that the person works (Marwa: hers);
 * 2.39: its folder, when it was made and by whom.
 */
export interface NotActiveSheetView {
  id: string; name: string; dedupeBy: string[]; numberBy: string | null; columns: string[]; rows: number;
  folder: string | null; createdAt: string; createdBy: string | null; pending: number; matched: number;
}
/** Before «ادمج»: the file's headers and first rows, and what it would add to the sheet of that name (if there is one). */
export interface NotActivePreview {
  headers: string[]; total: number; sample: Record<string, string>[];
  /** the sheet of that name, when the file goes into an existing one */
  sheet: NotActiveSheetView | null;
  /** the column(s) checked: the ones asked for, else the sheet's own, else the number column (2.40) */
  dedupeBy: string[];
  /** 2.40 · rows that go in (marked) · that will show as repeats · that «متدخلش» leaves out · with a picked cell empty */
  added: number; marked: number; duplicates: number; noKey: number;
  /** the «Number» column the sheet would be compared by, when the file names one plainly */
  numberGuess: string | null;
}
export interface NotActiveImportDone { sheetId: string; added: number; duplicates: number; marked: number; skipped: number; noKey: number; inInventory: number }
export interface NotActivePerson { id: string; name: string }
export interface NotActiveRowView {
  id: string; data: Record<string, string>; status: string | null; feedback: string | null; createdAt: string;
  assignedTo: NotActivePerson | null;
  /** its number is an owner's number of this unit; `matchSeen` once Manar set its status */
  matched: { id: string; code: string } | null; matchSeen: boolean;
  /** Done: the unit Marwa entered from it */
  unit: { id: string; code: string } | null;
  /** 2.40 · how many other rows of the file repeat it under the file's columns */
  dupes: number;
}
/** The tabs' and tiles' counts, in what the person sees (Marwa: the rows sent to her). */
export interface NotActiveCounts { all: number; "No Answer": number; "Not True": number; Done: number; pending: number; matched: number; dupes: number }
