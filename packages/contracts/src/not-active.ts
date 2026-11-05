import { z } from "zod";
import { Page } from "./common.ts";

/**
 * M-03 1.1 · Not Active Inventory: sheets Manar uploads (e.g. CFC). Their columns aren't fixed yet (the client will
 * send them), so a sheet keeps the headers it came with and rows are header → text.
 */

/** The upload's fields next to the file: the sheet's name (a new one, or the one it merges into) and Manar's column. */
export const NotActiveImport = z.object({
  name: z.string({ required_error: "اكتب اسم الشيت", invalid_type_error: "اكتب اسم الشيت" }).trim().min(1, "اكتب اسم الشيت").max(60, "اسم الشيت طويل"),
  dedupeBy: z.string({ required_error: "اختار خانة منع التكرار", invalid_type_error: "اختار خانة منع التكرار" }).trim().min(1, "اختار خانة منع التكرار").max(120),
});
export type NotActiveImport = z.infer<typeof NotActiveImport>;

export const NotActiveRowFilters = Page.extend({ pageSize: z.coerce.number().int().min(1).max(200).default(100) });
export type NotActiveRowFilters = z.infer<typeof NotActiveRowFilters>;

export interface NotActiveSheetView { id: string; name: string; dedupeBy: string; columns: string[]; rows: number }
/** Before «ادمج»: the file's headers and first rows, and what it would add to the sheet of that name (if there is one). */
export interface NotActivePreview {
  headers: string[]; total: number; sample: Record<string, string>[];
  /** the sheet of that name, when the file goes into an existing one */
  sheet: NotActiveSheetView | null;
  /** with the chosen column: new rows, ones already there (or twice in the file), rows with that cell empty */
  added: number | null; duplicates: number | null; noKey: number | null;
}
export interface NotActiveImportDone { sheetId: string; added: number; duplicates: number; noKey: number }
export interface NotActiveRowView {
  id: string; data: Record<string, string>; status: string | null; feedback: string | null; createdAt: string;
}
