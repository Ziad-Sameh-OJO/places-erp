import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { LeaveAsk, LeaveBalance, LeaveBalancesView, LeaveCalendarView, LeaveStatusKey, LeaveView, MyLeaves } from "@places/contracts";
import { afterReturn, daysWithin, leaveDays, leaveProblem, localDate } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { Tx } from "./hr.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const STATUS: Record<LeaveStatusKey, string> = { PENDING_TL: "مستني الـ Team Leader", APPROVED_BY_TL: "الـ TL وافق · مستني الـ HR", REJECTED: "اترفض", CLOSED_BY_HR: "اتسجّلت" };
const COUNTED: LeaveStatusKey[] = ["APPROVED_BY_TL", "CLOSED_BY_HR"];
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ROW = { include: { employee: { select: { id: true, name: true, userId: true, department: true } } } } as const;
type Row = Prisma.LeaveRequestGetPayload<typeof ROW>;

/**
 * M-05 · leaves (7.5 · 7.6): the employee asks; the Team Leader approves or rejects with a reason (final); HR records
 * it; balances per type (annual = the person's file, others from `leaveTypes`). Sick / emergency after return with a
 * document. Notifications at each step; the chase (24 / 48 hours) runs in the worker. Audited.
 */
@Injectable()
export class LeavesService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  private async types(tx: Tx | PrismaClient = this.db): Promise<{ name: string; days: number }[]> {
    const s = await tx.setting.findUnique({ where: { key: "leaveTypes" } });
    return (s?.value as { name: string; days: number }[] | null) ?? [{ name: "سنوية", days: 21 }];
  }

  private async balances(employee: { id: string; leaveBalance: number }, year: string, tx: Tx | PrismaClient = this.db): Promise<LeaveBalance[]> {
    const [types, taken] = await Promise.all([
      this.types(tx),
      tx.leaveRequest.groupBy({ by: ["type"], where: { employeeId: employee.id, status: { in: COUNTED }, fromDay: { gte: day(`${year}-01-01`), lte: day(`${year}-12-31`) } }, _sum: { days: true } }),
    ]);
    return types.map((t) => {
      const total = t.name === "سنوية" ? employee.leaveBalance : t.days, used = taken.find((x) => x.type === t.name)?._sum.days ?? 0;
      return { type: t.name, total, used, left: Math.max(0, total - used) };
    });
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
    return { items: rows.map((r) => this.view(r, null)), balances, types: types.map((t) => ({ name: t.name, afterReturn: afterReturn(t.name) })) };
  }

  async ask(me: CurrentUser, a: LeaveAsk, run: Run): Promise<LeaveView> {
    const saved = await run(async (tx) => {
      const e = await tx.employee.findUnique({ where: { userId: me.id }, select: { id: true, name: true, leaveBalance: true, teamLeader: { select: { userId: true } } } });
      if (!e) throw new NotFoundException("مالكش فايل موظف");
      const types = await this.types(tx);
      if (!types.some((t) => t.name === a.type)) throw new BadRequestException("نوع الإجازة مش موجود في الإعدادات");
      if (a.documentId && !(await tx.file.findFirst({ where: { id: a.documentId, uploadedById: me.id, entityId: null } }))) throw new BadRequestException("المستند مش موجود");
      const bal = (await this.balances(e, a.from.slice(0, 4), tx)).find((b) => b.type === a.type)!;
      const problem = leaveProblem({ type: a.type, from: a.from, to: a.to, today: localDate(new Date()), left: bal.left, hasDocument: !!a.documentId });
      if (problem) throw new BadRequestException(problem);
      const overlap = await tx.leaveRequest.findFirst({ where: { employeeId: e.id, status: { in: ["PENDING_TL", ...COUNTED] }, fromDay: { lte: day(a.to) }, toDay: { gte: day(a.from) } } });
      if (overlap) throw new BadRequestException("فيه طلب إجازة تاني في نفس الأيام");
      const tlUserId = e.teamLeader?.userId && e.teamLeader.userId !== me.id ? e.teamLeader.userId : null;
      const r = await tx.leaveRequest.create({ data: { employeeId: e.id, type: a.type, fromDay: day(a.from), toDay: day(a.to), reason: a.reason ?? null, days: leaveDays(a.from, a.to), documentId: a.documentId ?? null, tlUserId }, ...ROW });
      if (a.documentId) await tx.file.update({ where: { id: a.documentId }, data: { entity: "LeaveRequest", entityId: r.id } });
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

  /** The list in scope: a TL sees his team's and the ones waiting for him; HR (scope all) sees everyone's. */
  async list(me: CurrentUser): Promise<LeaveView[]> {
    const scope: Prisma.LeaveRequestWhereInput = me.grants.scope === "all" ? {} : { OR: [{ tlUserId: me.id }, { employee: me.grants.scope === "team" ? { id: { in: me.teamIds } } : me.grants.scope === "dept" && me.department ? { department: me.department } : { userId: me.id } }] };
    const rows = await this.db.leaveRequest.findMany({ where: scope, ...ROW, orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map((r) => this.view(r, me));
  }

  /** TL approves (→ HR), or HR records it (→ closed). Only the person whose turn it is. */
  async approve(me: CurrentUser, id: string, run: Run): Promise<LeaveView> {
    const r = await run(async (tx) => {
      const r = await tx.leaveRequest.findUnique({ where: { id }, ...ROW });
      if (!r) throw new NotFoundException("الطلب مش موجود");
      const turn = this.view(r, me).canDecide;
      if (!turn) throw new ForbiddenException("الطلب ده مش مستنيك");
      const data: Prisma.LeaveRequestUpdateInput = turn === "tl" ? { status: "APPROVED_BY_TL", tlDecidedAt: new Date(), ...(r.tlUserId ? {} : { tlUserId: me.id }) } : { status: "CLOSED_BY_HR", hrUserId: me.id, closedAt: new Date() };
      const out = await tx.leaveRequest.update({ where: { id }, data, ...ROW });
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

  /** 7.6 · the month's balances report: per person and type — total, used this year, taken this month, left. */
  async balancesReport(me: CurrentUser, month = localDate(new Date()).slice(0, 7)): Promise<LeaveBalancesView> {
    const scope = me.grants.scope === "all" ? {} : me.grants.scope === "team" ? { id: { in: me.teamIds } } : me.grants.scope === "dept" && me.department ? { department: me.department } : { userId: me.id };
    const start = `${month}-01`, end = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
    const [emps, types, inMonth] = await Promise.all([
      this.db.employee.findMany({ where: { AND: [scope, { user: { status: "ACTIVE" } }] }, select: { id: true, name: true, department: true, leaveBalance: true }, orderBy: { name: "asc" } }),
      this.types(), this.onLeave(start, end, me),
    ]);
    const rows = await Promise.all(emps.map(async (e) => {
      const b = await this.balances(e, month.slice(0, 4));
      return { employeeId: e.id, name: e.name, department: e.department, byType: Object.fromEntries(b.map((x) => [x.type, { total: x.total, used: x.used, left: x.left,
        month: inMonth.filter((r) => r.employeeId === e.id && r.type === x.type).reduce((s, r) => s + daysWithin(iso(r.fromDay), iso(r.toDay), start, end), 0) }])) };
    }));
    return { month, types: types.map((t) => t.name), rows };
  }

  /** Approved leave days (used by attendance: a person on leave isn't «مبصمش»). */
  async employeesOnLeave(dayIso: string, tx: Tx | PrismaClient = this.db): Promise<Set<string>> {
    // `tx`: a caller holding a transaction (lead routing) must not wait for a second pooled connection
    return new Set((await tx.leaveRequest.findMany({ where: { status: { in: COUNTED }, fromDay: { lte: day(dayIso) }, toDay: { gte: day(dayIso) } }, select: { employeeId: true } })).map((r) => r.employeeId));
  }
}
