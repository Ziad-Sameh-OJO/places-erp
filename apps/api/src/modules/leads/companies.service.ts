import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { activeValues, type AddedCompany, type CompanyFilters, type CompanyRow, type CompanySheet, type CompanyUpdate, type NewCompany, type PendingCompany } from "@places/contracts";
import { OUTBOUND_WINDOW_DAYS, contractEndingWindow, keepsCompaniesSheet, localDate } from "@places/domain";
import { EXPORT_LIMIT } from "../../core/http/excel";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { CompaniesRepository } from "./companies.repository";

const KEEPERS_ONLY = "شيت الشركات بتضيف فيه Telesales بس";

/**
 * 1.20 · «شيت الشركات» (M-01 2.1, 6.1): the sheet by category, Telesales' Outbound companies (KPI: 15 a week), and the
 * companies written on leads that aren't in the sheet yet, which Telesales adds with their category.
 */
@Injectable()
export class CompaniesService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: CompaniesRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  async sheet(me: CurrentUser, f: CompanyFilters): Promise<CompanySheet> {
    const since = new Date(Date.now() - OUTBOUND_WINDOW_DAYS * 864e5);
    const [[rows, total], counts, settings, outbound] = await Promise.all([this.repo.page(f, ending(f)), this.repo.categoryCounts(), this.settings.all(), this.repo.outboundSince(me.id, since)]);
    const byCat = new Map(counts.map((c) => [c.category, c._count._all]));
    return {
      items: rows.map(toRow), total, page: f.page, pageSize: f.pageSize, outboundThisWeek: outbound,
      categories: activeValues(settings.companyCategories).map((name) => ({ name, count: byCat.get(name) ?? 0 })),
    };
  }

  /** 1.21 · the report as Excel (M-01 6.1): the same filters as the screen, audited. */
  async exportRows(me: CurrentUser, f: CompanyFilters) {
    const rows = await this.repo.all(f, ending(f), EXPORT_LIMIT);
    await this.audit.record({ module: "leads", entity: "Company", entityId: "report", action: "export", userId: me.id, after: { rows: rows.length, category: f.category ?? null, endingWithin: f.endingWithin ?? null } });
    return rows.map(toRow);
  }

  names(q: string) {
    return q ? this.repo.names(q).then((r) => r.map((x) => x.name)) : Promise.resolve([]);
  }

  /** «أضف» (Outbound): Telesales found it herself. Same name or number = already in the sheet. */
  async add(me: CurrentUser, input: NewCompany): Promise<AddedCompany> {
    if (!keepsCompaniesSheet(me.roles)) throw new ForbiddenException(KEEPERS_ONLY);
    await this.checkCategory(input.category);
    const company = await this.db.$transaction(async (tx) => {
      if (await this.repo.findSame(input.name, input.number, tx)) throw new ConflictException("الشركة دي موجودة في الشيت");
      const c = await tx.company.create({ data: { name: input.name, category: input.category, number: input.number, outbound: true, createdById: me.id } });
      await this.audit.record({ module: "leads", entity: "Company", entityId: c.id, action: "create", userId: me.id, after: c }, tx);
      return c;
    });
    // «رقم الشركة بيتقارن بأرقام الليدز» (M-01 · the sheet's number): say so if a lead already has it
    const lead = await this.repo.leadWithPhone(input.number);
    return { id: company.id, name: company.name, category: company.category, leadCode: lead?.code ?? null };
  }

  /** «عدّل» a company in the sheet: its keepers only; name + number stay unique; audited with what changed. */
  async update(me: CurrentUser, id: string, input: CompanyUpdate): Promise<CompanyRow> {
    if (!keepsCompaniesSheet(me.roles)) throw new ForbiddenException(KEEPERS_ONLY);
    await this.checkCategory(input.category);
    const c = await this.db.$transaction(async (tx) => {
      const before = await tx.company.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("الشركة دي مش في الشيت");
      if (await this.repo.findSame(input.name, input.number, tx, id)) throw new ConflictException("فيه شركة تانية في الشيت بنفس الاسم أو الرقم");
      const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);
      const after = await tx.company.update({ where: { id }, data: {
        ...input, contractStart: day(input.contractStart), contractEnd: day(input.contractEnd),
      } });
      await this.audit.record({ module: "leads", entity: "Company", entityId: id, action: "update", userId: me.id, before, after }, tx);
      return after;
    });
    return toRow(c);
  }

  async pending(me: CurrentUser): Promise<PendingCompany[]> {
    if (!keepsCompaniesSheet(me.roles)) throw new ForbiddenException(KEEPERS_ONLY);
    const rows = await this.repo.pending();
    const names = new Map((await this.repo.userNames(rows.map((r) => r.byUserId))).map((p) => [p.userId, p.name]));
    return rows.map((r) => ({ id: r.id, name: r.name, lead: r.lead, by: names.get(r.byUserId) ?? "", at: r.createdAt.toISOString() }));
  }

  /** «أضف للشيت»: the company that came on a lead goes in under its category, and that lead points to it. */
  async addPending(me: CurrentUser, id: string, category: string): Promise<AddedCompany> {
    if (!keepsCompaniesSheet(me.roles)) throw new ForbiddenException(KEEPERS_ONLY);
    await this.checkCategory(category);
    return this.db.$transaction(async (tx) => {
      const req = await tx.companyRequest.findUnique({ where: { id }, select: { id: true, name: true, status: true, leadId: true } });
      if (!req) throw new NotFoundException("الطلب ده مش موجود");
      if (req.status !== "pending") throw new ConflictException("الشركة دي اتضافت خلاص");
      const same = await this.repo.findSame(req.name, null, tx);
      const company = same ?? await tx.company.create({ data: { name: req.name, category, createdById: me.id } });
      await tx.lead.update({ where: { id: req.leadId }, data: { companyId: company.id } });
      // every request for the same name goes with it
      await tx.companyRequest.updateMany({ where: { status: "pending", name: { equals: req.name, mode: "insensitive" } }, data: { status: "added", companyId: company.id } });
      await this.audit.record({ module: "leads", entity: "Company", entityId: company.id, action: same ? "link" : "create", userId: me.id, after: { name: company.name, category: same ? undefined : category, from: id } }, tx);
      return { id: company.id, name: company.name, category: same ? (await tx.company.findUniqueOrThrow({ where: { id: company.id } })).category : category, leadCode: null };
    });
  }

  /**
   * A lead was written with a company that isn't in the sheet (M-01 2.1, 6.1): Telesales adds it right there with its
   * category; anyone else's goes to Telesales to add. Called by the leads module inside the lead's transaction.
   */
  async fromLead(tx: Prisma.TransactionClient, me: CurrentUser, lead: { id: string; code: string }, name: string, category: string | undefined) {
    if (category && keepsCompaniesSheet(me.roles)) {
      await this.checkCategory(category);
      const c = await tx.company.create({ data: { name, category, createdById: me.id } });
      await this.audit.record({ module: "leads", entity: "Company", entityId: c.id, action: "create", userId: me.id, after: { name, category, leadId: lead.id } }, tx);
      return { companyId: c.id, notify: false };
    }
    await tx.companyRequest.create({ data: { name, leadId: lead.id, byUserId: me.id } });
    return { companyId: null, notify: true };
  }

  notifyNew(name: string, code: string) {
    return this.notifications.notify({ event: "lead.new_company", text: `شركة جديدة «${name}» اتضافت في ليد ${code} · محتاجة تتضاف لشيت الشركات`, link: "/companies" });
  }

  private async checkCategory(category: string) {
    if (!activeValues((await this.settings.all()).companyCategories).includes(category)) throw new BadRequestException("الكاتيجوري دي مش في القايمة");
  }
}

const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
function toRow(c: Prisma.CompanyGetPayload<object>): CompanyRow {
  return {
    id: c.id, name: c.name, category: c.category, number: c.number, contactName: c.contactName, contactTitle: c.contactTitle, email: c.email,
    currentLocation: c.currentLocation, currentSpace: c.currentSpace, contractStart: day(c.contractStart), contractEnd: day(c.contractEnd),
    averageRent: c.averageRent?.toFixed(2) ?? null, annualEscalation: c.annualEscalation?.toFixed(2) ?? null, feedback: c.feedback, outbound: c.outbound,
    date: (c.contactedOn ?? c.createdAt).toISOString().slice(0, 10),
  };
}

/** The report's window when asked for (1.21): today to today + N days, Cairo calendar days. */
const ending = (f: CompanyFilters) => (f.endingWithin ? contractEndingWindow(localDate(new Date()), f.endingWithin) : undefined);
