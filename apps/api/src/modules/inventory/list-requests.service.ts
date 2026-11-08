import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { ListRequestInput, ListRequestRow, ListRequests, SendListInput } from "@places/contracts";
import { asksForLists, ticketType, unconfirmedUnits } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { TicketsService } from "../tickets/tickets.service";
import { InventoryRepository } from "./inventory.repository";

/** The department the «list» ticket goes to (2.19): the inventory team prepares the Lists. */
const LIST_DEPARTMENT = ticketType("list")!.department!;
const NOT_FOUND = "طلب الـ List ده مش موجود";
/** Where both ends see their requests: the TL from the leads page, the inventory team from the units page. */
const TL_LINK = "/leads?lists=1", TEAM_LINK = "/inventory?lists=1";

/**
 * 2.32 · M-12 (Marwa's card 2 · 3): «طلبات الـ Team Leaders من الـ Lists خلال 24 ساعة · صفر وحدات مش مؤكدة». A TL
 * asks (demo leads.js «اطلب List من الانفنتوري»), which opens a «list» ticket for the inventory team (its SLA and
 * history, 2.19); Marwa picks the open, confirmed units and sends it (invwork.js «جهّز وابعت»), which settles the
 * ticket. The request keeps when it was sent and how many units weren't confirmed: the KPI job reads them.
 */
@Injectable()
export class ListRequestsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: InventoryRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tickets: TicketsService,
  ) {}

  /** A TL sees their own requests; the inventory team (and whoever sees every ticket) all of them, newest first. */
  async list(me: CurrentUser): Promise<ListRequests> {
    const canSend = prepares(me);
    const rows = await this.db.listRequest.findMany({ where: canSend ? {} : { requestedBy: me.id }, orderBy: { createdAt: "desc" }, take: 100 });
    const people = [...new Set(rows.flatMap((r) => [r.requestedBy, ...(r.doneById ? [r.doneById] : [])]))];
    const [names, codes] = await Promise.all([
      people.length ? this.db.employee.findMany({ where: { userId: { in: people } }, select: { userId: true, name: true } }) : [],
      this.tickets.codes(rows.flatMap((r) => (r.ticketId ? [r.ticketId] : []))),
    ]);
    const name = new Map(names.map((e) => [e.userId!, e.name]));
    const person = (id: string) => ({ id, name: name.get(id) ?? "—" });
    const items: ListRequestRow[] = rows.map((r) => ({
      id: r.id, text: r.text, by: person(r.requestedBy), createdAt: r.createdAt.toISOString(), ticketCode: r.ticketId ? codes.get(r.ticketId) ?? null : null,
      doneAt: r.doneAt?.toISOString() ?? null, doneBy: r.doneById ? person(r.doneById) : null, units: r.unitCodes, unconfirmed: r.unconfirmed,
    }));
    return { items, canAsk: asksForLists(me.roles, me.grants), canSend };
  }

  /** «اطلب»: the request and its ticket in one transaction; the inventory team is told. */
  async ask(me: CurrentUser, input: ListRequestInput): Promise<{ id: string }> {
    if (!asksForLists(me.roles, me.grants)) throw new ForbiddenException("طلب الـ List للـ Team Leader");
    const r = await this.db.$transaction(async (tx) => {
      const ticket = await this.tickets.openSystem(tx, { type: "list", title: `List · ${input.text}`, fromUserId: me.id, text: input.text });
      const made = await tx.listRequest.create({ data: { requestedBy: me.id, text: input.text, ticketId: ticket.id } });
      await this.audit.record({ module: "inventory", entity: "ListRequest", entityId: made.id, action: "create", userId: me.id, after: { text: input.text, ticket: ticket.code } }, tx);
      return made;
    });
    await this.tickets.tellDepartment(LIST_DEPARTMENT, me.id, `طلب List من ${me.name}: ${input.text}`, r.ticketId!, TEAM_LINK);
    return { id: r.id };
  }

  /**
   * «جهّز وابعت»: the units must be open and confirmed by Manar (Q15, what sales may be sent). A unit without an owner
   * update for a month is «مش مؤكدة»: refused unless sent anyway after the warning, and counted (Marwa's quality).
   */
  async send(me: CurrentUser, id: string, input: SendListInput): Promise<void> {
    if (!prepares(me)) throw new ForbiddenException("الـ List بيجهّزها فريق الانفنتوري");
    const r = await this.db.listRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(NOT_FOUND);
    if (r.doneAt) throw new BadRequestException("الـ List دي اتبعتت قبل كده");
    const found = new Map((await this.repo.forList(input.unitIds)).map((u) => [u.id, u]));
    if (input.unitIds.some((u) => !found.has(u))) throw new BadRequestException("فيه وحدة مش متاحة أو الـ PDF بتاعها لسه ماتأكدش");
    const units = input.unitIds.map((u) => found.get(u)!), codes = units.map((u) => u.code), now = new Date();
    const bad = unconfirmedUnits(units, now);
    if (bad.length && !input.sendAnyway) throw new BadRequestException(`${bad.join("، ")} مش مؤكدة (عدّى عليها شهر من غير ابديت). تبعتها برضه؟`);
    await this.db.$transaction(async (tx) => {
      const done = await tx.listRequest.updateMany({ where: { id, doneAt: null }, data: { unitCodes: codes, unconfirmed: bad.length, doneById: me.id, doneAt: now } });
      if (done.count === 0) throw new ConflictException("الـ List دي اتبعتت دلوقتي");
      if (r.ticketId) await this.tickets.settleSystem(tx, r.ticketId, `الـ List اتبعتت: ${codes.join("، ")}`, me.id);
      await this.audit.record({ module: "inventory", entity: "ListRequest", entityId: id, action: "send", userId: me.id, after: { units: codes, unconfirmed: bad } }, tx);
    });
    await this.notifications.notify({ event: "list.sent", text: `الـ List بتاعة «${r.text}» جاهزة: ${codes.join("، ")}`, link: TL_LINK, userIds: [r.requestedBy] });
  }
}

/** The department the List ticket is with prepares it (the tickets' own rule, M-06 7.2), or whoever sees every ticket. */
const prepares = (me: CurrentUser) => me.department === LIST_DEPARTMENT || me.grants.can("tickets", "approve");
