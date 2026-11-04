import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { ExcuseAsk, ExcuseStatus, ExcuseView } from "@places/contracts";
import { attendanceDay, excuseDeduction, excuseNumber, excuseRefused, localDate, type DeductionTiers } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { TicketsService } from "../tickets/tickets.service";
import type { Tx } from "./hr.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const LABEL: Record<ExcuseStatus, string> = { pending_tl: "مستني الـ Team Leader", approved_tl: "الـ TL وافق · مستني الـ HR", confirmed: "اتأكد", rejected: "اترفض", refused: "الخامس · اترفض" };
const COST = (n: number) => (n >= 5 ? "مرفوض" : excuseDeduction(n) ? "نص يوم" : "من غير خصم");
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
type Row = Prisma.ExcuseRequestGetPayload<object>;

/**
 * M-05 · the Excuse (7.4, Q31): a ticket (type «excuse», 8.1) to the Team Leader, then HR. Its number in the month
 * decides the cost — 1–2 nothing, 3–4 half a day; the 5th is refused at once and management is alerted (`hr.excuse`).
 * Once HR confirms, the day shows «Excuse #n» instead of «متأخر» (Weekly Delay still counts every minute).
 */
@Injectable()
export class ExcusesService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly notifications: NotificationsService, private readonly tickets: TicketsService) {}

  private hr = (me: CurrentUser) => me.grants.scope === "all" && me.grants.can("hr", "approve");

  private async view(rows: Row[], me: CurrentUser | null): Promise<ExcuseView[]> {
    const [emps, tks] = await Promise.all([
      this.db.employee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, name: true } }),
      this.db.ticket.findMany({ where: { id: { in: rows.map((r) => r.ticketId ?? "") } }, select: { id: true, number: true } }),
    ]);
    return rows.map((r) => {
      const st = r.status as ExcuseStatus;
      const canDecide = !me ? null : st === "pending_tl" && (r.tlUserId === me.id || (!r.tlUserId && this.hr(me))) ? "tl" : st === "approved_tl" && this.hr(me) ? "hr" : null;
      const t = tks.find((x) => x.id === r.ticketId);
      return { id: r.id, employeeId: r.employeeId, name: emps.find((e) => e.id === r.employeeId)?.name ?? "", day: iso(r.day), reason: r.reason, number: r.number, status: st, statusLabel: LABEL[st],
        cost: COST(r.number), rejectReason: r.rejectReason, ticket: t ? `TK-${t.number}` : null, canDecide };
    });
  }

  async mine(me: CurrentUser): Promise<ExcuseView[]> {
    const e = await this.db.employee.findUnique({ where: { userId: me.id }, select: { id: true } });
    if (!e) throw new NotFoundException("مالكش فايل موظف");
    return this.view(await this.db.excuseRequest.findMany({ where: { employeeId: e.id }, orderBy: { day: "desc" }, take: 30 }), null);
  }

  async list(me: CurrentUser): Promise<ExcuseView[]> {
    const scope: Prisma.ExcuseRequestWhereInput = me.grants.scope === "all" ? {} : { OR: [{ tlUserId: me.id }, { employeeId: { in: me.grants.scope === "team" ? me.teamIds : [] } }] };
    return this.view(await this.db.excuseRequest.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 200 }), me);
  }

  async ask(me: CurrentUser, a: ExcuseAsk, run: Run): Promise<ExcuseView> {
    const today = localDate(new Date());
    if (a.day.slice(0, 7) !== today.slice(0, 7) || a.day < today) throw new BadRequestException("الـ Excuse بيتطلب لنهارده أو يوم جاي في نفس الشهر");
    const r = await run(async (tx) => {
      const e = await tx.employee.findUnique({ where: { userId: me.id }, select: { id: true, name: true, teamLeader: { select: { userId: true } } } });
      if (!e) throw new NotFoundException("مالكش فايل موظف");
      if (await tx.excuseRequest.findFirst({ where: { employeeId: e.id, day: day(a.day), status: { notIn: ["rejected"] } } })) throw new BadRequestException("فيه Excuse لليوم ده");
      const earlier = await tx.excuseRequest.count({ where: { employeeId: e.id, day: { gte: day(`${today.slice(0, 7)}-01`) }, status: { in: ["pending_tl", "approved_tl", "confirmed"] } } });
      const n = excuseNumber(earlier), refused = excuseRefused(n);
      const tlUserId = e.teamLeader?.userId && e.teamLeader.userId !== me.id ? e.teamLeader.userId : null;
      const t = await this.tickets.openSystem(tx, { type: "excuse", fromUserId: me.id, title: `Excuse #${n} · ${e.name} · ${a.day}`, text: a.reason });
      const row = await tx.excuseRequest.create({ data: { employeeId: e.id, day: day(a.day), reason: a.reason, number: n, status: refused ? "refused" : "pending_tl", ticketId: t.id, tlUserId, createdById: me.id, ...(refused ? { decidedAt: new Date() } : {}) } });
      if (refused) await this.tickets.settleSystem(tx, t.id, "الـ Excuse الخامس في الشهر · اترفض (Q31)", me.id);
      await this.audit.record({ module: "hr", entity: "ExcuseRequest", entityId: row.id, action: "create", userId: me.id, after: { day: a.day, number: n, status: row.status, ticket: t.code } }, tx);
      return { row, name: e.name };
    });
    if (r.row.status === "refused") await this.notifications.notify({ event: "hr.excuse", link: "/hr", text: `${r.name} طلب Excuse خامس الشهر ده (${iso(r.row.day)}) · اترفض` });
    else await this.notifications.notify({ event: "hr.excuse", link: "/hr", text: `Excuse #${r.row.number} من ${r.name} · ${iso(r.row.day)}`, ...(r.row.tlUserId ? { userIds: [r.row.tlUserId] } : {}) });
    return (await this.view([r.row], me))[0]!;
  }

  /** TL approves (→ HR) or HR confirms (→ the day becomes «Excuse #n»). */
  async approve(me: CurrentUser, id: string, run: Run): Promise<ExcuseView> {
    const row = await run(async (tx) => {
      const r = await tx.excuseRequest.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("الطلب مش موجود");
      const turn = (await this.view([r], me))[0]!.canDecide;
      if (!turn) throw new ForbiddenException("الطلب ده مش مستنيك");
      const out = await tx.excuseRequest.update({ where: { id }, data: turn === "tl" ? { status: "approved_tl", ...(r.tlUserId ? {} : { tlUserId: me.id }) } : { status: "confirmed", hrUserId: me.id, decidedAt: new Date() } });
      if (r.ticketId) {
        if (turn === "tl") await this.tickets.noteSystem(tx, r.ticketId, "الـ Team Leader وافق · مستني الـ HR", me.id, true);
        else await this.tickets.settleSystem(tx, r.ticketId, `الـ HR أكّدت · ${COST(r.number)}`, me.id);
      }
      if (turn === "hr") await this.applyToDay(tx, r.employeeId, iso(r.day));
      await this.audit.record({ module: "hr", entity: "ExcuseRequest", entityId: id, action: turn === "tl" ? "approve" : "confirm", userId: me.id, before: { status: r.status }, after: { status: out.status } }, tx);
      return out;
    });
    return (await this.view([row], me))[0]!;
  }

  async reject(me: CurrentUser, id: string, reason: string, run: Run): Promise<ExcuseView> {
    const row = await run(async (tx) => {
      const r = await tx.excuseRequest.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("الطلب مش موجود");
      if (!(await this.view([r], me))[0]!.canDecide) throw new ForbiddenException("الطلب ده مش مستنيك");
      const out = await tx.excuseRequest.update({ where: { id }, data: { status: "rejected", rejectReason: reason, decidedAt: new Date() } });
      if (r.ticketId) await this.tickets.settleSystem(tx, r.ticketId, `اترفض: ${reason}`, me.id);
      await this.audit.record({ module: "hr", entity: "ExcuseRequest", entityId: id, action: "reject", userId: me.id, before: { status: r.status }, after: { status: "rejected", reason } }, tx);
      return out;
    });
    return (await this.view([row], me))[0]!;
  }

  /** The confirmed Excuse number for a person's day, or null (attendance asks this when it writes the day). */
  async confirmedFor(employeeId: string, dayIso: string, tx: Tx | PrismaClient = this.db): Promise<number | null> {
    return (await tx.excuseRequest.findFirst({ where: { employeeId, day: day(dayIso), status: "confirmed" }, select: { number: true } }))?.number ?? null;
  }

  /** Re-reads the day with the Excuse: its label and cost replace «متأخر»; Weekly Delay keeps every minute. */
  private async applyToDay(tx: Tx, employeeId: string, dayIso: string) {
    const a = await tx.attendanceDay.findUnique({ where: { employeeId_day: { employeeId, day: day(dayIso) } } });
    if (!a?.checkInAt) return; // not fingerprinted yet: attendance applies it when the day arrives
    const e = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { deductionTiers: true } });
    const n = (await this.confirmedFor(employeeId, dayIso, tx))!;
    const minutes = a.lateMinutes ? a.lateMinutes + 16 : 0;
    const r = attendanceDay({ kind: "excuse", minutesAfterStart: minutes, excuseNumberThisMonth: n }, (e.deductionTiers as DeductionTiers | null) ?? undefined);
    await tx.attendanceDay.update({ where: { id: a.id }, data: { kind: "EXCUSE", deduction: r.deduction } });
  }
}
