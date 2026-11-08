import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { ClientMergeRow, DecideMerge, SuggestMerge } from "@places/contracts";
import { mergedFile, normalizePhone } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ClientsRepository } from "./clients.repository";
import { visibleTo } from "./clients.service";

const NO_MERGE = "طلب الدمج ده مش موجود أو اتقرر قبل كده";

/**
 * M-10 2.2: two files of the same person are merged only with Operations' approval. Anyone who edits files suggests
 * one by the other file's number (the system suggests one too when a deal's numbers are on two files); Operations
 * approves → everything of the dropped file moves into the kept one, audited before and after; or rejects.
 */
@Injectable()
export class ClientMergesService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: ClientsRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async pending(me: CurrentUser): Promise<ClientMergeRow[]> {
    // M-09: numbers hidden from the reader are left out, from the files and from the reason («نفس الموبايل 010…»)
    const noNumbers = me.fields.hidden("clients").has("phones");
    const rows = await this.repo.pendingMerges();
    const files = new Map((await this.repo.mergeSides(rows.flatMap((r) => [r.keepId, r.dropId]))).map((c) => [c.id, { id: c.id, name: c.name, kind: c.kind, phones: noNumbers ? [] : c.phones.map((p) => p.phone) }]));
    const names = new Map((await this.repo.userNames(rows.flatMap((r) => (r.suggestedById ? [r.suggestedById] : [])))).map((e) => [e.userId, e.name]));
    return rows.flatMap((r) => {
      const keep = files.get(r.keepId), drop = files.get(r.dropId);
      return keep && drop ? [{ id: r.id, keep, drop, reason: noNumbers ? r.reason.replace(/\+?\d[\d ]{4,}/g, "").trim() : r.reason, by: r.suggestedById ? names.get(r.suggestedById) ?? null : null, at: r.createdAt.toISOString() }] : [];
    });
  }

  /** «ادمج بالموبايل»: the file the reader is on stays; the one with that number moves into it once Operations approves. */
  async suggest(me: CurrentUser, keepId: string, input: SuggestMerge) {
    // M-09: with the numbers hidden, the answer («مفيش ملف بالرقم ده») would tell which numbers are on a file
    if (me.fields.hidden("clients").has("phones")) throw new ForbiddenException("الحقل ده مقفول عليك");
    const phone = normalizePhone(input.phone);
    if (!phone) throw new BadRequestException("الرقم غلط");
    const created = await this.db.$transaction(async (tx) => {
      const keep = await tx.client.findFirst({ where: { AND: [visibleTo(me), { id: keepId }] }, select: { id: true, name: true } });
      if (!keep) throw new NotFoundException("الملف ده مش موجود أو مش معاك");
      const [other] = await this.repo.byPhones(tx, [phone]);
      if (!other) throw new BadRequestException("مفيش ملف بالرقم ده");
      if (other.client.id === keep.id) throw new BadRequestException("الرقم ده على نفس الملف");
      if (await this.repo.openMerge(tx, keep.id, other.client.id)) throw new BadRequestException("فيه طلب دمج للملفين دول مستني الأوبريشن");
      const m = await tx.clientMerge.create({ data: { keepId: keep.id, dropId: other.client.id, reason: `نفس الموبايل ${phone}`, suggestedById: me.id } });
      await this.audit.record({ module: "clients", entity: "ClientMerge", entityId: m.id, action: "create", userId: me.id, after: m }, tx);
      return { id: m.id, name: keep.name };
    });
    await this.notifications.notify({ event: "client.merge", text: `اقتراح دمج ملف ${created.name} مع ملف تاني بنفس الموبايل · مستني الأوبريشن`, link: "/clients" });
    return { id: created.id };
  }

  async decide(me: CurrentUser, id: string, input: DecideMerge) {
    await this.db.$transaction(async (tx) => {
      const m = await tx.clientMerge.findFirst({ where: { id, status: "pending" } });
      if (!m) throw new NotFoundException(NO_MERGE);
      const decided = { decidedById: me.id, decidedAt: new Date() };
      if (input.decision === "reject") {
        await tx.clientMerge.update({ where: { id }, data: { status: "rejected", ...decided } });
        await this.audit.record({ module: "clients", entity: "ClientMerge", entityId: id, action: "reject", userId: me.id, before: { status: "pending" }, after: { status: "rejected" } }, tx);
        return;
      }
      const [keep, drop] = await Promise.all([this.repo.snapshot(tx, m.keepId), this.repo.snapshot(tx, m.dropId)]);
      if (!keep || !drop) throw new BadRequestException("واحد من الملفين اتدمج أو اتشال · ارفض الطلب ده");
      const after = mergedFile(keep, drop);
      await this.repo.moveInto(tx, drop.id, keep.id);
      await tx.client.update({ where: { id: keep.id }, data: after });
      await tx.client.update({ where: { id: drop.id }, data: { archivedAt: new Date(), mergedIntoId: keep.id } });
      await tx.clientMerge.update({ where: { id }, data: { status: "approved", ...decided } });
      // before and after (M-10 2.2): both files as they were, and the kept file as it is now
      await this.audit.record({ module: "clients", entity: "Client", entityId: keep.id, action: "merge", userId: me.id, before: { keep, drop }, after: { ...after, id: keep.id, mergedFrom: drop.id } }, tx);
    });
  }
}
