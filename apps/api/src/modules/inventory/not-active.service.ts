import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { NotActiveImport, NotActiveImportDone, NotActivePreview, NotActiveRowFilters, NotActiveRowView, NotActiveSheetView, Paged } from "@places/contracts";
import { mergeColumns, mergeSheetRows, type SheetRow } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import type { SheetTable } from "../../core/http/import";
import { NotActiveRepository } from "./not-active.repository";

const NO_SHEET = "الشيت ده مش موجود";
const PREVIEW_ROWS = 10;

type SheetRecord = { id: string; name: string; dedupeBy: string; columns: string[]; _count: { rows: number } };
const view = (s: SheetRecord): NotActiveSheetView => ({ id: s.id, name: s.name, dedupeBy: s.dedupeBy, columns: s.columns, rows: s._count.rows });
const cells = (data: unknown): SheetRow => (data && typeof data === "object" ? (data as SheetRow) : {});

/**
 * M-03 1.1 · 2.3 · 7.1 (2.14): Manar uploads a sheet (e.g. CFC); the same name again merges into it and only the rows
 * whose value in the column she picks isn't there yet are added. The comparison with the main inventory, the tabs and
 * Marwa's classification come with 2.15.
 */
@Injectable()
export class NotActiveService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly repo: NotActiveRepository, private readonly audit: AuditService) {}

  async sheets(): Promise<NotActiveSheetView[]> {
    return (await this.repo.sheets()).map(view);
  }

  async rows(sheetId: string, f: NotActiveRowFilters): Promise<Paged<NotActiveRowView>> {
    if (!(await this.repo.sheet(sheetId))) throw new NotFoundException(NO_SHEET);
    const [rows, total] = await this.repo.rows(sheetId, (f.page - 1) * f.pageSize, f.pageSize);
    return {
      items: rows.map((r) => ({ id: r.id, data: cells(r.data) as Record<string, string>, status: r.status, feedback: r.feedback, createdAt: r.createdAt.toISOString() })),
      total, page: f.page, pageSize: f.pageSize,
    };
  }

  /** Before «ادمج»: the file's headers and first rows, and — with a name and a column — what the merge would do. */
  async preview(table: SheetTable, name?: string, dedupeBy?: string): Promise<NotActivePreview> {
    const sheet = name?.trim() ? await this.repo.sheetByName(name.trim()) : null;
    const column = dedupeBy && table.headers.includes(dedupeBy) ? dedupeBy : null;
    const merge = column ? mergeSheetRows(sheet ? (await this.repo.rowData(sheet.id)).map((r) => cells(r.data)) : [], table.rows, column) : null;
    return {
      headers: table.headers, total: table.rows.length, sample: table.rows.slice(0, PREVIEW_ROWS), sheet: sheet ? view(sheet) : null,
      added: merge?.added.length ?? null, duplicates: merge?.duplicates ?? null, noKey: merge?.noKey ?? null,
    };
  }

  /** «ادمج»: one transaction — the sheet (new or the same name), its new rows, its columns and the audit. */
  async import(me: CurrentUser, table: SheetTable, input: NotActiveImport, file: string): Promise<NotActiveImportDone> {
    if (!table.headers.includes(input.dedupeBy)) throw new BadRequestException(`خانة «${input.dedupeBy}» مش في الشيت`);
    if (!table.rows.length) throw new BadRequestException("الشيت مفيهوش صفوف");
    return this.db.$transaction(async (tx) => {
      const found = await this.repo.sheetByName(input.name, tx);
      const sheet = found ?? await this.repo.createSheet(tx, input.name, input.dedupeBy, table.headers);
      const existing = found ? (await this.repo.rowData(sheet.id, tx)).map((r) => cells(r.data)) : [];
      const merge = mergeSheetRows(existing, table.rows, input.dedupeBy);
      const { count } = await this.repo.addRows(tx, sheet.id, merge.added);
      await this.repo.updateSheet(tx, sheet.id, input.dedupeBy, mergeColumns(sheet.columns, table.headers));
      const done = { sheetId: sheet.id, added: count, duplicates: merge.duplicates + (merge.added.length - count), noKey: merge.noKey };
      await this.audit.record({
        module: "notactive", entity: "NotActiveSheet", entityId: sheet.id, action: found ? "merge" : "create", userId: me.id,
        after: { name: sheet.name, file, dedupeBy: input.dedupeBy, added: done.added, duplicates: done.duplicates, noKey: done.noKey },
      }, tx);
      return done;
    });
  }
}
