import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { BulkDecision, BulkPerson, BulkRequest, BulkReview, BulkSent } from "@places/contracts";
import { assignInTurn, bulkMobiles, distributeEvenly, localDate } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { sheetTexts, type UploadedSheet } from "../../core/http/import";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LeavesService } from "../hr/leaves.service";
import { LeadBulkRepository } from "./bulk.repository";
import { RotationService } from "./rotation.service";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 1.19 · the bulk entry (M-01 · answers-leads-telesales): Telesales sends a sheet of mobiles with its channel and
 * campaign → Operations sees how many each salesperson gets, can take salespeople out, approves or rejects with a
 * reason → the new numbers become Fresh leads given in turn over today's rotation order (1.23); numbers we already
 * have count as a duplicate arrival on their lead (M-04 Q22) and don't become leads.
 */
@Injectable()
export class LeadBulkService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadBulkRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly leaves: LeavesService,
    private readonly rotation: RotationService,
  ) {}

  /** «أو ارفع ملف Excel / CSV»: every mobile in the sheet's cells, whatever the columns (0.12's reader). */
  async readSheet(file: UploadedSheet | undefined) {
    if (!file) throw new BadRequestException("ارفع ملف Excel أو CSV");
    return { numbers: bulkMobiles(await sheetTexts(file)) };
  }

  async send(me: CurrentUser, input: BulkRequest): Promise<BulkSent> {
    const numbers = bulkMobiles([input.numbers]);
    if (!numbers.length) throw new BadRequestException("مفيش أرقام صحيحة في الشيت");
    if (input.campaignId && !(await this.repo.campaignOf(input.campaignId, input.channel))) throw new BadRequestException("الكامبين دي مش تبع الـ channel ده");
    const duplicates = (await this.repo.existingPhones(numbers)).size;
    const bulk = await this.db.$transaction(async (tx) => {
      const b = await tx.leadBulk.create({ data: { numbers, channel: input.channel, campaignId: input.campaignId ?? null, byUserId: me.id } });
      await this.audit.record({ module: "leads", entity: "LeadBulk", entityId: b.id, action: "create", userId: me.id,
        after: { count: numbers.length, duplicates, channel: b.channel, campaignId: b.campaignId } }, tx);
      return b;
    });
    await this.notifications.notify({ event: "lead.bulk", text: `${me.name} بعتت إدخال جماعي فيه ${numbers.length} رقم · محتاج موافقتك`, link: "/leads" });
    return { id: bulk.id, count: numbers.length, duplicates };
  }

  /** Operations' «راجع التوزيع»: the pending requests with how many each salesperson gets today. */
  async pending(): Promise<BulkReview[]> {
    const rows = await this.repo.pending();
    if (!rows.length) return [];
    const [day, existing, names] = await Promise.all([this.today(), this.repo.existingPhones(rows.flatMap((r) => r.numbers)), this.repo.userNames(rows.map((r) => r.byUserId))]);
    return rows.map((r) => {
      const fresh = r.numbers.filter((n) => !existing.has(n)).length;
      const counts = distributeEvenly(fresh, day.order.filter((id) => !r.excluded.includes(id)));
      const people: BulkPerson[] = day.people.map((p) => ({ id: p.id, name: p.name, onLeave: day.onLeave.has(p.id), excluded: r.excluded.includes(p.id), count: counts.get(p.id) ?? 0 }));
      return { id: r.id, at: r.createdAt.toISOString(), by: { id: r.byUserId, name: names.get(r.byUserId) ?? "" }, channel: r.channel, campaign: r.campaign,
        total: r.numbers.length, duplicates: r.numbers.length - fresh, fresh, people };
    });
  }

  /** «شيله» / «رجّعه»: at least one salesperson stays in the distribution (demo). */
  async setExcluded(me: CurrentUser, id: string, employeeId: string, excluded: boolean) {
    await this.db.$transaction(async (tx) => {
      const b = await this.repo.lockPending(tx, id);
      const day = await this.today(tx);
      if (!day.people.some((p) => p.id === employeeId)) throw new BadRequestException("ده مش سيلز");
      const next = excluded ? [...new Set([...b.excluded, employeeId])] : b.excluded.filter((x) => x !== employeeId);
      if (day.order.every((p) => next.includes(p))) throw new BadRequestException("لازم يفضل سيلز واحد على الأقل");
      await tx.leadBulk.update({ where: { id }, data: { excluded: next } });
      await this.audit.record({ module: "leads", entity: "LeadBulk", entityId: id, action: excluded ? "exclude" : "include", userId: me.id,
        before: { excluded: b.excluded }, after: { excluded: next } }, tx);
    });
    return this.pending();
  }

  /** «وافق ووزّع» (M-01 3.2) or «ارفض الطلب» with its reason. */
  async decide(me: CurrentUser, id: string, d: BulkDecision) {
    if (!d.approve) return this.reject(me, id, d.reason ?? "");
    const done = await this.db.$transaction(async (tx) => {
      const b = await this.repo.lockPending(tx, id);
      const existing = await this.repo.existingPhones(b.numbers, tx);
      const fresh = b.numbers.filter((n) => !existing.has(n));
      const pool = (await this.today(tx)).order.filter((p) => !b.excluded.includes(p));
      if (fresh.length && !pool.length) throw new BadRequestException("مفيش سيلز متاح النهارده للتوزيع");
      const leads = await this.repo.createLeads(tx, assignInTurn(fresh, pool).map(({ item, to }) => ({ phone: item, to })),
        { name: `رقم من ${b.campaign?.name ?? b.channel}`, channel: b.channel, campaignId: b.campaignId, byUserId: me.id });
      await this.repo.duplicateArrivals(tx, [...existing.values()], { channel: b.channel, campaignId: b.campaignId, byUserId: b.byUserId });
      await tx.leadBulk.update({ where: { id }, data: { status: "approved", decidedById: me.id, decidedAt: new Date() } });
      const perPerson = Object.fromEntries([...distributeEvenly(fresh.length, pool)].filter(([, n]) => n > 0));
      await this.audit.record({ module: "leads", entity: "LeadBulk", entityId: id, action: "approve", userId: me.id, before: { status: "pending" },
        after: { status: "approved", leads: leads.map((l) => l.id), perPerson, duplicates: existing.size } }, tx);
      return { byUserId: b.byUserId, perPerson, count: fresh.length, people: Object.keys(perPerson).length };
    });
    const owners = await this.repo.userIdsOf(Object.keys(done.perPerson));
    for (const [employeeId, n] of Object.entries(done.perPerson)) {
      const userId = owners.get(employeeId);
      if (userId) await this.notifications.notify({ event: "lead.assigned", text: `اتوزعلك ${n} رقم من إدخال جماعي`, link: "/leads", to: [userId] });
    }
    await this.notifications.notify({ event: "lead.bulk_decided", text: `الأوبريشن وافقت: اتوزع ${done.count} رقم على ${done.people} سيلز`, link: "/leads", to: [done.byUserId] });
    return { count: done.count, people: done.people };
  }

  private async reject(me: CurrentUser, id: string, reason: string) {
    const byUserId = await this.db.$transaction(async (tx) => {
      const b = await this.repo.lockPending(tx, id);
      await tx.leadBulk.update({ where: { id }, data: { status: "rejected", reason, decidedById: me.id, decidedAt: new Date() } });
      await this.audit.record({ module: "leads", entity: "LeadBulk", entityId: id, action: "reject", userId: me.id, before: { status: "pending" }, after: { status: "rejected", reason } }, tx);
      return b.byUserId;
    });
    await this.notifications.notify({ event: "lead.bulk_decided", text: `الأوبريشن رفضت الإدخال الجماعي · السبب: ${reason}`, link: "/leads", to: [byUserId] });
    return { count: 0, people: 0 };
  }

  /**
   * Today's salespeople (M-01 3.2 «السيلز الموجودين في ترتيب اليوم»): everyone with the sales role, and `order` = the
   * ones not on approved leave in today's rotation order (1.23: who started first, or Operations' order by hand).
   */
  private async today(tx: Db = this.db) {
    const [people, onLeave] = await Promise.all([this.repo.salespeople(tx), this.leaves.employeesOnLeave(localDate(new Date()), tx)]);
    const order = await this.rotation.order(people.filter((p) => !onLeave.has(p.id)).map((p) => p.id), tx);
    const rank = new Map(order.map((id, i) => [id, i]));
    return { people: [...people].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)), onLeave, order };
  }
}
