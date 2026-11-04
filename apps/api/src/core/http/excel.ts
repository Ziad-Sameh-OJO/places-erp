import ExcelJS from "exceljs";
import type { Response } from "express";

export interface ExcelColumn<T> { header: string; value: (row: T) => string | number | Date | boolean | null | undefined; width?: number }

/** Exports stop here: a bigger table should be filtered first (and a huge file would hold the API for too long). */
export const EXPORT_LIMIT = 10_000;

/**
 * Any table as an .xlsx download: right-to-left sheet, bold frozen header with filters, columns sized to their header.
 * Callers check the `export` permission and write the audit log; this only builds and sends the file.
 */
export async function sendXlsx<T>(res: Response, filename: string, columns: ExcelColumn<T>[], rows: T[], sheetName = "Sheet1") {
  const book = new ExcelJS.Workbook();
  book.creator = "Places ERP";
  const sheet = book.addWorksheet(sheetName, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 4) }));
  for (const row of rows) sheet.addRow(columns.map((c) => c.value(row) ?? ""));
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await book.xlsx.write(res);
  res.end();
}
