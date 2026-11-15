import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { LeadTagRow, LeadTags, TagDecision, TagRequest, TagsQuery } from "@places/contracts";
import { tagApprover, tagProblem } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { leadScope } from "./lead-scope";

/**
 * M-01 · Tags (client, 11 Nov): a salesperson tags the others working the same deal on the lead; the Team Leader
 * approves (domain tagApprover) and the tagged salesperson then sees and works it with its owner (leadScope).
 */
@Injectable()
export class LeadTagsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  /** The salespeople one can tag (and the Team Leaders who sell). */
  people() {
    return this.db.employee.findMany({
      where: { user: { status: { not: "DISABLED" }, roles: { some: { role: { key: { in: ["sales", "tl"] } } } } } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
  }

  async request(me: CurrentUser, input: TagRequest): Promise<LeadTags> {
    if (!me.employeeId) throw new ForbiddenException("الـ Tag للسيلز والتيم ليدرز");
    const lead = await this.db.lead.findFirst({ where: { AND: [leadScope(me), { id: input.leadId, archivedAt: null }] }, select: { id: true, code: true, name: true, assignedToId: true } });
    if (!lead) throw new NotFoundException("الليد دي مش موجودة");
    const ids = [...new Set(input.employeeIds)];
    const problem = tagProblem(lead.assignedToId, me.employeeId, ids);
    if (problem) throw new BadRequestException(problem);
    const [by, tagged] = await Promise.all([
      this.db.employee.findUniqueOrThrow({ where: { id: me.employeeId }, select: { id: true, teamLeaderId: true } }),
      this.db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, teamLeaderId: true, userId: true } }),
    ]);
    if (tagged.length !== ids.length) throw new BadRequestException("اختار سيلز من القايمة");
    const asker = { employeeId: by.id, teamLeaderId: by.teamLeaderId, isTl: me.roles.includes("tl") };
    const made = await this.db.$transaction(async (tx) => {
      const out: Array<{ id: string; employeeId: string; approverId: string | null; approved: boolean }> = [];
      for (const t of tagged) {
        const d = tagApprover(asker, { employeeId: t.id, teamLeaderId: t.teamLeaderId, isTl: false });
        const status = d.approved ? "APPROVED" : "PENDING";
        const before = await tx.leadTag.findUnique({ where: { leadId_employeeId: { leadId: lead.id, employeeId: t.id } } });
        if (before && before.status !== "REJECTED") throw new ConflictException(`${t.name} عليها Tag قبل كده`);
        const row = await tx.leadTag.upsert({
          where: { leadId_employeeId: { leadId: lead.id, employeeId: t.id } },
          create: { leadId: lead.id, employeeId: t.id, byUserId: me.id, approverId: d.approverId, status, ...(d.approved ? { decidedAt: new Date(), decidedById: me.id } : {}) },
          update: { byUserId: me.id, approverId: d.approverId, status, decidedAt: d.approved ? new Date() : null, decidedById: d.approved ? me.id : null },
        });
        await tx.leadActivity.create({ data: { leadId: lead.id, kind: "tag", text: d.approved ? `اتعمل Tag لـ ${t.name}` : `طلب Tag لـ ${t.name} · مستني موافقة التيم ليدر`, byUserId: me.id } });
        await this.audit.record({ module: "leads", entity: "LeadTag", entityId: row.id, action: "create", userId: me.id, after: { leadId: lead.id, employeeId: t.id, status, approverId: d.approverId } }, tx);
        out.push({ id: row.id, employeeId: t.id, approverId: d.approverId, approved: d.approved });
      }
      return out;
    });
    // the Team Leader hears of each request; a tag approved at once goes to the tagged salesperson
    const approvers = await this.db.employee.findMany({ where: { id: { in: made.filter((m) => !m.approved && m.approverId).map((m) => m.approverId!) } }, select: { userId: true } });
    if (approvers.length) await this.notifications.notify({ event: "lead.tag_request", text: `${me.name} طالب Tag على ليد ${lead.code} · ${lead.name}`, link: "/leads?tags=1", userIds: approvers.map((a) => a.userId) });
    const now = tagged.filter((t) => made.some((m) => m.employeeId === t.id && m.approved)).map((t) => t.userId);
    if (now.length) await this.notifications.notify({ event: "lead.tag_decided", text: `اتعملك Tag على ليد ${lead.code} · ${lead.name}`, link: `/leads?open=${lead.id}`, userIds: now });
    return this.list(me, { leadId: lead.id });
  }

  async decide(me: CurrentUser, id: string, input: TagDecision): Promise<LeadTags> {
    const tag = await this.db.leadTag.findUnique({ where: { id }, include: { lead: { select: { id: true, code: true, name: true } } } });
    if (!tag) throw new NotFoundException("الطلب ده مش موجود");
    if (!this.mayDecide(me, tag.approverId)) throw new ForbiddenException("الموافقة للتيم ليدر بتاع الطلب");
    const status = input.approve ? "APPROVED" : "REJECTED";
    await this.db.$transaction(async (tx) => {
      const won = await tx.leadTag.updateMany({ where: { id, status: "PENDING" }, data: { status, decidedAt: new Date(), decidedById: me.id } });
      if (!won.count) throw new ConflictException("الطلب ده اتقرر قبل كده");
      const [who] = await tx.employee.findMany({ where: { id: tag.employeeId }, select: { name: true } });
      await tx.leadActivity.create({ data: { leadId: tag.leadId, kind: "tag", text: `${input.approve ? "اتوافق على" : "اترفض"} الـ Tag لـ ${who?.name ?? ""}`, byUserId: me.id } });
      await this.audit.record({ module: "leads", entity: "LeadTag", entityId: id, action: input.approve ? "approve" : "reject", userId: me.id, before: { status: "PENDING" }, after: { status } }, tx);
    });
    const tagged = await this.db.employee.findUnique({ where: { id: tag.employeeId }, select: { userId: true } });
    await this.notifications.notify({
      event: "lead.tag_decided", text: `${input.approve ? "اتوافق على" : "اترفض"} الـ Tag على ليد ${tag.lead.code} · ${tag.lead.name}`,
      link: input.approve ? `/leads?open=${tag.leadId}` : "/leads?tags=1", userIds: [tag.byUserId, ...(input.approve && tagged ? [tagged.userId] : [])],
    });
    return this.list(me, {});
  }

  /**
   * The «Tags» tab: what I asked, what I'm tagged on, and what waits for me to decide (newest first); on a lead's
   * window, that lead's tags (if I reach the lead).
   */
  async list(me: CurrentUser, q: TagsQuery): Promise<LeadTags> {
    const mineOr = [{ byUserId: me.id }, ...(me.employeeId ? [{ employeeId: me.employeeId }, { approverId: me.employeeId }] : []), ...(this.approvesAll(me) ? [{ approverId: null }] : [])];
    const where = q.leadId
      ? { leadId: q.leadId, lead: leadScope(me) }
      : me.grants.scope === "all" ? {} : { OR: mineOr };
    const rows = await this.db.leadTag.findMany({ where, include: { lead: { select: { id: true, code: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    const emps = await this.db.employee.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.employeeId, ...(r.approverId ? [r.approverId] : [])]))] } }, select: { id: true, name: true } });
    const users = await this.db.employee.findMany({ where: { userId: { in: [...new Set(rows.map((r) => r.byUserId))] } }, select: { userId: true, name: true } });
    const en = new Map(emps.map((e) => [e.id, e.name])), un = new Map(users.map((u) => [u.userId, u.name]));
    const items: LeadTagRow[] = rows.map((r) => ({
      id: r.id, lead: r.lead, tagged: en.get(r.employeeId) ?? "", by: un.get(r.byUserId) ?? "", approver: r.approverId ? en.get(r.approverId) ?? null : null,
      status: r.status, at: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
      canDecide: r.status === "PENDING" && this.mayDecide(me, r.approverId),
    }));
    return { items, toDecide: items.filter((i) => i.canDecide).length, pending: items.filter((i) => i.status === "PENDING").length };
  }

  private approvesAll(me: CurrentUser) {
    return me.grants.can("leads", "approve");
  }

  private mayDecide(me: CurrentUser, approverId: string | null) {
    return (approverId !== null && approverId === me.employeeId) || this.approvesAll(me);
  }
}
