import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CreateTicket, Paged, SlaReport, SlaReportQuery, TicketDetail, TicketFilters, TicketOptions, TicketReply, TicketRow, TicketSummary, TransferTicket } from "@places/contracts";
import {
  OPEN_TICKET_STATUSES, TICKET_TYPES, type WorkCalendar, dayStart, isTicketLate, localDate, slaReport, statusAfterReply, ticketDepartment, ticketType,
} from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { type TicketRecord, TicketsRepository } from "./tickets.repository";

/** Out of scope or gone: the same answer, so it doesn't tell whether the ticket exists. */
const NO_TICKET = "التذكرة دي مش موجودة أو مش من حقك تشوفها";
const SETTLED = ["Resolved", "Closed"];
const code = (n: number) => `TK-${n}`;
/** A system type (the Excuse, the List request) is decided in its own flow, so its status never moves from the tickets screen. */
const SYSTEM_TICKET = "الطلب ده بيتقرر من شاشته (الـ Excuse من الـ HR، والـ List من الانفنتوري)";
const link = (id: string) => `/tickets?id=${id}`;

/** M-06 use cases. The rules (routes, SLAs, lateness, the report) live in @places/domain. */
@Injectable()
export class TicketsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: TicketsRepository,
    private readonly audit: AuditService,
    private readonly time: BusinessTimeService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * M-06 4.1: a person sees the tickets they opened and the ones of their own department, never other departments'.
   * Whoever holds «tickets: approve» (the Super Admin by default) sees them all.
   */
  private scope(me: CurrentUser): Prisma.TicketWhereInput {
    if (seesAll(me)) return {};
    return { OR: [{ fromUserId: me.id }, ...(me.department ? [{ department: me.department }] : [])] };
  }

  async options(): Promise<TicketOptions> {
    return {
      types: TICKET_TYPES.filter((t) => !t.system).map((t) => ({ key: t.key, label: t.label, department: t.department, slaHours: t.slaHours, highSlaHours: t.highSlaHours })),
      departments: await this.departments(),
    };
  }

  async list(me: CurrentUser, f: TicketFilters): Promise<Paged<TicketRow>> {
    const scope: Prisma.TicketWhereInput = { AND: [this.scope(me), viewWhere(me, f.view), searchWhere(f.q)] };
    const cal = await this.time.calendar();
    const now = new Date();
    let rows: TicketRecord[], total: number;
    if (f.view === "late") {
      // lateness is counted in working time, so it's decided on the open tickets of the scope, not in SQL
      const late = (await this.repo.open(scope)).filter((t) => isTicketLate(t, now, cal));
      [rows, total] = [late.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), late.length];
    } else {
      const order: Prisma.TicketOrderByWithRelationInput[] = f.view === "closed" ? [{ createdAt: "desc" }] : [{ priority: "asc" }, { createdAt: "asc" }]; // 5.1: oldest and high first
      [rows, total] = await this.repo.page(scope, order, (f.page - 1) * f.pageSize, f.pageSize);
    }
    const names = await this.names(rows.map((r) => r.fromUserId));
    return { items: rows.map((r) => toRow(r, names, now, cal)), total, page: f.page, pageSize: f.pageSize };
  }

  /** The demo's four tiles: open, late, the average reply of my department this month, closed. */
  async summary(me: CurrentUser): Promise<TicketSummary> {
    const scope = this.scope(me);
    const [cal, open, closed] = await Promise.all([this.time.calendar(), this.repo.open(scope), this.repo.count({ AND: [scope, { status: "Closed" }] })]);
    const now = new Date();
    const dept = me.department;
    const avgReplyMinutes = dept ? (await this.report({}, now)).rows.find((r) => r.department === dept)?.avgReplyMinutes ?? null : null;
    return { open: open.length, late: open.filter((t) => isTicketLate(t, now, cal)).length, closed, department: dept, avgReplyMinutes };
  }

  async get(me: CurrentUser, id: string): Promise<TicketDetail> {
    const t = await this.repo.detail(this.scope(me), id);
    if (!t) throw new NotFoundException(NO_TICKET);
    const cal = await this.time.calendar();
    const names = await this.names([t.fromUserId, ...t.events.flatMap((e) => (e.byUserId ? [e.byUserId] : []))]);
    const open = OPEN_TICKET_STATUSES.includes(t.status), handler = handles(me, t.department);
    return {
      ...toRow(t, names, new Date(), cal),
      events: t.events.map((e) => ({ kind: e.kind, text: e.text, by: e.byUserId ? { id: e.byUserId, name: names.get(e.byUserId) ?? "—" } : null, at: e.at.toISOString() })),
      can: { reply: open && (handler || t.fromUserId === me.id), handle: open && handler, transfer: open && handler, close: handler && t.status === "Resolved" },
    };
  }

  /** M-06 2.1: open a ticket; the type decides the department (2.2), the department is told. */
  async create(me: CurrentUser, input: CreateTicket): Promise<{ id: string; code: string }> {
    const type = ticketType(input.type)!; // the contract already refused unknown types
    const department = ticketDepartment(type, input.department);
    if (!department) throw new BadRequestException("اختار القسم");
    if (!type.department && !(await this.departments()).includes(department)) throw new BadRequestException("القسم ده مش في قايمة أقسام التذاكر");
    const created = await this.db.$transaction(async (tx) => {
      const t = await this.repo.create(tx, { type: type.key, department, title: input.title, priority: input.priority, fromUserId: me.id });
      await this.repo.addEvent(tx, t.id, "open", "اتفتحت", me.id);
      await this.audit.record({ module: "tickets", entity: "Ticket", entityId: t.id, action: "create", userId: me.id, after: { type: type.key, department, priority: input.priority, title: input.title } }, tx);
      return t;
    });
    await this.tellDepartment(department, me.id, `تذكرة جديدة لقسمك: ${input.title}`, created.id);
    return { id: created.id, code: code(created.number) };
  }

  /**
   * For a module whose flow lives elsewhere (the Excuse, 7.4): open a system ticket inside the caller's transaction,
   * add a line to its history, and settle it — so it shows in tickets and the response report, with its history.
   */
  async openSystem(tx: Prisma.TransactionClient, t: { type: string; title: string; fromUserId: string; text: string }) {
    const type = ticketType(t.type);
    if (!type?.system || !type.department) throw new BadRequestException("نوع التذكرة مش موجود");
    const created = await this.repo.create(tx, { type: type.key, department: type.department, title: t.title, priority: "normal", fromUserId: t.fromUserId });
    await this.repo.addEvent(tx, created.id, "open", t.text, t.fromUserId);
    return { id: created.id, code: code(created.number) };
  }

  async noteSystem(tx: Prisma.TransactionClient, id: string, text: string, byUserId: string, firstReply = false) {
    await this.repo.addEvent(tx, id, "reply", text, byUserId);
    if (firstReply) await tx.ticket.updateMany({ where: { id, firstReplyAt: null }, data: { firstReplyAt: new Date() } });
  }

  async settleSystem(tx: Prisma.TransactionClient, id: string, text: string, byUserId: string) {
    const now = new Date();
    await tx.ticket.update({ where: { id }, data: { status: "Closed", resolvedAt: now, closedAt: now } });
    await tx.ticket.updateMany({ where: { id, firstReplyAt: null }, data: { firstReplyAt: now } });
    await this.repo.addEvent(tx, id, "close", text, byUserId);
  }

  /** A reply from the department or from whoever opened it; the department's reply can move the status (3.3). */
  async reply(me: CurrentUser, id: string, input: TicketReply) {
    const t = await this.openTicket(me, id);
    const handler = handles(me, t.department);
    if (!handler && t.fromUserId !== me.id) throw new ForbiddenException("الرد للقسم المسؤول ولصاحب التذكرة بس");
    if (input.status && !handler) throw new ForbiddenException("الحالة بيغيّرها القسم المسؤول");
    if (input.status && ticketType(t.type)?.system) throw new BadRequestException(SYSTEM_TICKET);
    const now = new Date();
    const status = statusAfterReply(t.status, handler, input.status);
    const firstReply = handler && t.fromUserId !== me.id && !t.firstReplyAt; // M-06 3.2: the department's first reply
    await this.db.$transaction(async (tx) => {
      const data = { status, ...(firstReply ? { firstReplyAt: now } : {}), ...(status === "Resolved" ? { resolvedAt: now } : {}) };
      if ((await this.repo.update(tx, t.id, t.status, data)).count === 0) throw new ConflictException("التذكرة اتغيّرت دلوقتي · افتحها تاني");
      await this.repo.addEvent(tx, t.id, "reply", input.text, me.id);
      if (status !== t.status) await this.repo.addEvent(tx, t.id, "status", `الحالة بقت ${status}`, me.id);
      await this.audit.record({ module: "tickets", entity: "Ticket", entityId: t.id, action: "reply", userId: me.id, before: { status: t.status }, after: { status, text: input.text } }, tx);
    });
    return this.get(me, id);
  }

  /** M-06 2.3: sent to the wrong department → the department moves it, it stays open and its history stays. */
  async transfer(me: CurrentUser, id: string, input: TransferTicket) {
    const t = await this.openTicket(me, id);
    if (!handles(me, t.department)) throw new ForbiddenException("التحويل للقسم المسؤول بس");
    if (ticketType(t.type)?.system) throw new BadRequestException(SYSTEM_TICKET);
    if (input.department === t.department) throw new BadRequestException("التذكرة في القسم ده أصلاً");
    if (!(await this.departments()).includes(input.department)) throw new BadRequestException("القسم ده مش في قايمة أقسام التذاكر");
    await this.db.$transaction(async (tx) => {
      if ((await this.repo.update(tx, t.id, t.status, { department: input.department })).count === 0) throw new ConflictException("التذكرة اتغيّرت دلوقتي · افتحها تاني");
      await this.repo.addEvent(tx, t.id, "transfer", `اتحوّلت من ${t.department} لـ ${input.department}`, me.id);
      await this.audit.record({ module: "tickets", entity: "Ticket", entityId: t.id, action: "transfer", userId: me.id, before: { department: t.department }, after: { department: input.department } }, tx);
    });
    await this.tellDepartment(input.department, me.id, `تذكرة اتحوّلت لقسمك: ${t.title}`, t.id);
    return { ok: true };
  }

  /** M-06 7.2 (35): the department that did the work closes it. */
  async close(me: CurrentUser, id: string) {
    const t = await this.repo.detail(this.scope(me), id);
    if (!t) throw new NotFoundException(NO_TICKET);
    if (!handles(me, t.department)) throw new ForbiddenException("القسم اللي نفّذ الطلب هو اللي يقفل التذكرة");
    if (ticketType(t.type)?.system) throw new BadRequestException(SYSTEM_TICKET);
    if (t.status !== "Resolved") throw new BadRequestException("خلّص الطلب الأول (Resolved) وبعدين اقفلها");
    await this.db.$transaction(async (tx) => {
      if ((await this.repo.update(tx, t.id, t.status, { status: "Closed", closedAt: new Date() })).count === 0) throw new ConflictException("التذكرة اتغيّرت دلوقتي · افتحها تاني");
      await this.repo.addEvent(tx, t.id, "close", `قسم ${t.department} نفّذ الطلب وقفل التذكرة`, me.id);
      await this.audit.record({ module: "tickets", entity: "Ticket", entityId: t.id, action: "close", userId: me.id, before: { status: t.status }, after: { status: "Closed" } }, tx);
    });
    return this.get(me, id);
  }

  /** M-06 6.1 · per department, for a month (Cairo): closed in the SLA ÷ all tickets opened, and the average reply. */
  async report(q: SlaReportQuery, now = new Date()): Promise<SlaReport> {
    const month = q.month ?? localDate(now).slice(0, 7);
    const [y, m] = month.split("-").map(Number) as [number, number];
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const [cal, tickets, departments] = await Promise.all([this.time.calendar(), this.repo.openedBetween(dayStart(`${month}-01`), dayStart(`${next}-01`)), this.departments()]);
    return { month, rows: slaReport(tickets, departments, cal) };
  }

  private async openTicket(me: CurrentUser, id: string) {
    const t = await this.repo.detail(this.scope(me), id);
    if (!t) throw new NotFoundException(NO_TICKET);
    if (!OPEN_TICKET_STATUSES.includes(t.status)) throw new BadRequestException("التذكرة دي اتقفلت");
    return t;
  }

  /** «أقسام التذاكر» (M-13), the active ones. */
  private async departments(): Promise<string[]> {
    return (await this.settings.all()).ticketDepts.filter((d) => d.active).map((d) => d.value);
  }

  /** A new ticket for a department: its people are told (not whoever opened it). A system type links to its own screen. */
  async tellDepartment(department: string, exceptUserId: string, text: string, id: string, to = link(id)) {
    const userIds = (await this.repo.departmentPeople(department)).filter((u) => u !== exceptUserId);
    if (userIds.length) await this.notifications.notify({ event: "ticket.new", text, link: to, userIds });
  }

  /** Tickets' codes (TK-…) by id, for a module that shows the ticket its record opened (the List request, 2.32). */
  async codes(ids: string[]): Promise<Map<string, string>> {
    return new Map((ids.length ? await this.db.ticket.findMany({ where: { id: { in: ids } }, select: { id: true, number: true } }) : []).map((t) => [t.id, code(t.number)]));
  }

  private async names(userIds: string[]): Promise<Map<string, string>> {
    return new Map((await this.repo.names(userIds)).map((u) => [u.id, u.employee?.name ?? u.email]));
  }
}

const seesAll = (me: CurrentUser) => me.grants.can("tickets", "approve");
/** The department the ticket is with (or whoever sees every ticket) answers, transfers and closes it. */
const handles = (me: CurrentUser, department: string) => seesAll(me) || me.department === department;

function viewWhere(me: CurrentUser, view: TicketFilters["view"]): Prisma.TicketWhereInput {
  switch (view) {
    case "mine": return { fromUserId: me.id };
    case "assigned": return { department: me.department ?? "—" };
    case "closed": return { status: { in: SETTLED } };
    default: return {};
  }
}

function searchWhere(q: string | undefined): Prisma.TicketWhereInput {
  if (!q) return {};
  const n = q.match(/^(?:tk-?)?(\d+)$/i);
  if (n) return { number: Number(n[1]) };
  return { title: { contains: q, mode: "insensitive" } };
}

function toRow(t: TicketRecord, names: Map<string, string>, now: Date, cal: WorkCalendar): TicketRow {
  return {
    id: t.id, code: code(t.number), type: t.type, typeLabel: ticketType(t.type)?.label ?? t.type, department: t.department, title: t.title,
    priority: t.priority, status: t.status, from: { id: t.fromUserId, name: names.get(t.fromUserId) ?? "—" }, createdAt: t.createdAt.toISOString(),
    firstReplyAt: t.firstReplyAt?.toISOString() ?? null, late: isTicketLate(t, now, cal), events: t._count.events,
  };
}
