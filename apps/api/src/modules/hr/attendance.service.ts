import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { AttendanceDayView, AttendanceEntry, AttendanceHistoryView, AttendanceRange, AttendanceRowView, DeductionRowView, DeductionsView, FingerprintDone, FingerprintRow, IdealView, WeeklyDelayView } from "@places/contracts";
import { MIN_KPI_FOR_IDEAL, attendanceDay, dayStart, deductionAmount, fingerprintDay, formatEGP, idealEmployee, minutesAfterStart, fromDecimal, isWorkingDay, localDate, monthDeduction, monthOf, normName, normTime, toDecimal, type DeductionTiers, type MemberMonth } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { ParsedSheet } from "../../core/http/import";
import type { Tx } from "./hr.repository";
import { LeavesService } from "./leaves.service";
import { ExcusesService } from "./excuses.service";
import { KpisService } from "../kpis/kpis.service";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const EMP = { id: true, name: true, department: true, salary: true, partTime: true, partTimeDeductions: true, deductionTiers: true, fixedSchedule: true } as const;
type Emp = Prisma.EmployeeGetPayload<{ select: typeof EMP }>;
const asDay = (s: string) => new Date(`${s}T00:00:00Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** One approved line (7.9): what HR saw and approved, so payroll keeps reading it even if a day is corrected afterwards. */
type DeductionLine = Omit<DeductionRowView, "net" | "kpi"> & { userId: string; kpi?: string }; // kpi: lines approved before 11.6 have none
/** «11:05» on a Cairo day → the instant. */
const at = (day: string, hhmm: string) => new Date(dayStart(day).getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))) * 60_000);

/**
 * M-05 · attendance (7.2 · 7.10 · 7.12): the fingerprint sheet (device export) → one row per person and day (never
 * twice), names HR links once, missing days HR fills in; each day through fingerprintDay() (tiers, part-time,
 * special schedule); a holiday or a day off is never «غياب». Audited in the same transaction.
 */
@Injectable()
export class AttendanceService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly time: BusinessTimeService, private readonly audit: AuditService, private readonly leaves: LeavesService, private readonly excuses: ExcusesService, private readonly notifications: NotificationsService, private readonly kpis: KpisService) {}

  private scope(me: CurrentUser): Prisma.EmployeeWhereInput {
    switch (me.grants.scope) {
      case "all": return {};
      case "dept": return me.department ? { department: me.department } : { userId: me.id };
      case "team": return { id: { in: me.teamIds } };
      case "own": return { userId: me.id };
    }
  }

  private hhmm(d: Date | null, day: string): string | null {
    if (!d) return null;
    const min = Math.round((d.getTime() - dayStart(day).getTime()) / 60_000);
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }

  private row(e: Emp, a: { day: Date; checkInAt: Date | null; checkOutAt: Date | null; lateMinutes: number; deduction: Prisma.Decimal; source: string; kind?: string }): AttendanceRowView {
    const day = isoDay(a.day), checkIn = this.hhmm(a.checkInAt, day);
    const r = fingerprintDay({ checkIn, partTime: e.partTime, partTimeDeductions: e.partTimeDeductions, tiers: (e.deductionTiers as DeductionTiers | null) ?? null, specialSchedule: !!e.fixedSchedule });
    const ded = Number(a.deduction);
    return { employeeId: e.id, name: e.name, department: e.department, day, checkIn, checkOut: this.hhmm(a.checkOutAt, day), lateMinutes: a.lateMinutes, deduction: ded,
      deductionAmount: toDecimal(deductionAmount(fromDecimal(e.salary.toFixed(2)), ded)), label: a.kind === "EXCUSE" ? "Excuse" : r.label, source: a.source, customTiers: e.deductionTiers != null, fixedSchedule: e.fixedSchedule };
  }

  /** Writes a day from a check-in (sheet, or HR filling a missing day); the same person and day is never duplicated. */
  private async write(e: Emp, day: string, checkIn: string, checkOut: string | null, source: string, tx: Tx, overwrite: boolean) {
    // a confirmed Excuse (7.4) replaces «متأخر» with its own cost; Weekly Delay keeps every minute
    const excuse = await this.excuses.confirmedFor(e.id, day, tx);
    const r = excuse ? attendanceDay({ kind: "excuse", minutesAfterStart: minutesAfterStart(checkIn), excuseNumberThisMonth: excuse }, (e.deductionTiers as DeductionTiers | null) ?? undefined)
      : fingerprintDay({ checkIn, partTime: e.partTime, partTimeDeductions: e.partTimeDeductions, tiers: (e.deductionTiers as DeductionTiers | null) ?? null, specialSchedule: !!e.fixedSchedule });
    const kind = excuse ? "EXCUSE" : e.fixedSchedule ? "SPECIAL_SCHEDULE" : "CHECKIN";
    const data = { checkInAt: at(day, checkIn), checkOutAt: checkOut ? at(day, checkOut) : null, kind: kind as "CHECKIN", deduction: r.deduction, lateMinutes: r.lateMinutes, source };
    const key = { employeeId_day: { employeeId: e.id, day: asDay(day) } };
    const had = await tx.attendanceDay.findUnique({ where: key });
    if (had && !overwrite) return { created: false, before: had };
    await tx.attendanceDay.upsert({ where: key, create: { employeeId: e.id, day: asDay(day), ...data }, update: data });
    return { created: !had, before: had };
  }

  async day(me: CurrentUser, day = localDate(new Date())): Promise<AttendanceDayView> {
    const cal = await this.time.calendar();
    const [emps, rows, unmatched, holiday, onLeave] = await Promise.all([
      this.db.employee.findMany({ where: { AND: [this.scope(me), { user: { status: "ACTIVE" } }] }, select: EMP, orderBy: { name: "asc" } }),
      this.db.attendanceDay.findMany({ where: { day: asDay(day), employee: this.scope(me) } }),
      me.grants.scope === "all" ? this.db.fingerprintUnmatched.findMany({ orderBy: [{ day: "desc" }, { name: "asc" }], take: 200 }) : Promise.resolve([]),
      this.db.holiday.findFirst({ where: { from: { lte: asDay(day) }, to: { gte: asDay(day) } } }),
      this.leaves.employeesOnLeave(day),
    ]);
    const byId = new Map(emps.map((e) => [e.id, e]));
    const view = rows.filter((a) => byId.has(a.employeeId)).map((a) => this.row(byId.get(a.employeeId)!, a)).sort((x, y) => x.name.localeCompare(y.name, "ar"));
    const working = isWorkingDay(day, cal);
    const seen = new Set(rows.map((r) => r.employeeId));
    // a holiday or a day off is never «غياب»; part-timers don't fingerprint; approved leave isn't missing (7.5)
    const missing = working ? emps.filter((e) => !seen.has(e.id) && !e.partTime && !onLeave.has(e.id)).map((e) => ({ employeeId: e.id, name: e.name, department: e.department })) : [];
    return {
      day, working, holiday: holiday?.label ?? null, rows: view, missing,
      unmatched: unmatched.map((u) => ({ id: u.id, name: u.name, day: isoDay(u.day), checkIn: u.checkIn })),
      totals: { present: view.length, late: view.filter((r) => r.lateMinutes > 0).length, deductions: toDecimal(view.reduce((s, r) => s + fromDecimal(r.deductionAmount), 0)) },
    };
  }

  async history(me: CurrentUser, f: AttendanceRange): Promise<AttendanceHistoryView> {
    if (f.from > f.to) throw new BadRequestException("«من» لازم تبقى قبل «لحد»");
    const emp = f.employeeId ? await this.db.employee.findFirst({ where: { AND: [{ id: f.employeeId }, this.scope(me)] }, select: EMP }) : null;
    if (f.employeeId && !emp) throw new NotFoundException("الموظف مش موجود");
    if (!emp) return { employee: null, rows: [], totals: { late: 0, deductionDays: 0, deductions: "0.00" } };
    const rows = (await this.db.attendanceDay.findMany({ where: { employeeId: emp.id, day: { gte: asDay(f.from), lte: asDay(f.to) } }, orderBy: { day: "asc" } })).map((a) => this.row(emp, a));
    return { employee: { id: emp.id, name: emp.name }, rows,
      totals: { late: rows.reduce((s, r) => s + r.lateMinutes, 0), deductionDays: rows.reduce((s, r) => s + r.deduction, 0), deductions: toDecimal(rows.reduce((s, r) => s + fromDecimal(r.deductionAmount), 0)) } };
  }

  /** Weekly Delay (M-05): every minute after 11:16 per person per day, Excuse / Visit included, sorted by the most. */
  async weeklyDelay(me: CurrentUser, f: AttendanceRange): Promise<WeeklyDelayView> {
    if (f.from > f.to) throw new BadRequestException("«من» لازم تبقى قبل «لحد»");
    const [emps, rows] = await Promise.all([
      this.db.employee.findMany({ where: { AND: [this.scope(me), { user: { status: "ACTIVE" }, partTime: false }] }, select: EMP }),
      this.db.attendanceDay.findMany({ where: { day: { gte: asDay(f.from), lte: asDay(f.to) }, employee: this.scope(me) }, orderBy: { day: "asc" } }),
    ]);
    const days = [...new Set(rows.map((r) => isoDay(r.day)))].sort();
    const people = emps.map((e) => {
      const mine = rows.filter((r) => r.employeeId === e.id).map((r) => this.row(e, r));
      return { employeeId: e.id, name: e.name, byDay: Object.fromEntries(mine.map((r) => [r.day, { late: r.lateMinutes, label: r.label }])), total: mine.reduce((s, r) => s + r.lateMinutes, 0) };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ar"));
    return { days, people };
  }

  /**
   * 7.9 · this month's live lines for everyone payroll pays: attendance days (Excuses already in them) + approved penalties,
   * and (11.6) the KPI reward or deduction of a quarter closed this month.
   */
  private async liveDeductions(month: string, tx: Tx | PrismaClient = this.db): Promise<DeductionLine[]> {
    const within = { gte: asDay(`${month}-01`), lt: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)) };
    const [emps, days, pens, kpis] = await Promise.all([
      tx.employee.findMany({ where: { user: { status: "ACTIVE" }, salary: { gt: 0 } }, select: { id: true, userId: true, name: true, salary: true }, orderBy: { name: "asc" } }),
      tx.attendanceDay.groupBy({ by: ["employeeId"], where: { day: within }, _sum: { deduction: true, lateMinutes: true } }),
      tx.penalty.groupBy({ by: ["employeeId"], where: { day: within, status: "approved" }, _sum: { deductionDays: true } }),
      this.kpis.payrollAmounts(month, tx),
    ]);
    return emps.map((e) => {
      const a = days.find((x) => x.employeeId === e.id)?._sum, p = pens.find((x) => x.employeeId === e.id)?._sum;
      const salary = fromDecimal(e.salary.toFixed(2)), attendanceDays = Number(a?.deduction ?? 0), penaltyDays = Number(p?.deductionDays ?? 0), kpi = kpis.get(e.id) ?? 0;
      return { employeeId: e.id, userId: e.userId, name: e.name, salary: toDecimal(salary), attendanceDays, penaltyDays, lateMinutes: a?.lateMinutes ?? 0, kpi: toDecimal(kpi),
        amount: toDecimal(monthDeduction({ salary, attendanceDays, penaltyDays, kpi }).amount) };
    });
  }

  /** «التوفير» (7.9): the month's deductions, live until HR approves them, then exactly what was approved. */
  async deductions(me: CurrentUser, month = monthOf(localDate(new Date()))): Promise<DeductionsView> {
    const [ok, mine] = await Promise.all([this.db.deductionApproval.findUnique({ where: { month } }), this.db.employee.findMany({ where: this.scope(me), select: { id: true } })]);
    const ids = new Set(mine.map((e) => e.id));
    const lines = (ok ? (ok.lines as DeductionLine[]) : await this.liveDeductions(month)).filter((l) => ids.has(l.employeeId));
    const by = ok ? await this.db.employee.findUnique({ where: { userId: ok.approvedById }, select: { name: true } }) : null;
    const rows = lines.map((l) => ({ employeeId: l.employeeId, name: l.name, salary: l.salary, attendanceDays: l.attendanceDays, penaltyDays: l.penaltyDays, lateMinutes: l.lateMinutes, kpi: l.kpi ?? "0.00", amount: l.amount,
      net: toDecimal(fromDecimal(l.salary) - fromDecimal(l.amount)) }));
    const sum = (k: "salary" | "amount" | "net") => toDecimal(rows.reduce((s, r) => s + fromDecimal(r[k]), 0));
    return { month, rows, totals: { salary: sum("salary"), amount: sum("amount"), net: sum("net"), people: rows.length }, approved: ok ? { by: by?.name ?? "", at: ok.at.toISOString() } : null };
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
      this.db.penalty.findMany({ where: { day: within, status: "approved" }, select: { employeeId: true } }),
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
        name: `فريق ${nameOf.get(lead) ?? ""}`, winner: r.winner ? { employeeId: r.winner, name: byId.get(r.winner)!.name } : null, fund: toDecimal(r.fund),
        rows: team.map((m) => ({
          employeeId: m.id, name: byId.get(m.id)!.name, earlyDays: m.earlyDays, lateHours: Math.round(m.lateHours * 10) / 10, absentDays: m.absentDays,
          kpi: m.kpiScore == null ? null : Math.round(m.kpiScore), points: Math.round(r.points.get(m.id)! * 10) / 10,
          status: m.id === r.winner ? "ideal" as const : m.hasPenalty ? "penalty" as const : m.kpiScore != null && m.kpiScore < MIN_KPI_FOR_IDEAL ? "kpi" as const : null,
        })).sort((a, b) => b.points - a.points),
      };
    });
    return { month, teams: out.sort((a, b) => a.name.localeCompare(b.name, "ar")) };
  }

  /** «اعتمد الخصومات وابعتها للمالية» (7.9, M-05 (32)): once a month, by HR; payroll reads these numbers from then on. */
  async approveDeductions(me: CurrentUser, run: Run): Promise<DeductionsView> {
    if (me.grants.scope !== "all" || !me.grants.can("hr", "approve")) throw new ForbiddenException("اعتماد الخصومات للـ HR");
    const month = monthOf(localDate(new Date()));
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
    return run(async (tx) => {
      const [emps, aliases] = await Promise.all([tx.employee.findMany({ where: { user: { status: "ACTIVE" } }, select: EMP }), tx.fingerprintAlias.findMany()]);
      const byName = new Map(emps.map((e) => [normName(e.name), e]));
      const byId = new Map(emps.map((e) => [e.id, e]));
      for (const a of aliases) { const e = byId.get(a.employeeId); if (e) byName.set(a.name, e); }
      let imported = 0, skipped = 0, unmatched = 0;
      for (const { data: r } of sheet.rows) {
        const checkIn = normTime(r.checkIn), checkOut = normTime(r.checkOut);
        if (!checkIn) { skipped++; continue; }
        const e = byName.get(normName(r.name));
        if (!e) {
          await tx.fingerprintUnmatched.upsert({ where: { name_day: { name: r.name.trim(), day: asDay(r.day) } }, create: { name: r.name.trim(), day: asDay(r.day), checkIn, checkOut, uploadedById: me.id }, update: { checkIn, checkOut } });
          unmatched++; continue;
        }
        if ((await this.write(e, r.day, checkIn, checkOut, "sheet", tx, false)).created) imported++;
        else skipped++;
      }
      await this.audit.record({ module: "hr", entity: "AttendanceDay", entityId: "sheet", action: "import", userId: me.id, after: { rows: sheet.rows.length, imported, skipped, unmatched } }, tx);
      return { imported, skipped, unmatched };
    });
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
      for (const x of same) if (x.checkIn) await this.write(e, isoDay(x.day), x.checkIn, x.checkOut, "sheet", tx, false);
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
      return this.row(e, after);
    });
  }
}
