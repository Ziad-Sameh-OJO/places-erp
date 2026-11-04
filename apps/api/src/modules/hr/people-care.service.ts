import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { HrActionsView, NewOneOnOne, NewPenalty, OneOnOnesView, PenaltiesView, PenaltyView } from "@places/contracts";
import { deductionAmount, fromDecimal, localDate, oneOnOneDue, penaltyCounts, penaltyDaysOk, toDecimal } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { Tx } from "./hr.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const QUESTIONS = "hr.oneQuestions";
/** The demo's questions until HR sets their own (M-05 3.1: «بتتدخّل مرة واحدة وتظهر في كل 1-to-1»). */
const DEFAULT_QUESTIONS = ["أكتر حاجة بتعطلك في الشغل؟", "محتاج تدريب في إيه؟", "تقييمك لنفسك الشهر ده؟", "إيه اللي محتاج يتغير في الفريق؟"];
const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const PEN = { include: { employee: { select: { id: true, name: true, salary: true } } } } as const;

/**
 * M-05 · penalties (7.7) and the 1-to-1 (7.8). A penalty HR writes is approved at once; a Team Leader's proposal for his
 * team waits for HR. Only approved penalties reach the deductions and block «الموظف المثالي». The 1-to-1 is monthly,
 * with HR's questions; «حل الـ HR» has a due date and rings once (worker). Everything audited.
 */
@Injectable()
export class PeopleCareService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  private scope(me: CurrentUser): Prisma.EmployeeWhereInput {
    switch (me.grants.scope) {
      case "all": return {};
      case "dept": return me.department ? { department: me.department } : { userId: me.id };
      case "team": return { id: { in: me.teamIds } };
      case "own": return { userId: me.id };
    }
  }
  private isHr = (me: CurrentUser) => me.grants.scope === "all" && me.grants.can("hr", "edit");

  private async names(ids: string[]) {
    return new Map((await this.db.employee.findMany({ where: { userId: { in: ids } }, select: { userId: true, name: true } })).map((e) => [e.userId, e.name]));
  }

  async penalties(me: CurrentUser, month = localDate(new Date()).slice(0, 7)): Promise<PenaltiesView> {
    const end = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));
    const rows = await this.db.penalty.findMany({ where: { day: { gte: day(`${month}-01`), lte: day(end) }, employee: this.scope(me) }, ...PEN, orderBy: { day: "desc" } });
    const by = await this.names(rows.map((r) => r.byUserId));
    const items: PenaltyView[] = rows.map((r) => ({
      id: r.id, employeeId: r.employeeId, name: r.employee.name, day: iso(r.day), text: r.text, deductionDays: Number(r.deductionDays),
      deductionAmount: toDecimal(deductionAmount(fromDecimal(r.employee.salary.toFixed(2)), Number(r.deductionDays))), status: r.status as PenaltyView["status"], by: by.get(r.byUserId) ?? "",
      canDecide: r.status === "pending" && this.isHr(me),
    }));
    const ok = items.filter((i) => penaltyCounts(i.status));
    return { month, items, totals: { approved: ok.length, pending: items.filter((i) => i.status === "pending").length, deductions: toDecimal(ok.reduce((s, i) => s + fromDecimal(i.deductionAmount), 0)) } };
  }

  async addPenalty(me: CurrentUser, p: NewPenalty, run: Run) {
    if (!penaltyDaysOk(p.deductionDays)) throw new BadRequestException("الخصم ربع يوم أو نص أو أيام لحد 3");
    if (p.day > localDate(new Date())) throw new BadRequestException("مينفعش يوم بعد النهارده");
    const hr = this.isHr(me);
    const saved = await run(async (tx) => {
      const e = await tx.employee.findFirst({ where: { AND: [{ id: p.employeeId }, this.scope(me)] }, select: { id: true, name: true, userId: true } });
      if (!e) throw new NotFoundException("الموظف مش موجود");
      if (e.userId === me.id) throw new ForbiddenException("مينفعش تسجّل جزاء على نفسك");
      const r = await tx.penalty.create({ data: { employeeId: e.id, day: day(p.day), text: p.text, deductionDays: p.deductionDays, byUserId: me.id, status: hr ? "approved" : "pending", ...(hr ? { approvedById: me.id, decidedAt: new Date() } : {}) } });
      await this.audit.record({ module: "hr", entity: "Penalty", entityId: r.id, action: "create", userId: me.id, after: { employee: e.name, day: p.day, text: p.text, deductionDays: p.deductionDays, status: r.status } }, tx);
      return { r, e };
    });
    if (!hr) await this.notifications.notify({ event: "hr.penalty", link: "/hr", text: `جزاء مقترح على ${saved.e.name}: ${p.text} · مستني موافقتك` });
    return { id: saved.r.id, status: saved.r.status };
  }

  async decidePenalty(me: CurrentUser, id: string, approve: boolean, run: Run) {
    if (!this.isHr(me)) throw new ForbiddenException("الموافقة على الجزاءات للـ HR");
    return run(async (tx) => {
      const r = await tx.penalty.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("الجزاء مش موجود");
      if (r.status !== "pending") throw new BadRequestException("الجزاء ده اتقرر قبل كده");
      const status = approve ? "approved" : "rejected";
      await tx.penalty.update({ where: { id }, data: { status, approvedById: me.id, decidedAt: new Date() } });
      await this.audit.record({ module: "hr", entity: "Penalty", entityId: id, action: approve ? "approve" : "reject", userId: me.id, before: { status: r.status }, after: { status } }, tx);
      return { id, status };
    });
  }

  async removePenalty(me: CurrentUser, id: string, run: Run) {
    if (!this.isHr(me)) throw new ForbiddenException("مسح الجزاءات للـ HR");
    return run(async (tx) => {
      const r = await tx.penalty.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("الجزاء مش موجود");
      await tx.penalty.delete({ where: { id } });
      await this.audit.record({ module: "hr", entity: "Penalty", entityId: id, action: "delete", userId: me.id, before: { day: iso(r.day), text: r.text, deductionDays: Number(r.deductionDays), status: r.status } }, tx);
      return { id };
    });
  }

  /* ---- 7.8 · the 1-to-1 ---- */
  async questions(): Promise<string[]> {
    const s = await this.db.setting.findUnique({ where: { key: QUESTIONS } });
    return (s?.value as string[] | null) ?? DEFAULT_QUESTIONS;
  }

  async setQuestions(me: CurrentUser, questions: string[], run: Run) {
    return run(async (tx) => {
      const before = await this.questions();
      await tx.setting.upsert({ where: { key: QUESTIONS }, create: { key: QUESTIONS, value: questions }, update: { value: questions } });
      await this.audit.record({ module: "hr", entity: "Setting", entityId: QUESTIONS, action: "update", userId: me.id, before: { questions: before }, after: { questions } }, tx);
      return { questions };
    });
  }

  async oneOnOnes(me: CurrentUser, employeeId: string): Promise<OneOnOnesView> {
    const e = await this.db.employee.findFirst({ where: { AND: [{ id: employeeId }, this.scope(me)] }, select: { id: true } });
    if (!e) throw new NotFoundException("الموظف مش موجود");
    const [rows, questions] = await Promise.all([this.db.oneOnOne.findMany({ where: { employeeId }, orderBy: { heldOn: "desc" } }), this.questions()]);
    const by = await this.names(rows.map((r) => r.byUserId ?? ""));
    return {
      questions, due: oneOnOneDue(rows[0] ? iso(rows[0].heldOn) : null, localDate(new Date())) === "due",
      items: rows.map((r) => ({ id: r.id, heldOn: iso(r.heldOn), answers: r.answers as Record<string, string>, hrAction: r.hrAction, hrActionDue: r.hrActionDue ? iso(r.hrActionDue) : null, hrActionDone: r.hrActionDone, by: by.get(r.byUserId ?? "") ?? "" })),
    };
  }

  async addOneOnOne(me: CurrentUser, employeeId: string, o: NewOneOnOne, run: Run) {
    if (o.hrAction && !o.hrActionDue) throw new BadRequestException("«حل الـ HR» لازم يتحدد له ميعاد");
    if (o.heldOn > localDate(new Date())) throw new BadRequestException("مينفعش يوم بعد النهارده");
    return run(async (tx) => {
      const e = await tx.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true } });
      if (!e) throw new NotFoundException("الموظف مش موجود");
      const r = await tx.oneOnOne.create({ data: { employeeId, heldOn: day(o.heldOn), answers: o.answers, hrAction: o.hrAction || null, hrActionDue: o.hrActionDue ? day(o.hrActionDue) : null, byUserId: me.id } });
      await this.audit.record({ module: "hr", entity: "OneOnOne", entityId: r.id, action: "create", userId: me.id, after: { employee: e.name, heldOn: o.heldOn, hrAction: o.hrAction ?? null, hrActionDue: o.hrActionDue ?? null } }, tx);
      return { id: r.id };
    });
  }

  async actionDone(me: CurrentUser, id: string, run: Run) {
    return run(async (tx) => {
      const r = await tx.oneOnOne.findUnique({ where: { id } });
      if (!r || !r.hrAction) throw new NotFoundException("مفيش حل HR في الجلسة دي");
      await tx.oneOnOne.update({ where: { id }, data: { hrActionDone: true } });
      await this.audit.record({ module: "hr", entity: "OneOnOne", entityId: id, action: "action-done", userId: me.id, after: { hrAction: r.hrAction } }, tx);
      return { id };
    });
  }

  /** Open «حل الـ HR» items, the late ones first. */
  async actions(): Promise<HrActionsView> {
    const today = localDate(new Date());
    const rows = await this.db.oneOnOne.findMany({ where: { hrAction: { not: null }, hrActionDone: false }, include: { employee: { select: { id: true, name: true } } }, orderBy: { hrActionDue: "asc" } });
    return { items: rows.map((r) => ({ id: r.id, employeeId: r.employeeId, name: r.employee.name, action: r.hrAction!, due: r.hrActionDue ? iso(r.hrActionDue) : today, late: !!r.hrActionDue && iso(r.hrActionDue) < today })) };
  }
}
