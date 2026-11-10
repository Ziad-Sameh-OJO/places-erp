import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type {
  CreatedUnit, NotActiveAssign, NotActiveClassify, NotActiveCounts, NotActiveFileInput, NotActiveImport, NotActiveImportDone, NotActivePerson, NotActivePreview,
  NotActiveRowFilters, NotActiveRowView, NotActiveSheetView, Paged, UnitInput, UnitOptions,
} from "@places/contracts";
import { classifyProblem, defaultDedupe, duplicateCounts, guessNumberColumn, inventoryMatches, mergeColumns, mergeSheetRows, type SheetRow } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import type { SheetTable } from "../../core/http/import";
import { InventoryService } from "./inventory.service";
import { NotActiveRepository, type NotActiveRowRecord, type RowScope } from "./not-active.repository";

const NO_SHEET = "الشيت ده مش موجود";
const NO_ROW = "الصف ده مش موجود أو مش معاك";
const PREVIEW_ROWS = 10;
const LINK = "/notactive";

type SheetRecord = {
  id: string; name: string; dedupeBy: string[]; numberBy: string | null; columns: string[]; folder: string | null; createdById: string | null; createdAt: Date;
  _count: { rows: number };
};
type SheetExtra = { createdBy?: string | null; pending?: number; matched?: number };
const view = (s: SheetRecord, x: SheetExtra = {}): NotActiveSheetView => ({
  id: s.id, name: s.name, dedupeBy: s.dedupeBy, numberBy: s.numberBy, columns: s.columns, rows: s._count.rows,
  folder: s.folder, createdAt: s.createdAt.toISOString(), createdBy: x.createdBy ?? null, pending: x.pending ?? 0, matched: x.matched ?? 0,
});
const NAME_TAKEN = "فيه ملف بنفس الاسم · اختار اسم تاني";
const cells = (data: unknown): SheetRow => (data && typeof data === "object" ? (data as SheetRow) : {});

/**
 * M-03 1.1 · 2.1 (12–16) · 2.3 · 7.1 · Not Active Inventory. 2.14: Manar uploads a sheet; the same name again adds only
 * the rows new by the column she picks. 2.15: each new number is compared with the owners' numbers in the inventory
 * (Alarm to Manar, she sets the status, the row stays); she sends rows to Marwa as a task; Marwa classifies each —
 * No Answer, Not True (with a feedback), Done (she enters the unit, a draft until Manar confirms it; Alarm to Manar).
 */
@Injectable()
export class NotActiveService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: NotActiveRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly inventory: InventoryService,
  ) {}

  /** Manar («Not Active: approve») sees every row; the others the rows sent to them. */
  private scope(me: CurrentUser): RowScope {
    return { all: me.grants.can("notactive", "approve"), userId: me.id };
  }

  /** 2.39 · the files (Marwa: the ones with rows sent to her), each with its folder, who made it and what's left to classify. */
  async sheets(me: CurrentUser): Promise<NotActiveSheetView[]> {
    const s = this.scope(me);
    const [sheets, [pending, matched]] = await Promise.all([this.repo.sheets(s), this.repo.sheetCounts(s)]);
    const people = new Map((await this.repo.names([...new Set(sheets.flatMap((x) => (x.createdById ? [x.createdById] : [])))])).map((p) => [p.userId, p.name]));
    const n = (g: { sheetId: string; _count: { _all: number } }[], id: string) => g.find((x) => x.sheetId === id)?._count._all ?? 0;
    return sheets.map((x) => view(x, { createdBy: x.createdById ? people.get(x.createdById) ?? null : null, pending: n(pending, x.id), matched: n(matched, x.id) }));
  }

  /** The folders already used, for «ملف جديد». */
  async folders(): Promise<string[]> {
    return (await this.repo.folders()).flatMap((f) => (f.folder ? [f.folder] : [])).sort((a, b) => a.localeCompare(b, "ar"));
  }

  /**
   * 2.39 · «ملف جديد»: a named file (the name is one of a kind, «CFC» = «cfc»), maybe in a folder; its sheet comes now or
   * later. Whoever manages the inventory makes files (the demo's canFile: Not Active import or inventory edit).
   */
  async createFile(me: CurrentUser, input: NotActiveFileInput): Promise<NotActiveSheetView> {
    this.mayFile(me);
    return this.db.$transaction(async (tx) => {
      if (await this.repo.sheetByName(input.name, tx)) throw new BadRequestException(NAME_TAKEN);
      const sheet = await this.repo.createFile(tx, input.name, input.folder ?? null, me.id);
      await this.audit.record({ module: "notactive", entity: "NotActiveSheet", entityId: sheet.id, action: "create", userId: me.id, after: { name: sheet.name, folder: sheet.folder } }, tx);
      return view(sheet, { createdBy: me.name });
    });
  }

  /** «تغيير الاسم / الفولدر». */
  async renameFile(me: CurrentUser, id: string, input: NotActiveFileInput): Promise<NotActiveSheetView> {
    this.mayFile(me);
    return this.db.$transaction(async (tx) => {
      const before = await this.repo.sheet(id, tx);
      if (!before) throw new NotFoundException(NO_SHEET);
      const other = await this.repo.sheetByName(input.name, tx);
      if (other && other.id !== id) throw new BadRequestException(NAME_TAKEN);
      const sheet = await this.repo.renameFile(tx, id, input.name, input.folder ?? null);
      await this.audit.record({ module: "notactive", entity: "NotActiveSheet", entityId: id, action: "update", userId: me.id,
        before: { name: before.name, folder: before.folder }, after: { name: sheet.name, folder: sheet.folder } }, tx);
      return view(sheet);
    });
  }

  /** The demo's canFile: Not Active «import», or whoever edits the inventory. */
  private mayFile(me: CurrentUser) {
    if (!me.grants.can("notactive", "import") && !me.grants.can("inventory", "edit")) throw new ForbiddenException("مش مسموح لك تعمل ملفات أو ترفع شيتات في الـ Not Active");
  }

  async rows(me: CurrentUser, sheetId: string, f: NotActiveRowFilters): Promise<Paged<NotActiveRowView>> {
    const sheet = await this.repo.sheet(sheetId);
    if (!sheet) throw new NotFoundException(NO_SHEET);
    const dupes = await this.dupesOf(sheetId, sheet.dedupeBy);
    // «التكرار»: the repeats only, or the rows without one
    const ids = f.dup === "any" ? { in: [...dupes.keys()] } : f.dup === "none" ? { notIn: [...dupes.keys()] } : undefined;
    const [rows, total] = await this.repo.rows(sheetId, this.scope(me), f.tab, (f.page - 1) * f.pageSize, f.pageSize, ids);
    return { items: await this.views(me, rows, sheet.numberBy, dupes), total, page: f.page, pageSize: f.pageSize };
  }

  async counts(me: CurrentUser, sheetId: string): Promise<NotActiveCounts> {
    const sheet = await this.repo.sheet(sheetId);
    if (!sheet) throw new NotFoundException(NO_SHEET);
    const dupIds = [...(await this.dupesOf(sheetId, sheet.dedupeBy)).keys()];
    const [all, noAnswer, notTrue, done, pending, matched, dupes] = await this.repo.counts(sheetId, this.scope(me), dupIds);
    return { all, "No Answer": noAnswer, "Not True": notTrue, Done: done, pending, matched, dupes };
  }

  async assignees(): Promise<NotActivePerson[]> {
    return (await this.repo.assignees()).map((p) => ({ id: p.userId, name: p.name }));
  }

  /** The unit form's lists for Marwa's Done (she has no inventory page of her own). */
  unitOptions(): Promise<UnitOptions> {
    return this.inventory.options();
  }

  /**
   * Before the rows go in (2.40, demo dupModal): the file's headers and first rows, and with the picked column(s) — else
   * the file's own, else the number column — how many rows will show as repeats and how many «متدخلش» leaves out.
   */
  async preview(me: CurrentUser, table: SheetTable, name?: string, dedupeBy?: string[], skip = false): Promise<NotActivePreview> {
    this.mayFile(me);
    const sheet = name?.trim() ? await this.repo.sheetByName(name.trim()) : null;
    const fits = (c: string[] | undefined) => (c?.length && c.every((x) => table.headers.includes(x)) ? c : null);
    const columns = fits(dedupeBy) ?? fits(sheet?.dedupeBy) ?? defaultDedupe(table.headers);
    const merge = mergeSheetRows(sheet ? (await this.repo.rowData(sheet.id)).map((r) => cells(r.data)) : [], table.rows, columns, skip);
    return {
      headers: table.headers, total: table.rows.length, sample: table.rows.slice(0, PREVIEW_ROWS), sheet: sheet ? view(sheet) : null, dedupeBy: columns,
      added: merge.added.length, marked: merge.marked, duplicates: merge.duplicates, noKey: merge.noKey,
      numberGuess: sheet?.numberBy && table.headers.includes(sheet.numberBy) ? sheet.numberBy : guessNumberColumn(table.headers),
    };
  }

  /** 2.40 · «غيّر خانة منع التكرار»: how many of the file's rows would show as repeats (nothing saved). */
  async dedupePreview(sheetId: string, columns: string[]): Promise<{ marked: number }> {
    const sheet = await this.fileWith(sheetId, columns);
    return { marked: duplicateCounts(await this.repo.rowData(sheet.id), columns).size };
  }

  /** …and saving it (audited). The rows stay; only which of them show as repeats changes. */
  async setDedupe(me: CurrentUser, sheetId: string, columns: string[]): Promise<NotActiveSheetView> {
    this.mayFile(me);
    const sheet = await this.fileWith(sheetId, columns);
    await this.db.$transaction(async (tx) => {
      await this.repo.updateSheet(tx, sheetId, columns, sheet.numberBy, sheet.columns);
      await this.audit.record({ module: "notactive", entity: "NotActiveSheet", entityId: sheetId, action: "dedupe", userId: me.id, before: { dedupeBy: sheet.dedupeBy }, after: { dedupeBy: columns } }, tx);
    });
    return view({ ...sheet, dedupeBy: columns });
  }

  private async fileWith(sheetId: string, columns: string[]) {
    const sheet = await this.repo.sheet(sheetId);
    if (!sheet) throw new NotFoundException(NO_SHEET);
    const missing = columns.find((c) => !sheet.columns.includes(c));
    if (missing) throw new BadRequestException(`خانة «${missing}» مش في الشيت`);
    return sheet;
  }

  /** 2.40 · the file's repeats under its columns: row id → how many others repeat it (all of the file's rows count). */
  private async dupesOf(sheetId: string, columns: string[]) {
    return columns.length ? duplicateCounts(await this.repo.rowData(sheetId), columns) : new Map<string, number>();
  }

  /** «ادمج»: one transaction — the sheet (new or the same name), its new rows, its columns and the audit; then the comparison. */
  async import(me: CurrentUser, table: SheetTable, input: NotActiveImport, file: string): Promise<NotActiveImportDone> {
    this.mayFile(me);
    const missing = input.dedupeBy.find((c) => !table.headers.includes(c));
    if (missing) throw new BadRequestException(`خانة «${missing}» مش في الشيت`);
    if (input.numberBy && !table.headers.includes(input.numberBy)) throw new BadRequestException(`خانة «${input.numberBy}» مش في الشيت`);
    if (!table.rows.length) throw new BadRequestException("الشيت مفيهوش صفوف");
    const done = await this.db.$transaction(async (tx) => {
      const found = await this.repo.sheetByName(input.name, tx);
      const numberBy = input.numberBy ?? found?.numberBy ?? null;
      const sheet = found ?? await this.repo.createSheet(tx, input.name, input.dedupeBy, numberBy, table.headers, me.id);
      const existing = found ? (await this.repo.rowData(sheet.id, tx)).map((r) => cells(r.data)) : [];
      // 2.40: every row goes in and the repeats show marked, or «متدخلش» leaves the repeats out (the first of each goes in)
      const merge = mergeSheetRows(existing, table.rows, input.dedupeBy, input.skipDupes);
      const { count } = await this.repo.addRows(tx, sheet.id, merge.added);
      await this.repo.updateSheet(tx, sheet.id, input.dedupeBy, numberBy, mergeColumns(sheet.columns, table.headers));
      const result = {
        sheetId: sheet.id, name: sheet.name, numberBy, added: count, duplicates: merge.duplicates, marked: input.skipDupes ? 0 : merge.marked,
        skipped: input.skipDupes ? merge.duplicates : 0, noKey: merge.noKey,
      };
      await this.audit.record({
        module: "notactive", entity: "NotActiveSheet", entityId: sheet.id, action: found ? "merge" : "create", userId: me.id,
        after: { name: sheet.name, file, dedupeBy: input.dedupeBy, skipDupes: input.skipDupes, numberBy, added: result.added, duplicates: result.duplicates, skipped: result.skipped, noKey: result.noKey },
      }, tx);
      return result;
    });
    const inInventory = done.numberBy ? await this.compare(done.sheetId, done.name, done.numberBy) : 0;
    return { sheetId: done.sheetId, added: done.added, duplicates: done.duplicates, marked: done.marked, skipped: done.skipped, noKey: done.noKey, inInventory };
  }

  /**
   * M-03 1.1 · 2.1 (13): the new rows' «Number» against the owners' numbers in the main inventory. A match stays in the
   * sheet, is marked with the unit, and Manar gets one Alarm for the upload to set their status.
   */
  private async compare(sheetId: string, sheetName: string, numberBy: string): Promise<number> {
    const rows = (await this.repo.unmatched(sheetId)).map((r) => ({ id: r.id, number: cells(r.data)[numberBy] }));
    if (!rows.length) return 0;
    const matches = inventoryMatches(rows, await this.inventory.ownerPhones());
    if (!matches.size) return 0;
    await this.db.$transaction(async (tx) => {
      for (const [rowId, unit] of matches) await this.repo.setMatch(tx, rowId, unit.id);
      await this.audit.record({ module: "notactive", entity: "NotActiveSheet", entityId: sheetId, action: "in-inventory", userId: null,
        after: { rows: [...matches].map(([rowId, u]) => ({ rowId, unit: u.code })) } }, tx);
    });
    await this.notifications.notify({ event: "notactive.in_inventory", text: `${matches.size} رقم في شيت ${sheetName} موجود في الانفنتوري الأصلي · حددي حالتهم`, link: LINK });
    return matches.size;
  }

  /** «ابعتهم Task لمروة» (M-03 1.1): to someone with «Not Active: edit»; she's told. Done rows stay where they are. */
  async assign(me: CurrentUser, sheetId: string, input: NotActiveAssign) {
    const sheet = await this.repo.sheet(sheetId);
    if (!sheet) throw new NotFoundException(NO_SHEET);
    const to = (await this.assignees()).find((p) => p.id === input.to);
    if (!to) throw new BadRequestException("اختار حد من فريق الانفنتوري");
    const { count } = await this.db.$transaction(async (tx) => {
      const r = await this.repo.assign(tx, sheetId, input.rowIds, to.id);
      await this.audit.record({ module: "notactive", entity: "NotActiveSheet", entityId: sheetId, action: "assign", userId: me.id, after: { to: to.id, rowIds: input.rowIds, assigned: r.count } }, tx);
      return r;
    });
    if (count) await this.notifications.notify({ event: "notactive.task", text: `${me.name} بعتتلك ${count} رقم من شيت ${sheet.name} تصنّفيهم`, link: LINK, userIds: [to.id] });
    return { assigned: count };
  }

  /**
   * No Answer / Not True (needs its feedback, M-03 2.3). Done here only for a number already in the inventory, by Manar
   * (she sets its status, Q 2.3); otherwise Done means a new unit and goes through `done`.
   */
  async classify(me: CurrentUser, rowId: string, input: NotActiveClassify): Promise<NotActiveRowView> {
    const s = this.scope(me), keepsFeedback = me.fields.fixed("notactive").has("feedback");
    const problem = keepsFeedback ? null : classifyProblem(input.status, input.feedback);
    if (problem) throw new BadRequestException(problem);
    return this.db.$transaction(async (tx) => {
      const row = await this.repo.row(rowId, s, tx);
      if (!row) throw new NotFoundException(NO_ROW);
      const kept = keepsFeedback ? classifyProblem(input.status, row.feedback) : null; // Not True needs one the person can't write
      if (kept) throw new BadRequestException(kept);
      if (row.status === "Done") throw new BadRequestException("الصف ده Done خلاص");
      const decides = s.all && !!row.matchedUnitId;
      if (input.status === "Done" && !decides) throw new BadRequestException("Done معناها وحدة جديدة · دخّل بياناتها");
      // M-09: a feedback the person may not change keeps its stored value
      const feedback = keepsFeedback ? row.feedback : input.status === "Not True" ? input.feedback!.trim() : null;
      const data = { status: input.status, feedback, matchSeen: row.matchSeen || decides };
      if (!(await this.repo.classify(tx, rowId, data)).count) throw new BadRequestException("الصف ده Done خلاص");
      await this.audit.record({ module: "notactive", entity: "NotActiveRow", entityId: rowId, action: "classify", userId: me.id,
        before: { status: row.status, feedback: row.feedback }, after: { status: data.status, feedback: data.feedback } }, tx);
      return (await this.views(me, [{ ...row, ...data }], (await this.repo.sheet(row.sheetId, tx))?.numberBy ?? null))[0]!;
    });
  }

  /**
   * Done (M-03 1.1 · 7.1): the unit from this number, with the main inventory's fields; it's a draft until Manar
   * confirms it (Q15), and Manar gets the Alarm that a new unit is to be added. The row is claimed first.
   */
  async done(me: CurrentUser, rowId: string, input: UnitInput): Promise<CreatedUnit> {
    const row = await this.repo.row(rowId, this.scope(me));
    if (!row) throw new NotFoundException(NO_ROW);
    if (!(await this.repo.claimDone(rowId)).count) throw new BadRequestException("الصف ده Done خلاص");
    let unit: CreatedUnit;
    try {
      unit = await this.inventory.create(me, input);
    } catch (e) {
      await this.repo.restore(rowId, row.status, row.feedback);
      throw e;
    }
    const sheet = await this.db.$transaction(async (tx) => {
      await this.repo.setUnit(tx, rowId, unit.id);
      await this.audit.record({ module: "notactive", entity: "NotActiveRow", entityId: rowId, action: "done", userId: me.id,
        before: { status: row.status }, after: { status: "Done", unitId: unit.id, code: unit.code } }, tx);
      return this.repo.sheet(row.sheetId, tx);
    });
    await this.notifications.notify({ event: "notactive.done", text: `${me.name} جابت وحدة جديدة ${unit.code} من شيت ${sheet?.name ?? ""} · تتضاف للانفنتوري`, link: `/inventory?unit=${unit.id}` });
    return unit;
  }

  /** M-09 field permissions: a hidden number (the sheet's «Number» column) or feedback never leaves the API. */
  private async views(me: CurrentUser, rows: NotActiveRowRecord[], numberBy: string | null, dupes = new Map<string, number>()): Promise<NotActiveRowView[]> {
    const hidden = me.fields.hidden("notactive");
    const data = (d: unknown) => {
      const c = cells(d) as Record<string, string>;
      return numberBy && hidden.has("number") && numberBy in c ? { ...c, [numberBy]: "" } : c;
    };
    const unitIds = [...new Set(rows.flatMap((r) => [r.matchedUnitId, r.unitId]).filter((x): x is string => !!x))];
    const userIds = [...new Set(rows.map((r) => r.assignedTo).filter((x): x is string => !!x))];
    const [codes, people] = await Promise.all([this.inventory.codes(unitIds), this.repo.names(userIds)]);
    const code = new Map(codes.map((u) => [u.id, u.code]));
    const name = new Map(people.map((p) => [p.userId, p.name]));
    const unit = (id: string | null) => (id ? { id, code: code.get(id) ?? "" } : null);
    return rows.map((r) => ({
      id: r.id, data: data(r.data), status: r.status, feedback: hidden.has("feedback") ? null : r.feedback, createdAt: r.createdAt.toISOString(),
      assignedTo: r.assignedTo ? { id: r.assignedTo, name: name.get(r.assignedTo) ?? "" } : null,
      matched: unit(r.matchedUnitId), matchSeen: r.matchSeen, unit: unit(r.unitId), dupes: dupes.get(r.id) ?? 0,
    }));
  }
}
