import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import {
  KpiWatch, type ActivityInput, type ActivityResultInput, type ActivityView, type KpiBandsInput, type KpiBoard, type KpiCardSummary, type KpiCardView,
  type KpiCompany, type KpiDeliveryInput, type KpiItemsInput, type KpiLogEntry, type KpiPayInput, type KpiQuarterView, type KpiToday, type MyActivities, type TaskKpiEffect,
  type KpiBonusInput, type KpiSheetSetup,
} from "@places/contracts";
import {
  INVENTORY_DEPARTMENT, INVENTORY_MANAGER, canManageCard, invManagerMakesCard,
  type Bands, type LeadClocks, type MetricParams, type Method, kpiTodayLines, leadClocks, bandLabel, bandTone, calcText, canEnterManual, closeAlert, dayStart, fromDecimal, itemAchievement, kpiPeriodStart, levelLabel, metricProblem, nextQuarter, payoutDelta, previousQuarter, quarterLabel, taskCardFollower, timedTasks, toDecimal, TASKS_ON_TIME_ITEM, type ActivityKind,
  type SheetField, SHEET_FIELDS, SHEET_FIELD_KEYS, dealRowOf, monthBounds, quarterMonths, sheetFigures,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { DocumentsService, esc, layout } from "../../core/documents/documents.service";
import { MailService } from "../../core/mail/mail.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { type CardRecord, KpisRepository } from "./kpis.repository";

const MODULE = "kpis";
const LINK = "/kpis";
/** Out of reach or gone: the same answer, so it doesn't tell whether the card exists. */
const NO_CARD = "الكارت ده مش موجود أو مش من حقك تشوفه";
const CLOSED = "الربع اتقفل · مفيش تعديل";
/** 11.14: the watcher never sees these in the changes log. */
const MONEY_ENTITIES = ["KpiPay", "KpiBands", "KpiQuarterClose", "KpiBonusRule"];
const NO_MONEY = "الفلوس مش في صلاحياتك";
const NO_PLAN = "خطة التحسين مش في صلاحياتك";

/** M-09 field permissions: a hidden result leaves no trace (its tier and tone tell it too). */
function hideScore<T extends { score: number; tone: "ok" | "warn" | "bad"; tier: string }>(w: Who, x: T): T {
  return w.noScore ? { ...x, score: 0, tone: "ok", tier: "" } : x;
}
function hideCard(w: Who, v: KpiCardView): KpiCardView {
  const out = hideScore(w, { ...v, plan: w.noPlan ? null : v.plan });
  return w.noScore ? { ...out, items: out.items.map((it) => ({ ...it, achievement: 0, contribution: 0 })) } : out;
}

/** `noScore` / `noPlan` / `fixedMoney` / `fixedPlan`: the person's M-09 field rules on the card (`noMoney` covers them too). */
export interface Who { me: CurrentUser; watcher: boolean; edit: boolean; approve: boolean; all: boolean; noMoney: boolean; noScore: boolean; noPlan: boolean; fixedMoney: boolean; fixedPlan: boolean }
type Quarter = { id: string; status: string; sheetsAt?: Date | null; sheetsById?: string | null };

const piasters = (d: Prisma.Decimal | null) => (d == null ? 0 : fromDecimal(d.toFixed(2)));
const num = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));
const bandsOf = (b: { top: number; full: number; partial: number; low: number; rewardPct: number; cutPct: number }): Bands =>
  ({ top: b.top, full: b.full, partial: b.partial, low: b.low, rewardPercent: b.rewardPct, cutPercent: b.cutPct });

/**
 * M-12 · KPI cards: my card (11.2), my team as the follower (11.3), the whole company's money and quarter (11.4), the
 * item source editor and a new quarter (11.11), and the KPI watcher who runs it all without money (11.14).
 * Who sees what is decided here per card (owner · follower · everyone for kpis approve/edit and the watcher).
 */
@Injectable()
export class KpisService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: KpisRepository,
    private readonly audit: AuditService,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly docs: DocumentsService,
    private readonly mail: MailService,
  ) {}

  private async watchers(): Promise<string[]> {
    const w = KpiWatch.safeParse(await this.repo.watchers());
    return w.success ? w.data : [];
  }

  /** Operations' New Lead and Draft clocks, from the KPI items that measure them (11.15 · 4 Nov meeting: no timing in the code). */
  async leadClocks(): Promise<LeadClocks> {
    return leadClocks(await this.repo.leadClockItems());
  }

  async who(me: CurrentUser): Promise<Who> {
    const watcher = (await this.watchers()).includes(me.id);
    const edit = me.grants.can("kpis", "edit"), approve = me.grants.can("kpis", "approve");
    // M-09 field permissions only hide more: a hidden «money» is the watcher's view of it (11.14), everywhere money goes
    const hidden = me.fields.hidden("kpis"), fixed = me.fields.fixed("kpis");
    return { me, watcher, edit, approve, all: edit || approve || watcher, noMoney: (watcher && !edit && !approve) || hidden.has("money"),
      noScore: hidden.has("score"), noPlan: hidden.has("plan"), fixedMoney: fixed.has("money"), fixedPlan: fixed.has("plan") };
  }

  /** The follower approves and types the follower's manual items; «الملاك» (no follower) = a Super Admin who isn't the card's owner. */
  private isFollower(w: Who, c: { followerId: string | null; employeeId: string }) {
    return c.followerId ? c.followerId === w.me.employeeId : w.me.roles.includes("admin") && c.employeeId !== w.me.employeeId;
  }

  private canSee(w: Who, c: { followerId: string | null; employeeId: string }) {
    return w.all || c.employeeId === w.me.employeeId || this.isFollower(w, c);
  }

  private async current(tx?: Prisma.TransactionClient): Promise<Quarter> {
    const q = await this.repo.currentQuarter(tx);
    if (!q) throw new NotFoundException("مفيش ربع شغال");
    return q;
  }

  private qView(q: Quarter): KpiQuarterView {
    return { id: q.id, label: quarterLabel(q.id), status: q.status === "closed" ? "closed" : "open" };
  }

  /** A card of the current quarter the person may see. */
  private async visibleCard(w: Who, id: string) {
    const [c, q] = await Promise.all([this.repo.card(id), this.current()]);
    if (!c || c.quarter !== q.id || !this.canSee(w, c)) throw new NotFoundException(NO_CARD);
    return { c, q };
  }

  private async openCard(w: Who, id: string) {
    const r = await this.visibleCard(w, id);
    if (r.q.status !== "open") throw new ConflictException(CLOSED);
    return r;
  }

  /** The item list, weights, targets and sources: the follower, «kpis: edit», the watcher (meeting 4 Nov), and the Inventory Manager on her own card (11.19). */
  private canManage(w: Who, c: CardRecord) {
    return canManageCard({ isFollower: this.isFollower(w, c), edit: w.edit, watcher: w.watcher, roles: w.me.roles, ownCard: c.employeeId === w.me.employeeId });
  }

  private score(c: CardRecord) {
    return c.items.reduce((s, it) => s + it.weight * this.ach(it), 0);
  }

  private ach(it: CardRecord["items"][number]) {
    return itemAchievement({ method: it.method as Method, direction: it.direction as "at-least" | "at-most", goal: Number(it.goal), value: num(it.value), required: it.required, delivered: it.deliveries.length });
  }

  /** 11.4: reward (+) or deduction (−) on the salary or the bonus (the bonus defaults to one month's salary). */
  private delta(c: CardRecord, score: number, b: Bands) {
    const salary = piasters(c.employee.salary);
    const amount = c.payBase === "salary" ? salary : c.payAmount == null ? salary : piasters(c.payAmount);
    return payoutDelta(score, { base: c.payBase === "salary" ? "salary" : "bonus", amount, monthlySalary: salary }, b);
  }

  private summary(w: Who, c: CardRecord, b: Bands): KpiCardSummary {
    const s = this.score(c);
    return hideScore(w, {
      id: c.id, employeeId: c.employeeId, name: c.employee.name, title: c.employee.jobTitle, follower: c.follower?.name ?? "الملاك",
      score: Math.round(s * 10) / 10, tone: bandTone(s, b), tier: w.noMoney ? levelLabel(s, b) : bandLabel(s, b),
      below: c.items.filter((it) => this.ach(it) < 1).length, approved: !!c.approvedAt,
      money: w.noMoney ? null : toDecimal(this.delta(c, s, b)),
    });
  }

  /** «كارتي» · «فريقي» · «كل الشركة»: the scope goes into the query. */
  async board(me: CurrentUser, scope: "me" | "team" | "mine" | "all"): Promise<KpiBoard> {
    const w = await this.who(me);
    if (scope === "all" && !w.all) throw new ForbiddenException("كل الشركة للإدارة والـ Office Manager ومسؤول الـ KPIs");
    const q = await this.current();
    const mine: Prisma.KpiCardWhereInput = me.employeeId ? { followerId: me.employeeId } : { id: "-" };
    // «الملاك» follow the cards with no follower: a Super Admin sees them under «فريقي», except his own
    const team: Prisma.KpiCardWhereInput = me.roles.includes("admin") ? { OR: [mine, { followerId: null, employeeId: { not: me.employeeId ?? "-" } }] } : mine;
    const own: Prisma.KpiCardWhereInput = { employeeId: me.employeeId ?? "-" };
    const where = scope === "me" ? own : scope === "team" ? team : scope === "mine" ? { OR: [own, team] } : {};
    // 11.19: the Inventory Manager also sees who on her team has no card yet, to make one she follows
    const inv = scope === "mine" && q.status === "open" && me.employeeId && me.roles.includes(INVENTORY_MANAGER);
    const [cards, bands, missing] = await Promise.all([this.repo.cards({ quarter: q.id, ...where }), this.repo.bands(),
      inv ? this.repo.invWithoutCard(q.id, INVENTORY_DEPARTMENT, me.employeeId!) : Promise.resolve([])]);
    const b = bandsOf(bands);
    return { quarter: this.qView(q), cards: cards.map((c) => this.summary(w, c, b)).sort((x, y) => (w.noScore ? x.name.localeCompare(y.name, "ar") : x.score - y.score)), seesMoney: !w.noMoney, seesAll: w.all,
      missing: missing.map((p) => ({ id: p.id, name: p.name, title: p.jobTitle })) };
  }

  /**
   * 11.16 · home: my card (any quarter state, as the demo) and, while the quarter is open, what waits on me: the cards
   * I follow to approve, the manual numbers I type on others' cards, my own hand-ins (domain kpiTodayLines).
   */
  async today(me: CurrentUser): Promise<KpiToday> {
    const q = await this.repo.currentQuarter();
    if (!q) return { mine: null, lines: [] };
    const w = await this.who(me);
    const emp = me.employeeId ?? "-";
    const follows: Prisma.KpiCardWhereInput = me.roles.includes("admin") ? { OR: [{ followerId: emp }, { followerId: null, employeeId: { not: emp } }] } : { followerId: emp };
    const enters: Prisma.KpiCardWhereInput = { items: { some: { method: "manual", enteredBy: { hasSome: [me.id, ...me.roles] } } } };
    const [cards, bands] = await Promise.all([this.repo.cards({ quarter: q.id, OR: [{ employeeId: emp }, follows, enters] }), this.repo.bands()]);
    const b = bandsOf(bands);
    const score = (c: CardRecord) => (w.noScore ? null : Math.round(this.score(c) * 10) / 10);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const lines = q.status !== "open" ? [] : kpiTodayLines(cards.map((c) => ({
      id: c.id, employeeId: c.employeeId, followerId: c.followerId, approved: !!c.approvedAt,
      items: c.items.map((it) => ({ title: it.title, method: it.method as Method, enteredBy: it.enteredBy, report: it.report, required: it.required, delivered: it.deliveries.length })),
    })), { userId: me.id, employeeId: me.employeeId, roles: me.roles }).map((l) => { const c = byId.get(l.cardId)!; return { ...l, name: c.employee.name, score: score(c) }; });
    const c = cards.find((x) => x.employeeId === me.employeeId);
    const below = c ? c.items.filter((it) => this.ach(it) < 1) : [];
    const mine = c && {
      id: c.id, quarter: quarterLabel(q.id), score: score(c), tone: w.noScore ? "ok" as const : bandTone(this.score(c), b), follower: c.follower?.name ?? "الملاك", belowCount: below.length,
      below: below.slice(0, 3).map((it) => ({ title: it.title, targetText: it.targetText, method: it.method as Method, value: num(it.value), delivered: it.deliveries.length, required: it.required })),
    };
    return { mine: mine ?? null, lines };
  }

  async card(me: CurrentUser, id: string): Promise<KpiCardView> {
    const w = await this.who(me);
    const { c, q } = await this.visibleCard(w, id);
    return this.view(w, c, q);
  }

  private async view(w: Who, c: CardRecord, q: Quarter): Promise<KpiCardView> {
    const [bands, people, roles, reports] = await Promise.all([this.repo.bands(), this.repo.people(), this.repo.roles(), this.repo.reportNames()]);
    const b = bandsOf(bands), s = this.score(c), open = q.status === "open";
    const names = new Map<string, string>([...people.map((p) => [p.userId, p.name] as const), ...roles.map((r) => [r.key, r.label] as const)]);
    const follower = this.isFollower(w, c), mine = c.employeeId === w.me.employeeId, manage = open && this.canManage(w, c);
    const approver = c.approvedBy ? people.find((p) => p.userId === c.approvedBy)?.name ?? "" : "";
    const details = await this.details(c, q);
    return hideCard(w, {
      id: c.id, quarter: this.qView(q), employee: { id: c.employeeId, name: c.employee.name, title: c.employee.jobTitle },
      follower: { id: c.followerId, name: c.follower?.name ?? "الملاك" },
      score: Math.round(s * 10) / 10, tone: bandTone(s, b), tier: w.noMoney ? levelLabel(s, b) : bandLabel(s, b), plan: c.plan,
      approved: c.approvedAt ? { by: approver, at: c.approvedAt.toISOString() } : null,
      pay: w.noMoney ? null : {
        base: c.payBase === "salary" ? "salary" : "bonus", period: c.payPeriod === "month" ? "month" : "quarter",
        amount: c.payAmount?.toFixed(2) ?? null, salary: c.employee.salary.toFixed(2), delta: toDecimal(this.delta(c, s, b)),
      },
      items: c.items.map((it) => {
        const a = this.ach(it);
        const params = (it.params ?? {}) as Record<string, string | number>;
        return {
          id: it.id, key: it.key, title: it.title, weight: it.weight, targetText: it.targetText, source: it.source,
          method: it.method as Method, module: it.module, direction: it.direction as "at-least" | "at-most", goal: Number(it.goal),
          metric: it.metric, params, enteredBy: it.enteredBy, report: it.report, required: it.required,
          value: num(it.value), delivered: it.deliveries.length, detail: details.get(it.id) ?? null,
          deliveries: it.deliveries.map((d) => ({ id: d.id, at: d.at.toISOString(), link: d.link, file: !!d.fileId })),
          calc: calcText({ ...it, method: it.method as Method, params: params as MetricParams, report: it.report && (reports.find((r) => r.id === it.report)?.name ?? it.report) }, (x) => names.get(x) ?? x),
          achievement: Math.round(a * 1000) / 10, contribution: Math.round(it.weight * a * 10) / 10,
          canEnter: open && it.method === "manual" && canEnterManual(it.enteredBy, { userId: w.me.id, roles: w.me.roles, isFollower: follower }),
          canDeliver: open && mine && it.method === "report" && !it.report && it.deliveries.length < (it.required ?? 0),
        };
      }),
      can: { manage, approve: open && follower && !c.approvedAt, plan: open && follower && !w.fixedPlan, pay: open && w.edit && !w.fixedMoney, admin: open && (w.edit || w.watcher), sheet: this.canSheet(w, q) },
      options: manage ? { people: people.map((p) => ({ id: p.id, userId: p.userId, name: p.name })), roles } : null,
    });
  }

  /**
   * 11.15 · the line under a timed item (demo `detail`): «5 في الميعاد من 8 · اتأخرت في: …». Read now, while the item's
   * number is the daily job's (kpi-refresh), so the two can differ until tomorrow's run.
   */
  private async details(c: CardRecord, q: Quarter) {
    const out = new Map<string, string>(), now = new Date();
    for (const it of c.items.filter((x) => x.method === "system" && (x.metric === "newLeadRoute" || x.metric === "draftAction"))) {
      const p = (it.params ?? {}) as MetricParams, from = kpiPeriodStart(p.per, now, q.id);
      out.set(it.id, it.metric === "newLeadRoute"
        ? timedTasks(await this.repo.newLeadTasks(from, c.employee.userId), (Number(p.min) || 30) * 60_000, now, "min").detail
        : timedTasks(await this.repo.draftTasks(from), (Number(p.hours) || 24) * 3_600_000, now, "hour").detail);
    }
    return out;
  }

  /** Watchers hear of every change but never of money (11.14); whoever made it doesn't need telling. */
  private async tell(me: CurrentUser, text: string) {
    const to = (await this.watchers()).filter((x) => x !== me.id);
    if (to.length) await this.notifications.notify({ event: "kpi.changed", text, link: LINK, userIds: to });
  }

  /** 11.3 · 11.11: the editor saves the whole item list. Kept items keep their value, key and hand-ins. */
  async saveItems(me: CurrentUser, id: string, input: KpiItemsInput) {
    const w = await this.who(me);
    const { c, q } = await this.openCard(w, id);
    if (!this.canManage(w, c)) throw new ForbiddenException("البنود بيعدّلها المتابع أو مسؤول الـ KPIs");
    const known = new Set([...(await this.repo.people()).map((p) => p.userId), ...(await this.repo.roles()).map((r) => r.key), "follower"]);
    const items = input.items.map((it) => {
      const system = it.method === "system";
      const problem = system ? metricProblem(it.metric, it.params as MetricParams) : null;
      if (problem) throw new BadRequestException(`«${it.title}»: ${problem}`);
      if (it.method === "manual" && it.enteredBy.some((x) => !known.has(x))) throw new BadRequestException(`«${it.title}»: فيه شخص أو دور مش موجود`);
      if (it.id && !c.items.some((x) => x.id === it.id)) throw new BadRequestException("فيه بند مش من الكارت ده");
      return {
        ...it, metric: system ? it.metric : null, params: system ? it.params : {},
        enteredBy: it.method === "manual" ? it.enteredBy : ["follower"], required: it.method === "report" ? it.required : null,
      };
    });
    await this.db.$transaction(async (tx) => {
      const kept = new Set(items.flatMap((it) => (it.id ? [it.id] : [])));
      await tx.kpiItem.deleteMany({ where: { cardId: id, id: { notIn: [...kept] } } });
      // two passes: positions are unique per card, so move the kept ones out of the way first
      for (const [i, itemId] of [...kept].entries()) await tx.kpiItem.update({ where: { id: itemId }, data: { position: -1 - i } });
      for (const [position, { id: itemId, ...data }] of items.entries()) {
        if (itemId) await tx.kpiItem.update({ where: { id: itemId }, data: { ...data, position } });
        else await tx.kpiItem.create({ data: { ...data, position, cardId: id } });
      }
      await this.audit.record({ module: MODULE, entity: "KpiItems", entityId: id, action: "update", userId: me.id,
        before: { items: c.items.map((it) => ({ ...it, deliveries: undefined })) }, after: { summary: `بنود كارت ${c.employee.name} اتعدّلت`, items } }, tx);
    });
    await this.tell(me, `${me.name} عدّل بنود كارت ${c.employee.name}`);
    return this.view(w, (await this.repo.card(id))!, q);
  }

  /** 11.3: a manual item, typed by whoever the item names (the follower by default). */
  async setValue(me: CurrentUser, id: string, itemId: string, value: number) {
    const w = await this.who(me);
    const { c } = await this.openCard(w, id);
    const it = c.items.find((x) => x.id === itemId);
    if (!it || it.method !== "manual") throw new NotFoundException("البند ده مش يدوي أو مش في الكارت");
    if (!canEnterManual(it.enteredBy, { userId: me.id, roles: me.roles, isFollower: this.isFollower(w, c) })) throw new ForbiddenException("الرقم ده بيدخّله اللي البند بيحدده");
    await this.db.$transaction(async (tx) => {
      await tx.kpiItem.update({ where: { id: itemId }, data: { value } });
      await this.audit.record({ module: MODULE, entity: "KpiItem", entityId: itemId, action: "update", userId: me.id,
        before: { value: num(it.value) }, after: { value, summary: `${c.employee.name} · ${it.title}: ${value}` } }, tx);
    });
    await this.tell(me, `${me.name} دخّل ${value} في «${it.title}» · ${c.employee.name}`);
  }

  /** 11.2 «سلّمت»: the card's owner hands in an item that no report delivers, with a link or a file. */
  async deliver(me: CurrentUser, id: string, itemId: string, input: KpiDeliveryInput) {
    const w = await this.who(me);
    const { c } = await this.openCard(w, id);
    const it = c.items.find((x) => x.id === itemId);
    if (c.employeeId !== me.employeeId) throw new ForbiddenException("التسليم بيعمله صاحب الكارت");
    if (!it || it.method !== "report" || it.report) throw new BadRequestException("البند ده بيتسلّم من التقرير بتاعه مش من الكارت");
    if (it.deliveries.length >= (it.required ?? 0)) throw new ConflictException("كل المرات المطلوبة اتسلّمت");
    await this.db.$transaction(async (tx) => {
      const d = await tx.kpiDelivery.create({ data: { itemId, byId: me.id, link: input.link ?? null, fileId: input.fileId ?? null } });
      if (input.fileId) await this.files.attach(me, [input.fileId], "KpiDelivery", d.id, tx);
      await this.audit.record({ module: MODULE, entity: "KpiDelivery", entityId: d.id, action: "create", userId: me.id,
        after: { ...input, summary: `${c.employee.name} سلّم «${it.title}»` } }, tx);
    });
    await this.tell(me, `${me.name} سلّم «${it.title}»`);
  }

  async deliveryFile(me: CurrentUser, deliveryId: string) {
    const d = await this.repo.delivery(deliveryId);
    if (!d?.fileId) throw new NotFoundException("الملف مش موجود");
    await this.visibleCard(await this.who(me), d.item.cardId);
    return this.files.downloadUrl(d.fileId);
  }

  /** 11.4: whoever runs the KPIs moves a card to another follower (null = the owners). */
  async setFollower(me: CurrentUser, id: string, followerId: string | null) {
    const w = await this.who(me);
    if (!w.edit && !w.watcher) throw new ForbiddenException("المتابع بيغيّره الأدمن أو مسؤول الـ KPIs");
    const { c } = await this.openCard(w, id);
    const f = followerId ? await this.repo.employee(followerId) : null;
    if (followerId && (!f || followerId === c.employeeId)) throw new BadRequestException("اختار متابع تاني");
    await this.db.$transaction(async (tx) => {
      await tx.kpiCard.update({ where: { id }, data: { followerId } });
      await this.audit.record({ module: MODULE, entity: "KpiCard", entityId: id, action: "update", userId: me.id,
        before: { followerId: c.followerId }, after: { followerId, summary: `${c.employee.name} بقى بيتابعه ${f?.name ?? "الملاك"}` } }, tx);
    });
    await this.tell(me, `${c.employee.name} بقى بيتابعه ${f?.name ?? "الملاك"}`);
  }

  /** 11.3: the improvement plan, written by the follower. */
  async setPlan(me: CurrentUser, id: string, plan: string) {
    const w = await this.who(me);
    const { c } = await this.openCard(w, id);
    if (!this.isFollower(w, c)) throw new ForbiddenException("خطة التحسين بيكتبها المتابع");
    if (w.fixedPlan) throw new ForbiddenException(NO_PLAN); // M-09: read only or hidden for this person
    await this.db.$transaction(async (tx) => {
      await tx.kpiCard.update({ where: { id }, data: { plan: plan || null } });
      await this.audit.record({ module: MODULE, entity: "KpiCard", entityId: id, action: "update", userId: me.id,
        before: { plan: c.plan }, after: { plan, summary: `خطة تحسين لـ ${c.employee.name}` } }, tx);
    });
    await this.tell(me, `${me.name} كتب خطة تحسين لـ ${c.employee.name}`);
  }

  /** 11.3: the follower approves the card's result. */
  async approve(me: CurrentUser, id: string) {
    const w = await this.who(me);
    const { c } = await this.openCard(w, id);
    if (!this.isFollower(w, c)) throw new ForbiddenException("النتيجة بيعتمدها المتابع");
    if (c.approvedAt) throw new ConflictException("النتيجة اتعتمدت قبل كده");
    const score = Math.round(this.score(c));
    await this.db.$transaction(async (tx) => {
      await tx.kpiCard.update({ where: { id }, data: { approvedBy: me.id, approvedAt: new Date() } });
      await this.audit.record({ module: MODULE, entity: "KpiCard", entityId: id, action: "approve", userId: me.id, after: { summary: `اتعتمد KPI ${c.employee.name} · ${score}%` } }, tx);
    });
    await this.tell(me, `${me.name} اعتمد KPI ${c.employee.name} · ${score}%`);
  }

  /** 11.4: salary or quarter bonus, monthly or per quarter, and the bonus (null = one month's salary). Money: «kpis: edit». */
  async setPay(me: CurrentUser, id: string, input: KpiPayInput) {
    const w = await this.who(me);
    if (w.fixedMoney) throw new ForbiddenException(NO_MONEY); // M-09: read only or hidden for this person
    const { c } = await this.openCard(w, id);
    await this.db.$transaction(async (tx) => {
      await tx.kpiCard.update({ where: { id }, data: { payBase: input.base, payPeriod: input.period, payAmount: input.amount } });
      await this.audit.record({ module: MODULE, entity: "KpiPay", entityId: id, action: "update", userId: me.id,
        before: { base: c.payBase, period: c.payPeriod, amount: c.payAmount?.toFixed(2) ?? null }, after: { ...input, summary: `فلوس KPI ${c.employee.name} اتعدّلت` } }, tx);
    });
  }

  async bands() {
    return this.repo.bands();
  }

  /** 11.4: one set of bands for everyone. */
  async setBands(me: CurrentUser, input: KpiBandsInput) {
    if ((await this.who(me)).fixedMoney) throw new ForbiddenException(NO_MONEY);
    const data = { top: input.top, full: input.full, partial: input.partial, low: input.low, rewardPct: input.rewardPercent, cutPct: input.cutPercent };
    await this.db.$transaction(async (tx) => {
      const before = await this.repo.bands(tx);
      await tx.kpiBands.update({ where: { id: "default" }, data });
      await this.audit.record({ module: MODULE, entity: "KpiBands", entityId: "default", action: "update", userId: me.id, before, after: { ...data, summary: "شرايح الفلوس اتعدّلت" } }, tx);
    });
  }

  /** 11.18 · the sheet's lines and award rules, for «كل الشركة» (not for the watcher: it's money). */
  private async sheetSetup(w: Who): Promise<KpiSheetSetup | null> {
    if (w.noMoney) return null;
    const [bands, rules] = await Promise.all([this.repo.bands(), this.repo.bonusRules()]);
    return { fields: SHEET_FIELD_KEYS.filter((k) => bands.sheetFields.includes(k)),
      bonuses: rules.map((r) => ({ id: r.id, minPct: r.minPct, amount: r.amount.toFixed(2) })) };
  }

  /** 11.18 «الخانات اللي في الورقة»: applies to every sheet made from now on. */
  async setSheetFields(me: CurrentUser, fields: SheetField[]) {
    if ((await this.who(me)).fixedMoney) throw new ForbiddenException(NO_MONEY);
    const sheetFields = SHEET_FIELD_KEYS.filter((k) => fields.includes(k));
    await this.db.$transaction(async (tx) => {
      const before = (await this.repo.bands(tx)).sheetFields;
      await tx.kpiBands.update({ where: { id: "default" }, data: { sheetFields } });
      await this.audit.record({ module: MODULE, entity: "KpiBands", entityId: "default", action: "update", userId: me.id, before: { sheetFields: before }, after: { sheetFields, summary: "خانات ورقة الموظف اتعدّلت" } }, tx);
    });
  }

  /** 11.18 «الجوايز»: «لو حقق X% من التارجت ← جايزة». */
  async addBonus(me: CurrentUser, input: KpiBonusInput) {
    if ((await this.who(me)).fixedMoney) throw new ForbiddenException(NO_MONEY);
    return this.db.$transaction(async (tx) => {
      const r = await tx.kpiBonusRule.create({ data: { minPct: input.minPct, amount: input.amount } });
      await this.audit.record({ module: MODULE, entity: "KpiBonusRule", entityId: r.id, action: "create", userId: me.id,
        after: { minPct: r.minPct, amount: input.amount, summary: `جايزة جديدة: لو حقق ${r.minPct}% من التارجت ← ${input.amount}` } }, tx);
      return { id: r.id };
    });
  }

  async removeBonus(me: CurrentUser, id: string) {
    if ((await this.who(me)).fixedMoney) throw new ForbiddenException(NO_MONEY);
    await this.db.$transaction(async (tx) => {
      const r = await tx.kpiBonusRule.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("الجايزة دي مش موجودة");
      await tx.kpiBonusRule.delete({ where: { id } });
      await this.audit.record({ module: MODULE, entity: "KpiBonusRule", entityId: id, action: "delete", userId: me.id,
        before: { minPct: r.minPct, amount: r.amount.toFixed(2) }, after: { summary: `اتمسحت جايزة الـ ${r.minPct}%` } }, tx);
    });
  }

  /** 11.4 · 11.11: a card for someone who has none: empty, or with another card's items (nothing achieved). */
  async createCard(me: CurrentUser, employeeId: string, copyFrom?: string) {
    const w = await this.who(me);
    const emp = await this.repo.employee(employeeId);
    // 11.19: the Inventory Manager makes one for her team from the inventory, and follows it
    const inv = !w.edit && !w.watcher && !!emp && invManagerMakesCard(me.roles, me.employeeId, emp);
    if (!w.edit && !w.watcher && !inv) throw new ForbiddenException("الكروت بيعملها الأدمن أو مسؤول الـ KPIs");
    const q = await this.current();
    if (q.status !== "open") throw new ConflictException(CLOSED);
    if (!emp) throw new BadRequestException("الموظف مش موجود");
    if (inv && copyFrom) throw new ForbiddenException("الكروت بيعملها الأدمن أو مسؤول الـ KPIs");
    if (await this.repo.cardOf(q.id, employeeId)) throw new ConflictException(`${emp.name} عنده كارت`);
    const from = copyFrom ? (await this.visibleCard(w, copyFrom)).c : null;
    const card = await this.db.$transaction(async (tx) => {
      const created = await tx.kpiCard.create({ data: {
        quarter: q.id, employeeId, followerId: inv ? me.employeeId : from?.followerId ?? null,
        items: { create: (from?.items ?? []).map((it) => this.copyItem(it)) },
      } });
      await this.audit.record({ module: MODULE, entity: "KpiCard", entityId: created.id, action: "create", userId: me.id,
        after: { summary: inv ? `كارت KPIs جديد لـ ${emp.name} (يتابعه ${me.name})` : `كارت KPIs جديد لـ ${emp.name}${from ? ` من بنود ${from.employee.name}` : ""}` } }, tx);
      return created;
    });
    await this.tell(me, `كارت KPIs جديد لـ ${emp.name}`);
    return { id: card.id };
  }

  /** 11.4 «انسخ البنود والأوزان دي لـ»: replaces the other person's items (or makes their card). */
  async copyCard(me: CurrentUser, id: string, toEmployeeId: string) {
    const w = await this.who(me);
    if (!w.edit && !w.watcher) throw new ForbiddenException("النسخ للأدمن أو مسؤول الـ KPIs");
    const { c, q } = await this.openCard(w, id);
    if (toEmployeeId === c.employeeId) throw new BadRequestException("اختار موظف تاني");
    const target = await this.repo.cardOf(q.id, toEmployeeId);
    if (!target) return this.createCard(me, toEmployeeId, id);
    await this.db.$transaction(async (tx) => {
      await tx.kpiItem.deleteMany({ where: { cardId: target.id } });
      await tx.kpiItem.createMany({ data: c.items.map((it) => ({ ...this.copyItem(it), cardId: target.id })) });
      await this.audit.record({ module: MODULE, entity: "KpiItems", entityId: target.id, action: "update", userId: me.id,
        before: { items: target.items.map((it) => ({ ...it, deliveries: undefined })) }, after: { summary: `بنود ${c.employee.name} اتنسخت لـ ${target.employee.name}` } }, tx);
    });
    await this.tell(me, `بنود ${c.employee.name} اتنسخت لـ ${target.employee.name}`);
    return { id: target.id };
  }

  /** The same item with nothing achieved yet; `key` is kept so a new quarter's item stays the same item (11.12). */
  private copyItem(it: CardRecord["items"][number], keepKey = false) {
    return {
      ...(keepKey ? { key: it.key } : {}), position: it.position, title: it.title, weight: it.weight, targetText: it.targetText, source: it.source,
      method: it.method, module: it.module, direction: it.direction, goal: it.goal, metric: it.metric, params: it.params ?? {},
      enteredBy: it.enteredBy, report: it.report, required: it.required, baseline: it.baseline,
    };
  }

  /** 11.4: the Office Manager closes the quarter: every card's final score and amount are kept. */
  async closeQuarter(me: CurrentUser) {
    const q = await this.current();
    if (q.status !== "open") throw new ConflictException("الربع ده اتقفل قبل كده");
    const { cards, b } = await this.db.$transaction(async (tx) => this.finish(me, q.id, tx, true));
    await this.tell(me, `${quarterLabel(q.id)} اتقفل · ${cards.length} كارت`);
    await this.closeAlerts(q.id, cards, b);
  }

  /** Saves each card's result and closes the quarter. With money (the close) the amounts too. */
  private async finish(me: CurrentUser, quarter: string, tx: Prisma.TransactionClient, money: boolean) {
    const [cards, bands] = await Promise.all([this.repo.cards({ quarter }, tx), this.repo.bands(tx)]);
    const b = bandsOf(bands);
    for (const c of cards) {
      const s = this.score(c);
      await tx.kpiCard.update({ where: { id: c.id }, data: { finalScore: Math.round(s * 100) / 100, ...(money ? { finalAmount: toDecimal(this.delta(c, s, b)) } : {}) } });
    }
    await tx.kpiQuarter.update({ where: { id: quarter }, data: { status: "closed", closedAt: new Date(), closedById: me.id } });
    await this.audit.record({ module: MODULE, entity: money ? "KpiQuarterClose" : "KpiQuarter", entityId: quarter, action: "update", userId: me.id,
      after: { summary: `${quarterLabel(quarter)} اتقفل · النتايج اتحفظت`, cards: cards.length } }, tx);
    return { cards, b };
  }

  /**
   * 11.6 (M-12 2.3): after the close, under 70% the employee and the follower hear «خصم + خطة تحسين» (the follower opens
   * it), under 50% also the written warning, and under 50% two quarters in a row HR is told to review.
   */
  private async closeAlerts(quarter: string, cards: CardRecord[], b: Bands) {
    const prev = new Map((await this.repo.finalScores(previousQuarter(quarter))).map((x) => [x.employeeId, Number(x.finalScore)]));
    const label = quarterLabel(quarter);
    for (const c of cards) {
      const s = this.score(c), r = Math.round(s), alert = closeAlert(s, prev.get(c.employeeId) ?? null, b);
      if (!alert) continue;
      const text = alert === "plan"
        ? `نتيجة KPI ${c.employee.name} في ${label}: ${r}% · خصم ${b.cutPercent}% + خطة تحسين يفتحها المتابع`
        : `نتيجة KPI ${c.employee.name} في ${label}: ${r}% تحت الـ Threshold · البونص اتلغى + خصم ${b.cutPercent}% من المرتب + إنذار مكتوب + خطة تحسين`;
      // «الملاك» (no follower) = the Super Admins
      await this.notifications.notify({ event: "kpi.result", text, link: LINK, to: [c.employee.userId, c.follower?.userId ?? "admin"] });
      if (alert === "hr") await this.notifications.notify({ event: "kpi.hr_review", link: LINK,
        text: `KPI ${c.employee.name} تحت ${b.low}% ربعين ورا بعض (${Math.round(prev.get(c.employeeId)!)}% ثم ${r}%) · محتاج مراجعة الـ HR` });
    }
  }

  /** 11.6: the KPI amount of each card whose quarter closed in this month (`2026-12`), for that month's payroll line. */
  async payrollAmounts(month: string, tx?: Prisma.TransactionClient | PrismaClient): Promise<Map<string, number>> {
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
    const from = dayStart(`${month}-01`), to = dayStart(next); // Cairo month
    return new Map((await this.repo.closedAmounts(from, to, tx)).map((c) => [c.employeeId, piasters(c.finalAmount)]));
  }

  /**
   * 4.15 (demo kpis.js `kpiForTask`): a task sent with «تتحسب في الـ KPIs» lands in the assignee's «المهام في ميعادها»
   * item. Inside the task's own transaction: the item is added once, with weight 0 (the follower sets it); someone with
   * no card gets one, followed by the sender when they share a department, else by the owners. Audited here.
   */
  async countTask(tx: Prisma.TransactionClient, assigneeUserId: string, senderUserId: string | null, actorUserId: string): Promise<TaskKpiEffect> {
    const q = await this.repo.currentQuarter(tx);
    const emp = await tx.employee.findUnique({ where: { userId: assigneeUserId }, select: { id: true, name: true, department: true } });
    if (!q || q.status !== "open" || !emp) return null;
    // one task at a time per person, so two «أيوه» tasks at once can't both add the item or both make the card
    await tx.$queryRaw`SELECT id FROM hr."Employee" WHERE id = ${emp.id} FOR UPDATE`;
    const card = await tx.kpiCard.findUnique({ where: { quarter_employeeId: { quarter: q.id, employeeId: emp.id } }, select: { id: true, items: { select: { metric: true, position: true } } } });
    const item = { ...TASKS_ON_TIME_ITEM, params: {} };
    if (!card) {
      const sender = senderUserId ? await tx.employee.findUnique({ where: { userId: senderUserId }, select: { id: true, department: true } }) : null;
      const created = await tx.kpiCard.create({ data: { quarter: q.id, employeeId: emp.id, followerId: taskCardFollower(sender, emp.department), items: { create: [{ ...item, position: 0 }] } } });
      await this.audit.record({ module: MODULE, entity: "KpiCard", entityId: created.id, action: "create", userId: actorUserId,
        after: { summary: `كارت KPIs جديد لـ ${emp.name} (من المهام) وفيه بند «${item.title}»` } }, tx);
      return "card";
    }
    if (card.items.some((it) => it.metric === item.metric)) return "counted";
    const position = Math.max(-1, ...card.items.map((it) => it.position)) + 1;
    await tx.kpiItem.create({ data: { ...item, position, cardId: card.id } });
    await this.audit.record({ module: MODULE, entity: "KpiItems", entityId: card.id, action: "update", userId: actorUserId,
      after: { summary: `KPI ${emp.name}: بند «${item.title}» اتضاف (من المهام) بوزن 0` } }, tx);
    return "item";
  }

  /** 7.11: the current quarter's cards: who follows whom (a team) and the live score (the ideal employee needs ≥ 80%). */
  async liveCards(): Promise<{ employeeId: string; followerId: string | null; score: number }[]> {
    const q = await this.repo.currentQuarter();
    return q ? (await this.repo.cards({ quarter: q.id })).map((c) => ({ employeeId: c.employeeId, followerId: c.followerId, score: this.score(c) })) : [];
  }

  /** 11.7: the sheet of a closed quarter, before the Office Manager's approval only for the KPI admins. */
  private canSheet(w: Who, q: Quarter) {
    return q.status === "closed" && !w.noMoney && !w.noScore && !w.noPlan && (!!q.sheetsAt || w.approve || w.edit);
  }

  /**
   * 11.18: the sheet's money lines management picked (demo clients.js sheetOf): the salary, the quarter's target (its
   * three months added up), what came in against it, the scheme, the commission, the Transactions, and the award the
   * biggest rule reached gives. `hidden`: the reader's M-09 field rules — a hidden salary isn't on his copy at all.
   */
  private async sheetLines(c: CardRecord, quarter: string, fields: readonly string[], hidden: ReadonlySet<SheetField>) {
    const keys = SHEET_FIELD_KEYS.filter((k) => fields.includes(k) && !hidden.has(k));
    if (!keys.length) return "";
    const months = quarterMonths(quarter), from = monthBounds(months[0]).from, to = monthBounds(months[2]).to;
    const [m, rules] = await Promise.all([this.repo.sheetMoney(c.employeeId, months, from, to), this.repo.bonusRules()]);
    const goal = months.reduce((sum, mo) => sum + piasters(m.targets.find((t) => t.month === mo)?.value ?? m.target), 0);
    const deals = m.deals.map((d) => dealRowOf({ ...d, commissionOwner: d.commissionOwner.toFixed(2), commissionClient: d.commissionClient.toFixed(2), targetBase: d.targetBase?.toFixed(2) ?? null,
      payments: d.payments.map((p) => ({ side: p.side, amount: p.amount.toFixed(2), receivedAt: p.receivedAt })) }));
    const scheme = Number(m.commissionPct), f = sheetFigures(c.employeeId, deals, from, to, goal, scheme, rules.map((r) => ({ minPct: r.minPct, amount: piasters(r.amount) })));
    const egp = (p: number) => `<span class="num">${toDecimal(p)}</span> ج.م`;
    const value: Record<SheetField, string> = {
      salary: egp(piasters(c.employee.salary)), target: goal ? egp(goal) : "—", achieved: goal ? `${egp(f.achieved)} · <span class="num">${Math.round(f.percent)}%</span>` : egp(f.achieved),
      scheme: `<span class="num">${scheme}%</span>`, commission: egp(f.commission), transactions: `<span class="num">${f.transactions}</span>`, bonus: f.bonus ? egp(f.bonus) : "—",
    };
    return `<h2>الورقة</h2><table>${keys.map((k) => `<tr><th>${SHEET_FIELDS.find(([x]) => x === k)![1]}</th><td>${value[k]}</td></tr>`).join("")}</table>`;
  }

  /** 11.18 · the M-09 rules that take a line off the reader's sheet. */
  private sheetHidden(me: CurrentUser): Set<SheetField> {
    const hr = me.fields.hidden("hr"), rp = me.fields.hidden("reports"), kp = me.fields.hidden("kpis"), out = new Set<SheetField>();
    if (hr.has("salary")) out.add("salary");
    if (hr.has("target") || rp.has("value")) out.add("target");
    if (rp.has("achieved")) out.add("achieved");
    if (hr.has("commissionPct")) { out.add("scheme"); out.add("commission"); }
    if (kp.has("money")) out.add("bonus");
    return out;
  }

  /** 11.7: the employee's quarterly sheet: the result, its tier and amount, and every item (+ 11.18 the picked lines). */
  private async sheetHtml(c: CardRecord, quarter: string, hidden: ReadonlySet<SheetField> = new Set()) {
    const bands = await this.repo.bands(), b = bandsOf(bands);
    const lines = await this.sheetLines(c, quarter, bands.sheetFields, hidden);
    const s = c.finalScore != null ? Number(c.finalScore) : this.score(c);
    const amount = c.finalAmount != null ? piasters(c.finalAmount) : this.delta(c, s, b);
    const money = `${amount > 0 ? "مكافأة" : amount < 0 ? "خصم" : "—"} <span class="num">${toDecimal(Math.abs(amount))}</span> ج.م`;
    const pct = (n: number) => `<span class="num">${Math.round(n * 10) / 10}%</span>`;
    const rows = c.items.map((it) => { const a = this.ach(it); return `<tr><td>${esc(it.title)}</td><td>${pct(it.weight)}</td><td>${esc(it.targetText)}</td><td>${pct(a * 100)}</td><td>${pct(it.weight * a)}</td></tr>`; }).join("");
    const title = `ورقة ${quarterLabel(quarter)} · ${c.employee.name}`;
    return { name: `${title}.pdf`, html: layout(title, `<h1>${esc(title)}</h1>
<table><tr><th>الموظف</th><td>${esc(c.employee.name)} · ${esc(c.employee.jobTitle)}</td></tr><tr><th>المتابع</th><td>${esc(c.follower?.name ?? "الملاك")}</td></tr>
<tr><th>نتيجة الربع</th><td>${pct(s)} · ${esc(bandLabel(s, b))}</td></tr><tr><th>المكافأة / الخصم</th><td>${money}</td></tr>
${c.plan ? `<tr><th>خطة التحسين</th><td>${esc(c.plan)}</td></tr>` : ""}</table>
${lines}<h2>البنود</h2><table><tr><th>البند</th><th>الوزن</th><th>المستهدف</th><th>التحقيق</th><th>في النتيجة</th></tr>${rows}</table>`) };
  }

  async sheet(me: CurrentUser, id: string) {
    const w = await this.who(me);
    const { c, q } = await this.visibleCard(w, id);
    if (!this.canSheet(w, q)) throw new ForbiddenException("ورقة الربع بتطلع بعد قفل الربع وموافقة الـ Office Manager");
    const { name, html } = await this.sheetHtml(c, q.id, this.sheetHidden(me));
    return { name, pdf: await this.docs.pdf(html) };
  }

  /** 11.7: the Office Manager approves the closed quarter's sheets; each employee gets theirs by email, only then. */
  async approveSheets(me: CurrentUser) {
    const q = await this.current();
    if (q.status !== "closed") throw new ConflictException("ورق الربع بيتبعت بعد قفل الربع");
    const cards = await this.repo.cards({ quarter: q.id });
    await this.db.$transaction(async (tx) => {
      const ok = await tx.kpiQuarter.updateMany({ where: { id: q.id, sheetsAt: null }, data: { sheetsAt: new Date(), sheetsById: me.id } });
      if (!ok.count) throw new ConflictException("ورق الربع ده اتبعت قبل كده");
      await this.audit.record({ module: MODULE, entity: "KpiSheets", entityId: q.id, action: "approve", userId: me.id,
        after: { summary: `ورق ${quarterLabel(q.id)} اتوافق عليه واتبعت لـ ${cards.length} موظف`, cards: cards.length } }, tx);
    });
    for (const c of cards) {
      const { name, html } = await this.sheetHtml(c, q.id);
      await this.mail.send({ to: c.employee.user.email, subject: `ورقة ${quarterLabel(q.id)} · Places ERP`,
        text: `أهلاً ${c.employee.name}،\nمرفق ورقة نتيجة الـ KPIs بتاعتك عن ${quarterLabel(q.id)} بعد موافقة الـ Office Manager.`, attachments: [{ filename: name, content: await this.docs.pdf(html) }] });
    }
    return { sent: cards.length };
  }

  /**
   * 11.11 «ابدأ ربع جديد»: the current quarter's results are kept and every card starts the next one with the same items
   * and weights and nothing achieved. A card already set up for the next quarter (the TL draft) stays as it is.
   */
  async startQuarter(me: CurrentUser) {
    const w = await this.who(me);
    if (!w.edit && !w.watcher) throw new ForbiddenException("الربع الجديد بيبدأه الأدمن أو مسؤول الـ KPIs");
    const q = await this.current();
    // closing here without the amounts would leave payroll with no KPI reward/deduction: the close is the Office Manager's (11.4)
    if (q.status === "open") throw new ConflictException("اقفل الربع الحالي الأول");
    const next = nextQuarter(q.id);
    const n = await this.db.$transaction(async (tx) => {
      await tx.kpiQuarter.create({ data: { id: next } });
      const ready = new Set((await tx.kpiCard.findMany({ where: { quarter: next }, select: { employeeId: true } })).map((c) => c.employeeId));
      const cards = (await this.repo.cards({ quarter: q.id }, tx)).filter((c) => !ready.has(c.employeeId));
      for (const c of cards) {
        await tx.kpiCard.create({ data: { quarter: next, employeeId: c.employeeId, followerId: c.followerId, payBase: c.payBase, payPeriod: c.payPeriod, payAmount: c.payAmount,
          items: { create: c.items.map((it) => this.copyItem(it, true)) } } });
      }
      await this.audit.record({ module: MODULE, entity: "KpiQuarter", entityId: next, action: "create", userId: me.id,
        after: { summary: `بدأ ${quarterLabel(next)} بنسخة من كروت ${quarterLabel(q.id)}`, cards: cards.length } }, tx);
      return cards.length;
    });
    await this.tell(me, `بدأ ${quarterLabel(next)} · ${n} كارت اتنسخ`);
    return { quarter: next };
  }

  /** «كل الشركة»: the quarters, who has no card, the watchers, the bands (not for the watcher). */
  async company(me: CurrentUser): Promise<KpiCompany> {
    const w = await this.who(me);
    if (!w.all) throw new ForbiddenException("كل الشركة للإدارة والـ Office Manager ومسؤول الـ KPIs");
    const q = await this.current();
    const [quarters, stats, people, cards, bands, watchers] = await Promise.all([
      this.repo.quarters(), this.repo.quarterStats(), this.repo.people(), this.repo.cards({ quarter: q.id }), this.repo.bands(), this.watchers(),
    ]);
    const has = new Set(cards.map((c) => c.employeeId));
    const b = bandsOf(bands);
    return {
      quarters: quarters.map((x) => {
        const st = stats.find((s) => s.quarter === x.id);
        return { id: x.id, label: quarterLabel(x.id), status: x.status, cards: st?._count._all ?? 0, avg: w.noScore || st?._avg.finalScore == null ? null : Math.round(Number(st._avg.finalScore)) };
      }),
      noCard: w.edit || w.watcher ? people.filter((p) => !has.has(p.id)).map((p) => ({ id: p.id, name: p.name, title: p.jobTitle })) : [],
      watchers: people.filter((p) => watchers.includes(p.userId)).map((p) => ({ id: p.id, userId: p.userId, name: p.name })),
      people: people.map((p) => ({ id: p.id, userId: p.userId, name: p.name })),
      bands: w.noMoney ? null : { top: b.top, full: b.full, partial: b.partial, low: b.low, rewardPercent: b.rewardPercent, cutPercent: b.cutPercent },
      can: { edit: w.edit, close: w.approve && q.status === "open", sheets: w.approve && q.status === "closed" && !q.sheetsAt },
      sheets: q.sheetsAt ? { by: people.find((p) => p.userId === q.sheetsById)?.name ?? "", at: q.sheetsAt.toISOString() } : null,
      sheetSetup: await this.sheetSetup(w),
    };
  }

  /** 11.14 «مسؤول الـ KPIs»: the Setting `kpiWatch`. */
  async setWatchers(me: CurrentUser, userIds: string[]) {
    const known = new Set((await this.repo.people()).map((p) => p.userId));
    if (userIds.some((x) => !known.has(x))) throw new BadRequestException("فيه شخص مش موجود");
    const before = await this.watchers();
    await this.db.$transaction(async (tx) => {
      await this.repo.setWatchers(userIds, tx);
      await this.audit.record({ module: MODULE, entity: "Setting", entityId: "kpiWatch", action: "update", userId: me.id, before, after: { userIds, summary: "مسؤولين الـ KPIs اتغيّروا" } }, tx);
    });
  }

  /** 11.14 «سجل التغييرات»: every KPI change, who and when; the money ones are left out for the watcher. */
  // ───────── 11.13 · Farming / Approach (demo kpis.js `actCard`) ─────────

  private async activityCard(employeeId: string) {
    const q = await this.repo.currentQuarter();
    return q ? this.repo.activityCard(q.id, employeeId) : null;
  }

  /** «نشاطاتي»: for sales, and for anyone whose card this quarter counts these activities. */
  async activities(me: CurrentUser): Promise<MyActivities> {
    if (!me.employeeId) return { show: false, items: [] };
    const [rows, card] = await Promise.all([this.repo.activities(me.employeeId), this.activityCard(me.employeeId)]);
    return {
      show: me.roles.includes("sales") || !!card?.items.length || rows.length > 0,
      items: rows.map((a) => ({
        id: a.id, kind: a.kind as ActivityKind, place: a.place, at: a.at.toISOString(), status: a.status as ActivityView["status"],
        got: a.got, note: a.note, companies: a.companies,
      })),
    };
  }

  async addActivity(me: CurrentUser, input: ActivityInput) {
    if (!me.employeeId) throw new ForbiddenException("النشاطات للموظفين بس");
    const employeeId = me.employeeId;
    await this.db.$transaction(async (tx) => {
      const a = await tx.salesActivity.create({ data: { employeeId, kind: input.kind, place: input.place, at: new Date(input.at) } });
      await this.audit.record({ module: MODULE, entity: "SalesActivity", entityId: a.id, action: "create", userId: me.id,
        after: { ...input, summary: `${me.name} سجّل ${input.kind} في ${input.place}` } }, tx);
    });
  }

  /** «عملتها؟» after its time: done (with what came of it) or not. The follower and Operations hear of it. */
  async activityResult(me: CurrentUser, id: string, input: ActivityResultInput) {
    const a = await this.repo.activity(id);
    if (!a || a.employeeId !== me.employeeId) throw new NotFoundException("النشاط ده مش موجود");
    if (a.status !== "planned") throw new ConflictException("النشاط ده اتسجّلت نتيجته قبل كده");
    const now = new Date();
    if (a.at > now) throw new BadRequestException("لسه ميعاده ماجاش");
    const approach = a.kind === "Approach";
    if (input.done && approach && !input.companies.length) throw new BadRequestException("اكتب الشركات");
    const data = !input.done ? { status: "notDone" }
      : { status: "done", doneAt: now, ...(approach ? { companies: input.companies } : { got: input.got, note: input.note || null }) };
    const what = !input.done ? `ماعملش الـ ${a.kind} في ${a.place}`
      : `عمل ${a.kind} في ${a.place} · ${approach ? `شركات: ${input.companies.join("، ")}` : `${input.got ? "جاب حاجة" : "مجابش حاجة"}${input.note ? `: ${input.note}` : ""}`}`;
    await this.db.$transaction(async (tx) => {
      // only if no other tab answered it meanwhile
      const done = await tx.salesActivity.updateMany({ where: { id, status: "planned" }, data });
      if (done.count === 0) throw new ConflictException("النشاط ده اتسجّلت نتيجته قبل كده");
      await this.audit.record({ module: MODULE, entity: "SalesActivity", entityId: id, action: "update", userId: me.id,
        before: { status: a.status }, after: { ...data, summary: `${me.name} ${what}` } }, tx);
    });
    const follower = (await this.activityCard(a.employeeId))?.follower?.userId;
    await this.notifications.notify({ event: "kpi.activity", text: `${me.name} ${what}`, link: LINK, userIds: follower && follower !== me.id ? [follower] : [] });
  }

  async log(me: CurrentUser): Promise<KpiLogEntry[]> {
    const w = await this.who(me);
    if (!w.all) throw new ForbiddenException("السجل للإدارة ومسؤول الـ KPIs");
    const rows = (await this.repo.log(80)).filter((r) => !(w.noMoney && MONEY_ENTITIES.includes(r.entity)));
    const names = new Map((await this.repo.names(rows.flatMap((r) => (r.userId ? [r.userId] : [])))).map((n) => [n.userId, n.name]));
    return rows.slice(0, 40).map((r) => {
      const after = (r.after ?? {}) as { summary?: unknown };
      return { at: r.at.toISOString(), by: (r.userId && names.get(r.userId)) || "السيستم", text: typeof after.summary === "string" ? after.summary : r.entity };
    });
  }
}
