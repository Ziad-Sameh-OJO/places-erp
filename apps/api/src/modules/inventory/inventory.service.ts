import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import {
  type CreatedUnit, type OwnerUpdateInput, type Paged, type RecommendedUnit, type UnitDetail, type UnitFilters, type UnitInput, type UnitOptions,
  type MissingUnitsToday, type UnitImportOptions, type UnitImportReviewRow, type UnitRow, type UnitSummary, type UnitTabCounts,
} from "@places/contracts";
import {
  UNIT_TYPES, allowedValue, carrySides, closedStatus, dayStart, findDuplicates, importDecision, mediaOnTime, fromDecimal, incomeFigures, isStale, keepsInventory, localDate, missingFields, recommendUnits, seesMissingOf, spaceWindow, staleBefore, toDecimal, unitTotal,
  type ClientNeed, type NarrowingAnswers, type UnitType,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { ClientsService } from "../clients/clients.service";
import { InventoryRepository, type ListFilters, type UnitRecord, type UnitRowRecord, type UnitScope } from "./inventory.repository";
import { UnitsService } from "./units.service";
import { IMPORT_TX, type ImportReport, type ParsedSheet } from "../../core/http/import";
import { EXPORT_LIMIT } from "../../core/http/excel";
import { UnitPhotosService } from "./unit-photos.service";

const NO_UNIT = "الوحدة مش موجودة";
/** How many open units a recommendation reads at most, and how many it shows (best first). */
const RECOMMEND_CANDIDATES = 2_000;
const RECOMMEND_SHOWN = 100;

/**
 * M-03 · the units: list (filters, tabs, tiles), one unit, add / edit / archive. Editing is for the people the role
 * matrix lets (Manar and Randa, Q18); every change is audited in its transaction, and an edit sends the PDF back to
 * Manar's confirm (Q19).
 */
@Injectable()
export class InventoryService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: InventoryRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly clients: ClientsService, // M-10 2.1: every unit linked to its owner's file (2.11)
    private readonly units: UnitsService,
    private readonly photos: UnitPhotosService,
  ) {}

  /** For a lead's Visit / Meeting (1.9): open, confirmed units by code, project or space (4 Nov demo meeting). */
  forVisit(q?: string) {
    return this.repo.forVisit(q, 30);
  }

  /**
   * M-03 3.2 · 7.1 (2.12): the units for a lead's client, best first (domain recommendUnits), and the projects the
   * suggestions come from before the questions narrow them (the «المشروع» question's choices).
   */
  async recommend(need: ClientNeed, answers: NarrowingAnswers, tolerancePct: number): Promise<{ items: RecommendedUnit[]; projects: string[] }> {
    if (!(UNIT_TYPES as readonly string[]).includes(need.type)) return { items: [], projects: [] };
    const window = need.space == null ? null : { ...spaceWindow(need.space, tolerancePct), need: need.space };
    const rows = await this.repo.forRecommendation(need.type as UnitType, need.condition, window, RECOMMEND_CANDIDATES);
    const units = rows.map((u) => ({
      ...u, pricePerSqm: u.pricePerSqm ? fromDecimal(u.pricePerSqm.toFixed(2)) : null,
      delivery: typeof (u.details as Record<string, unknown> | null)?.delivery === "string" ? (u.details as Record<string, string>).delivery! : null,
    }));
    const projects = [...new Set(recommendUnits(need, units, {}, tolerancePct).map((r) => r.unit.project))].sort((a, b) => a.localeCompare(b, "ar"));
    const items = recommendUnits(need, units, answers, tolerancePct).slice(0, RECOMMEND_SHOWN).map(({ unit: u, ...r }) => ({
      id: u.id, code: u.code, type: u.type, project: u.project, area: u.area, floor: u.floor, space: u.space, condition: u.condition,
      parking: u.parking, minSplit: u.minSplit, price: r.price == null ? null : toDecimal(r.price), monthly: need.type === "Rent",
      split: r.split, sameArea: r.sameArea, match: r.match,
    }));
    return { items, projects };
  }

  /**
   * The units of a client's list (2.13, M-01 6.1 · M-03 6.1), in the order picked: open units a salesperson may see
   * (confirmed by Manar, Q15). Null when one of them isn't (closed, a draft, archived or unknown).
   */
  async forClientList(ids: string[]): Promise<ClientListUnit[] | null> {
    const rows = new Map((await this.repo.forClientList(ids)).map((u) => [u.id, u]));
    if (ids.some((id) => !rows.has(id))) return null;
    return ids.map((id) => { const u = rows.get(id)!; return { ...u, totalPrice: u.totalPrice?.toFixed(2) ?? null, splitOf: null }; });
  }

  /** «سجّل صفقة» (M-02 2.1 step 1): open, confirmed units by code, project or space, with their agent (the Seller). */
  forDeal(q?: string) {
    return this.repo.forDeal(q, 30);
  }

  /** The unit a new deal names, if it is still open and confirmed; null otherwise. */
  openForDeal(id: string) {
    return this.repo.openForDeal(id);
  }

  /** M-03 6.2 · 7.1 (M-04 4.4): the new open units marketing hasn't pressed Done on yet — drafts too, newest first. */
  forMarketing() {
    return this.repo.forMarketing();
  }

  /** Marketing's Done on a new unit takes it off its board; Undo puts it back (M-04 7.1). Audited. */
  async marketingDone(me: CurrentUser, id: string, done: boolean): Promise<{ code: string }> {
    const u = await this.repo.unitById(id);
    if (!u || u.archivedAt) throw new NotFoundException(NO_UNIT);
    if (!!u.marketingDoneAt === done) throw new BadRequestException(done ? "الوحدة دي اتشالت من لوحة التسويق قبل كده" : "الوحدة دي لسه على لوحة التسويق");
    const at = done ? new Date() : null;
    await this.db.$transaction(async (tx) => {
      await tx.unit.update({ where: { id }, data: { marketingDoneAt: at } });
      await this.audit.record({ module: "marketing", entity: "Unit", entityId: id, action: done ? "marketing-done" : "marketing-undo", userId: me.id, before: { marketingDoneAt: u.marketingDoneAt }, after: { marketingDoneAt: at } }, tx);
    });
    return { code: u.code };
  }

  /** For a task (M-04 4.2): open units, drafts included, by code, project or space. */
  forTasks(q?: string) {
    return this.repo.forTasks(q, 30);
  }

  /** The owners' numbers in the main inventory, for the Not Active comparison (M-03 1.1). */
  ownerPhones() {
    return this.repo.ownerPhones();
  }

  /** Codes for the units a Visit names (1.9), whatever their state now. */
  codes(ids: string[]) {
    return ids.length ? this.repo.codes(ids) : Promise.resolve([]);
  }

  /** The ids that are open units a salesperson may see (1.9). */
  async openForVisit(ids: string[]): Promise<Set<string>> {
    return new Set(ids.length ? (await this.repo.openForVisit(ids)).map((u) => u.id) : []);
  }

  private scope(me: CurrentUser, now = new Date()): UnitScope {
    return { insider: keepsInventory(me.grants), staleBefore: staleBefore(now) };
  }

  async list(me: CurrentUser, filters: UnitFilters): Promise<Paged<UnitRow>> {
    const s = this.scope(me), hidden = me.fields.hidden("inventory"), f = shownFilters(filters, hidden);
    const [rows, total] = await this.repo.list(s, await withMissing(this.repo, s, f), f.tabId ? await this.repo.areaTabs() : []);
    const [agents, links] = await Promise.all([this.names(rows.map((r) => r.agentId)), this.photos.links(rows.flatMap((r) => r.photos.map((p) => p.fileId)))]);
    return { items: rows.map((r) => this.row(r, s, agents, links, hidden)), total, page: f.page, pageSize: f.pageSize };
  }

  /**
   * 2.28 · «تصدير الوحدات» (demo inventory.js, M-12 0.11): the sheet as filtered on the screen, every page, in the same
   * scope (sales: confirmed units only, Q15) and with the same hidden fields blank (M-09). Audited.
   */
  async exportRows(me: CurrentUser, filters: UnitFilters): Promise<UnitRow[]> {
    const s = this.scope(me), hidden = me.fields.hidden("inventory"), f = { ...shownFilters(filters, hidden), page: 1, pageSize: EXPORT_LIMIT };
    const [rows] = await this.repo.list(s, await withMissing(this.repo, s, f), f.tabId ? await this.repo.areaTabs() : []);
    const agents = await this.names(rows.map((r) => r.agentId));
    await this.audit.record({ module: "inventory", entity: "Unit", entityId: "export", action: "export", userId: me.id, after: { filters, rows: rows.length } });
    return rows.map((r) => this.row(r, s, agents, new Map(), hidden));
  }

  async summary(me: CurrentUser): Promise<UnitSummary> {
    const s = this.scope(me);
    const [[available, pdfDraft, stale, divisible], missing] = await Promise.all([this.repo.summary(s), missingUnits(this.repo, s)]);
    return { available, pdfDraft, stale, divisible, missing: missing.length };
  }

  /**
   * 2.20 · «مهامي النهارده»: the units missing data, Manar's the Rent ones, Randa's the rest, the admin's all (demo
   * home.js). The first 5 get a line each; the rest one line that opens the sheet filtered.
   */
  async missingToday(me: CurrentUser): Promise<MissingUnitsToday> {
    const mine = (await missingUnits(this.repo, this.scope(me))).filter((u) => seesMissingOf(me.roles, u.type));
    return { units: mine.slice(0, 5).map(({ id, code, missing }) => ({ id, code, missing })), total: mine.length };
  }

  async tabs(me: CurrentUser, filters: UnitFilters): Promise<UnitTabCounts> {
    const s = this.scope(me), f = shownFilters(filters, me.fields.hidden("inventory"));
    const [all, ...rest] = await this.repo.tabCounts(s, await withMissing(this.repo, s, f), UNIT_TYPES, f.tabId ? await this.repo.areaTabs() : []);
    const closed = rest.pop()!;
    return { all, ...(Object.fromEntries(UNIT_TYPES.map((t, i) => [t, rest[i]!])) as Record<(typeof UNIT_TYPES)[number], number>), closed };
  }

  async options(): Promise<UnitOptions> {
    const [settings, agents] = await Promise.all([this.settings.all(), this.repo.agents()]);
    return { areas: settings.areas, conditions: settings.finishings, agents, paymentMethods: settings.paymentPlans };
  }

  async get(me: CurrentUser, id: string): Promise<UnitDetail> {
    const s = this.scope(me), hidden = me.fields.hidden("inventory");
    const u = await this.repo.detail(s, id);
    if (!u) throw new NotFoundException(NO_UNIT);
    const [agents, links] = await Promise.all([this.names([u.agentId]), this.photos.links(u.photos.map((p) => p.fileId))]);
    const by = u.createdById ? await this.repo.userName(u.createdById) : null;
    const locks = s.insider ? await this.units.locks(me, id) : []; // the deals on it are the inventory team's business
    return {
      ...this.row(u, s, agents, links, hidden), splitNote: hidden.has("splitNote") ? null : u.splitNote, receivedAt: u.receivedAt?.toISOString() ?? null, enteredAt: u.enteredAt.toISOString(),
      createdBy: u.createdById && by ? { id: u.createdById, name: by.name } : null, updatedAt: u.updatedAt.toISOString(), locks,
      mediaUploadedAt: u.mediaUploadedAt?.toISOString() ?? null, mediaOnTime: u.mediaUploadedAt ? mediaOnTime(u.enteredAt, u.mediaUploadedAt) : null,
    };
  }

  /** M-03 2.1 · 3.2: the serial code and the total are the system's; marketing gets the Live Alert (M-03 7.1). */
  async create(me: CurrentUser, sheet: UnitInput): Promise<CreatedUnit> {
    const input = keepFixed(sheet, null, me.fields.fixed("inventory"));
    await this.check(input, null);
    const unit = await this.db.$transaction((tx) => this.insert(tx, me, input));
    // to marketing's board of new units (M-04 4.4), not the unit: it isn't published until Manar confirms its PDF (Q15, 2.8)
    await this.notifications.notify({ event: "unit.new", text: `Live Alert: وحدة جديدة ${unit.code} (${unit.project}) اتضافت للانفنتوري`, link: "/marketing?tab=units" });
    return { id: unit.id, code: unit.code };
  }

  /**
   * 13.1 · 2.38 · units from the template, in one transaction. A repeat is told by the column(s) the uploader picked
   * (domain findDuplicates: all of them match a unit or an earlier row); each repeat is left out unless the reviewer
   * says «ادمج» (a repeat of a unit: its price, owner name and last update) or «ضيفها برضه». Rows the form would refuse
   * are skipped and reported. `save` false = the preview, nothing written. The import (with the picked columns) is
   * audited, and marketing gets one Live Alert with how many units came in (4.4).
   */
  async importUnits(me: CurrentUser, sheet: ParsedSheet<UnitInput>, opts: UnitImportOptions, save: boolean): Promise<ImportReport & { merged: number; review: UnitImportReviewRow[] }> {
    const errors = [...sheet.errors];
    const agents = new Map((await this.repo.agents()).map((a) => [a.name.trim().toLowerCase(), a.id]));
    const valid: { line: number; input: UnitInput }[] = [];
    for (const { line, data } of sheet.rows) {
      const name = data.agentId?.trim().toLowerCase();
      const input = keepFixed({ ...data, agentId: name ? agents.get(name) ?? "" : undefined }, null, me.fields.fixed("inventory")); // the sheet has the agent's name (may be empty, 2.21)
      if (input.agentId === "") { errors.push({ line, column: "الـ Agent", message: "الـ Agent ده مش موجود" }); continue; }
      try { await this.check(input, null); } catch (e) { errors.push({ line, column: "", message: (e as Error).message }); continue; }
      valid.push({ line, input });
    }
    const dups = findDuplicates(valid.map((v) => ({ line: v.line, ...v.input })), await this.repo.importKeys(), opts.dupBy);
    const hidden = me.fields.hidden("inventory");
    const review = valid.map(({ line, input }, i): UnitImportReviewRow => ({
      line, project: input.project, space: input.space, floor: input.floor ?? null, building: input.building ?? null,
      ownerName: hidden.has("ownerName") ? null : input.ownerName ?? null, dupOf: dups[i] ?? null,
    }));
    let added = 0, merged = 0;
    const run = async (tx: Prisma.TransactionClient) => {
      for (const [i, { line, input }] of valid.entries()) {
        const dup = dups[i] ?? null, decision = importDecision(dup, opts.decisions[String(line)]);
        if (decision === "add") { if (save) await this.insert(tx, me, input); added++; }
        if (decision === "merge" && dup && "unit" in dup) { if (save) await this.mergeImported(tx, me, dup.unit, input); merged++; }
      }
      if (save) {
        await this.audit.record({ module: "inventory", entity: "UnitImport", entityId: me.id, action: "import", userId: me.id,
          after: { dupBy: opts.dupBy, rows: sheet.total, added, merged, duplicates: dups.filter(Boolean).length, decisions: opts.decisions } }, tx);
      }
    };
    if (save) await this.db.$transaction(run, IMPORT_TX);
    else await run(this.db);
    if (save && added) await this.notifications.notify({ event: "unit.new", text: `Live Alert: ${added} وحدة جديدة اتضافت للانفنتوري من استيراد Excel`, link: "/marketing?tab=units" });
    return { added, merged, duplicates: dups.filter(Boolean).length, errors, review };
  }

  /** «ادمج (حدّث القديم)» (demo importApprove): the row's price and owner name go on the unit it repeats, updated today; audited, the PDF waits again (Q19). */
  private async mergeImported(tx: Prisma.TransactionClient, me: CurrentUser, code: string, input: UnitInput) {
    const u = await tx.unit.findUniqueOrThrow({ where: { code }, select: { id: true, space: true, pricePerSqm: true, ownerName: true, lastOwnerUpdateAt: true } });
    const price = input.pricePerSqm ? fromDecimal(input.pricePerSqm) : null;
    const data = {
      ...(price !== null ? { pricePerSqm: toDecimal(price), totalPrice: u.space ? toDecimal(unitTotal(price, u.space)) : null } : {}),
      ...(input.ownerName ? { ownerName: input.ownerName } : {}),
      lastOwnerUpdateAt: dayStart(localDate(new Date())), pdfStatus: "draft",
    };
    await tx.unit.update({ where: { id: u.id }, data });
    await this.audit.record({ module: "inventory", entity: "Unit", entityId: u.id, action: "update", userId: me.id,
      before: { pricePerSqm: u.pricePerSqm?.toFixed(2) ?? null, ownerName: u.ownerName, lastOwnerUpdateAt: u.lastOwnerUpdateAt }, after: { ...data, merged: "import" } }, tx);
  }

  /** The serial code, the owner's file and the audit, in the caller's transaction. */
  private async insert(tx: Prisma.TransactionClient, me: CurrentUser, input: UnitInput) {
    const [{ n }] = (await this.repo.nextCode(tx)) as [{ n: bigint }];
    // the owner comes with their first unit, or the unit joins the file their number is on (M-10 2.1, 2.11)
    const ownerId = input.ownerPhone ? await this.clients.joinAsOwner(tx, me.id, { name: input.ownerName ?? null, phone: input.ownerPhone }) : null;
    const u = await tx.unit.create({ data: { code: `U-${n}`, ...toData(input), alsoStatus: input.alsoType ? "available" : null, ownerId, createdById: me.id, ...(input.receivedAt ? { receivedAt: new Date(input.receivedAt) } : {}) } });
    await this.audit.record({ module: "inventory", entity: "Unit", entityId: u.id, action: "create", userId: me.id, after: u }, tx);
    return u;
  }

  /** The whole sheet is sent back; only what changed is audited (prices too, 2.2), and the PDF waits for Manar again (Q19). */
  async update(me: CurrentUser, id: string, sheet: UnitInput): Promise<UnitDetail> {
    const s = this.scope(me);
    const before = await this.repo.detail(s, id);
    if (!before) throw new NotFoundException(NO_UNIT);
    // M-09 field permissions: what the person may not change keeps its value (the form sends the whole sheet)
    const input = keepFixed(sheet, before, me.fields.fixed("inventory"));
    await this.check(input, before);
    const blocked = await this.units.editBlocked(id, { type: input.type, alsoType: input.alsoType ?? null });
    if (blocked) throw new BadRequestException(blocked);
    // Q17: each type keeps its own state (rented / sold) through the edit
    const data = { ...toData(input), ...carrySides(before, { type: input.type, alsoType: input.alsoType ?? null }) };
    const changed = diff(before, data);
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : undefined;
    if (receivedAt && before.receivedAt?.getTime() !== receivedAt.getTime()) changed.receivedAt = [before.receivedAt, receivedAt];
    if (!Object.keys(changed).length) return this.get(me, id);
    await this.db.$transaction(async (tx) => {
      // a new owner number moves the unit to that number's file (made if new); a removed number unlinks it (2.11)
      const owner = "ownerPhone" in changed
        ? { ownerId: data.ownerPhone ? await this.clients.joinAsOwner(tx, me.id, { name: data.ownerName, phone: data.ownerPhone }) : null }
        : {};
      await tx.unit.update({ where: { id }, data: { ...data, ...owner, ...(receivedAt ? { receivedAt } : {}), pdfStatus: "draft" } });
      await this.audit.record({
        module: "inventory", entity: "Unit", entityId: id, action: "update", userId: me.id,
        before: Object.fromEntries(Object.entries(changed).map(([k, [b]]) => [k, b])),
        after: Object.fromEntries(Object.entries(changed).map(([k, [, a]]) => [k, a])),
      }, tx);
    });
    return this.get(me, id);
  }

  /**
   * 2.29 · the demo's unitUpdate (M-03 2.4): the owner was spoken to today. The unit's last update becomes now (so it
   * leaves «محتاجة ابديت»), its open «متابعة مع المالك» tasks are done, and the contact goes on the owner's file
   * (M-10 2.4) — all in one transaction, audited. Only this unit: the owner's file has its own «ابديت مع المالك» for all.
   */
  async ownerUpdate(me: CurrentUser, id: string, input: OwnerUpdateInput): Promise<UnitDetail> {
    if (me.fields.fixed("inventory").has("lastOwnerUpdateAt")) throw new ForbiddenException("الـ Last update مقفول على دورك");
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const u = await this.repo.detail(this.scope(me), id, tx);
      if (!u) throw new NotFoundException(NO_UNIT);
      await tx.unit.update({ where: { id }, data: { lastOwnerUpdateAt: now } });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: id, action: "owner-update", userId: me.id, before: { lastOwnerUpdateAt: u.lastOwnerUpdateAt }, after: { lastOwnerUpdateAt: now, comment: input.comment ?? null } }, tx);
      // the task is the inventory's own (the stale-units job makes it); the tasks module imports this one, so it's closed here
      const open = await tx.task.findMany({ where: { unitId: id, kind: "followup", status: { not: "done" } }, select: { id: true, status: true } });
      await tx.task.updateMany({ where: { id: { in: open.map((t) => t.id) } }, data: { status: "done", doneAt: now } });
      for (const t of open) await this.audit.record({ module: "tasks", entity: "Task", entityId: t.id, action: "status", userId: me.id, before: { status: t.status }, after: { status: "done" } }, tx);
      if (u.ownerId && !me.fields.fixed("clients").has("timeline")) {
        await this.clients.logOwnerUpdate(tx, me.id, u.ownerId, `${u.code} · ${u.project}${input.comment ? ` · ${input.comment}` : ""}`);
      }
    });
    return this.get(me, id);
  }

  /** Archived, never deleted: deals and visits still point at it. */
  async archive(me: CurrentUser, id: string) {
    await this.db.$transaction(async (tx) => {
      const u = await this.repo.detail(this.scope(me), id, tx);
      if (!u) throw new NotFoundException(NO_UNIT);
      await tx.unit.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: id, action: "archive", userId: me.id, before: { code: u.code } }, tx);
    });
  }

  /**
   * A new agent must be someone still working here — the one who brought the unit stays on it after leaving (it's
   * history, and their KPI). Area, finishing and payment method come from the settings' lists. «Last update» is a
   * day that happened.
   */
  private async check(input: UnitInput, before: UnitRecord | null) {
    if (input.agentId && before?.agentId !== input.agentId && !(await this.repo.agents([input.agentId])).length) throw new BadRequestException("الـ Agent ده مش موجود");
    if (input.lastOwnerUpdateAt && input.lastOwnerUpdateAt > localDate(new Date())) throw new BadRequestException("الـ Last update مايبقاش في المستقبل");
    if (input.areaTabId && !(await this.repo.areaTabs()).some((t) => t.id === input.areaTabId)) throw new BadRequestException("تاب المساحة ده اتشال · اختار تاب تاني");
    // the lists (12.7): a new value must be an active one; a unit keeps the value it has even if it was switched off since
    const lists = await this.settings.all();
    if (input.area && !allowedValue(lists.areas, input.area, before?.area)) throw new BadRequestException("اختار Area من القايمة");
    if (input.condition && !allowedValue(lists.finishings, input.condition, before?.condition)) throw new BadRequestException("اختار التشطيب من القايمة");
    const pay = "paymentMethod" in input ? input.paymentMethod : undefined;
    if (pay && !allowedValue(lists.paymentPlans, pay, before?.paymentMethod)) throw new BadRequestException("اختار طريقة الدفع من القايمة");
  }

  private async names(ids: (string | null)[]) {
    const known = [...new Set(ids.filter((x): x is string => !!x))];
    return new Map((known.length ? await this.repo.employeeNames(known) : []).map((e) => [e.id, e.name]));
  }

  private row(u: UnitRowRecord, s: UnitScope, agents: Map<string, string>, links: Map<string, string>, hidden: ReadonlySet<string>): UnitRow {
    return hideFields(this.fullRow(u, s, agents, links, hidden), hidden);
  }

  private fullRow(u: UnitRowRecord, s: UnitScope, agents: Map<string, string>, links: Map<string, string>, hidden: ReadonlySet<string>): UnitRow {
    const money = (d: Prisma.Decimal | null) => (d ? d.toFixed(2) : null);
    const income = u.type === "Income" && u.pricePerSqm && u.leasePerSqm && u.space > 0
      ? incomeFigures({ salePerSqm: fromDecimal(u.pricePerSqm.toFixed(2)), leasePerSqm: fromDecimal(u.leasePerSqm.toFixed(2)), area: u.space })
      : null;
    return {
      id: u.id, code: u.code, type: u.type, alsoType: u.alsoType, status: u.status, alsoStatus: u.alsoStatus,
      project: u.project, area: u.area, space: u.space, condition: u.condition, floor: u.floor, building: u.building, parking: u.parking,
      ownerName: s.insider ? u.ownerName : null, ownerPhone: s.insider ? u.ownerPhone : null,
      pricePerSqm: money(u.pricePerSqm), totalPrice: money(u.totalPrice), leasePerSqm: money(u.leasePerSqm),
      maintenance: u.maintenance, commission: u.commission, paymentMethod: u.paymentMethod, layout: u.layout, comment: u.comment,
      divisible: u.divisible, minSplit: u.minSplit, location: u.location, areaTabId: u.areaTabId,
      agent: u.agentId ? { id: u.agentId, name: agents.get(u.agentId) ?? "" } : null,
      lastOwnerUpdateAt: u.lastOwnerUpdateAt.toISOString(), stale: isStale(u.lastOwnerUpdateAt, new Date()),
      pdfStatus: u.pdfStatus === "confirmed" ? "confirmed" : "draft", createdAt: u.createdAt.toISOString(),
      details: (u.details ?? {}) as UnitRow["details"],
      income: income ? { monthlyRent: toDecimal(income.monthlyRent), annualRent: toDecimal(income.annualRent), yieldPct: income.yieldPct } : null,
      photo: u.photos[0] ? links.get(u.photos[0].fileId) ?? null : null, photoCount: u._count.photos, agreement: !!u.agreementFileId,
      closings: u.locks.map((l) => ({ type: l.type, status: closedStatus(l.type), at: (l.lockedAt ?? u.createdAt).toISOString(), dealCode: s.insider ? l.deal.code : null })),
      missing: missingFields({ ...u, photoCount: u._count.photos }, hidden),
    };
  }
}

/**
 * M-09 field permissions: a hidden field's value never leaves the API: blank in the row (its kind kept, so the screens
 * and documents show «—»), gone from `details`. The screens leave its column, row and input out (they read the same rules).
 */
function hideFields(r: UnitRow, hidden: ReadonlySet<string>): UnitRow {
  if (!hidden.size) return r;
  const h = (k: string) => hidden.has(k);
  return {
    ...r,
    area: h("area") ? "" : r.area, space: h("space") ? 0 : r.space, areaTabId: h("areaTabId") ? null : r.areaTabId, condition: h("condition") ? "" : r.condition,
    floor: h("floor") ? null : r.floor, building: h("building") ? null : r.building, parking: h("parking") ? 0 : r.parking,
    ownerName: h("ownerName") ? null : r.ownerName, ownerPhone: h("ownerPhone") ? null : r.ownerPhone,
    pricePerSqm: h("pricePerSqm") ? null : r.pricePerSqm, totalPrice: h("totalPrice") ? null : r.totalPrice, leasePerSqm: h("leasePerSqm") ? null : r.leasePerSqm,
    income: h("income") || !r.income ? null : h("yield") ? { ...r.income, yieldPct: null } : r.income,
    maintenance: h("maintenance") ? null : r.maintenance, commission: h("commission") ? null : r.commission, paymentMethod: h("paymentMethod") ? null : r.paymentMethod,
    layout: h("layout") ? false : r.layout, comment: h("comment") ? null : r.comment, location: h("location") ? null : r.location, agreement: h("agreement") ? false : r.agreement,
    divisible: h("divisible") ? false : r.divisible, minSplit: h("minSplit") ? null : r.minSplit, agent: h("agent") ? null : r.agent,
    lastOwnerUpdateAt: h("lastOwnerUpdateAt") ? "" : r.lastOwnerUpdateAt, stale: h("stale") ? false : r.stale,
    details: Object.fromEntries(Object.entries(r.details).filter(([k]) => !h(k))),
  };
}

/** Filtering by a hidden field would tell its value: such a filter is dropped. */
function shownFilters(f: UnitFilters, hidden: ReadonlySet<string>): UnitFilters {
  if (!hidden.size) return f;
  const drop = (on: boolean, ...keys: (keyof UnitFilters)[]) => (on ? Object.fromEntries(keys.map((k) => [k, undefined])) : {});
  return {
    ...f, ...drop(hidden.has("area"), "area"), ...drop(hidden.has("condition"), "condition"), ...drop(hidden.has("agent"), "agentId"),
    ...drop(hidden.has("space"), "minSpace", "maxSpace", "tabId"), ...drop(hidden.has("totalPrice"), "minPrice", "maxPrice"),
    ...drop(hidden.has("lastOwnerUpdateAt"), "stale"), ...drop(hidden.has("divisible"), "divisible"),
  };
}

/** A field the person may not set: its value as stored (an edit), or empty (a new unit). Keys a type doesn't have are ignored by toData. */
const EMPTY: Record<string, unknown> = { area: "", space: 0, condition: "", parking: 0, layout: false, divisible: false };
const INPUT_KEYS = ["area", "space", "areaTabId", "condition", "floor", "building", "parking", "agentId", "maintenance", "commission", "location", "layout", "comment",
  "lastOwnerUpdateAt", "divisible", "minSplit", "splitNote", "ownerName", "ownerPhone", "pricePerSqm", "leasePerSqm", "paymentMethod", "delivery", "upfront",
  "security", "payment", "term", "grace", "escalationPct", "link", "contractDuration", "startsOn", "endsOn", "serviceChargeUsd", "tenant", "note"] as const;
function keepFixed(input: UnitInput, before: UnitRecord | null, fixed: ReadonlySet<string>): UnitInput {
  if (!fixed.size) return input;
  const out: Record<string, unknown> = { ...input };
  const stored = (before ?? {}) as Record<string, unknown>, details = (before?.details ?? {}) as Record<string, unknown>;
  for (const k of INPUT_KEYS) {
    if (!fixed.has(k)) continue;
    if (!before) { out[k] = EMPTY[k]; continue; }
    const v = k in stored ? stored[k] : details[k];
    out[k] = v instanceof Date ? localDate(v) : v != null && typeof v === "object" && "toFixed" in v ? (v as Prisma.Decimal).toFixed(2) : v ?? undefined;
  }
  return out as UnitInput;
}

/**
 * 2.20 · the units the person can see (archived aside) that miss data (domain missingFields), newest first.
 * shortcut: checks every unit in memory (one light query), move to SQL if the inventory passes ~20k units.
 */
async function missingUnits(repo: InventoryRepository, s: UnitScope) {
  return (await repo.forMissingCheck(s))
    .map((u) => ({ id: u.id, code: u.code, type: u.type, missing: missingFields({ ...u, photoCount: u._count.photos }) }))
    .filter((u) => u.missing.length);
}

/** The list's «ناقصها بيانات» filter (2.20) as the units it names. */
export async function withMissing(repo: InventoryRepository, s: UnitScope, f: UnitFilters): Promise<ListFilters> {
  return f.missing == null ? f : { ...f, missingIds: (await missingUnits(repo, s)).map((u) => u.id) };
}

/** A unit as the client's PDF list shows it (no owner details). */
export interface ClientListUnit {
  id: string; code: string; type: string; project: string; area: string; floor: string | null; space: number; condition: string; parking: number;
  /** Rent: a month's rent · the others: the sale price */
  totalPrice: string | null;
  /** offered in part (Q20): the whole unit's space; `space` and `totalPrice` are then the client's part */
  splitOf: number | null;
}

type UnitData = ReturnType<typeof toData>;

/** The form → the sheet's columns: the total is computed (M-03 3.2), the one-type columns go to `details`. */
function toData(u: UnitInput) {
  const price = u.pricePerSqm ?? null;
  const details: Record<string, string | number> = {};
  const put = (k: string, v: string | number | undefined) => { if (v !== undefined) details[k] = v; };
  if (u.type === "Resale") put("delivery", u.delivery);
  if (u.type === "Rent") {
    put("delivery", u.delivery); put("upfront", u.upfront); put("security", u.security); put("payment", u.payment); put("term", u.term); put("grace", u.grace);
    put("escalationPct", u.escalationPct);
  }
  if (u.type === "Income") {
    put("link", u.link); put("contractDuration", u.contractDuration); put("startsOn", u.startsOn); put("endsOn", u.endsOn);
    put("escalationPct", u.escalationPct); put("serviceChargeUsd", u.serviceChargeUsd && toDecimal(fromDecimal(u.serviceChargeUsd))); put("tenant", u.tenant); put("note", u.note);
  }
  return {
    type: u.type, alsoType: u.alsoType ?? null, project: u.project, area: u.area, space: u.space, condition: u.condition, floor: u.floor ?? null, building: u.building ?? null,
    parking: u.parking, agentId: u.agentId ?? null, ownerName: u.ownerName ?? null, ownerPhone: u.ownerPhone ?? null,
    pricePerSqm: price ? toDecimal(fromDecimal(price)) : null, totalPrice: price && u.space ? toDecimal(unitTotal(fromDecimal(price), u.space)) : null,
    leasePerSqm: u.type === "Income" && u.leasePerSqm ? toDecimal(fromDecimal(u.leasePerSqm)) : null,
    maintenance: u.maintenance ?? null, commission: u.commission ?? null, layout: u.layout, comment: u.comment ?? null,
    paymentMethod: u.type === "Rent" ? null : (u.paymentMethod ?? null),
    details, location: u.location ?? null, areaTabId: u.areaTabId ?? null,
    divisible: u.divisible, minSplit: u.divisible ? (u.minSplit ?? null) : null, splitNote: u.divisible ? (u.splitNote ?? null) : null,
    lastOwnerUpdateAt: dayStart(u.lastOwnerUpdateAt ?? localDate(new Date())),
  };
}

/** Field → [before, after] for what really changed (money as 2-place decimal strings, dates by instant). */
function diff(before: UnitRecord, after: UnitData): Record<string, [unknown, unknown]> {
  const norm = (v: unknown): string => {
    if (v == null) return "";
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object" && "toFixed" in v && typeof v.toFixed === "function") return (v as Prisma.Decimal).toFixed(2);
    if (typeof v === "object") return JSON.stringify(Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))));
    return String(v);
  };
  const out: Record<string, [unknown, unknown]> = {};
  for (const [k, a] of Object.entries(after)) {
    const b = (before as Record<string, unknown>)[k];
    if (norm(b) !== norm(a)) out[k] = [b instanceof Object && "toFixed" in b ? norm(b) : b, a];
  }
  return out;
}
