import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { PostponeDecision, VisitPostpone } from "@places/contracts";
import { ruleRecipients } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { AttendanceService } from "../hr/attendance.service";
import { LeadRulesService } from "./lead-rules.service";
import { LeadsRepository } from "./leads.repository";
import { LeadsService } from "./leads.service";

const NO_LEAD = "الليد ده مش موجود أو مبقاش معاك";
const NO_VISIT = "الميعاد ده مش موجود";
const kindOf = (db: string) => (db === "meeting" ? "Meeting" : "Visit");
const day = (d: Date) => d.toLocaleDateString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", day: "numeric", month: "short" });

/**
 * 1.24 · «اتأجلت»: the salesperson writes the reason → whom the lead rules name approves or rejects (the salesperson's TL
 * by default, «visit.postpone»); whom they name to be told (Operations, «visit.postponeInfo») only hears of it. Approved =
 * that day without a deduction (7.3) and the salesperson and HR are told; rejected = it must be marked Done or «معملتهاش».
 */
@Injectable()
export class VisitPostponeService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly leads: LeadsService,
    private readonly rules: LeadRulesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly attendance: AttendanceService,
  ) {}

  async ask(me: CurrentUser, id: string, visitId: string, input: VisitPostpone) {
    const v = await this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { AND: [ownedBy(me) as never, { id, archivedAt: null }] }, select: { name: true, assignedToId: true } });
      if (!lead) throw new NotFoundException(NO_LEAD);
      const visit = await this.repo.findVisit(tx, id, visitId);
      if (!visit) throw new NotFoundException(NO_VISIT);
      const ok = await tx.leadVisit.updateMany({ where: { id: visitId, outcome: null, postponeStatus: null },
        data: { postponeStatus: "pending", postponeReason: input.reason, postponeRequestedBy: me.id } });
      if (!ok.count) throw new BadRequestException(visit.outcome ? "الميعاد اتعلّم خلاص" : "الميعاد ده اتطلب تأجيله قبل كده");
      const kind = kindOf(visit.kind);
      await this.repo.addActivity(tx, id, kind === "Meeting" ? "meeting" : "visit", `طلب تأجيل الـ ${kind} بتاع ${day(visit.at)} · السبب: ${input.reason}`, me.id);
      await this.audit.record({ module: "leads", entity: "LeadVisit", entityId: visitId, action: "postpone-ask", userId: me.id,
        before: { leadId: id, postponeStatus: null }, after: { leadId: id, postponeStatus: "pending", reason: input.reason } }, tx);
      return { kind, at: visit.at, name: lead.name, ownerId: lead.assignedToId };
    });
    const [rules, owner] = await Promise.all([this.rules.get(), v.ownerId ? this.repo.ownerAccounts(v.ownerId) : null]);
    const to = ruleRecipients(rules.visit.postpone, { ownerUserId: owner?.userId ?? null, ownerTlUserId: owner?.teamLeader?.userId ?? null });
    await this.notifications.notify({ event: "lead.visit_postpone", text: `${owner?.name ?? me.name} عايز يأجّل ${v.kind} ${v.name} (${day(v.at)}) · السبب: ${input.reason} · محتاج موافقتك`,
      link: `/leads?open=${id}`, to, channels: [...rules.visit.postpone.ch] });
    return this.leads.get(me, id);
  }

  async decide(me: CurrentUser, id: string, visitId: string, input: PostponeDecision) {
    const d = await this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { AND: [ownedBy(me) as never, { id, archivedAt: null }] }, select: { name: true, assignedToId: true } });
      if (!lead) throw new NotFoundException(NO_LEAD);
      const visit = await tx.leadVisit.findFirst({ where: { id: visitId, leadId: id }, select: { kind: true, at: true, postponeStatus: true, postponeReason: true } });
      if (!visit) throw new NotFoundException(NO_VISIT);
      if (!lead.assignedToId || !(await this.leads.canDecidePostpone(me, lead.assignedToId))) throw new ForbiddenException("الموافقة على التأجيل للـ Team Leader");
      const status = input.approve ? "approved" : "rejected";
      const ok = await tx.leadVisit.updateMany({ where: { id: visitId, postponeStatus: "pending" }, data: { postponeStatus: status, postponeDecidedBy: me.id, postponeDecidedAt: new Date() } });
      if (!ok.count) throw new BadRequestException("مفيش طلب تأجيل مستني هنا");
      const kind = kindOf(visit.kind);
      const what = `${me.name} ${input.approve ? "وافق على" : "رفض"} تأجيل ${kind} ${lead.name} (${day(visit.at)}) · السبب: ${visit.postponeReason ?? "—"}`;
      await this.repo.addActivity(tx, id, kind === "Meeting" ? "meeting" : "visit", `${what} · ${input.approve ? "اليوم ده من غير خصم" : "لازم يتعلّم Done أو معملتهاش"}`, me.id);
      await this.audit.record({ module: "leads", entity: "LeadVisit", entityId: visitId, action: input.approve ? "postpone-approve" : "postpone-reject", userId: me.id,
        before: { leadId: id, postponeStatus: "pending" }, after: { leadId: id, postponeStatus: status } }, tx);
      if (input.approve) await this.attendance.refreshDay(lead.assignedToId, visit.at, tx); // 7.3: that day without a deduction
      return { what, kind, at: visit.at, name: lead.name, ownerId: lead.assignedToId };
    });
    const [rules, owner] = await Promise.all([this.rules.get(), this.repo.ownerAccounts(d.ownerId)]);
    const lead = { ownerUserId: owner?.userId ?? null, ownerTlUserId: owner?.teamLeader?.userId ?? null };
    // Operations: told, not asked
    await this.notifications.notify({ event: "lead.visit_postponed", text: d.what, link: `/leads?open=${id}`, to: ruleRecipients(rules.visit.postponeInfo, lead).filter((x) => x !== me.id), channels: [...rules.visit.postponeInfo.ch] });
    await this.notifications.notify({ event: "lead.visit_postponed", link: `/leads?open=${id}`, to: [...(owner ? [owner.userId] : []), ...(input.approve ? ["hr"] : [])],
      text: input.approve ? `${owner?.name ?? ""}: الـ ${d.kind} بتاع ${day(d.at)} اتأجل واتوافق عليه · من غير خصم` : `${d.name}: الـ Team Leader رفض تأجيل الـ ${d.kind}` });
    return this.leads.get(me, id);
  }
}
