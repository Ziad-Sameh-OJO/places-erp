import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { BroadcastBoard, BroadcastDone, BroadcastImage, BroadcastInput, MyBroadcast, TodayLine } from "@places/contracts";
import { BROADCASTS_PER_WEEK, broadcastsThisWeek, dayStart, localDate, whatsappLimitTone, whatsappSentToday } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "../inventory/inventory.service";
import { SettingsService } from "../settings/settings.service";

const NO_BROADCAST = "الـ Broadcast ده مش موجود";
/** M-04 1.2 · 4.1: the Broadcast goes to sales; they see only their own Broadcast tasks. */
const SALES_ROLE = "sales";
const BOARD_SIZE = 50;
/** system.File.entity of a Broadcast's images (M-04 2.1 step 7 «صورة»). */
const BROADCAST = "Broadcast";

/**
 * M-04 · the Broadcast (2.1 steps 7-8, 2.2, 2.3): Rahma's message with its Hot Inventory goes to every salesperson
 * as a task; each presses Done (= sent, 24), noting other units they broadcast; Rahma sees who did what.
 */
@Injectable()
export class BroadcastsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
  ) {}

  /** 0.18 · demo home.js «Broadcast مستني موافقتك»: the messages waiting for the marketing manager's approval. */
  async waiting(): Promise<TodayLine[]> {
    const rows = await this.db.broadcast.findMany({ where: { approved: false }, orderBy: { createdAt: "asc" }, select: { id: true, text: true } });
    return rows.map((b) => ({ kind: "broadcastApprove", tone: "warn", id: b.id, values: { text: b.text } }));
  }

  async board(now = new Date()): Promise<BroadcastBoard> {
    const [rows, sales, donesToday, settings] = await Promise.all([
      this.db.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: BOARD_SIZE, include: { sends: { orderBy: { doneAt: "asc" } } } }),
      this.salesIds(),
      this.db.broadcastSend.count({ where: { doneAt: { gte: dayStart(localDate(now)) } } }), // the whole company's, today (Cairo)
      this.settings.all(),
    ]);
    const sentToday = whatsappSentToday(donesToday), limit = settings.whatsappDailyLimit;
    const names = await this.names(rows.flatMap((b) => b.sends.map((s) => s.userId)));
    const [codes, images] = await Promise.all([this.codes(rows.flatMap((b) => b.hotUnitIds)), this.images(rows.map((b) => b.id))]);
    return {
      items: rows.map((b) => ({
        id: b.id, text: b.text, images: images.get(b.id) ?? [], approved: b.approved, createdAt: b.createdAt.toISOString(),
        hotUnits: b.hotUnitIds.map((id) => ({ id, code: codes.get(id) ?? "—" })),
        sent: b.sends.map((s) => ({ id: s.userId, name: names.get(s.userId) ?? "—", otherUnits: s.otherUnits, doneAt: s.doneAt.toISOString() })),
        pending: sales.filter((id) => !b.sends.some((s) => s.userId === id)).length,
      })),
      week: { sent: broadcastsThisWeek(rows.map((b) => ({ createdAt: b.createdAt, approved: b.approved, hotUnits: b.hotUnitIds.length })), now), of: BROADCASTS_PER_WEEK },
      whatsapp: { sent: sentToday, limit, tone: whatsappLimitTone(sentToday, limit) },
    };
  }

  /** The Hot Inventory to pick from: open units confirmed for sales (Q15), by code, project or space. */
  hotUnits(me: CurrentUser, q?: string) {
    return this.inventory.forHot(me, q);
  }

  /** M-04 2.2 «(مقترح)»: a Broadcast from someone who can't approve waits for the marketing manager before reaching sales. */
  async create(me: CurrentUser, input: BroadcastInput): Promise<{ id: string }> {
    const open = await this.inventory.openForVisit(input.hotUnitIds);
    if (open.size !== new Set(input.hotUnitIds).size) throw new BadRequestException("فيه وحدة في الـ Hot Inventory مش متاحة للسيلز");
    const pics = await this.files.names(input.imageFileIds);
    if (pics.some((f) => !f.mime.startsWith("image/"))) throw new BadRequestException("الـ Broadcast بياخد صور بس");
    const approved = me.grants.can("marketing", "approve");
    const b = await this.db.$transaction(async (tx) => {
      const created = await tx.broadcast.create({ data: { text: input.text, hotUnitIds: [...new Set(input.hotUnitIds)], approved, createdById: me.id }, select: { id: true } });
      await this.files.attach(me, input.imageFileIds, BROADCAST, created.id, tx); // the sender's own finished uploads, or it fails
      await this.audit.record({ module: "marketing", entity: "Broadcast", entityId: created.id, action: "create", userId: me.id, after: { ...input, images: pics.map((f) => f.name), approved } }, tx);
      return created;
    });
    if (approved) await this.tellSales();
    return b;
  }

  async approve(me: CurrentUser, id: string) {
    const b = await this.db.broadcast.findUnique({ where: { id } });
    if (!b) throw new NotFoundException(NO_BROADCAST);
    if (b.approved) throw new ConflictException("الـ Broadcast ده اتوافق عليه قبل كده");
    await this.db.$transaction(async (tx) => {
      // conditional on the old state: of two clicks at once only one approves, so sales get «Broadcast جديد» once
      const won = await tx.broadcast.updateMany({ where: { id, approved: false }, data: { approved: true } });
      if (!won.count) throw new ConflictException("الـ Broadcast ده اتوافق عليه قبل كده");
      await this.audit.record({ module: "marketing", entity: "Broadcast", entityId: id, action: "approve", userId: me.id, before: { approved: false }, after: { approved: true } }, tx);
    });
    await this.tellSales();
  }

  /** A salesperson's Broadcast tasks: the approved ones, with their own Done. Nobody else has any. */
  async mine(me: CurrentUser): Promise<MyBroadcast[]> {
    if (!me.roles.includes(SALES_ROLE)) return [];
    const rows = await this.db.broadcast.findMany({ where: { approved: true }, orderBy: { createdAt: "desc" }, take: 20, include: { sends: { where: { userId: me.id } } } });
    const [codes, images] = await Promise.all([this.codes(rows.flatMap((b) => b.hotUnitIds)), this.images(rows.map((b) => b.id))]);
    return rows.map((b) => ({
      id: b.id, text: b.text, images: images.get(b.id) ?? [], createdAt: b.createdAt.toISOString(),
      hotUnits: b.hotUnitIds.map((id) => ({ id, code: codes.get(id) ?? "—" })), doneAt: b.sends[0]?.doneAt.toISOString() ?? null,
    }));
  }

  /** M-04 2.3 (23-24): the salesperson sent it by hand and presses Done, noting the other units they broadcast. */
  async done(me: CurrentUser, id: string, input: BroadcastDone) {
    if (!me.roles.includes(SALES_ROLE)) throw new ForbiddenException("الـ Broadcast مهمة للسيلز");
    const b = await this.db.broadcast.findFirst({ where: { id, approved: true }, include: { sends: { where: { userId: me.id } } } });
    if (!b) throw new NotFoundException(NO_BROADCAST);
    if (b.sends.length) throw new BadRequestException("إنت دوست Done على الـ Broadcast ده قبل كده");
    const otherUnits = [...new Set(input.otherUnits.map((c) => c.toUpperCase()))];
    await this.db.$transaction(async (tx) => {
      const s = await tx.broadcastSend.create({ data: { broadcastId: id, userId: me.id, otherUnits }, select: { id: true } }).catch((e: unknown) => {
        if ((e as { code?: unknown } | null)?.code === "P2002") throw new BadRequestException("إنت دوست Done على الـ Broadcast ده قبل كده"); // a double click
        throw e;
      });
      await this.audit.record({ module: "marketing", entity: "BroadcastSend", entityId: s.id, action: "create", userId: me.id, after: { broadcastId: id, otherUnits } }, tx);
    });
  }

  /** Each Broadcast's images, oldest first, with short links (inline to show, attachment to save and send). */
  private async images(ids: string[]): Promise<Map<string, BroadcastImage[]>> {
    const link = (fid: string, inline: boolean) => this.files.downloadUrl(fid, inline).then((l) => l.url, () => null);
    const pairs = await Promise.all(ids.map(async (id) => [id, await Promise.all((await this.files.of(BROADCAST, id)).map(async (f) => ({
      id: f.id, name: f.name, url: await link(f.id, true), download: await link(f.id, false),
    })))] as const));
    return new Map(pairs);
  }

  private async tellSales() {
    await this.notifications.notify({ event: "marketing.broadcast", text: "رسالة Broadcast جديدة من التسويق · ابعتها لعملائك ودوس Done", link: "/" });
  }

  private async salesIds(): Promise<string[]> {
    return (await this.db.user.findMany({ where: { status: "ACTIVE", roles: { some: { role: { key: SALES_ROLE } } } }, select: { id: true } })).map((u) => u.id);
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, email: true, employee: { select: { name: true } } } });
    return new Map(rows.map((u) => [u.id, u.employee?.name ?? u.email]));
  }

  private async codes(ids: string[]): Promise<Map<string, string>> {
    return new Map((await this.inventory.codes([...new Set(ids)])).map((u) => [u.id, u.code]));
  }
}
