import { z } from "zod";
import { NOT_ACTIVE_STATUSES } from "@places/domain";
import { Id, Page } from "./common.ts";

/**
 * M-03 1.1 · Not Active Inventory: sheets Manar uploads (e.g. CFC). Their columns aren't fixed yet (the client will
 * send them), so a sheet keeps the headers it came with and rows are header → text.
 */

const column = (missing: string) => z.string({ required_error: missing, invalid_type_error: missing }).trim().min(1, missing).max(120);

/**
 * The upload's fields next to the file: the sheet's name (a new one, or the one it merges into), Manar's column that
 * tells rows apart, and the «Number» column compared with the inventory's owners (2.15).
 */
export const NotActiveImport = z.object({
  name: z.string({ required_error: "اكتب اسم الشيت", invalid_type_error: "اكتب اسم الشيت" }).trim().min(1, "اكتب اسم الشيت").max(60, "اسم الشيت طويل"),
  dedupeBy: column("اختار خانة منع التكرار"),
  numberBy: z.preprocess((v) => (v === "" ? undefined : v), column("اختار خانة الرقم").optional()),
});
export type NotActiveImport = z.infer<typeof NotActiveImport>;

/** The tabs under a sheet (M-03 1.1): All Sheet · No Answer · Not True · Done. */
export const NotActiveTab = z.enum(["all", ...NOT_ACTIVE_STATUSES]);
export type NotActiveTab = z.infer<typeof NotActiveTab>;
export const NotActiveRowFilters = Page.extend({ pageSize: z.coerce.number().int().min(1).max(200).default(100), tab: NotActiveTab.default("all") });
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

export interface NotActiveSheetView { id: string; name: string; dedupeBy: string; numberBy: string | null; columns: string[]; rows: number }
/** Before «ادمج»: the file's headers and first rows, and what it would add to the sheet of that name (if there is one). */
export interface NotActivePreview {
  headers: string[]; total: number; sample: Record<string, string>[];
  /** the sheet of that name, when the file goes into an existing one */
  sheet: NotActiveSheetView | null;
  /** with the chosen column: new rows, ones already there (or twice in the file), rows with that cell empty */
  added: number | null; duplicates: number | null; noKey: number | null;
  /** the «Number» column the sheet would be compared by, when the file names one plainly */
  numberGuess: string | null;
}
export interface NotActiveImportDone { sheetId: string; added: number; duplicates: number; noKey: number; inInventory: number }
export interface NotActivePerson { id: string; name: string }
export interface NotActiveRowView {
  id: string; data: Record<string, string>; status: string | null; feedback: string | null; createdAt: string;
  assignedTo: NotActivePerson | null;
  /** its number is an owner's number of this unit; `matchSeen` once Manar set its status */
  matched: { id: string; code: string } | null; matchSeen: boolean;
  /** Done: the unit Marwa entered from it */
  unit: { id: string; code: string } | null;
}
/** The tabs' and tiles' counts, in what the person sees (Marwa: the rows sent to her). */
export interface NotActiveCounts { all: number; "No Answer": number; "Not True": number; Done: number; pending: number; matched: number }
