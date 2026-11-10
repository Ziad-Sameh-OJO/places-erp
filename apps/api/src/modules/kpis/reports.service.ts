import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Prisma, type PrismaClient, performanceRows } from "@places/db";
import {
  KpiWatch, type DailyFieldInput, type DailyForm, type DailyInput, type DayReport, type HandInCard, type MyHandIn, type ReportInput, type ReportsPage, type ScheduledReportView,
} from "@places/contracts";
import {
  type MetricParams, type Method, type Schedule, type WorkCalendar, METRICS, calcText, dailyAverage, dailySumValue, dailyTotals, dayStart, dayStatus, dueOf, handInState, isOffPeriod,
  itemAchievement, localDate, nextDue, pickPeople,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { KpisRepository } from "./kpis.repository";
import { KpisService } from "./kpis.service";
import { ReportsRepository } from "./reports.repository";

const MODULE = "reports";
const LINK = "/reports";
const DAILY_LINK = "/kpis";
/** What the daily report fills by itself for the day (demo kpis.js DAY_AUTO, those the system can count today). */
const AUTO = ["calls", "visitsDone", "dealsCount"];
/** What the person types in it: any number (dailySum), and the website ads count (webAds, 11.9: no website hook yet). */
const TYPED = ["dailySum", "webAds"];
const typed = (metric: string | null) => TYPED.includes(metric ?? "");
const NO_DAILY = "مفيش تقرير يومي شغال";

type Report = Prisma.ScheduledReportGetPayload<object>;
type User = Awaited<ReturnType<ReportsRepository["users"]>>[number];
const schedule = (r: Report): Schedule => ({ freq: r.freq as Schedule["freq"], day: r.day, time: r.time });
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * M-12 · the scheduled reports (11.10): their settings, the hand-ins and the KPI item an on-time hand-in counts in; and the
 * daily report of every team (11.12): the form, the extra fields, any day's report and how it adds up. The worker
 * (scheduled-reports.ts) sends the auto ones, the reminders and the late notices.
 */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: ReportsRepository,
    private readonly kpiRepo: KpisRepository,
    private readonly kpis: KpisService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly time: BusinessTimeService,
  ) {}

  private async quarter() {
    return (await this.kpiRepo.currentQuarter())?.id;
  }

  private async watchers() {
    const w = KpiWatch.safeParse(await this.kpiRepo.watchers());
    return w.success ? w.data : [];
  }

  /** «التقارير ومواعيدها». The watcher (no money) never sees a money report. */
  async list(me: CurrentUser): Promise<ReportsPage> {
    const [w, rows, users, cal, q] = await Promise.all([this.kpis.who(me), this.repo.reports(), this.repo.users(), this.time.calendar(), this.quarter()]);
    const items = q ? await this.repo.reportItems(q) : [];
    const now = new Date(), edit = me.grants.can("reports", "edit");
    const reports = await Promise.all(rows.filter((r) => !(w.noMoney && r.money)).map(async (r): Promise<ScheduledReportView> => {
      const s = schedule(r), { period } = dueOf(s, now, cal);
      const handed = r.kind === "handin" ? { got: (await this.repo.handIns(r.id, period)).length, of: pickPeople(r.preparedBy, users).length } : null;
      return {
        id: r.id, name: r.name, on: r.on, kind: r.kind as "auto" | "handin", freq: s.freq, day: r.day, time: r.time, fmt: r.fmt as ReportInput["fmt"],
        content: r.content as ReportInput["content"], preparedBy: r.preparedBy, recipients: r.recipients, remindMin: r.remindMin, lateNotify: r.lateNotify,
        money: r.money, daily: r.daily, next: nextDue(s, now, cal).toISOString(), handed,
        kpiItems: items.filter((it) => it.report === r.id).map((it) => ({ id: it.id, label: `${it.card.employee.name} · ${it.title}` })),
        runs: r.runs.map((x) => ({ id: x.id, period: x.period, at: x.at.toISOString(), title: x.title })),
      };
    }));
    return {
      reports, can: { edit },
      options: edit ? {
        people: users.filter((u) => u.name).map((u) => ({ id: u.id, name: u.name })), roles: await this.repo.roles(),
        items: items.map((it) => ({ id: it.id, label: `${it.card.employee.name} · ${it.title}` })),
      } : null,
    };
  }

  /** «تقرير جديد» or a change to one (11.10): applies at once; the worker reads it on its next tick. */
  async save(me: CurrentUser, id: string | null, input: ReportInput) {
    const before = id ? await this.repo.report(id) : null;
    if (id && !before) throw new NotFoundException("التقرير مش موجود");
    const [users, roles, q] = await Promise.all([this.repo.users(), this.repo.roles(), this.quarter()]);
    const known = new Set([...users.map((u) => u.id), ...roles.map((r) => r.key), "follower"]);
    if ([...input.preparedBy, ...input.recipients, ...input.lateNotify].some((x) => !known.has(x))) throw new BadRequestException("فيه شخص أو دور مش موجود");
    const items = new Set((q ? await this.repo.reportItems(q) : []).map((it) => it.id));
    if (input.kpiItems.some((x) => !items.has(x))) throw new BadRequestException("فيه بند KPIs مش بيتسلّم بتقرير");
    const { kpiItems, ...data } = input;
    const handin = data.kind === "handin";
    const row = { ...data, content: handin ? null : data.content, preparedBy: handin || data.content === "inventory" ? data.preparedBy : [], lateNotify: handin ? data.lateNotify : [], day: data.freq === "daily" ? 0 : data.day };
    const saved = await this.db.$transaction(async (tx) => {
      const r = id ? await tx.scheduledReport.update({ where: { id }, data: row }) : await tx.scheduledReport.create({ data: row });
      const links = handin ? kpiItems : [];
      await tx.kpiItem.updateMany({ where: { report: r.id, id: { notIn: links } }, data: { report: null } });
      if (links.length) await tx.kpiItem.updateMany({ where: { id: { in: links } }, data: { report: r.id } });
      await this.audit.record({ module: MODULE, entity: "ScheduledReport", entityId: r.id, action: id ? "update" : "create", userId: me.id,
        before, after: { ...row, kpiItems: links, summary: id ? `«${r.name}» اتعدّل` : `تقرير جديد «${r.name}»` } }, tx);
      return r;
    });
    return { id: saved.id };
  }

  async remove(me: CurrentUser, id: string) {
    const r = await this.repo.report(id);
    if (!r) throw new NotFoundException("التقرير مش موجود");
    await this.db.$transaction(async (tx) => {
      await tx.kpiItem.updateMany({ where: { report: id }, data: { report: null } });
      await tx.scheduledReport.delete({ where: { id } });
      await this.audit.record({ module: MODULE, entity: "ScheduledReport", entityId: id, action: "delete", userId: me.id, before: r, after: { summary: `اتمسح التقرير «${r.name}»` } }, tx);
    });
  }

  /** An auto report the system built, as rows for the Excel file. */
  async run(me: CurrentUser, id: string) {
    const r = await this.repo.run(id);
    if (!r || (r.report.money && (await this.kpis.who(me)).noMoney)) throw new NotFoundException("الملف مش موجود");
    return { title: r.title, rows: Array.isArray(r.rows) ? (r.rows as Record<string, string | number>[]) : [] };
  }

  /**
   * «ابعته دلوقتي» (11.17, demo clients.js rpRun): an auto report built now for its latest period and sent to the same
   * recipients as the worker would (the KPI watcher too, unless it has money), logged under the report like a scheduled run.
   * Anyone who sees the page may press it, as in the demo. The inventory report isn't sent before Manar approves it (M-03 3.1).
   */
  async runNow(me: CurrentUser, id: string) {
    const r = await this.repo.report(id);
    const [w, watchers] = await Promise.all([this.kpis.who(me), this.watchers()]);
    if (!r || (r.money && w.noMoney)) throw new NotFoundException("التقرير مش موجود");
    if (r.kind !== "auto" || r.content !== "performance") throw new BadRequestException("التقرير ده مش بيتبعت أوتوماتيك");
    const [users, cal] = await Promise.all([this.repo.users(), this.time.calendar()]);
    const now = new Date(), s = schedule(r), { period } = dueOf(s, now, cal);
    const built = await performanceRows(this.db, s, period, cal);
    const to = [...new Set([...pickPeople(r.recipients, users), ...(r.money ? [] : watchers)])];
    const run = await this.db.$transaction(async (tx) => {
      // a manual run never takes the period's key: the worker still sends the scheduled one at its time
      const made = await tx.reportRun.create({ data: { reportId: r.id, period: `${period} · ${now.toISOString()}`, title: built.title, rows: built.rows } });
      await this.audit.record({ module: MODULE, entity: "ScheduledReport", entityId: r.id, action: "run", userId: me.id, after: { run: made.id, to, summary: `«${r.name}» اتبعت دلوقتي` } }, tx);
      return made;
    });
    if (to.length) await this.notifications.notify({ event: "report.sent", text: `اتبعت تقرير «${r.name}» (${r.fmt}) · ${built.title}`, link: LINK, userIds: to });
    return { id: run.id, title: run.title, sent: to.length };
  }

  /** The home's «سلّم» tasks: what's due today and not handed in (demo «reportInbox»). */
  async mine(me: CurrentUser): Promise<MyHandIn[]> {
    const [rows, users, cal, q] = await Promise.all([this.repo.reports(), this.repo.users(), this.time.calendar(), this.quarter()]);
    const now = new Date(), today = localDate(now, cal);
    const due = rows.filter((r) => r.on && r.kind === "handin" && pickPeople(r.preparedBy, users).includes(me.id))
      .map((r) => ({ r, ...dueOf(schedule(r), now, cal) })).filter((x) => x.period === today && !isOffPeriod(schedule(x.r), x.period, cal));
    const done = new Set((await this.repo.handInsOf(me.id, [today])).map((h) => h.reportId));
    return Promise.all(due.filter((x) => !done.has(x.r.id)).map(async (x) => ({
      reportId: x.r.id, name: x.r.name, due: x.due.toISOString(), late: now > x.due, daily: x.r.daily,
      kpi: !!(me.employeeId && q && (await this.repo.linkedItem(x.r.id, me.employeeId, q))),
    })));
  }

  /** «سلّمت» (11.10). The daily report is handed in with its form (submitDaily). */
  async handIn(me: CurrentUser, id: string, note?: string) {
    const r = await this.repo.report(id);
    if (!r || !r.on || r.kind !== "handin") throw new NotFoundException("التقرير ده مش بيتسلّم");
    if (r.daily) throw new BadRequestException("التقرير اليومي بيتسلّم من الفورم بتاعه");
    const [users, cal] = await Promise.all([this.repo.users(), this.time.calendar()]);
    const res = await this.db.$transaction((tx) => this.handInTx(tx, me, r, users, cal, new Date(), note));
    await this.tellHanded(me, r, users, res.onTime);
    return res;
  }

  /**
   * One hand-in, once per period. On time it counts in the KPI item linked to the report (meeting 4 Nov); late it doesn't.
   */
  private async handInTx(tx: Prisma.TransactionClient, me: CurrentUser, r: Report, users: User[], cal: WorkCalendar, now: Date, note?: string) {
    if (!pickPeople(r.preparedBy, users).includes(me.id)) throw new ForbiddenException("التقرير ده مش عليك");
    const { period, due } = dueOf(schedule(r), now, cal);
    if (isOffPeriod(schedule(r), period, cal)) throw new ConflictException("النهارده أجازة · مفيش تقرير");
    const key = { reportId_userId_period: { reportId: r.id, userId: me.id, period } };
    if ((await tx.reportHandIn.findUnique({ where: key }))?.at) throw new ConflictException("سلّمته قبل كده");
    await tx.reportHandIn.upsert({ where: key, create: { reportId: r.id, userId: me.id, period, at: now, note: note || null }, update: { at: now, note: note || null } });
    const onTime = now <= due, q = await this.kpiRepo.currentQuarter(tx);
    const item = onTime && me.employeeId && q ? await this.repo.linkedItem(r.id, me.employeeId, q.id, tx) : null;
    const counted = !!item && item._count.deliveries < (item.required ?? 0);
    if (counted) await tx.kpiDelivery.create({ data: { itemId: item.id, byId: me.id } });
    await this.audit.record({ module: MODULE, entity: "ReportHandIn", entityId: r.id, action: "create", userId: me.id,
      after: { period, onTime, ...(note ? { note } : {}), kpiItem: counted ? item.id : null, summary: `${me.name} سلّم «${r.name}» ${onTime ? "في الميعاد" : "متأخر"}` } }, tx);
    return { onTime, counted };
  }

  /**
   * A hand-in report as a card on another screen (M-04 «تقرير المنافسين الشهري» on the marketing dashboard): this
   * period's state, the last `take` hand-ins, and whether `me` hands it in. Null when it isn't scheduled.
   */
  async card(me: CurrentUser, id: string, take = 3): Promise<HandInCard | null> {
    const r = await this.repo.report(id);
    if (!r || !r.on || r.kind !== "handin") return null;
    const [users, cal] = await Promise.all([this.repo.users(), this.time.calendar()]);
    const now = new Date(), { period, due } = dueOf(schedule(r), now, cal);
    const recent = await this.repo.recentHandIns(id, take);
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      id: r.id, name: r.name, state: handInState(recent.some((h) => h.period === period), due, now), due: due.toISOString(),
      canHandIn: pickPeople(r.preparedBy, users).includes(me.id),
      recent: recent.map((h) => ({ period: h.period, at: h.at!.toISOString(), note: h.note, by: names.get(h.userId) ?? "" })),
    };
  }

  /** The report's recipients (the person's follower too); the watcher only when there's no money in it. */
  private async tellHanded(me: CurrentUser, r: Report, users: User[], onTime: boolean) {
    const [follower, watchers] = await Promise.all([this.repo.followerOf(me.employeeId, await this.quarter()), this.watchers()]);
    const to = pickPeople(r.recipients, users, follower).filter((x) => x !== me.id && (!r.money || !watchers.includes(x)));
    if (to.length) await this.notifications.notify({ event: "report.handed", text: `${me.name} سلّم «${r.name}»${onTime ? "" : " (متأخر)"}`, link: r.daily ? DAILY_LINK : LINK, userIds: to });
  }

  // ───────── 11.12 · the daily report ─────────

  private async dailyReport() {
    const r = await this.repo.daily();
    if (!r) throw new NotFoundException(NO_DAILY);
    return r;
  }

  /** The person's card items the daily report shows: the ones the system counts and the ones he types. */
  private async dayItems(employeeId: string | null, quarter: string | undefined) {
    const card = employeeId && quarter ? await this.kpiRepo.cardOf(quarter, employeeId) : null;
    return { card, items: (card?.items ?? []).filter((it) => it.method === "system" && (typed(it.metric) || AUTO.includes(it.metric ?? ""))) };
  }

  private window(day: string, cal: WorkCalendar) {
    return { from: dayStart(day, cal), to: dayStart(shift(day, 1), cal) };
  }

  private async form(p: User, day: string, r: Report, cal: WorkCalendar, now: Date): Promise<DailyForm> {
    const q = await this.quarter();
    const [{ items }, fields, saved] = await Promise.all([this.dayItems(p.employeeId, q), this.repo.fields(p.id), this.repo.dailyReports(p.id, asDate(day), asDate(day))]);
    const rep = saved[0] ?? null, values = (rep?.values ?? {}) as Record<string, number | string>, w = this.window(day, cal);
    const { due } = dueOf(schedule(r), new Date(w.from.getTime() + 12 * 3_600_000), cal);
    return {
      day, due: due.toISOString(), status: dayStatus(rep?.at ?? null, due, now, isOffPeriod(schedule(r), day, cal)),
      items: await Promise.all(items.map(async (it) => {
        const auto = !typed(it.metric), v = auto ? await this.repo.count(it.metric!, p, w.from, w.to, it.params as Record<string, unknown>) : values[it.key];
        return { key: it.key, title: it.title, target: it.targetText, auto, value: typeof v === "number" ? v : null };
      })),
      fields: fields.map((f) => ({ id: f.id, label: f.label, type: f.type === "text" ? "text" : "number" })),
      saved: rep ? { values, note: rep.note, at: rep.at.toISOString() } : null,
    };
  }

  private async person(me: CurrentUser): Promise<User> {
    return (await this.repo.users()).find((u) => u.id === me.id) ?? { id: me.id, roles: me.roles, employeeId: me.employeeId, name: me.name };
  }

  /** «اكتب التقرير»: today's form as I see it. */
  async myForm(me: CurrentUser): Promise<DailyForm> {
    const [r, cal, users] = await Promise.all([this.dailyReport(), this.time.calendar(), this.repo.users()]);
    if (!pickPeople(r.preparedBy, users).includes(me.id)) throw new ForbiddenException("التقرير اليومي مش عليك");
    const now = new Date();
    return this.form(await this.person(me), localDate(now, cal), r, cal, now);
  }

  /**
   * «سلّم التقرير»: what I typed for today, kept as the day's report; my «اللي بيكتبه في التقرير اليومي» items take the new
   * totals, and the hand-in counts like any report's (on time → the linked KPI item).
   */
  async submitDaily(me: CurrentUser, input: DailyInput) {
    const [r, cal, users] = await Promise.all([this.dailyReport(), this.time.calendar(), this.repo.users()]);
    const now = new Date(), today = localDate(now, cal), q = await this.quarter();
    const [{ items }, fields] = await Promise.all([this.dayItems(me.employeeId, q), this.repo.fields(me.id)]);
    const mine = items.filter((it) => typed(it.metric));
    const kinds = new Map<string, string>([...mine.map((it) => [it.key, "number"] as const), ...fields.map((f) => [f.id, f.type] as const)]);
    for (const [k, v] of Object.entries(input.values)) {
      const kind = kinds.get(k);
      if (!kind) throw new BadRequestException("فيه خانة مش في تقريرك");
      if ((kind === "number") !== (typeof v === "number")) throw new BadRequestException("الخانة دي رقم");
    }
    const res = await this.db.$transaction(async (tx) => {
      if ((await this.repo.dailyReports(me.id, asDate(today), asDate(today), tx)).length) throw new ConflictException("سلّمت تقرير النهارده");
      const out = await this.handInTx(tx, me, r, users, cal, now);
      await tx.dailyReport.create({ data: { userId: me.id, day: asDate(today), values: input.values, note: input.note, at: now } });
      const qStart = shift(today, -100); // covers the longest period an item adds up (a quarter); dailySumValue picks the days
      const days = (await this.repo.dailyReports(me.id, asDate(qStart), asDate(today), tx)).map((d) => ({ day: d.day.toISOString().slice(0, 10), values: d.values as Record<string, unknown> }));
      for (const it of mine) {
        const series = days.flatMap((d) => (typeof d.values[it.key] === "number" ? [{ day: d.day, value: d.values[it.key] as number }] : []));
        const value = it.metric === "webAds" ? dailyAverage(series, today) : dailySumValue(series, today, it.params as MetricParams);
        await tx.kpiItem.update({ where: { id: it.id }, data: { value } });
        // the value drives the KPI reward / deduction in payroll (M-11), so it carries its trail like any money input (Q50)
        await this.audit.record({ module: "kpis", entity: "KpiItem", entityId: it.id, action: "update", userId: me.id,
          before: { value: it.value == null ? null : Number(it.value) }, after: { value, summary: `${me.name} · ${it.title}: ${value} (التقرير اليومي)` } }, tx);
      }
      return out;
    });
    await this.tellHanded(me, r, users, res.onTime);
    return res;
  }

  /** Who I see in «التقارير اليومية»: everyone for whoever sees all the KPIs, otherwise the people I follow. */
  private async visible(me: CurrentUser, r: Report, users: User[]) {
    const w = await this.kpis.who(me);
    const mine = pickPeople(r.preparedBy, users);
    const followed = w.all ? null : new Set(await this.repo.followedBy(me.employeeId, await this.quarter()));
    return { w, ids: mine.filter((id) => !followed || followed.has(id)) };
  }

  /** «تقرير يوم» and «شكل التقرير» for one person (11.12). The TL sees his team only. */
  async day(me: CurrentUser, userId: string, day?: string): Promise<DayReport> {
    const [r, cal, users] = await Promise.all([this.dailyReport(), this.time.calendar(), this.repo.users()]);
    const { w, ids } = await this.visible(me, r, users);
    const p = users.find((u) => u.id === userId);
    if (!p || (!ids.includes(userId) && userId !== me.id)) throw new NotFoundException("التقرير ده مش موجود أو مش من حقك تشوفه");
    const now = new Date(), today = localDate(now, cal), d = day && day <= today ? day : today, q = await this.quarter();
    const [form, { card }, rolesList, follower] = await Promise.all([this.form(p, d, r, cal, now), this.dayItems(p.employeeId, q), this.repo.roles(), this.repo.followerOf(p.employeeId, q)]);
    const names = new Map<string, string>([...users.map((u) => [u.id, u.name] as const), ...rolesList.map((x) => [x.key, x.label] as const), ["follower", "المتابع"]]);
    const qStart = `${d.slice(0, 5)}${String(Math.floor((Number(d.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
    const reps = await this.repo.dailyReports(p.id, asDate(qStart), asDate(d));
    const rows = await Promise.all((card?.items ?? []).map(async (it) => {
      const params = (it.params ?? {}) as Record<string, unknown>;
      let t: { day: number; week: number; month: number; quarter: number } | null = null;
      if (it.method === "system" && typed(it.metric)) {
        t = dailyTotals(reps.map((x) => { const v = (x.values as Record<string, unknown>)[it.key]; return { day: x.day.toISOString().slice(0, 10), value: typeof v === "number" ? v : 0 }; }), d);
      } else if (it.method === "system" && AUTO.includes(it.metric ?? "")) {
        const end = dayStart(shift(d, 1), cal), from = (x: string) => dayStart(x, cal);
        const [a, b, c, e] = await Promise.all([d, shift(d, -6), `${d.slice(0, 8)}01`, qStart].map((x) => this.repo.count(it.metric!, p, from(x), end, params)));
        t = { day: a ?? 0, week: b ?? 0, month: c ?? 0, quarter: e ?? 0 };
      }
      const ach = itemAchievement({ method: it.method as Method, direction: it.direction as "at-least" | "at-most", goal: Number(it.goal), value: it.value == null ? null : Number(it.value), required: it.required, delivered: it.deliveries.length });
      return {
        title: it.title, calc: calcText({ ...it, method: it.method as Method, params: params as MetricParams }, (x) => names.get(x) ?? x),
        day: t?.day ?? null, week: t?.week ?? null, month: t?.month ?? null, quarter: t?.quarter ?? null, target: it.targetText, achievement: Math.round(ach * 1000) / 10,
      };
    }));
    const handed = new Set((await this.repo.dailyOn(ids, asDate(d))).map((x) => x.userId));
    const who = (list: string[]) => pickPeople(list, users, follower).map((x) => names.get(x) ?? "").filter(Boolean).join("، ") || "—";
    return {
      person: { userId: p.id, name: p.name }, form, rows,
      team: ids.map((id) => ({ userId: id, name: names.get(id) ?? "", handed: handed.has(id) })).sort((a, b) => a.name.localeCompare(b.name, "ar")),
      shape: [
        ...form.items.map((it) => {
          const src = card?.items.find((x) => x.key === it.key);
          return { label: it.title, how: it.auto ? `السيستم بيملاه لوحده: ${METRICS[src?.metric ?? ""]?.label ?? ""} النهارده` : "بيكتبه هو (رقم)", goes: `بند «${it.title}» في الـ KPIs · ${src?.weight ?? 0}%`, fieldId: null };
        }),
        ...form.fields.map((f) => ({ label: f.label, how: `بيكتبه هو (${f.type === "number" ? "رقم" : "كلام"})`, goes: "خانة إضافية · بتظهر في التقرير ومش مربوطة بالـ KPIs", fieldId: f.id })),
        { label: "عملت إيه تاني النهارده؟", how: "بيكتبه هو (كلام)", goes: "بيظهر في التقرير بس", fieldId: null },
      ],
      can: { fields: w.edit || w.watcher }, to: who(r.recipients), late: who(r.lateNotify), time: r.time,
    };
  }

  private async fieldsAdmin(me: CurrentUser) {
    const w = await this.kpis.who(me);
    if (!w.edit && !w.watcher) throw new ForbiddenException("الخانات الإضافية بيضيفها الأدمن أو مسؤول الـ KPIs");
  }

  async addField(me: CurrentUser, input: DailyFieldInput) {
    await this.fieldsAdmin(me);
    const p = (await this.repo.users()).find((u) => u.id === input.userId);
    if (!p) throw new BadRequestException("الموظف مش موجود");
    const n = (await this.repo.fields(p.id)).length;
    const f = await this.db.$transaction(async (tx) => {
      const row = await tx.dailyReportField.create({ data: { userId: p.id, label: input.label, type: input.type, position: n } });
      await this.audit.record({ module: MODULE, entity: "DailyReportField", entityId: row.id, action: "create", userId: me.id,
        after: { ...input, summary: `التقرير اليومي بتاع ${p.name}: اتضافت خانة «${input.label}»` } }, tx);
      return row;
    });
    return { id: f.id };
  }

  async removeField(me: CurrentUser, id: string) {
    await this.fieldsAdmin(me);
    const f = await this.repo.field(id);
    if (!f) throw new NotFoundException("الخانة مش موجودة");
    await this.db.$transaction(async (tx) => {
      await tx.dailyReportField.delete({ where: { id } });
      await this.audit.record({ module: MODULE, entity: "DailyReportField", entityId: id, action: "delete", userId: me.id, before: f, after: { summary: `اتشالت خانة «${f.label}» من التقرير اليومي` } }, tx);
    });
  }

  /** «انسخ الخانات الإضافية لكل الـ <الدور>»: the others' extra fields are replaced. */
  async copyFields(me: CurrentUser, userId: string) {
    await this.fieldsAdmin(me);
    const users = await this.repo.users(), p = users.find((u) => u.id === userId);
    const role = p?.roles[0];
    if (!p || !role) throw new BadRequestException("الموظف مالوش دور");
    const fields = await this.repo.fields(p.id), label = (await this.repo.roles()).find((x) => x.key === role)?.label ?? role;
    const to = users.filter((u) => u.id !== p.id && u.roles.includes(role)).map((u) => u.id);
    await this.db.$transaction(async (tx) => {
      await tx.dailyReportField.deleteMany({ where: { userId: { in: to } } });
      await tx.dailyReportField.createMany({ data: to.flatMap((userId) => fields.map((f) => ({ userId, label: f.label, type: f.type, position: f.position }))) });
      await this.audit.record({ module: MODULE, entity: "DailyReportField", entityId: p.id, action: "update", userId: me.id,
        after: { role, to, summary: `خانات التقرير اليومي بتاعة ${p.name} اتنسخت لكل الـ ${label}` } }, tx);
    });
    return { copied: to.length };
  }
}
