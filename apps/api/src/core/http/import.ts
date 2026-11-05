import { BadRequestException } from "@nestjs/common";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { ZodType, ZodTypeDef } from "zod";
import type { ImportError, ImportPreview } from "@places/contracts";

/** What multer hands the controller (FileInterceptor keeps the file in memory). */
export interface UploadedSheet { buffer: Buffer; originalname: string; size: number }

/** Bigger sheets go in parts: one import is one transaction. */
export const IMPORT_LIMIT = 5_000;
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** Column key → the header people see in the template (Arabic, same as the screens). */
export type ImportColumns<K extends string> = Record<K, string>;

/** A big old-data sheet (13.1) is thousands of rows in one transaction: Prisma's 5 s default is too short. */
export const IMPORT_TX = { timeout: 120_000, maxWait: 10_000 };
/** 13.1 · what a module's import did (or would do, in the preview): added, skipped as duplicates, and the errors. */
export interface ImportReport { added: number; duplicates: number; errors: ImportError[] }

export interface ParsedSheet<T> { rows: { line: number; data: T }[]; errors: ImportError[]; total: number }

/**
 * Reads an .xlsx or .csv, matches the columns by their header (any order, extra columns ignored), and validates every
 * row with the module's schema. Returns the valid rows with their sheet line, and every error by line and column.
 * Saving is the module service's job, in its own transaction.
 */
export async function parseSheet<K extends string, T>(file: UploadedSheet | undefined, columns: ImportColumns<K>, schema: ZodType<T, ZodTypeDef, unknown>, uniqueBy?: (row: T) => string): Promise<ParsedSheet<T>> {
  if (!file) throw new BadRequestException("ارفع ملف Excel أو CSV");
  const sheet = await readFirstSheet(file);
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => headers.set(text(cell.value) ?? "", col));
  const missing = Object.values<string>(columns).filter((h) => !headers.has(h));
  if (missing.length) return { rows: [], total: 0, errors: [{ line: 1, column: missing.join("، "), message: "أعمدة ناقصة في الشيت · نزّل القالب" }] };

  const rows: ParsedSheet<T>["rows"] = [];
  const errors: ImportError[] = [];
  const seen = new Map<string, number>();
  let total = 0;
  for (let line = 2; line <= sheet.rowCount; line++) {
    const row = sheet.getRow(line);
    const raw = Object.fromEntries((Object.entries(columns) as [K, string][]).map(([key, h]) => [key, text(row.getCell(headers.get(h)!).value)]));
    if (Object.values(raw).every((v) => v === undefined)) continue; // blank lines between blocks are common in hand-made sheets
    if (++total > IMPORT_LIMIT) throw new BadRequestException(`الشيت أكبر من ${IMPORT_LIMIT} صف · قسّمه`);
    const r = schema.safeParse(raw);
    if (!r.success) {
      for (const i of r.error.issues) errors.push({ line, column: columns[i.path[0] as K] ?? "", message: i.message });
      continue;
    }
    const key = uniqueBy?.(r.data);
    if (key !== undefined && seen.has(key)) { errors.push({ line, column: "", message: `مكرر مع السطر ${seen.get(key)}` }); continue; }
    if (key !== undefined) seen.set(key, line);
    rows.push({ line, data: r.data });
  }
  return { rows, errors, total };
}

/** A sheet read as it is: its own headers and every non-blank row as header → text. */
export interface SheetTable { headers: string[]; rows: Record<string, string>[] }

/**
 * For sheets whose columns aren't fixed (the Not Active sheets, M-03 1.1: the client hasn't sent their columns yet):
 * the first row's headers, then each row by them. Columns without a header are ignored.
 */
export async function readTable(file: UploadedSheet | undefined): Promise<SheetTable> {
  if (!file) throw new BadRequestException("ارفع ملف Excel أو CSV");
  const sheet = await readFirstSheet(file);
  const cols: [number, string][] = [];
  sheet.getRow(1).eachCell((cell, col) => { const h = text(cell.value); if (h && !cols.some(([, x]) => x === h)) cols.push([col, h]); });
  if (!cols.length) throw new BadRequestException("أول صف في الشيت لازم يبقى العناوين");
  const rows: Record<string, string>[] = [];
  for (let line = 2; line <= sheet.rowCount; line++) {
    const row = sheet.getRow(line);
    const data = Object.fromEntries(cols.map(([col, h]) => [h, text(row.getCell(col).value)]).filter((e): e is [string, string] => e[1] !== undefined));
    if (!Object.keys(data).length) continue;
    if (rows.length >= IMPORT_LIMIT) throw new BadRequestException(`الشيت أكبر من ${IMPORT_LIMIT} صف · قسّمه`);
    rows.push(data);
  }
  return { headers: cols.map(([, h]) => h), rows };
}

/** What the screen shows before «تأكيد»: the first 50 valid rows and every error. */
export function preview<T>(p: ParsedSheet<T>): ImportPreview<T> {
  return { total: p.total, valid: p.rows.length, errors: p.errors, sample: p.rows.slice(0, 50).map((r) => r.data) };
}

/** Every non-empty cell of the first sheet as text, whatever the columns (a sheet of mobiles has no fixed header, 1.19). */
export async function sheetTexts(file: UploadedSheet): Promise<string[]> {
  const sheet = await readFirstSheet(file);
  const out: string[] = [];
  sheet.eachRow((row) => row.eachCell((cell) => { const t = text(cell.value); if (t) out.push(t); }));
  if (out.length > IMPORT_LIMIT * 10) throw new BadRequestException(`الشيت أكبر من ${IMPORT_LIMIT} صف · قسّمه`);
  return out;
}

async function readFirstSheet(file: UploadedSheet) {
  const book = new ExcelJS.Workbook();
  try {
    // CSV cells stay text: ExcelJS would turn "2026-04-10" into a local-time Date, a day early in UTC
    if (/\.csv$/i.test(file.originalname)) return await book.csv.read(Readable.from(file.buffer), { map: (v: unknown) => v });
    // ExcelJS's own Buffer type predates Node's generic Buffer
    await book.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException("الملف مش Excel (.xlsx) ولا CSV");
  }
  const sheet = book.worksheets[0];
  if (!sheet) throw new BadRequestException("الملف فاضي");
  return sheet;
}

/** A cell as trimmed text: dates as YYYY-MM-DD, times as HH:MM, rich text and formulas by what they show, empty as undefined. */
function text(v: ExcelJS.CellValue): string | undefined {
  if (v === null || v === undefined) return undefined;
  // a time-only cell (a fingerprint sheet's «11:05») is a date on Excel's day zero: keep the time
  if (v instanceof Date) return v.getUTCFullYear() < 1901 ? v.toISOString().slice(11, 16) : v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return text(v.richText.map((t) => t.text).join(""));
    if ("text" in v) return text(v.text as string);
    if ("result" in v) return text(v.result as ExcelJS.CellValue);
    return undefined;
  }
  const s = String(v).trim();
  return s === "" ? undefined : s;
}
