import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { AttendanceDayView, AttendanceEntry, AttendanceHistoryView, AttendanceRange, AttendanceRowView, DeductionRowView, DeductionsView, FingerprintDone, FingerprintRow, WeeklyDelayView } from "@places/contracts";
import { attendanceDay, dayStart, dayStartTime, type DayVisit, deductionAmount, fingerprintDay, OUTSIDE_REQUESTS, pickDayVisit, visitDay, formatEGP, minutesAfterStart, fromDecimal, isWorkingDay, localDate, monthDeduction, monthOf, normName, normTime, toDecimal, type DeductionTiers } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { ParsedSheet } from "../../core/http/import";
import type { Tx } from "./hr.repository";
import { LeavesService } from "./leaves.service";
import { ExcusesService } from "./excuses.service";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const EMP = { id: true, name: true, department: true, salary: true, partTime: true, partTimeDeductions: true, deductionTiers: true, fixedSchedule: true } as const;
type Emp = Prisma.EmployeeGetPayload<{ select: typeof EMP }>;
const asDay = (s: string) => new Date(`${s}T00:00:00Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** One approved line (7.9): what HR saw and approved, so payroll keeps reading it even if a day is corrected afterwards. */
type DeductionLine = Omit<DeductionRowView, "net"> & { userId: string };
/** «11:05» on a Cairo day → the instant. */
const at = (day: string, hhmm: string) => new Date(dayStart(day).getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))) * 60_000);

/**
 * M-05 · attendance (7.2 · 7.10 · 7.12): the fingerprint sheet (device export) → one row per person and day (never
 * twice), names HR links once, missing days HR fills in; each day through fingerprintDay() (tiers, part-time,
 * special schedule); a holiday or a day off is never «غياب». Audited in the same transaction.
 */
@Injectable()
export class AttendanceService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly time: BusinessTimeService, private readonly audit: AuditService, private readonly leaves: LeavesService, private readonly excuses: ExcusesService, private readonly notifications: NotificationsService) {}

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

  private row(e: Emp, a: { id: string; day: Date; checkInAt: Date | null; checkOutAt: Date | null; visitAt: Date | null; lateMinutes: number; deduction: Prisma.Decimal; source: string; kind: string; hrConfirmed: boolean }): AttendanceRowView {
    const day = isoDay(a.day), checkIn = this.hhmm(a.checkInAt, day);
    const r = fingerprintDay({ checkIn, partTime: e.partTime, partTimeDeductions: e.partTimeDeductions, tiers: (e.deductionTiers as DeductionTiers | null) ?? null, specialSchedule: !!e.fixedSchedule });
    const ded = Number(a.deduction);
    const label = a.kind === "EXCUSE" ? "Excuse" : a.kind === "OUTSIDE_APPROVED" ? "شغل من بره (معتمد)" : a.kind === "FORGOT" ? (a.hrConfirmed ? "نسي البصمة" : "نسي البصمة · مستني Confirmation")
      : a.kind === "VISIT" ? (a.visitAt ? "Visit" : "Visit اتأجلت (معتمد)") : a.visitAt ? "Visit · معملهاش" : r.label;
    return { id: a.id, employeeId: e.id, name: e.name, department: e.department, day, checkIn, checkOut: this.hhmm(a.checkOutAt, day), visitAt: this.hhmm(a.visitAt, day),
      confirmForgot: a.kind === "FORGOT" && !a.hrConfirmed, lateMinutes: a.lateMinutes, deduction: ded,
      deductionAmount: toDecimal(deductionAmount(fromDecimal(e.salary.toFixed(2)), ded)), label, source: a.source, customTiers: e.deductionTiers != null, fixedSchedule: e.fixedSchedule };
  }

  /** 7.3 · each salesperson's Visits that day (the lead's owner). Meetings stay out until the client says they count (open question). */
  private async visitsOn(ids: string[], day: string, tx: Tx | PrismaClient = this.db): Promise<Map<string, DayVisit[]>> {
    const from = dayStart(day);
    const rows = await tx.leadVisit.findMany({ where: { kind: "visit", at: { gte: from, lt: new Date(from.getTime() + 86_400_000) }, lead: { assignedToId: { in: ids } } },
      select: { at: true, outcome: true, postponeStatus: true, lead: { select: { assignedToId: true } } } });
    const out = new Map<string, DayVisit[]>();
    for (const v of rows) out.set(v.lead.assignedToId!, [...(out.get(v.lead.assignedToId!) ?? []),
      { at: this.hhmm(v.at, day)!, outcome: v.outcome === "done" || v.outcome === "not_done" ? v.outcome : null, postponed: v.postponeStatus === "approved" }]);
    return out;
  }

  /**
   * A day's kind and cost: outside work HR confirmed (no deduction even if the fingerprint says otherwise) → the day's Visit
   * (7.3) → only a check-out = «نسي البصمة» (a day once HR confirms) → a confirmed Excuse (7.4) → the fingerprint. null = no start.
   */
  private async compute(e: Emp, day: string, checkIn: string | null, checkOut: string | null, forgotConfirmed: boolean, tx: Tx) {
    const input = { checkIn, partTime: e.partTime, partTimeDeductions: e.partTimeDeductions, tiers: (e.deductionTiers as DeductionTiers | null) ?? null, specialSchedule: !!e.fixedSchedule };
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
    } else if (excuse) [kind, r] = ["EXCUSE", attendanceDay({ kind: "excuse", minutesAfterStart: minutesAfterStart(checkIn), excuseNumberThisMonth: excuse }, input.tiers ?? undefined)];
    else [kind, r] = [e.fixedSchedule ? "SPECIAL_SCHEDULE" : "CHECKIN", fingerprintDay(input)];
    return { checkInAt: checkIn ? at(day, checkIn) : null, checkOutAt: checkOut ? at(day, checkOut) : null, visitAt, kind, deduction: r.deduction, lateMinutes: r.lateMinutes, hrConfirmed: kind === "FORGOT" && forgotConfirmed };
  }

  /** Writes a day (sheet, HR, or a Visit marked); the same person and day is never duplicated. A day without a check-in yet is completed by the sheet. */
  private async write(e: Emp, day: string, checkIn: string | null, checkOut: string | null, source: string, tx: Tx, overwrite: boolean) {
    const key = { employeeId_day: { employeeId: e.id, day: asDay(day) } };
    const had = await tx.attendanceDay.findUnique({ where: key });
    if (had?.checkInAt && !overwrite) return { created: false, before: had };
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
    return run(async (tx) => {
      const a = await tx.attendanceDay.findFirst({ where: { id, kind: "FORGOT", hrConfirmed: false, employee: this.scope(me) }, include: { employee: { select: EMP } } });
      if (!a) throw new NotFoundException("مفيش «نسي البصمة» مستني تأكيد هنا");
      const r = attendanceDay({ kind: "forgot-fingerprint", confirmedByHr: true });
      const out = await tx.attendanceDay.update({ where: { id }, data: { hrConfirmed: true, deduction: r.deduction } });
      await this.audit.record({ module: "hr", entity: "AttendanceDay", entityId: id, action: "confirm-forgot", userId: me.id, before: { deduction: Number(a.deduction) }, after: { day: isoDay(a.day), deduction: r.deduction } }, tx);
      return this.row(a.employee, out);
    });
  }

  /** 1.23 · when each of these people started the day: the fingerprint, or the Visit time (7.3); the Visit itself for the card. */
  async dayStarts(ids: string[], day: string, tx: Tx | PrismaClient = this.db): Promise<Map<string, { start: string | null; visit: string | null }>> {
    const [rows, visits] = await Promise.all([tx.attendanceDay.findMany({ where: { employeeId: { in: ids }, day: asDay(day) }, select: { employeeId: true, checkInAt: true } }), this.visitsOn(ids, day, tx)]);
    return new Map(ids.map((id) => {
      const v = pickDayVisit(visits.get(id) ?? []), counted = v && v.outcome !== "not_done" ? v : null;
      return [id, { start: dayStartTime(this.hhmm(rows.find((r) => r.employeeId === id)?.checkInAt ?? null, day), counted), visit: counted?.at ?? null }];
    }));
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

  /** 7.9 · this month's live lines for everyone payroll pays: attendance days (Excuses already in them) + approved penalties. */
  private async liveDeductions(month: string, tx: Tx | PrismaClient = this.db): Promise<DeductionLine[]> {
    const within = { gte: asDay(`${month}-01`), lt: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)) };
    const [emps, days, pens] = await Promise.all([
      tx.employee.findMany({ where: { user: { status: "ACTIVE" }, salary: { gt: 0 } }, select: { id: true, userId: true, name: true, salary: true }, orderBy: { name: "asc" } }),
      tx.attendanceDay.groupBy({ by: ["employeeId"], where: { day: within }, _sum: { deduction: true, lateMinutes: true } }),
      tx.penalty.groupBy({ by: ["employeeId"], where: { day: within, status: "approved" }, _sum: { deductionDays: true } }),
    ]);
    return emps.map((e) => {
      const a = days.find((x) => x.employeeId === e.id)?._sum, p = pens.find((x) => x.employeeId === e.id)?._sum;
      const salary = fromDecimal(e.salary.toFixed(2)), attendanceDays = Number(a?.deduction ?? 0), penaltyDays = Number(p?.deductionDays ?? 0);
      return { employeeId: e.id, userId: e.userId, name: e.name, salary: toDecimal(salary), attendanceDays, penaltyDays, lateMinutes: a?.lateMinutes ?? 0,
        amount: toDecimal(monthDeduction({ salary, attendanceDays, penaltyDays }).amount) };
    });
  }

  /** «التوفير» (7.9): the month's deductions, live until HR approves them, then exactly what was approved. */
  async deductions(me: CurrentUser, month = monthOf(localDate(new Date()))): Promise<DeductionsView> {
    const [ok, mine] = await Promise.all([this.db.deductionApproval.findUnique({ where: { month } }), this.db.employee.findMany({ where: this.scope(me), select: { id: true } })]);
    const ids = new Set(mine.map((e) => e.id));
    const lines = (ok ? (ok.lines as DeductionLine[]) : await this.liveDeductions(month)).filter((l) => ids.has(l.employeeId));
    const by = ok ? await this.db.employee.findUnique({ where: { userId: ok.approvedById }, select: { name: true } }) : null;
    const rows = lines.map((l) => ({ employeeId: l.employeeId, name: l.name, salary: l.salary, attendanceDays: l.attendanceDays, penaltyDays: l.penaltyDays, lateMinutes: l.lateMinutes, amount: l.amount,
      net: toDecimal(fromDecimal(l.salary) - fromDecimal(l.amount)) }));
    const sum = (k: "salary" | "amount" | "net") => toDecimal(rows.reduce((s, r) => s + fromDecimal(r[k]), 0));
    return { month, rows, totals: { salary: sum("salary"), amount: sum("amount"), net: sum("net"), people: rows.length }, approved: ok ? { by: by?.name ?? "", at: ok.at.toISOString() } : null };
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
      return this.row(e, after);
    });
  }
}
