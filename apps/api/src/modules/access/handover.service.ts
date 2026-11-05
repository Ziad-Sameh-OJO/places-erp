import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { HandoverDecision, HandoverInput, HandoverRow } from "@places/contracts";
import { handoverRefusal } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadsService } from "../leads/leads.service";
import { TasksService } from "../marketing/tasks.service";

const NOT_YOURS = "الطلب ده مش مستني موافقتك";

/**
 * M-09 2.2 · 7.1 «موظف مشي: الحساب يتقفل، والليدز بتاعته تتنقل بموافقة مديره»: HR asks for a stopped account's
 * open leads and tasks to go to someone; the leaver's direct manager approves (everything moves in one
 * transaction, audited) or rejects (nothing moves). Its own module because the leads module already uses access.
 */
@Injectable()
export class HandoverService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly leads: LeadsService,
    private readonly tasks: TasksService,
  ) {}

  async ask(me: CurrentUser, id: string, b: HandoverInput) {
    const [from, to] = await Promise.all([this.person(id), this.person(b.to)]);
    if (!from) throw new NotFoundException();
    if (!to) throw new BadRequestException("اختار حد من القايمة");
    const manager = from.employee.managerId ? await this.db.employee.findUnique({ where: { id: from.employee.managerId }, select: { userId: true } }) : null;
    const pending = !!(await this.db.handover.count({ where: { fromUserId: id, status: "pending" } }));
    const refusal = handoverRefusal({
      leaving: from.status === "DISABLED" || !!from.endDate, managerUserId: manager?.userId ?? null, fromId: id, toId: b.to,
      toActive: to.status === "ACTIVE" && (!to.endDate || to.endDate > new Date()), pending,
    });
    if (refusal) throw new BadRequestException(refusal);
    const h = await this.db.$transaction(async (tx) => {
      const h = await tx.handover.create({ data: { fromUserId: id, toUserId: b.to, byUserId: me.id, approverId: manager!.userId } });
      await this.audit.record({ module: "access", entity: "Handover", entityId: h.id, action: "handover-asked", userId: me.id, after: { from: id, to: b.to, approver: manager!.userId } }, tx);
      return h;
    });
    await this.notifications.notify({ event: "access.handover", userIds: [h.approverId], link: "/", text: `${me.name} طالب نقل ليدز ومهام ${from.employee.name} لـ ${to.employee.name} · مستني موافقتك` });
    return { id: h.id };
  }

  /** What waits for the signed-in manager, with how much work would move now. */
  async mine(me: CurrentUser): Promise<HandoverRow[]> {
    const hs = await this.db.handover.findMany({ where: { approverId: me.id, status: "pending" }, orderBy: { createdAt: "asc" } });
    const people = await this.db.employee.findMany({ where: { userId: { in: hs.flatMap((h) => [h.fromUserId, h.toUserId, h.byUserId]) } }, select: { id: true, userId: true, name: true } });
    const by = new Map(people.map((p) => [p.userId, p]));
    return Promise.all(hs.map(async (h) => ({
      id: h.id, from: by.get(h.fromUserId)?.name ?? "", to: by.get(h.toUserId)?.name ?? "", by: by.get(h.byUserId)?.name ?? "السيستم",
      leads: by.get(h.fromUserId) ? await this.leads.openCount(by.get(h.fromUserId)!.id) : 0, tasks: await this.tasks.openCount(h.fromUserId), createdAt: h.createdAt.toISOString(),
    })));
  }

  async decide(me: CurrentUser, id: string, d: HandoverDecision) {
    const h = await this.db.handover.findUnique({ where: { id } });
    if (!h || h.approverId !== me.id) throw new ForbiddenException(NOT_YOURS);
    const [from, to] = await Promise.all([this.person(h.fromUserId), this.person(h.toUserId)]);
    if (d.approve && (!to || to.status !== "ACTIVE")) throw new BadRequestException("اللي هيستلم الشغل حسابه مبقاش شغال · ارفض واطلب نقل لحد تاني");
    const moved = await this.db.$transaction(async (tx) => {
      // only a pending request is decided, once (two clicks or two tabs can't move the work twice)
      const r = await tx.handover.updateMany({ where: { id, status: "pending" }, data: { status: d.approve ? "approved" : "rejected", decidedAt: new Date() } });
      if (!r.count) throw new ConflictException("الطلب ده اتقرر قبل كده");
      let moved = { leads: [] as string[], tasks: 0 };
      if (d.approve) {
        moved = { leads: from && to ? await this.leads.handOver(tx, from.employee.id, to.employee.id, me.id) : [], tasks: await this.tasks.handOver(tx, h.fromUserId, h.toUserId) };
        await tx.handover.update({ where: { id }, data: { leads: moved.leads.length, tasks: moved.tasks } });
      }
      await this.audit.record({ module: "access", entity: "Handover", entityId: id, action: d.approve ? "handover-approved" : "handover-rejected", userId: me.id,
        before: { assignedTo: h.fromUserId }, after: { assignedTo: d.approve ? h.toUserId : h.fromUserId, leads: moved.leads, tasks: moved.tasks } }, tx);
      return moved;
    });
    const name = from?.employee.name ?? "";
    await this.notifications.notify({ event: "access.handover", userIds: d.approve ? [h.byUserId, h.toUserId] : [h.byUserId],
      text: d.approve ? `${me.name} وافق: ${moved.leads.length} ليد و${moved.tasks} مهمة من شغل ${name} اتنقلوا لـ ${to?.employee.name ?? ""}` : `${me.name} رفض نقل شغل ${name}` });
  }

  private person(userId: string) {
    return this.db.user.findFirst({ where: { id: userId, employee: { isNot: null } }, select: { id: true, status: true, endDate: true, employee: { select: { id: true, name: true, managerId: true } } } })
      .then((u) => (u && u.employee ? { ...u, employee: u.employee } : null));
  }
}
