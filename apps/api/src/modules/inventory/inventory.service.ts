import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import {
  type CreatedUnit, type Paged, type RecommendedUnit, type UnitDetail, type UnitFilters, type UnitInput, type UnitOptions,
  type UnitRow, type UnitSummary, type UnitTabCounts,
} from "@places/contracts";
import {
  UNIT_TYPES, allowedValue, carrySides, closedStatus, dayStart, fromDecimal, incomeFigures, isStale, keepsInventory, localDate, recommendUnits, spaceWindow, staleBefore, toDecimal, unitTotal,
  type ClientNeed, type NarrowingAnswers, type UnitType,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { ClientsService } from "../clients/clients.service";
import { InventoryRepository, type UnitRecord, type UnitRowRecord, type UnitScope } from "./inventory.repository";
import { UnitsService } from "./units.service";
import { IMPORT_TX, type ImportReport, type ParsedSheet } from "../../core/http/import";

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

  async list(me: CurrentUser, f: UnitFilters): Promise<Paged<UnitRow>> {
    const s = this.scope(me);
    const [rows, total] = await this.repo.list(s, f, f.tabId ? await this.repo.areaTabs() : []);
    const agents = await this.names(rows.map((r) => r.agentId));
    return { items: rows.map((r) => this.row(r, s, agents)), total, page: f.page, pageSize: f.pageSize };
  }

  async summary(me: CurrentUser): Promise<UnitSummary> {
    const s = this.scope(me);
    const [available, pdfDraft, stale, divisible] = await this.repo.summary(s);
    return { available, pdfDraft, stale, divisible };
  }

  async tabs(me: CurrentUser, f: UnitFilters): Promise<UnitTabCounts> {
    const [all, ...rest] = await this.repo.tabCounts(this.scope(me), f, UNIT_TYPES, f.tabId ? await this.repo.areaTabs() : []);
    const closed = rest.pop()!;
    return { all, ...(Object.fromEntries(UNIT_TYPES.map((t, i) => [t, rest[i]!])) as Record<(typeof UNIT_TYPES)[number], number>), closed };
  }

  async options(): Promise<UnitOptions> {
    const [settings, agents] = await Promise.all([this.settings.all(), this.repo.agents()]);
    return { areas: settings.areas, conditions: settings.finishings, agents, paymentMethods: settings.paymentPlans };
  }

  async get(me: CurrentUser, id: string): Promise<UnitDetail> {
    const s = this.scope(me);
    const u = await this.repo.detail(s, id);
    if (!u) throw new NotFoundException(NO_UNIT);
    const agents = await this.names([u.agentId]);
    const by = u.createdById ? await this.repo.userName(u.createdById) : null;
    const locks = s.insider ? await this.units.locks(me, id) : []; // the deals on it are the inventory team's business
    return {
      ...this.row(u, s, agents), splitNote: u.splitNote, receivedAt: u.receivedAt?.toISOString() ?? null, enteredAt: u.enteredAt.toISOString(),
      createdBy: u.createdById && by ? { id: u.createdById, name: by.name } : null, updatedAt: u.updatedAt.toISOString(), locks,
    };
  }

  /** M-03 2.1 · 3.2: the serial code and the total are the system's; marketing gets the Live Alert (M-03 7.1). */
  async create(me: CurrentUser, input: UnitInput): Promise<CreatedUnit> {
    await this.check(input, null);
    const unit = await this.db.$transaction((tx) => this.insert(tx, me, input));
    // to marketing's board of new units (M-04 4.4), not the unit: it isn't published until Manar confirms its PDF (Q15, 2.8)
    await this.notifications.notify({ event: "unit.new", text: `Live Alert: وحدة جديدة ${unit.code} (${unit.project}) اتضافت للانفنتوري`, link: "/marketing?tab=units" });
    return { id: unit.id, code: unit.code };
  }

  /**
   * 13.1 · old units from the template, in one transaction. A row is a duplicate when a unit (or an earlier row) has the
   * same project, space, floor, building and owner number (the demo's key for «البيانات كاملة», M-03 7.1): it's skipped.
   * Rows the form would refuse are skipped and reported. `save` false = the preview's counts, nothing written.
   * No Live Alert per unit: an old sheet isn't news for marketing.
   */
  async importUnits(me: CurrentUser, sheet: ParsedSheet<UnitInput>, save: boolean): Promise<ImportReport> {
    const errors = [...sheet.errors];
    const agents = new Map((await this.repo.agents()).map((a) => [a.name.trim().toLowerCase(), a.id]));
    const seen = new Set<string>();
    let added = 0, duplicates = 0;
    const run = async (tx: Prisma.TransactionClient) => {
      for (const { line, data } of sheet.rows) {
        const input = { ...data, agentId: agents.get(data.agentId.trim().toLowerCase()) ?? "" }; // the sheet has the agent's name
        if (!input.agentId) { errors.push({ line, column: "الـ Agent", message: "الـ Agent ده مش موجود" }); continue; }
        try { await this.check(input, null); } catch (e) { errors.push({ line, column: "", message: (e as Error).message }); continue; }
        const key = { project: input.project, space: input.space, floor: input.floor ?? null, building: input.building, ownerPhone: input.ownerPhone ?? null };
        const id = JSON.stringify({ ...key, project: key.project.toLowerCase() });
        if (seen.has(id) || (await tx.unit.findFirst({ where: { ...key, project: { equals: key.project, mode: "insensitive" }, archivedAt: null }, select: { id: true } }))) { duplicates++; continue; }
        seen.add(id);
        if (save) await this.insert(tx, me, input);
        added++;
      }
    };
    if (save) await this.db.$transaction(run, IMPORT_TX);
    else await run(this.db);
    return { added, duplicates, errors };
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
  async update(me: CurrentUser, id: string, input: UnitInput): Promise<UnitDetail> {
    const s = this.scope(me);
    const before = await this.repo.detail(s, id);
    if (!before) throw new NotFoundException(NO_UNIT);
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
    if (before?.agentId !== input.agentId && !(await this.repo.agents([input.agentId])).length) throw new BadRequestException("الـ Agent ده مش موجود");
    if (input.lastOwnerUpdateAt && input.lastOwnerUpdateAt > localDate(new Date())) throw new BadRequestException("الـ Last update مايبقاش في المستقبل");
    if (input.areaTabId && !(await this.repo.areaTabs()).some((t) => t.id === input.areaTabId)) throw new BadRequestException("تاب المساحة ده اتشال · اختار تاب تاني");
    // the lists (12.7): a new value must be an active one; a unit keeps the value it has even if it was switched off since
    const lists = await this.settings.all();
    if (!allowedValue(lists.areas, input.area, before?.area)) throw new BadRequestException("اختار Area من القايمة");
    if (!allowedValue(lists.finishings, input.condition, before?.condition)) throw new BadRequestException("اختار التشطيب من القايمة");
    const pay = "paymentMethod" in input ? input.paymentMethod : undefined;
    if (pay && !allowedValue(lists.paymentPlans, pay, before?.paymentMethod)) throw new BadRequestException("اختار طريقة الدفع من القايمة");
  }

  private async names(ids: (string | null)[]) {
    const known = [...new Set(ids.filter((x): x is string => !!x))];
    return new Map((known.length ? await this.repo.employeeNames(known) : []).map((e) => [e.id, e.name]));
  }

  private row(u: UnitRowRecord, s: UnitScope, agents: Map<string, string>): UnitRow {
    const money = (d: Prisma.Decimal | null) => (d ? d.toFixed(2) : null);
    const income = u.type === "Income" && u.pricePerSqm && u.leasePerSqm
      ? incomeFigures({ salePerSqm: fromDecimal(u.pricePerSqm.toFixed(2)), leasePerSqm: fromDecimal(u.leasePerSqm.toFixed(2)), area: u.space })
      : null;
    return {
      id: u.id, code: u.code, type: u.type, alsoType: u.alsoType, status: u.status, alsoStatus: u.alsoStatus,
      project: u.project, area: u.area, space: u.space, condition: u.condition, floor: u.floor, building: u.building, parking: u.parking,
      ownerName: s.insider ? u.ownerName : null, ownerPhone: s.insider ? u.ownerPhone : null,
      pricePerSqm: money(u.pricePerSqm), totalPrice: money(u.totalPrice), leasePerSqm: money(u.leasePerSqm),
      maintenance: u.maintenance, commission: u.commission, paymentMethod: u.paymentMethod,
      divisible: u.divisible, minSplit: u.minSplit, location: u.location, areaTabId: u.areaTabId,
      agent: u.agentId ? { id: u.agentId, name: agents.get(u.agentId) ?? "" } : null,
      lastOwnerUpdateAt: u.lastOwnerUpdateAt.toISOString(), stale: isStale(u.lastOwnerUpdateAt, new Date()),
      pdfStatus: u.pdfStatus === "confirmed" ? "confirmed" : "draft", createdAt: u.createdAt.toISOString(),
      details: (u.details ?? {}) as UnitRow["details"],
      income: income ? { monthlyRent: toDecimal(income.monthlyRent), annualRent: toDecimal(income.annualRent), yieldPct: income.yieldPct } : null,
      closings: u.locks.map((l) => ({ type: l.type, status: closedStatus(l.type), at: (l.lockedAt ?? u.createdAt).toISOString(), dealCode: s.insider ? l.deal.code : null })),
    };
  }
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
  if (u.type === "Income") {
    put("link", u.link); put("contractDuration", u.contractDuration); put("startsOn", u.startsOn); put("endsOn", u.endsOn);
    put("escalationPct", u.escalationPct); put("serviceChargeUsd", u.serviceChargeUsd && toDecimal(fromDecimal(u.serviceChargeUsd))); put("tenant", u.tenant); put("note", u.note);
  }
  return {
    type: u.type, alsoType: u.alsoType ?? null, project: u.project, area: u.area, space: u.space, condition: u.condition, floor: u.floor ?? null, building: u.building,
    parking: u.parking, agentId: u.agentId, ownerName: u.ownerName ?? null, ownerPhone: u.ownerPhone ?? null,
    pricePerSqm: price ? toDecimal(fromDecimal(price)) : null, totalPrice: price ? toDecimal(unitTotal(fromDecimal(price), u.space)) : null,
    leasePerSqm: u.type === "Income" ? toDecimal(fromDecimal(u.leasePerSqm)) : null,
    maintenance: u.maintenance ?? null, commission: u.commission ?? null,
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
