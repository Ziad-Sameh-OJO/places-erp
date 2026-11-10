import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type {
  CreatedUnit, NotActiveAssign, NotActiveClassify, NotActiveCounts, NotActiveImport, NotActiveImportDone, NotActivePerson, NotActivePreview,
  NotActiveRowFilters, NotActiveRowView, NotActiveSheetView, Paged, UnitInput, UnitOptions,
} from "@places/contracts";
import { classifyProblem, guessNumberColumn, inventoryMatches, mergeColumns, mergeSheetRows, type SheetRow } from "@places/domain";
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

type SheetRecord = { id: string; name: string; dedupeBy: string; numberBy: string | null; columns: string[]; _count: { rows: number } };
const view = (s: SheetRecord): NotActiveSheetView => ({ id: s.id, name: s.name, dedupeBy: s.dedupeBy, numberBy: s.numberBy, columns: s.columns, rows: s._count.rows });
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

  async sheets(me: CurrentUser): Promise<NotActiveSheetView[]> {
    return (await this.repo.sheets(this.scope(me))).map(view);
  }

  async rows(me: CurrentUser, sheetId: string, f: NotActiveRowFilters): Promise<Paged<NotActiveRowView>> {
    const sheet = await this.repo.sheet(sheetId);
    if (!sheet) throw new NotFoundException(NO_SHEET);
    const [rows, total] = await this.repo.rows(sheetId, this.scope(me), f.tab, (f.page - 1) * f.pageSize, f.pageSize);
    return { items: await this.views(me, rows, sheet.numberBy), total, page: f.page, pageSize: f.pageSize };
  }

  async counts(me: CurrentUser, sheetId: string): Promise<NotActiveCounts> {
    if (!(await this.repo.sheet(sheetId))) throw new NotFoundException(NO_SHEET);
    const [all, noAnswer, notTrue, done, pending, matched] = await this.repo.counts(sheetId, this.scope(me));
    return { all, "No Answer": noAnswer, "Not True": notTrue, Done: done, pending, matched };
  }

  async assignees(): Promise<NotActivePerson[]> {
    return (await this.repo.assignees()).map((p) => ({ id: p.userId, name: p.name }));
  }

  /** The unit form's lists for Marwa's Done (she has no inventory page of her own). */
  unitOptions(): Promise<UnitOptions> {
    return this.inventory.options();
  }

  /** Before «ادمج»: the file's headers and first rows, and — with a name and a column — what the merge would do. */
  async preview(table: SheetTable, name?: string, dedupeBy?: string): Promise<NotActivePreview> {
    const sheet = name?.trim() ? await this.repo.sheetByName(name.trim()) : null;
    const column = dedupeBy && table.headers.includes(dedupeBy) ? dedupeBy : null;
    const merge = column ? mergeSheetRows(sheet ? (await this.repo.rowData(sheet.id)).map((r) => cells(r.data)) : [], table.rows, column) : null;
    return {
      headers: table.headers, total: table.rows.length, sample: table.rows.slice(0, PREVIEW_ROWS), sheet: sheet ? view(sheet) : null,
      added: merge?.added.length ?? null, duplicates: merge?.duplicates ?? null, noKey: merge?.noKey ?? null,
      numberGuess: sheet?.numberBy && table.headers.includes(sheet.numberBy) ? sheet.numberBy : guessNumberColumn(table.headers),
    };
  }

  /** «ادمج»: one transaction — the sheet (new or the same name), its new rows, its columns and the audit; then the comparison. */
  async import(me: CurrentUser, table: SheetTable, input: NotActiveImport, file: string): Promise<NotActiveImportDone> {
    if (!table.headers.includes(input.dedupeBy)) throw new BadRequestException(`خانة «${input.dedupeBy}» مش في الشيت`);
    if (input.numberBy && !table.headers.includes(input.numberBy)) throw new BadRequestException(`خانة «${input.numberBy}» مش في الشيت`);
    if (!table.rows.length) throw new BadRequestException("الشيت مفيهوش صفوف");
    const done = await this.db.$transaction(async (tx) => {
      const found = await this.repo.sheetByName(input.name, tx);
      const numberBy = input.numberBy ?? found?.numberBy ?? null;
      const sheet = found ?? await this.repo.createSheet(tx, input.name, input.dedupeBy, numberBy, table.headers);
      const existing = found ? (await this.repo.rowData(sheet.id, tx)).map((r) => cells(r.data)) : [];
      const merge = mergeSheetRows(existing, table.rows, input.dedupeBy);
      const { count } = await this.repo.addRows(tx, sheet.id, merge.added);
      await this.repo.updateSheet(tx, sheet.id, input.dedupeBy, numberBy, mergeColumns(sheet.columns, table.headers));
      const result = { sheetId: sheet.id, name: sheet.name, numberBy, added: count, duplicates: merge.duplicates + (merge.added.length - count), noKey: merge.noKey };
      await this.audit.record({
        module: "notactive", entity: "NotActiveSheet", entityId: sheet.id, action: found ? "merge" : "create", userId: me.id,
        after: { name: sheet.name, file, dedupeBy: input.dedupeBy, numberBy, added: result.added, duplicates: result.duplicates, noKey: result.noKey },
      }, tx);
      return result;
    });
    const inInventory = done.numberBy ? await this.compare(done.sheetId, done.name, done.numberBy) : 0;
    return { sheetId: done.sheetId, added: done.added, duplicates: done.duplicates, noKey: done.noKey, inInventory };
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
  private async views(me: CurrentUser, rows: NotActiveRowRecord[], numberBy: string | null): Promise<NotActiveRowView[]> {
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
      matched: unit(r.matchedUnitId), matchSeen: r.matchSeen, unit: unit(r.unitId),
    }));
  }
}
