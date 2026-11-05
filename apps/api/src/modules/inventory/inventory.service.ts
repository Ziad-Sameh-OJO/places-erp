import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import {
  type CreatedUnit, type Paged, type RecommendedUnit, type UnitDetail, type UnitFilters, type UnitInput, type UnitOptions,
  type UnitRow, type UnitSummary, type UnitTabCounts,
} from "@places/contracts";
import {
  UNIT_TYPES, allowedValue, dayStart, fromDecimal, incomeFigures, isStale, keepsInventory, localDate, recommendUnits, spaceWindow, staleBefore, toDecimal, unitTotal,
  type ClientNeed, type NarrowingAnswers, type UnitType,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { InventoryRepository, type UnitRecord, type UnitRowRecord, type UnitScope } from "./inventory.repository";

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
    return {
      ...this.row(u, s, agents), splitNote: u.splitNote, receivedAt: u.receivedAt?.toISOString() ?? null, enteredAt: u.enteredAt.toISOString(),
      createdBy: u.createdById && by ? { id: u.createdById, name: by.name } : null, updatedAt: u.updatedAt.toISOString(),
    };
  }

  /** M-03 2.1 · 3.2: the serial code and the total are the system's; marketing gets the Live Alert (M-03 7.1). */
  async create(me: CurrentUser, input: UnitInput): Promise<CreatedUnit> {
    await this.check(input, null);
    const unit = await this.db.$transaction(async (tx) => {
      const [{ n }] = (await this.repo.nextCode(tx)) as [{ n: bigint }];
      const u = await tx.unit.create({ data: { code: `U-${n}`, ...toData(input), createdById: me.id, ...(input.receivedAt ? { receivedAt: new Date(input.receivedAt) } : {}) } });
      await this.audit.record({ module: "inventory", entity: "Unit", entityId: u.id, action: "create", userId: me.id, after: u }, tx);
      return u;
    });
    // no link: the unit isn't published to everyone until Manar confirms its PDF (Q15, 2.8)
    await this.notifications.notify({ event: "unit.new", text: `Live Alert: وحدة جديدة ${unit.code} (${unit.project}) اتضافت للانفنتوري` });
    return { id: unit.id, code: unit.code };
  }

  /** The whole sheet is sent back; only what changed is audited (prices too, 2.2), and the PDF waits for Manar again (Q19). */
  async update(me: CurrentUser, id: string, input: UnitInput): Promise<UnitDetail> {
    const s = this.scope(me);
    const before = await this.repo.detail(s, id);
    if (!before) throw new NotFoundException(NO_UNIT);
    await this.check(input, before);
    const data = toData(input);
    const changed = diff(before, data);
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : undefined;
    if (receivedAt && before.receivedAt?.getTime() !== receivedAt.getTime()) changed.receivedAt = [before.receivedAt, receivedAt];
    if (!Object.keys(changed).length) return this.get(me, id);
    await this.db.$transaction(async (tx) => {
      await tx.unit.update({ where: { id }, data: { ...data, ...(receivedAt ? { receivedAt } : {}), pdfStatus: "draft" } });
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
    };
  }
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
    type: u.type, project: u.project, area: u.area, space: u.space, condition: u.condition, floor: u.floor ?? null, building: u.building,
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
