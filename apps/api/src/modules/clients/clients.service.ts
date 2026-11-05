import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { AskDeletion, ClientDeal, ClientFile, ClientFilters, ClientRow, ClientSummary, LogInteraction, Paged, SetConsent, TimelineItem } from "@places/contracts";
import { allowedValue, fromDecimal, isStale, normalizePhone, partyBalance, showsNumbers, staleBefore, toDecimal, withRole, type ClientRole, type DealStatus } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { ownedBy } from "../../core/authz/scope";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { ClientsRepository, type ClientRowRecord, type FileDealRecord } from "./clients.repository";

const NO_CLIENT = "الملف ده مش موجود أو مش معاك";
/** The «أنواع التواصل» value that counts as the owner's update (default list, M-13; locked in the demo's wording). */
const OWNER_UPDATE = "ابديت مع المالك";

/**
 * M-10 · one file per client and owner. The list and the file read through the reader's scope (sales: the clients of
 * their own leads, M-10 4.1); the leads and inventory modules call joinAsClient / joinAsOwner inside their own
 * transaction so the file is made (or found by number) together with the change that makes it.
 */
@Injectable()
export class ClientsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: ClientsRepository,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(me: CurrentUser, f: ClientFilters): Promise<Paged<ClientRow>> {
    const [rows, total] = await this.repo.list(visibleTo(me), f, staleBefore(new Date()));
    const deals = await this.repo.dealsOf(rows.map((r) => r.id));
    return { items: rows.map((r) => toRow(r, deals.filter((d) => belongs(d, r.id)).length, me)), total, page: f.page, pageSize: f.pageSize };
  }

  async summary(me: CurrentUser): Promise<ClientSummary> {
    const [clients, owners, ownersStale, both] = await this.repo.summary(visibleTo(me), staleBefore(new Date()));
    return { clients, owners, ownersStale, both };
  }

  async file(me: CurrentUser, id: string): Promise<ClientFile> {
    const c = await this.repo.file(visibleTo(me), id);
    if (!c) throw new NotFoundException(NO_CLIENT);
    const now = new Date();
    const deals = (await this.repo.dealsOf([id])).map((d) => toDeal(d, id));
    const contracts = await this.repo.contracts(deals.map((d) => d.id));
    const names = new Map((await this.repo.userNames([...new Set([...c.interactions.map((i) => i.byId), ...(c.deletionAskedBy ? [c.deletionAskedBy] : [])])])).map((e) => [e.userId, e.name]));
    const balance = partyBalance(deals.map((d) => ({ status: d.status as DealStatus, due: fromDecimal(d.due), paid: fromDecimal(d.paid) })));
    const units = c.units.map((u) => ({ ...u, lastOwnerUpdateAt: u.lastOwnerUpdateAt.toISOString(), stale: isStale(u.lastOwnerUpdateAt, now) }));
    const codeOf = new Map(deals.map((d) => [d.id, d.code]));
    const timeline: TimelineItem[] = [
      ...c.interactions.map((i) => ({ at: i.at.toISOString(), text: `${i.kind}: ${i.text}`, by: names.get(i.byId) ?? null })),
      ...deals.map((d) => ({ at: d.closedAt, text: `صفقة ${d.code} على ${d.unit}`, by: null })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      ...toRow(c, deals.length, me), preferredContact: c.preferredContact, units, deals, marketingConsent: c.marketingConsent,
      deletionAsked: c.deletionAskedAt ? { at: c.deletionAskedAt.toISOString(), by: c.deletionAskedBy ? names.get(c.deletionAskedBy) ?? null : null, reason: c.deletionReason ?? "" } : null,
      contracts: contracts.map((k) => ({ id: k.id, code: k.code, deal: codeOf.get(k.dealId) ?? "", startsOn: day(k.startsOn), endsOn: day(k.endsOn), status: k.status })),
      leads: c.leads.map((l) => ({ id: l.id, code: l.code, stage: l.stage, createdAt: l.createdAt.toISOString() })),
      balance: { paid: toDecimal(balance.paid), remaining: toDecimal(balance.remaining) },
      timeline, interactionKinds: (await this.settings.all()).interactionTypes.filter((k) => k.active).map((k) => k.value),
    };
  }

  /** M-10 2.1 step 5: a call, a visit, a complaint… on a file the reader sees; it counts as dealing with them (3.3). */
  async logInteraction(me: CurrentUser, id: string, input: LogInteraction) {
    const kinds = (await this.settings.all()).interactionTypes;
    if (!allowedValue(kinds, input.kind)) throw new BadRequestException("اختار نوع التواصل من القايمة");
    return this.db.$transaction(async (tx) => {
      const c = await tx.client.findFirst({ where: { AND: [visibleTo(me), { id, archivedAt: null }] }, select: { id: true, status: true } });
      if (!c) throw new NotFoundException(NO_CLIENT);
      const row = await this.repo.addInteraction(tx, { clientId: id, kind: input.kind, text: input.text, byId: me.id });
      await tx.client.update({ where: { id }, data: { lastContactAt: row.at, status: "active" } });
      await this.audit.record({ module: "clients", entity: "ClientInteraction", entityId: row.id, action: "create", userId: me.id, after: row }, tx);
      // demo clients.js: «ابديت مع المالك» is the owner's monthly update (M-10 2.4 = M-03 «last update») for all their units
      if (input.kind === OWNER_UPDATE) {
        const units = await this.repo.touchOwnerUnits(tx, id, row.at);
        for (const u of units) {
          await this.audit.record({ module: "inventory", entity: "Unit", entityId: u.id, action: "update", userId: me.id, before: { lastOwnerUpdateAt: u.lastOwnerUpdateAt }, after: { lastOwnerUpdateAt: row.at } }, tx);
        }
      }
      return { id: row.id, at: row.at.toISOString() };
    });
  }

  /** M-10 3.1 «موافقة على التواصل التسويقي»: written by sales (and whoever edits files), audited old → new. */
  async setConsent(me: CurrentUser, id: string, input: SetConsent) {
    await this.db.$transaction(async (tx) => {
      const c = await tx.client.findFirst({ where: { AND: [visibleTo(me), { id }] }, select: { marketingConsent: true } });
      if (!c) throw new NotFoundException(NO_CLIENT);
      if (c.marketingConsent === input.consent) return;
      await tx.client.update({ where: { id }, data: { marketingConsent: input.consent } });
      await this.audit.record({ module: "clients", entity: "Client", entityId: id, action: "update", userId: me.id, before: { marketingConsent: c.marketingConsent }, after: { marketingConsent: input.consent } }, tx);
    });
  }

  /**
   * M-10 2.3: «عميل عايز يمسح بياناته: الطلب بيروح للإدارة (حماية البيانات)». The request is recorded on the file and
   * management is told; what management then does with it isn't settled by the client yet, so nothing is erased here.
   */
  async askDeletion(me: CurrentUser, id: string, input: AskDeletion) {
    const c = await this.db.$transaction(async (tx) => {
      const file = await tx.client.findFirst({ where: { AND: [visibleTo(me), { id }] }, select: { name: true, deletionAskedAt: true } });
      if (!file) throw new NotFoundException(NO_CLIENT);
      if (file.deletionAskedAt) throw new BadRequestException("طلب مسح البيانات اتبعت للإدارة قبل كده");
      const at = new Date();
      await tx.client.update({ where: { id }, data: { deletionAskedAt: at, deletionAskedBy: me.id, deletionReason: input.reason } });
      await this.audit.record({ module: "clients", entity: "Client", entityId: id, action: "deletion-request", userId: me.id, after: { deletionAskedAt: at, reason: input.reason } }, tx);
      return file;
    });
    await this.notifications.notify({ event: "client.deletion", text: `${c.name} طالب يمسح بياناته (حماية البيانات) · ${input.reason} · من ${me.name}`, link: "/clients" });
  }

  /**
   * M-10 2.1 / 7.1: a lead reached Done Deal → its client file. A number that's already on a file joins that file
   * (an owner who rents becomes «both»); otherwise a new file. Runs in the caller's transaction.
   */
  async joinAsClient(tx: Prisma.TransactionClient, by: string, lead: { id: string; name: string; phones: string[]; company: string | null }) {
    const clientId = await this.join(tx, by, "client", { name: lead.name, company: lead.company, phones: lead.phones });
    await tx.lead.update({ where: { id: lead.id }, data: { clientId } });
    return clientId;
  }

  /** M-10 2.3: a new lead whose number is on a file belongs to it, so the salesperson sees the history. */
  async fileOf(tx: Prisma.TransactionClient, phones: string[]): Promise<string | null> {
    const found = await this.repo.byPhones(tx, normalized(phones));
    return found[0]?.client.id ?? null;
  }

  private async join(tx: Prisma.TransactionClient, by: string, role: ClientRole, p: { name: string; company: string | null; phones: string[] }) {
    const phones = normalized(p.phones);
    const known = await this.repo.byPhones(tx, phones);
    const now = new Date();
    const old = known[0]?.client;
    if (old) {
      // the person's numbers are on more than one file: suggested to Operations as a merge (M-10 2.2)
      for (const other of new Set(known.map((k) => k.client.id).filter((x) => x !== old.id))) {
        const m = await this.repo.suggestMerge(tx, old.id, other, `نفس الشخص: ${p.name} · أرقامه على ملفين`);
        if (m) await this.audit.record({ module: "clients", entity: "ClientMerge", entityId: m.id, action: "create", userId: by, after: m }, tx);
      }
      // only numbers nobody has yet are added: a number on another file is for Operations' merge (M-10 2.2)
      const fresh = phones.filter((ph) => !known.some((k) => k.phone === ph));
      const kind = withRole(old.kind, role);
      await tx.client.update({ where: { id: old.id }, data: { kind, status: "active", lastContactAt: now, phones: { create: fresh.map((phone) => ({ phone })) } } });
      if (kind !== old.kind || fresh.length) {
        await this.audit.record({ module: "clients", entity: "Client", entityId: old.id, action: "update", userId: by, before: { kind: old.kind }, after: { kind, phones: fresh } }, tx);
      }
      return old.id;
    }
    const c = await tx.client.create({
      data: { name: p.name, company: p.company, kind: role, createdById: by, lastContactAt: now, phones: { create: phones.map((phone) => ({ phone })) } },
    });
    await this.audit.record({ module: "clients", entity: "Client", entityId: c.id, action: "create", userId: by, after: { ...c, phones } }, tx);
    return c.id;
  }
}

/**
 * Who sees which file (M-10 4.1): sales the clients of their own leads (their team's for a Team Leader); Inventory,
 * Operations, management and finance every file. The data scope is the role's, inside the query.
 */
export function visibleTo(me: CurrentUser): Prisma.ClientWhereInput {
  const own = ownedBy(me);
  return { archivedAt: null, ...(Object.keys(own).length ? { leads: { some: own } } : {}) };
}

/** PENDING_REVIEW → «Pending Review»: the deal statuses the team uses (M-02). */
const dealStatus = (db: string) => db.toLowerCase().split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ") as DealStatus;
const normalized = (phones: string[]) => [...new Set(phones.map(normalizePhone).filter((p): p is string => p !== null))];
const day = (d: Date) => d.toISOString().slice(0, 10);
const belongs = (d: FileDealRecord, id: string) => d.lead?.clientId === id || d.unit.ownerId === id;

/** Owners' numbers never leave the API for people who may not see them (M-10 4.1), not just hidden on the screen. */
function toRow(r: ClientRowRecord, deals: number, me: CurrentUser): ClientRow {
  return {
    id: r.id, name: r.name, company: r.company, kind: r.kind, status: r.status, phones: showsNumbers(r.kind, me.grants) ? r.phones.map((p) => p.phone) : null,
    units: r._count.units, deals, lastContactAt: r.lastContactAt.toISOString(),
  };
}

/** One deal as this file's person sees it: the client commission if they're the client, the owner's if it's their unit. */
function toDeal(d: FileDealRecord, id: string): ClientDeal {
  const side = d.lead?.clientId === id ? "client" : "owner";
  const due = side === "client" ? d.commissionClient : d.commissionOwner;
  const paid = d.payments.filter((p) => p.side === side).reduce((s, p) => s + fromDecimal(p.amount.toFixed(2)), 0);
  return {
    id: d.id, code: d.code, unit: d.unit.code, type: d.type, status: dealStatus(d.status), closedAt: d.closedAt.toISOString(),
    side, due: due.toFixed(2), paid: toDecimal(paid),
  };
}
