import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Prisma, type PrismaClient, onLeave } from "@places/db";
import type { BalancesQuery, LeaveAsk, LeaveBalance, LeaveBalancesView, LeaveCalendarView, LeaveStatusKey, LeaveView, MyLeaves } from "@places/contracts";
import { afterReturn, daysWithin, isOutsideRequest, leaveDays, leaveProblem, localDate, OUTSIDE_REQUESTS } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { FilesService } from "../../core/files/files.service";
import type { Tx } from "./hr.repository";

const ANNUAL = "سنوية";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const STATUS: Record<LeaveStatusKey, string> = { PENDING_TL: "مستني الـ Team Leader", APPROVED_BY_TL: "الـ TL وافق · مستني الـ HR", REJECTED: "اترفض", CLOSED_BY_HR: "اتسجّلت" };
const COUNTED: LeaveStatusKey[] = ["APPROVED_BY_TL", "CLOSED_BY_HR"];
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ROW = { include: { employee: { select: { id: true, name: true, userId: true, department: true } } } } as const;
type Row = Prisma.LeaveRequestGetPayload<typeof ROW>;
/** Serialises one person's requests: the balance is read and spent under this lock. */
const lock = (tx: Tx, employeeId: string) => tx.$queryRaw`SELECT id FROM hr."Employee" WHERE id = ${employeeId} FOR UPDATE`;
/** Moves the request only from the status it was read in: a second click (or a second person) at the same moment loses. */
async function claim(tx: Tx, id: string, status: string) {
  const n = await tx.leaveRequest.updateMany({ where: { id, status: status as LeaveStatusKey }, data: { status: status as LeaveStatusKey } });
  if (!n.count) throw new ConflictException("الطلب ده اتقرر قبل كده");
}

/**
 * M-05 · leaves (7.5 · 7.6): the employee asks; the Team Leader approves or rejects with a reason (final); HR records
 * it; balances per type (annual = the person's file, others from `leaveTypes`). Sick / emergency after return with a
 * document. Notifications at each step; the chase (24 / 48 hours) runs in the worker. Audited.
 */
@Injectable()
export class LeavesService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly notifications: NotificationsService, private readonly files: FilesService) {}

  private async types(tx: Tx | PrismaClient = this.db): Promise<{ name: string; days: number }[]> {
    const s = await tx.setting.findUnique({ where: { key: "leaveTypes" } });
    return (s?.value as { name: string; days: number }[] | null) ?? [{ name: "سنوية", days: 21 }];
  }

  /**
   * `held`: also take the requests still waiting (asking, so two requests can't both spend the same days), and leave
   * out `except` (approving it: what's left without the request itself).
   */
  private async balances(employee: { id: string; leaveBalance: number }, year: string, tx: Tx | PrismaClient = this.db, held: { pending?: boolean; except?: string } = {}): Promise<LeaveBalance[]> {
    const status: LeaveStatusKey[] = held.pending ? ["PENDING_TL", ...COUNTED] : COUNTED;
    const [types, taken] = await Promise.all([
      this.types(tx),
      tx.leaveRequest.groupBy({ by: ["type"], where: { employeeId: employee.id, status: { in: status }, fromDay: { gte: day(`${year}-01-01`), lte: day(`${year}-12-31`) }, ...(held.except ? { id: { not: held.except } } : {}) }, _sum: { days: true } }),
    ]);
    return types.map((t) => {
      const total = t.name === "سنوية" ? employee.leaveBalance : t.days, used = taken.find((x) => x.type === t.name)?._sum.days ?? 0;
      return { type: t.name, total, used, left: Math.max(0, total - used) };
    });
  }

  /** 7.16: the annual leave on the employee's file (total in their file, used this year, left). */
  async annual(employee: { id: string; leaveBalance: number }, year: string): Promise<LeaveBalance> {
    return (await this.balances(employee, year)).find((b) => b.type === "سنوية") ?? { type: "سنوية", total: employee.leaveBalance, used: 0, left: employee.leaveBalance };
  }

  private view(r: Row, me: CurrentUser | null): LeaveView {
    const st = r.status as LeaveStatusKey;
    const hr = !!me && me.grants.scope === "all" && me.grants.can("hr", "approve");
    const canDecide = !me ? null : st === "PENDING_TL" && (r.tlUserId === me.id || (!r.tlUserId && hr)) ? "tl" : st === "APPROVED_BY_TL" && hr ? "hr" : null;
    return { id: r.id, employeeId: r.employeeId, name: r.employee.name, type: r.type, from: iso(r.fromDay), to: iso(r.toDay), days: r.days, reason: r.reason, status: st, statusLabel: STATUS[st],
      rejectReason: r.rejectReason, hasDocument: !!r.documentId, createdAt: r.createdAt.toISOString(), canDecide };
  }

  async mine(me: CurrentUser): Promise<MyLeaves> {
    const e = await this.db.employee.findUnique({ where: { userId: me.id }, select: { id: true, leaveBalance: true } });
    if (!e) throw new NotFoundException("مالكش فايل موظف");
    const [rows, balances, types] = await Promise.all([
      this.db.leaveRequest.findMany({ where: { employeeId: e.id }, ...ROW, orderBy: { createdAt: "desc" }, take: 50 }),
      this.balances(e, localDate(new Date()).slice(0, 4)), this.types(),
    ]);
    return { items: rows.map((r) => this.view(r, null)), balances, types: [...types, ...OUTSIDE_REQUESTS.map((name) => ({ name }))].map((t) => ({ name: t.name, afterReturn: afterReturn(t.name) })) };
  }

  async ask(me: CurrentUser, a: LeaveAsk, run: Run): Promise<LeaveView> {
    const saved = await run(async (tx) => {
      const e = await tx.employee.findUnique({ where: { userId: me.id }, select: { id: true, name: true, leaveBalance: true, teamLeader: { select: { userId: true } } } });
      if (!e) throw new NotFoundException("مالكش فايل موظف");
      await lock(tx, e.id); // two requests sent at once mustn't both spend the same balance
      const types = await this.types(tx);
      if (!types.some((t) => t.name === a.type) && !isOutsideRequest(a.type)) throw new BadRequestException("نوع الإجازة مش موجود في الإعدادات");
      const bal = (await this.balances(e, a.from.slice(0, 4), tx, { pending: true })).find((b) => b.type === a.type) ?? { left: 0 }; // «شغل من بره / عذر غياب» have no balance
      const problem = leaveProblem({ type: a.type, from: a.from, to: a.to, today: localDate(new Date()), left: bal.left, hasDocument: !!a.documentId });
      if (problem) throw new BadRequestException(problem);
      const overlap = await tx.leaveRequest.findFirst({ where: { employeeId: e.id, status: { in: ["PENDING_TL", ...COUNTED] }, fromDay: { lte: day(a.to) }, toDay: { gte: day(a.from) } } });
      if (overlap) throw new BadRequestException("فيه طلب إجازة تاني في نفس الأيام");
      const tlUserId = e.teamLeader?.userId && e.teamLeader.userId !== me.id ? e.teamLeader.userId : null;
      const r = await tx.leaveRequest.create({ data: { employeeId: e.id, type: a.type, fromDay: day(a.from), toDay: day(a.to), reason: a.reason ?? null, days: leaveDays(a.from, a.to), documentId: a.documentId ?? null, tlUserId }, ...ROW });
      // attach(): only my own finished upload that nothing holds yet (a pending or rejected file isn't a document)
      if (a.documentId) await this.files.attach(me, [a.documentId], "LeaveRequest", r.id, tx);
      await this.audit.record({ module: "hr", entity: "LeaveRequest", entityId: r.id, action: "create", userId: me.id, after: { type: a.type, from: a.from, to: a.to, days: r.days } }, tx);
      return r;
    });
    await this.notifications.notify({ event: "hr.leave_request", link: "/hr", text: `طلب إجازة ${saved.type} من ${saved.employee.name} · ${saved.days} يوم (${iso(saved.fromDay)} ← ${iso(saved.toDay)})`,
      ...(saved.tlUserId ? { userIds: [saved.tlUserId] } : { userIds: await this.hrUsers() }) });
    return this.view(saved, me);
  }

  private async hrUsers() {
    return (await this.db.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: "hr" } } } }, select: { id: true } })).map((u) => u.id);
  }

  /** The requests in scope: a TL sees his team's and the ones waiting for him; HR (scope all) sees everyone's. */
  private inScope(me: CurrentUser): Prisma.LeaveRequestWhereInput {
    return me.grants.scope === "all" ? {} : { OR: [{ tlUserId: me.id }, { employee: me.grants.scope === "team" ? { id: { in: me.teamIds } } : me.grants.scope === "dept" && me.department ? { department: me.department } : { userId: me.id } }] };
  }

  async list(me: CurrentUser): Promise<LeaveView[]> {
    const rows = await this.db.leaveRequest.findMany({ where: this.inScope(me), ...ROW, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map((r) => this.view(r, me));
  }

  /** 0.9: the sick / emergency leave's document, for whoever sees the request (the TL deciding, HR recording it). Audited. */
  async documentUrl(me: CurrentUser, id: string) {
    const r = await this.db.leaveRequest.findFirst({ where: { AND: [{ id }, this.inScope(me)] }, select: { documentId: true } });
    if (!r?.documentId) throw new NotFoundException("مفيش مستند للطلب ده");
    const link = await this.files.downloadUrl(r.documentId);
    await this.audit.record({ module: "hr", entity: "LeaveRequest", entityId: id, action: "download", userId: me.id, after: { documentId: r.documentId } });
    return link;
  }

  /** TL approves (→ HR), or HR records it (→ closed). Only the person whose turn it is. */
  async approve(me: CurrentUser, id: string, run: Run): Promise<LeaveView> {
    const r = await run(async (tx) => {
      const r = await tx.leaveRequest.findUnique({ where: { id }, ...ROW });
      if (!r) throw new NotFoundException("الطلب مش موجود");
      const turn = this.view(r, me).canDecide;
      if (!turn) throw new ForbiddenException("الطلب ده مش مستنيك");
      await lock(tx, r.employeeId); // two of his requests approved at once mustn't both pass the balance check
      // each approval checks the balance again: another request may have spent the days since this one was asked
      const e = await tx.employee.findUniqueOrThrow({ where: { id: r.employeeId }, select: { id: true, leaveBalance: true } });
      const bal = (await this.balances(e, iso(r.fromDay).slice(0, 4), tx, { except: r.id })).find((b) => b.type === r.type);
      if (bal && !isOutsideRequest(r.type) && r.days > bal.left) throw new BadRequestException(`رصيد ${r.type} فاضل فيه ${bal.left} يوم بس والطلب ${r.days} يوم`);
      const data: Prisma.LeaveRequestUpdateInput = turn === "tl" ? { status: "APPROVED_BY_TL", tlDecidedAt: new Date(), ...(r.tlUserId ? {} : { tlUserId: me.id }) } : { status: "CLOSED_BY_HR", hrUserId: me.id, closedAt: new Date() };
      await claim(tx, id, r.status);
      const out = await tx.leaveRequest.update({ where: { id }, data, ...ROW });
      // 7.3: outside work / an excused absence HR confirmed → those days without a deduction, even if the fingerprint says otherwise
      if (turn === "hr" && isOutsideRequest(r.type)) await tx.attendanceDay.updateMany({ where: { employeeId: r.employeeId, day: { gte: r.fromDay, lte: r.toDay } }, data: { kind: "OUTSIDE_APPROVED", deduction: 0 } });
      await this.audit.record({ module: "hr", entity: "LeaveRequest", entityId: id, action: turn === "tl" ? "approve" : "close", userId: me.id, before: { status: r.status }, after: { status: out.status } }, tx);
      return out;
    });
    await this.notifications.notify({ event: "hr.leave_decided", userIds: [r.employee.userId], link: "/profile", text: `طلب إجازتك (${r.type} · ${r.days} يوم): ${STATUS[r.status as LeaveStatusKey]}` });
    if (r.status === "APPROVED_BY_TL") await this.notifications.notify({ event: "hr.leave_request", userIds: await this.hrUsers(), link: "/hr", text: `طلب إجازة ${r.employee.name} اتوافق عليه من الـ Team Leader · سجّليه` });
    return this.view(r, me);
  }

  /** The Team Leader refuses with a reason; his decision is final (M-05). */
  async reject(me: CurrentUser, id: string, reason: string, run: Run): Promise<LeaveView> {
    const r = await run(async (tx) => {
      const r = await tx.leaveRequest.findUnique({ where: { id }, ...ROW });
      if (!r) throw new NotFoundException("الطلب مش موجود");
      if (this.view(r, me).canDecide !== "tl") throw new ForbiddenException("الطلب ده مش مستنيك");
      await claim(tx, id, r.status);
      const out = await tx.leaveRequest.update({ where: { id }, data: { status: "REJECTED", rejectReason: reason, tlDecidedAt: new Date() }, ...ROW });
      await this.audit.record({ module: "hr", entity: "LeaveRequest", entityId: id, action: "reject", userId: me.id, before: { status: r.status }, after: { status: "REJECTED", reason } }, tx);
      return out;
    });
    await this.notifications.notify({ event: "hr.leave_decided", userIds: [r.employee.userId], link: "/profile", text: `طلب إجازتك اترفض: ${reason}` });
    return this.view(r, me);
  }

  private async onLeave(from: string, to: string, me: CurrentUser) {
    const scope = me.grants.scope === "all" ? {} : me.grants.scope === "team" ? { id: { in: me.teamIds } } : me.grants.scope === "dept" && me.department ? { department: me.department } : { userId: me.id };
    return this.db.leaveRequest.findMany({ where: { status: { in: COUNTED }, fromDay: { lte: day(to) }, toDay: { gte: day(from) }, employee: scope }, ...ROW });
  }

  /** 7.6 · «مين إجازة النهارده» + the month's calendar. */
  async calendar(me: CurrentUser, month = localDate(new Date()).slice(0, 7)): Promise<LeaveCalendarView> {
    const start = `${month}-01`, end = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
    const today = localDate(new Date());
    const rows = await this.onLeave(start, end, me);
    const byDay: LeaveCalendarView["byDay"] = {};
    for (const r of rows) for (let d = new Date(Math.max(r.fromDay.getTime(), day(start).getTime())); d <= r.toDay && d <= day(end); d.setUTCDate(d.getUTCDate() + 1)) (byDay[iso(d)] ??= []).push({ name: r.employee.name, type: r.type });
    const now = (await this.onLeave(today, today, me)).map((r) => ({ employeeId: r.employeeId, name: r.employee.name, type: r.type, to: iso(r.toDay) }));
    return { month, byDay, today: now };
  }

  /** 7.6 · the balances report, between two dates (the month by default). Only the annual leave: the client
   *  dropped «عارضة» and «مرضية» from this report (16 Nov) — they're still requested and counted elsewhere. */
  async balancesReport(me: CurrentUser, q: BalancesQuery = {}): Promise<LeaveBalancesView> {
    const scope = me.grants.scope === "all" ? {} : me.grants.scope === "team" ? { id: { in: me.teamIds } } : me.grants.scope === "dept" && me.department ? { department: me.department } : { userId: me.id };
    // a missing end takes the month of the other one; nothing at all = the month (or this month)
    const month = q.month ?? (q.from ?? q.to ?? localDate(new Date())).slice(0, 7);
    const monthEnd = (m: string) => iso(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)));
    const start = q.from ?? (q.to ? `${q.to.slice(0, 7)}-01` : `${month}-01`), end = q.to ?? monthEnd(start.slice(0, 7));
    const [emps, inPeriod] = await Promise.all([
      this.db.employee.findMany({ where: { AND: [scope, { user: { status: "ACTIVE" } }] }, select: { id: true, name: true, department: true, leaveBalance: true }, orderBy: { name: "asc" } }),
      this.onLeave(start, end, me),
    ]);
    const rows = await Promise.all(emps.map(async (e) => {
      const b = (await this.balances(e, end.slice(0, 4))).filter((x) => x.type === ANNUAL);
      return { employeeId: e.id, name: e.name, department: e.department, byType: Object.fromEntries(b.map((x) => [x.type, { total: x.total, used: x.used, left: x.left,
        month: inPeriod.filter((r) => r.employeeId === e.id && r.type === x.type).reduce((s, r) => s + daysWithin(iso(r.fromDay), iso(r.toDay), start, end), 0) }])) };
    }));
    return { month, from: start, to: end, types: [ANNUAL], rows };
  }

  /** Approved leave days (used by attendance: a person on leave isn't «مبصمش»). */
  async employeesOnLeave(dayIso: string, tx: Tx | PrismaClient = this.db): Promise<Set<string>> {
    // `tx`: a caller holding a transaction (lead routing) must not wait for a second pooled connection
    return onLeave(tx, dayIso); // the same reading the day's rotation uses (@places/db, 1.15 · 1.23)
  }
}
