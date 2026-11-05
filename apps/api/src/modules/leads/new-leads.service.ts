import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { ROTATION, type NewLeadRequestRow, type RouteNewLead } from "@places/contracts";
import { LeadRouter, NEW_LEAD_ROUTE_MIN, localDate, newLeadMinutesLeft } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { LeavesService } from "../hr/leaves.service";
import { LeadsRepository } from "./leads.repository";
import { LeadsService } from "./leads.service";

const NO_LEAD = "الليد ده مش موجود أو مبقاش معاك";
const DECIDED = "القرار ده اتاخد قبل كده";

/**
 * 1.17 · M-01 2.3: a lead that came to Telesales on the third No Answer rotation and became Interested goes back to the
 * salespeople as a New Lead. Telesales sends it; Operations picks the normal rotation or a salesperson. Both times are
 * kept (requested / routed) for Operations' KPI item «توزيع الـ New Lead في ميعاده» (11.15).
 */
@Injectable()
export class NewLeadsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly leaves: LeavesService,
    private readonly leads: LeadsService,
  ) {}

  /** «ابعته كـ New Lead» (demo): only on a lead Telesales holds that became Interested, and once until it's routed. */
  async request(me: CurrentUser, id: string) {
    const lead = await this.db.$transaction(async (tx) => {
      const l = await tx.lead.findFirst({ where: { AND: [ownedBy(me) as never, { id, archivedAt: null }] }, select: { name: true, ownedByTelesales: true, stage: true, newLeadRequestedAt: true, newLeadRoutedAt: true } });
      if (!l) throw new NotFoundException(NO_LEAD);
      if (!l.ownedByTelesales || l.stage !== "INTERESTED") throw new BadRequestException("الليد لازم يكون Interested ومع Telesales");
      if (l.newLeadRequestedAt && !l.newLeadRoutedAt) throw new BadRequestException("الليد مستني قرار الأوبريشن بالفعل");
      const at = new Date();
      await tx.lead.update({ where: { id }, data: { newLeadRequestedAt: at, newLeadRequestedById: me.id, newLeadRoutedAt: null, newLeadRoutedById: null } });
      await this.repo.addActivity(tx, id, "assign", "Telesales بعتته كـ New Lead للأوبريشن", me.id);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "new-lead-request", userId: me.id, after: { newLeadRequestedAt: at.toISOString() } }, tx);
      return l;
    });
    await this.notifications.notify({ event: "lead.new_lead", text: `Telesales بعتت ${lead.name} كـ New Lead`, link: "/leads" });
    return this.leads.get(me, id);
  }

  /** Operations' queue, with each request's clock (30 minutes by default). */
  async pending(now = new Date()): Promise<NewLeadRequestRow[]> {
    const rows = await this.repo.pendingNewLeads();
    const people = new Map((await this.repo.userNames([...new Set(rows.map((r) => r.newLeadRequestedById).filter((x): x is string => !!x))])).map((p) => [p.userId, p.name]));
    return rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, area: r.area, requestedAt: r.newLeadRequestedAt!.toISOString(),
      by: r.newLeadRequestedById ? { id: r.newLeadRequestedById, name: people.get(r.newLeadRequestedById) ?? "" } : null,
      minutesLeft: newLeadMinutesLeft(r.newLeadRequestedAt!, now),
    }));
  }

  /**
   * «الروتيشن العادي» (the area's next salesperson, nobody switched off or on leave) or «سيلز معيّن» (that person's next
   * turn is used up, Q2). The lead starts again with the salesperson: Fresh, rotation 1, a new SLA clock. Once only.
   */
  async route(me: CurrentUser, id: string, input: RouteNewLead) {
    const picked = input.to === ROTATION ? null : (await this.repo.routingPeople()).find((p) => p.id === input.to);
    if (input.to !== ROTATION && !picked) throw new BadRequestException("اختار سيلز من القايمة");
    const routed = await this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id, archivedAt: null, newLeadRequestedAt: { not: null } }, select: { name: true, area: true, assignedToId: true, newLeadRequestedAt: true, newLeadRoutedAt: true } });
      if (!lead) throw new NotFoundException("الطلب ده مش موجود");
      if (lead.newLeadRoutedAt) throw new ConflictException(DECIDED);
      const router = new LeadRouter(await this.repo.lockRouting(tx));
      const to = picked?.id ?? router.next(lead.area, await this.rotationPool(tx, lead.area));
      if (!to) throw new BadRequestException("مفيش سيلز متاح على الـ area دي · اختار سيلز معيّن");
      if (picked) router.assignedByHand(picked.id);
      const now = new Date();
      const done = await tx.lead.updateMany({
        where: { id, newLeadRoutedAt: null },
        data: { assignedToId: to, assignedAt: now, ownedByTelesales: false, stage: "FRESH", touched: false, firstActionAt: null, slaWarnedAt: null,
          rotation: 1, noAnswerCount: 0, naMarkedAt: null, naMarkedById: null, newLeadRoutedAt: now, newLeadRoutedById: me.id },
      });
      if (!done.count) throw new ConflictException(DECIDED);
      await this.repo.saveRouting(tx, router.snapshot());
      const [salesperson] = await this.repo.employeeNames([to], tx);
      const took = Math.floor((now.getTime() - lead.newLeadRequestedAt!.getTime()) / 60_000);
      const late = took > NEW_LEAD_ROUTE_MIN ? ` (اتأخر عن ${NEW_LEAD_ROUTE_MIN} دقيقة)` : "";
      await this.repo.addActivity(tx, id, "assign", `الأوبريشن بعتت الليد كـ New Lead لـ ${salesperson?.name ?? "—"} · بعد ${took} دقيقة من استلامه${late}`, me.id);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "new-lead-route", userId: me.id,
        before: { assignedToId: lead.assignedToId, ownedByTelesales: true }, after: { assignedToId: to, by: picked ? "hand" : "rotation", minutes: took } }, tx);
      return { name: lead.name, area: lead.area, to };
    });
    await this.leads.notifyAssigned(id, routed.name, routed.area, routed.to);
    return this.leads.get(me, id);
  }

  /** The area's rotation as a new lead gets it (1.13, 1.15): still working, not on approved leave today. */
  private async rotationPool(tx: Prisma.TransactionClient, area: string) {
    const pools = ((await tx.setting.findUnique({ where: { key: "areaRouting" } }))?.value ?? {}) as Record<string, string[]>;
    const onLeave = await this.leaves.employeesOnLeave(localDate(new Date()), tx);
    return (await this.repo.stillWorking(pools[area] ?? [], tx)).filter((e) => !onLeave.has(e));
  }
}
