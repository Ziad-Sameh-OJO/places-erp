import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Prisma, type PrismaClient, clockOn, dayVisits } from "@places/db";
import type { AttendanceDayView, AttendanceEntry, DecideDay, AttendanceExport, AttendanceHistoryView, AttendanceRange, AttendanceRowView, DeductionRowView, DeductionsView, FingerprintDone, FingerprintRow, WeeklyDelayView, IdealView, IdealKpiView } from "@places/contracts";
import { attendanceDay, dayStart, payrollMonth, penaltyMonth, type DayVisit, deductionAmount, fingerprintDay, OUTSIDE_REQUESTS, pickDayVisit, visitDay, formatEGP, minutesAfterStart, fromDecimal, isWorkingDay, localDate, monthDeduction, monthOf, normName, normTime, toDecimal, type DeductionRules, type DeductionTiers, MIN_KPI_FOR_IDEAL, idealEmployee, rankByKpi, rulesFor, type MemberMonth, WORK_START } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { ParsedSheet } from "../../core/http/import";
import { HrRepository, type Tx } from "./hr.repository";
import { LeavesService } from "./leaves.service";
import { ExcusesService } from "./excuses.service";
import { KpisService } from "../kpis/kpis.service";
import { hideAttendance, hideDeduction, hiddenTotal } from "./hr-fields";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const EMP = { id: true, name: true, department: true, salary: true, partTime: true, partTimeDeductions: true, deductionTiers: true, fixedSchedule: true } as const;
type Emp = Prisma.EmployeeGetPayload<{ select: typeof EMP }>;
const asDay = (s: string) => new Date(`${s}T00:00:00Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** One approved line (7.9): what HR saw and approved, so payroll keeps reading it even if a day is corrected afterwards. */
type DeductionLine = Omit<DeductionRowView, "net" | "kpi"> & { userId: string; kpi?: string }; // kpi: lines approved before 11.6 have none
/** HR's decision on someone who didn't punch (HR, 15 Nov) is the only day written with this source. */
const DECIDED = "system";
const DECISION = { CHECKIN: "present", ABSENT: "absent", DAY_OFF: "off" } as const;
/** «11:05» on a Cairo day → the instant. */
const at = (day: string, hhmm: string) => new Date(dayStart(day).getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))) * 60_000);

/**
 * M-05 · attendance (7.2 · 7.10 · 7.12): the fingerprint sheet (device export) → one row per person and day (never
 * twice), names HR links once, missing days HR fills in; each day through fingerprintDay() (tiers, part-time,
 * special schedule); a holiday or a day off is never «غياب». Audited in the same transaction.
 */
@Injectable()
export class AttendanceService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly time: BusinessTimeService, private readonly audit: AuditService, private readonly leaves: LeavesService, private readonly excuses: ExcusesService, private readonly notifications: NotificationsService, private readonly kpis: KpisService, private readonly repo: HrRepository) {}

  /** A person's rules: their own tiers if HR set them, else the company's (HR, 15 Nov). */
  private rulesOf(e: Emp, company: DeductionRules): DeductionRules {
    return rulesFor((e.deductionTiers as DeductionTiers | null) ?? null, company);
  }

  private scope(me: CurrentUser): Prisma.EmployeeWhereInput {
    switch (me.grants.scope) {
      case "all": return {};
      case "dept": return me.department ? { department: me.department } : { userId: me.id };
      case "team": return { id: { in: me.teamIds } };
      case "own": return { userId: me.id };
    }
  }

  private hhmm(d: Date | null, day: string): string | null {
    return clockOn(d, day);
  }

  private row(e: Emp, a: { id: string; day: Date; checkInAt: Date | null; checkOutAt: Date | null; visitAt: Date | null; lateMinutes: number; deduction: Prisma.Decimal; source: string; kind: string; hrConfirmed: boolean }, company: DeductionRules): AttendanceRowView {
    const day = isoDay(a.day), checkIn = this.hhmm(a.checkInAt, day);
    const r = fingerprintDay({ checkIn, partTime: e.partTime, partTimeDeductions: e.partTimeDeductions, tiers: this.rulesOf(e, company), specialSchedule: !!e.fixedSchedule });
    const ded = Number(a.deduction);
    const decided = a.source === DECIDED ? DECISION[a.kind as keyof typeof DECISION] ?? null : null;
    const status = a.kind === "ABSENT" ? "absent" as const : a.kind === "DAY_OFF" ? "off" as const : a.lateMinutes > 0 ? "late" as const : "present" as const;
    const label = a.kind === "ABSENT" ? "غياب" : a.kind === "DAY_OFF" ? "Off" : decided ? "حضور · قرار HR" : a.kind === "EXCUSE" ? "Excuse" : a.kind === "OUTSIDE_APPROVED" ? "شغل من بره (معتمد)" : a.kind === "FORGOT" ? (a.hrConfirmed ? "نسي البصمة" : "نسي البصمة · مستني Confirmation")
      : a.kind === "VISIT" ? (a.visitAt ? "Visit" : "Visit اتأجلت (معتمد)") : a.visitAt ? "Visit · معملهاش" : r.label;
    return { id: a.id, employeeId: e.id, name: e.name, department: e.department, day, checkIn, checkOut: this.hhmm(a.checkOutAt, day), visitAt: this.hhmm(a.visitAt, day),
      confirmForgot: a.kind === "FORGOT" && !a.hrConfirmed, lateMinutes: a.lateMinutes, deduction: ded,
      deductionAmount: toDecimal(deductionAmount(fromDecimal(e.salary.toFixed(2)), ded)), label, source: a.source, customTiers: e.deductionTiers != null, fixedSchedule: e.fixedSchedule, status, decided };
  }

  /** 7.3 · each salesperson's Visits that day: the same reading the day's rotation order uses (1.23, @places/db). */
  private visitsOn(ids: string[], day: string, tx: Tx | PrismaClient = this.db): Promise<Map<string, DayVisit[]>> {
    return dayVisits(tx, ids, day);
  }

  /**
   * A day's kind and cost: outside work HR confirmed (no deduction even if the fingerprint says otherwise) → the day's Visit
   * (7.3) → only a check-out = «نسي البصمة» (a day once HR confirms) → a confirmed Excuse (7.4) → the fingerprint. null = no start.
   */
  private async compute(e: Emp, day: string, checkIn: string | null, checkOut: string | null, forgotConfirmed: boolean, tx: Tx) {
    // shortcut: the company's rules are read once per day written; pass them in if a sheet ever gets slow
    const input = { checkIn, partTime: e.partTime, partTimeDeductions: e.partTimeDeductions, tiers: this.rulesOf(e, await this.repo.deductionRules(tx)), specialSchedule: !!e.fixedSchedule };
    const [outside, excuse, visits] = await Promise.all([
      tx.leaveRequest.findFirst({ where: { employeeId: e.id, type: { in: [...OUTSIDE_REQUESTS] }, status: "CLOSED_BY_HR", fromDay: { lte: asDay(day) }, toDay: { gte: asDay(day) } }, select: { id: true } }),
      checkIn ? this.excuses.confirmedFor(e.id, day, tx) : null, this.visitsOn([e.id], day, tx),
    ]);
    const visit = pickDayVisit(visits.get(e.id) ?? []), byVisit = visit && visitDay(input, visit);
    let kind: NonNullable<Prisma.AttendanceDayCreateInput["kind"]>, r: { deduction: number; lateMinutes: number }, visitAt: Date | null = null;
    if (outside) [kind, r] = ["OUTSIDE_APPROVED", attendanceDay({ kind: "outside-approved" })];
    else if (visit && byVisit) {
      [kind, r] = [visit.outcome === "not_done" ? "CHECKIN" : "VISIT", byVisit];
      if (!visit.postponed) visitAt = at(day, visit.at);
    } else if (!checkIn) {
      if (!checkOut) return null;
      [kind, r] = ["FORGOT", attendanceDay({ kind: "forgot-fingerprint", confirmedByHr: forgotConfirmed })];
    } else if (excuse) [kind, r] = ["EXCUSE", attendanceDay({ kind: "excuse", minutesAfterStart: minutesAfterStart(checkIn), excuseNumberThisMonth: excuse }, input.tiers)];
    else [kind, r] = [e.fixedSchedule ? "SPECIAL_SCHEDULE" : "CHECKIN", fingerprintDay(input)];
    return { checkInAt: checkIn ? at(day, checkIn) : null, checkOutAt: checkOut ? at(day, checkOut) : null, visitAt, kind, deduction: r.deduction, lateMinutes: r.lateMinutes, hrConfirmed: kind === "FORGOT" && forgotConfirmed };
  }

  /** Writes a day (sheet, HR, or a Visit marked); the same person and day is never duplicated. A day without a check-in yet is completed by the sheet. */
  private async write(e: Emp, day: string, checkIn: string | null, checkOut: string | null, source: string, tx: Tx, overwrite: boolean) {
    const key = { employeeId_day: { employeeId: e.id, day: asDay(day) } };
    const had = await tx.attendanceDay.findUnique({ where: key });
    // a day HR decided (HR, 15 Nov) stays HR's: only HR's own correction («تعديل») replaces it
    if ((had?.checkInAt || had?.source === DECIDED) && !overwrite) return { created: false, before: had };
    const data = await this.compute(e, day, checkIn ?? this.hhmm(had?.checkInAt ?? null, day), checkOut ?? this.hhmm(had?.checkOutAt ?? null, day), !!had?.hrConfirmed, tx);
    if (!data) {
      if (had) await tx.attendanceDay.delete({ where: key }); // a Visit marked «معملتهاش» with no fingerprint: no start
      return { created: false, before: had };
    }
    await tx.attendanceDay.upsert({ where: key, create: { employeeId: e.id, day: asDay(day), source, ...data }, update: { ...data, ...(checkIn ? { source } : {}) } });
    return { created: !had || (!had.checkInAt && !!checkIn), before: had };
  }

  /** 7.3 · a Visit marked or a postponement decided (leads): that day is read again, if it has come. */
  async refreshDay(employeeId: string, visitAt: Date, tx: Tx) {
    const day = localDate(visitAt);
    if (day > localDate(new Date())) return;
    const e = await tx.employee.findUnique({ where: { id: employeeId }, select: EMP });
    if (e) await this.write(e, day, null, null, "visit", tx, true);
  }

  /** «Confirm خصم يوم» (7.3): HR confirms «نسي البصمة»; only then the day is deducted. */
  async confirmForgot(me: CurrentUser, id: string, run: Run): Promise<AttendanceRowView> {
    // M-05 3.1 (124): the day's deduction is HR's to confirm — a Team Leader (hr: approve, his team) doesn't deduct a day
    if (me.grants.scope !== "all") throw new ForbiddenException("تأكيد خصم نسيان البصمة للـ HR");
    return run(async (tx) => {
      const a = await tx.attendanceDay.findFirst({ where: { id, kind: "FORGOT", hrConfirmed: false, employee: this.scope(me) }, include: { employee: { select: EMP } } });
      if (!a) throw new NotFoundException("مفيش «نسي البصمة» مستني تأكيد هنا");
      const r = attendanceDay({ kind: "forgot-fingerprint", confirmedByHr: true });
      const out = await tx.attendanceDay.update({ where: { id }, data: { hrConfirmed: true, deduction: r.deduction } });
      await this.audit.record({ module: "hr", entity: "AttendanceDay", entityId: id, action: "confirm-forgot", userId: me.id, before: { deduction: Number(a.deduction) }, after: { day: isoDay(a.day), deduction: r.deduction } }, tx);
      return hideAttendance(this.row(a.employee, out, await this.repo.deductionRules(tx)), me.fields.hidden("hr"));
    });
  }

  /** 0.18 · demo home.js «… نسي البصمة · محتاج Confirmation لخصم يوم»: every day waiting for HR, in the caller's scope. */
  async forgotWaiting(me: CurrentUser): Promise<{ id: string; name: string; day: string }[]> {
    const rows = await this.db.attendanceDay.findMany({ where: { kind: "FORGOT", hrConfirmed: false, employee: this.scope(me) }, select: { id: true, day: true, employee: { select: { name: true } } }, orderBy: { day: "asc" }, take: 100 });
    return rows.map((a) => ({ id: a.id, name: a.employee.name, day: isoDay(a.day) }));
  }

  async day(me: CurrentUser, day = localDate(new Date())): Promise<AttendanceDayView> {
    const cal = await this.time.calendar();
    const [emps, rows, unmatched, holiday, onLeave, rules] = await Promise.all([
      this.db.employee.findMany({ where: { AND: [this.scope(me), { user: { status: "ACTIVE" } }] }, select: EMP, orderBy: { name: "asc" } }),
      this.db.attendanceDay.findMany({ where: { day: asDay(day), employee: this.scope(me) } }),
      me.grants.scope === "all" ? this.db.fingerprintUnmatched.findMany({ orderBy: [{ day: "desc" }, { name: "asc" }], take: 200 }) : Promise.resolve([]),
      this.db.holiday.findFirst({ where: { from: { lte: asDay(day) }, to: { gte: asDay(day) } } }),
      this.leaves.employeesOnLeave(day),
      this.repo.deductionRules(),
    ]);
    const byId = new Map(emps.map((e) => [e.id, e]));
    const hidden = me.fields.hidden("hr");
    const view = rows.filter((a) => byId.has(a.employeeId)).map((a) => hideAttendance(this.row(byId.get(a.employeeId)!, a, rules), hidden)).sort((x, y) => x.name.localeCompare(y.name, "ar"));
    const working = isWorkingDay(day, cal);
    const seen = new Set(rows.map((r) => r.employeeId));
    // a holiday or a day off is never «غياب»; part-timers don't fingerprint; approved leave isn't missing (7.5)
    const missing = working ? emps.filter((e) => !seen.has(e.id) && !e.partTime && !onLeave.has(e.id)).map((e) => ({ employeeId: e.id, name: e.name, department: e.department })) : [];
    return {
      day, working, holiday: holiday?.label ?? null, rows: view, missing,
      unmatched: unmatched.map((u) => ({ id: u.id, name: u.name, day: isoDay(u.day), checkIn: u.checkIn })),
      // HR's «غياب» and «Off» are rows of the day, not people present
      totals: { present: view.filter((r) => r.status === "present" || r.status === "late").length, late: view.filter((r) => r.status === "late").length, deductions: hiddenTotal(hidden, "deductionAmount", toDecimal(view.reduce((s, r) => s + fromDecimal(r.deductionAmount), 0))) },
    };
  }

  /** «تصدير الحضور» (demo hr.js · M-12 0.11): the day's rows as on the screen (same scope, same name search). */
  async exportDay(me: CurrentUser, f: AttendanceExport): Promise<{ day: string; rows: AttendanceRowView[] }> {
    const v = await this.day(me, f.day);
    const q = f.q ?? "";
    const rows = v.rows.filter((r) => r.name.includes(q));
    await this.audit.record({ module: "hr", entity: "AttendanceDay", entityId: "export", action: "export", userId: me.id, after: { day: v.day, q: f.q ?? null, rows: rows.length } });
    return { day: v.day, rows };
  }

  async history(me: CurrentUser, f: AttendanceRange): Promise<AttendanceHistoryView> {
    if (f.from > f.to) throw new BadRequestException("«من» لازم تبقى قبل «لحد»");
    const emp = f.employeeId ? await this.db.employee.findFirst({ where: { AND: [{ id: f.employeeId }, this.scope(me)] }, select: EMP }) : null;
    if (f.employeeId && !emp) throw new NotFoundException("الموظف مش موجود");
    if (!emp) return { employee: null, rows: [], totals: { late: 0, deductionDays: 0, deductions: "0.00" } };
    const hidden = me.fields.hidden("hr"), rules = await this.repo.deductionRules();
    const rows = (await this.db.attendanceDay.findMany({ where: { employeeId: emp.id, day: { gte: asDay(f.from), lte: asDay(f.to) } }, orderBy: { day: "asc" } })).map((a) => hideAttendance(this.row(emp, a, rules), hidden));
    return { employee: { id: emp.id, name: emp.name }, rows,
      totals: { late: rows.reduce((s, r) => s + r.lateMinutes, 0), deductionDays: rows.reduce((s, r) => s + r.deduction, 0), deductions: hiddenTotal(hidden, "deductionAmount", toDecimal(rows.reduce((s, r) => s + fromDecimal(r.deductionAmount), 0))) } };
  }

  /** Weekly Delay (M-05): every minute after 11:16 per person per day, Excuse / Visit included, sorted by the most. */
  async weeklyDelay(me: CurrentUser, f: AttendanceRange): Promise<WeeklyDelayView> {
    if (f.from > f.to) throw new BadRequestException("«من» لازم تبقى قبل «لحد»");
    const [emps, rows, sums, rules] = await Promise.all([
      this.db.employee.findMany({ where: { AND: [this.scope(me), { user: { status: "ACTIVE" }, partTime: false }] }, select: EMP }),
      this.db.attendanceDay.findMany({ where: { day: { gte: asDay(f.from), lte: asDay(f.to) }, employee: this.scope(me) }, orderBy: { day: "asc" } }),
      // 7.14 «التراكمي»: all of their days, from the first one they worked
      this.db.attendanceDay.groupBy({ by: ["employeeId"], where: { employee: this.scope(me) }, _sum: { lateMinutes: true } }),
      this.repo.deductionRules(),
    ]);
    const allTime = new Map(sums.map((s) => [s.employeeId, s._sum.lateMinutes ?? 0]));
    const days = [...new Set(rows.map((r) => isoDay(r.day)))].sort();
    const people = emps.map((e) => {
      const mine = rows.filter((r) => r.employeeId === e.id).map((r) => this.row(e, r, rules));
      return { employeeId: e.id, name: e.name, byDay: Object.fromEntries(mine.map((r) => [r.day, { late: r.lateMinutes, label: r.label }])), total: mine.reduce((s, r) => s + r.lateMinutes, 0), allTime: allTime.get(e.id) ?? 0 };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ar"));
    return { days, people };
  }

  /**
   * 7.9 · this month's live lines for everyone payroll pays: attendance days (Excuses already in them) + approved penalties,
   * and (11.6) the KPI reward or deduction of a quarter closed this month.
   */
  private async liveDeductions(month: string, tx: Tx | PrismaClient = this.db): Promise<DeductionLine[]> {
    const [y, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
    const within = { gte: asDay(`${month}-01`), lt: new Date(Date.UTC(y, m, 1)) };
    const [emps, days, pens, approvals, kpis] = await Promise.all([
      tx.employee.findMany({ where: { user: { status: "ACTIVE" }, salary: { gt: 0 } }, select: { id: true, userId: true, name: true, salary: true }, orderBy: { name: "asc" } }),
      tx.attendanceDay.groupBy({ by: ["employeeId"], where: { day: within }, _sum: { deduction: true, lateMinutes: true } }),
      // this month's penalties, and earlier ones approved after their month was (penaltyMonth): those were decided after the last month's approval, so not before its start
      tx.penalty.findMany({ where: { status: "approved", day: { lt: within.lt }, OR: [{ day: { gte: within.gte } }, { decidedAt: { gte: new Date(Date.UTC(y, m - 2, 1)) } }] }, select: { employeeId: true, day: true, decidedAt: true, deductionDays: true } }),
      tx.deductionApproval.findMany({ select: { month: true, at: true } }),
      this.kpis.payrollAmounts(month, tx),
    ]);
    const approvedAt = new Map(approvals.map((a) => [a.month, a.at]));
    const penaltyDaysOf = new Map<string, number>();
    for (const p of pens) if (penaltyMonth(isoDay(p.day), p.decidedAt, approvedAt) === month) penaltyDaysOf.set(p.employeeId, (penaltyDaysOf.get(p.employeeId) ?? 0) + Number(p.deductionDays));
    return emps.map((e) => {
      const a = days.find((x) => x.employeeId === e.id)?._sum;
      const salary = fromDecimal(e.salary.toFixed(2)), attendanceDays = Number(a?.deduction ?? 0), penaltyDays = penaltyDaysOf.get(e.id) ?? 0, kpi = kpis.get(e.id) ?? 0;
      return { employeeId: e.id, userId: e.userId, name: e.name, salary: toDecimal(salary), attendanceDays, penaltyDays, lateMinutes: a?.lateMinutes ?? 0, kpi: toDecimal(kpi),
        amount: toDecimal(monthDeduction({ salary, attendanceDays, penaltyDays, kpi }).amount) };
    });
  }

  /** «التوفير» (7.9): the month's deductions, live until HR approves them, then exactly what was approved. By default the month payroll pays now (payrollMonth). */
  async deductions(me: CurrentUser, month = payrollMonth(localDate(new Date()))): Promise<DeductionsView> {
    const [ok, mine] = await Promise.all([this.db.deductionApproval.findUnique({ where: { month } }), this.db.employee.findMany({ where: this.scope(me), select: { id: true } })]);
    const ids = new Set(mine.map((e) => e.id));
    const lines = (ok ? (ok.lines as DeductionLine[]) : await this.liveDeductions(month)).filter((l) => ids.has(l.employeeId));
    const by = ok ? await this.db.employee.findUnique({ where: { userId: ok.approvedById }, select: { name: true } }) : null;
    const rows = lines.map((l) => ({ employeeId: l.employeeId, name: l.name, salary: l.salary, attendanceDays: l.attendanceDays, penaltyDays: l.penaltyDays, lateMinutes: l.lateMinutes, kpi: l.kpi ?? "0.00", amount: l.amount,
      net: toDecimal(fromDecimal(l.salary) - fromDecimal(l.amount)) }));
    const hidden = me.fields.hidden("hr"), shown = rows.map((r) => hideDeduction(r, hidden));
    const sum = (k: "salary" | "amount" | "net") => toDecimal(shown.reduce((s, r) => s + fromDecimal(r[k]), 0));
    return { month, rows: shown, totals: { salary: sum("salary"), amount: sum("amount"), net: sum("net"), people: rows.length }, approved: ok ? { by: by?.name ?? "", at: ok.at.toISOString() } : null };
  }

  /**
   * 7.11 · «الموظف المثالي وصندوق الفريق» (M-05, client sheet 28/10): a team = a Team Leader's sales team or the people a
   * manager follows in the KPIs; idealEmployee() picks the winner and the fund. Only the people in my scope.
   */
  async ideal(me: CurrentUser, month = monthOf(localDate(new Date()))): Promise<IdealView> {
    const within = { gte: asDay(`${month}-01`), lt: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)) };
    const [emps, names, cards, days, pens] = await Promise.all([
      this.db.employee.findMany({ where: { AND: [this.scope(me), { user: { status: "ACTIVE" } }] }, select: { id: true, name: true, salary: true, teamLeaderId: true } }),
      this.db.employee.findMany({ select: { id: true, name: true } }),
      this.kpis.liveCards(),
      this.db.attendanceDay.findMany({ where: { day: within }, select: { employeeId: true, day: true, checkInAt: true, kind: true, lateMinutes: true, deduction: true } }),
      // HR, 15 Nov: any penalty this month that wasn't rejected (pending too) — penaltyBlocksIdeal()
      this.db.penalty.findMany({ where: { day: within, status: { not: "rejected" } }, select: { employeeId: true } }),
    ]);
    const byId = new Map(emps.map((e) => [e.id, e])), nameOf = new Map(names.map((e) => [e.id, e.name])), score = new Map(cards.map((c) => [c.employeeId, c.score]));
    const teams = new Map<string, Set<string>>();
    const add = (lead: string | null, id: string) => { if (lead && byId.has(id)) { if (!teams.has(lead)) teams.set(lead, new Set()); teams.get(lead)!.add(id); } };
    for (const e of emps) add(e.teamLeaderId, e.id);
    for (const c of cards) add(c.followerId, c.employeeId);
    const member = (id: string): MemberMonth => {
      const mine = days.filter((d) => d.employeeId === id);
      return {
        id, earlyDays: mine.filter((d) => d.checkInAt && d.checkInAt < at(isoDay(d.day), "11:00")).length, // before the start of work
        lateHours: mine.reduce((s, d) => s + d.lateMinutes, 0) / 60, absentDays: mine.filter((d) => d.kind === "ABSENT").length,
        deductions: deductionAmount(fromDecimal(byId.get(id)!.salary.toFixed(2)), mine.reduce((s, d) => s + Number(d.deduction), 0)),
        // shortcut: no achieved-target figure per person yet (deals 5.x), so a tie falls to the KPI score
        kpiScore: score.get(id) ?? null, targetPercent: 0, hasPenalty: pens.some((p) => p.employeeId === id),
      };
    };
    const out = [...teams].filter(([, ids]) => ids.size > 1).map(([lead, ids]) => {
      const team = [...ids].map(member), r = idealEmployee(team);
      return {
        name: `فريق ${nameOf.get(lead) ?? ""}`, winner: r.winner ? { employeeId: r.winner, name: byId.get(r.winner)!.name } : null, fund: hiddenTotal(me.fields.hidden("hr"), "fund", toDecimal(r.fund)),
        rows: team.map((m) => ({
          employeeId: m.id, name: byId.get(m.id)!.name, earlyDays: m.earlyDays, lateHours: Math.round(m.lateHours * 10) / 10, absentDays: m.absentDays,
          kpi: m.kpiScore == null ? null : Math.round(m.kpiScore), points: Math.round(r.points.get(m.id)! * 10) / 10,
          status: m.id === r.winner ? "ideal" as const : m.hasPenalty ? "penalty" as const : m.kpiScore != null && m.kpiScore < MIN_KPI_FOR_IDEAL ? "kpi" as const : null,
        })).sort((a, b) => r.order.indexOf(a.employeeId) - r.order.indexOf(b.employeeId)),
      };
    });
    return { month, teams: out.sort((a, b) => a.name.localeCompare(b.name, "ar")) };
  }

  /**
   * «الموظف المثالي» by KPIs (HR, 15/11): every salesperson and every Team Leader in my scope with this quarter's total KPI
   * score; rankByKpi() orders them and marks the highest of each group. The attendance-based teams stay in ideal() («Employee Box»).
   */
  async idealKpi(me: CurrentUser): Promise<IdealKpiView> {
    const [emps, cards, quarter] = await Promise.all([
      this.db.employee.findMany({
        where: { AND: [this.scope(me), { user: { status: "ACTIVE", roles: { some: { role: { key: { in: ["sales", "tl"] } } } } } }] },
        select: { id: true, name: true, teamLeader: { select: { name: true } }, user: { select: { roles: { select: { role: { select: { key: true } } } } } } },
      }),
      this.kpis.liveCards(),
      this.kpis.currentQuarterId(),
    ]);
    const score = new Map(cards.map((c) => [c.employeeId, c.score]));
    type Emp = (typeof emps)[number];
    const keys = (e: Emp) => new Set(e.user?.roles.map((r) => r.role.key) ?? []);
    const row = (e: Emp) => ({ employeeId: e.id, name: e.name, team: e.teamLeader?.name ?? null, score: score.has(e.id) ? Math.round(score.get(e.id)! * 10) / 10 : null });
    const group = (pick: (k: Set<string>) => boolean) => rankByKpi(emps.filter((e) => pick(keys(e))).map(row).sort((a, b) => a.name.localeCompare(b.name, "ar"))).rows.slice();
    return { quarter, sales: group((k) => k.has("sales") && !k.has("tl")), teamLeaders: group((k) => k.has("tl")) };
  }

  /**
   * «اعتمد الخصومات وابعتها للمالية» (7.9, M-05 (32)): once a month, by HR; payroll reads these numbers from then on.
   * The month is the one payroll pays now (payrollMonth): approving on 2 Nov approves October, which the 1 Nov run waits for.
   */
  async approveDeductions(me: CurrentUser, run: Run): Promise<DeductionsView> {
    if (me.grants.scope !== "all" || !me.grants.can("hr", "approve")) throw new ForbiddenException("اعتماد الخصومات للـ HR");
    const month = payrollMonth(localDate(new Date()));
    const total = await run(async (tx) => {
      if (await tx.deductionApproval.findUnique({ where: { month } })) throw new BadRequestException("خصومات الشهر ده اتعتمدت قبل كده");
      const lines = await this.liveDeductions(month, tx);
      const r = await tx.deductionApproval.create({ data: { month, lines, approvedById: me.id } });
      const total = lines.reduce((s, l) => s + fromDecimal(l.amount), 0);
      await this.audit.record({ module: "hr", entity: "DeductionApproval", entityId: r.id, action: "approve", userId: me.id, after: { month, people: lines.length, total: toDecimal(total) } }, tx);
      return total;
    });
    await this.notifications.notify({ event: "hr.deductions_approved", link: "/finance", text: `الـ HR اعتمدت خصومات ${month} (${formatEGP(total)}) · اترحّلت للمرتبات` });
    return this.deductions(me, month);
  }

  /** For payroll (9.14): each person's approved deduction this month by account, or null while HR hasn't approved. */
  async approvedDeductions(month: string, tx: Tx | PrismaClient = this.db): Promise<Map<string, number> | null> {
    const ok = await tx.deductionApproval.findUnique({ where: { month } });
    return ok ? new Map((ok.lines as DeductionLine[]).map((l) => [l.userId, fromDecimal(l.amount)])) : null;
  }

  /** 7.12 · the sheet: known names (and names HR linked before) are written; a day already there is kept; the rest wait for HR. */
  async importSheet(me: CurrentUser, sheet: ParsedSheet<FingerprintRow>, run: Run): Promise<FingerprintDone> {
    if (sheet.errors.length) throw new BadRequestException(`الشيت فيه ${sheet.errors.length} خطأ · صلّحهم وارفعه تاني`);
    if (!sheet.rows.length) throw new BadRequestException("الشيت مفيهوش صفوف");
    const out = await run(async (tx) => {
      const [emps, aliases] = await Promise.all([tx.employee.findMany({ where: { user: { status: "ACTIVE" } }, select: EMP }), tx.fingerprintAlias.findMany()]);
      const byName = new Map(emps.map((e) => [normName(e.name), e]));
      const byId = new Map(emps.map((e) => [e.id, e]));
      for (const a of aliases) { const e = byId.get(a.employeeId); if (e) byName.set(a.name, e); }
      let imported = 0, skipped = 0, unmatched = 0;
      const forgot: string[] = [];
      for (const { data: r } of sheet.rows) {
        const checkIn = normTime(r.checkIn), checkOut = normTime(r.checkOut);
        if (!checkIn && !checkOut) { skipped++; continue; }
        const e = byName.get(normName(r.name));
        if (!e) {
          await tx.fingerprintUnmatched.upsert({ where: { name_day: { name: r.name.trim(), day: asDay(r.day) } }, create: { name: r.name.trim(), day: asDay(r.day), checkIn, checkOut, uploadedById: me.id }, update: { checkIn, checkOut } });
          unmatched++; continue;
        }
        if ((await this.write(e, r.day, checkIn, checkOut, "sheet", tx, false)).created) { imported++; if (!checkIn) forgot.push(e.name); }
        else skipped++;
      }
      await this.audit.record({ module: "hr", entity: "AttendanceDay", entityId: "sheet", action: "import", userId: me.id, after: { rows: sheet.rows.length, imported, skipped, unmatched } }, tx);
      return { done: { imported, skipped, unmatched }, forgot };
    });
    // 7.3 «نسي البصمة» → HR is told; the day is deducted only once she confirms
    if (out.forgot.length) await this.notifications.notify({ event: "hr.forgot_fingerprint", link: "/hr", text: `نسي البصمة (${out.forgot.length}): ${out.forgot.join("، ")} · مستني Confirmation` });
    return out.done;
  }

  /** HR links a sheet name to an employee: that day is written, and the name matches by itself next time. */
  async link(me: CurrentUser, id: string, employeeId: string, run: Run) {
    return run(async (tx) => {
      const u = await tx.fingerprintUnmatched.findUnique({ where: { id } });
      if (!u) throw new NotFoundException("الاسم ده اتربط قبل كده");
      const e = await tx.employee.findUnique({ where: { id: employeeId }, select: EMP });
      if (!e) throw new NotFoundException("الموظف مش موجود");
      await tx.fingerprintAlias.upsert({ where: { name: normName(u.name) }, create: { name: normName(u.name), employeeId }, update: { employeeId } });
      // every waiting row with the same name goes to that person
      const same = (await tx.fingerprintUnmatched.findMany()).filter((x) => normName(x.name) === normName(u.name));
      for (const x of same) if (x.checkIn || x.checkOut) await this.write(e, isoDay(x.day), x.checkIn, x.checkOut, "sheet", tx, false);
      await tx.fingerprintUnmatched.deleteMany({ where: { id: { in: same.map((x) => x.id) } } });
      await this.audit.record({ module: "hr", entity: "FingerprintAlias", entityId: normName(u.name), action: "link", userId: me.id, after: { name: u.name, employeeId, days: same.length } }, tx);
      return { linked: same.length };
    });
  }

  /** «استكمال الأيام»: HR writes a day the device missed, or corrects one (audited old → new). */
  async entry(me: CurrentUser, input: AttendanceEntry, run: Run) {
    const checkIn = normTime(input.checkIn), checkOut = normTime(input.checkOut);
    if (!checkIn) throw new BadRequestException("الوقت بالشكل 11:05");
    if (input.day > localDate(new Date())) throw new BadRequestException("مينفعش يوم بعد النهارده");
    return run(async (tx) => {
      const e = await tx.employee.findFirst({ where: { AND: [{ id: input.employeeId }, this.scope(me)] }, select: EMP });
      if (!e) throw new NotFoundException("الموظف مش موجود");
      const { before } = await this.write(e, input.day, checkIn, checkOut, "hr", tx, true);
      const after = await tx.attendanceDay.findUniqueOrThrow({ where: { employeeId_day: { employeeId: e.id, day: asDay(input.day) } } });
      await this.audit.record({ module: "hr", entity: "AttendanceDay", entityId: after.id, action: before ? "update" : "create", userId: me.id,
        before: before ? { checkIn: this.hhmm(before.checkInAt, input.day), deduction: Number(before.deduction) } : null, after: { day: input.day, checkIn, checkOut, deduction: Number(after.deduction) } }, tx);
      return hideAttendance(this.row(e, after, await this.repo.deductionRules(tx)), me.fields.hidden("hr"));
    });
  }

  /**
   * HR, 15 Nov · someone who didn't punch on a working day: «حضور» (no deduction, e.g. an accident or no internet; the
   * check-in defaults to the work start), «غياب» (what the company's rules say an absence costs) or «Off» (a day off, no
   * deduction). HR only (scope all); deciding again replaces the decision; a day with a real fingerprint is corrected
   * with «تعديل» instead. Audited old → new.
   */
  async decide(me: CurrentUser, input: DecideDay, run: Run): Promise<AttendanceRowView> {
    if (me.grants.scope !== "all") throw new ForbiddenException("القرار ده للـ HR");
    if (input.day > localDate(new Date())) throw new BadRequestException("مينفعش يوم بعد النهارده");
    if (!isWorkingDay(input.day, await this.time.calendar())) throw new BadRequestException("اليوم ده مش يوم شغل");
    const checkIn = input.decision === "present" ? (input.checkIn ? normTime(input.checkIn) : WORK_START) : null;
    if (input.decision === "present" && !checkIn) throw new BadRequestException("الوقت بالشكل 11:05");
    return run(async (tx) => {
      const e = await tx.employee.findFirst({ where: { AND: [{ id: input.employeeId }, this.scope(me), { user: { status: "ACTIVE" } }] }, select: EMP });
      if (!e) throw new NotFoundException("الموظف مش موجود");
      const key = { employeeId_day: { employeeId: e.id, day: asDay(input.day) } };
      const had = await tx.attendanceDay.findUnique({ where: key });
      if (had && had.source !== DECIDED) throw new BadRequestException("اليوم ده فيه بصمة · عدّله من «تعديل»");
      const rules = this.rulesOf(e, await this.repo.deductionRules(tx));
      const data = checkIn
        ? { kind: "CHECKIN" as const, checkInAt: at(input.day, checkIn), deduction: 0, lateMinutes: attendanceDay({ kind: "checkin", minutesAfterStart: minutesAfterStart(checkIn) }, rules).lateMinutes }
        : { kind: input.decision === "absent" ? "ABSENT" as const : "DAY_OFF" as const, checkInAt: null, lateMinutes: 0,
            deduction: input.decision === "absent" ? attendanceDay({ kind: "absent-without-permission" }, rules).deduction : 0 };
      const out = await tx.attendanceDay.upsert({ where: key, create: { employeeId: e.id, day: asDay(input.day), source: DECIDED, ...data }, update: data });
      await this.audit.record({ module: "hr", entity: "AttendanceDay", entityId: out.id, action: "decide", userId: me.id,
        before: had ? { kind: had.kind, checkIn: this.hhmm(had.checkInAt, input.day), deduction: Number(had.deduction) } : null,
        after: { employee: e.name, day: input.day, decision: input.decision, checkIn, deduction: data.deduction } }, tx);
      return hideAttendance(this.row(e, out, rules), me.fields.hidden("hr"));
    });
  }
}
