import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { PostInput, PostQuery, PostRow } from "@places/contracts";
import { allowedValue, dayStart, postState } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";

const NO_POST = "البوست ده مش موجود";
const ROW = { id: true, title: true, channel: true, at: true, description: true, approved: true, publishedAt: true, reminderSentAt: true, campaign: { select: { id: true, name: true } } } satisfies Prisma.PostSelect;
type PostRecord = Prisma.PostGetPayload<{ select: typeof ROW }>;

/**
 * M-04 · the Content plan (2.1 step 6, 2.4): posts on a calendar, the manager's optional review (2.2), «اتنشر» records
 * the actual time. The Reminder at the post's time is the worker's (post-reminder). Small enough to read Prisma here.
 */
@Injectable()
export class PostsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(q: PostQuery, now = new Date()): Promise<PostRow[]> {
    const at = q.month ? { gte: dayStart(`${q.month}-01`), lt: dayStart(`${nextMonth(q.month)}-01`) } : undefined;
    const rows = await this.db.post.findMany({ where: { archivedAt: null, ...(at ? { at } : {}) }, select: ROW, orderBy: { at: "asc" } });
    return rows.map((p) => toRow(p, now));
  }

  /** M-04 2.2 «(مقترح)»: a post from someone who can't approve waits for the marketing manager; the manager's own is approved. */
  async create(me: CurrentUser, input: PostInput): Promise<{ id: string }> {
    await this.check(input);
    const data = { title: input.title, channel: input.channel, campaignId: input.campaignId ?? null, at: cairo(input.at), description: input.description ?? null, approved: me.grants.can("marketing", "approve"), createdById: me.id };
    return this.db.$transaction(async (tx) => {
      const p = await tx.post.create({ data, select: { id: true } });
      await this.audit.record({ module: "marketing", entity: "Post", entityId: p.id, action: "create", userId: me.id, after: { ...input } }, tx);
      return p;
    });
  }

  async approve(me: CurrentUser, id: string) {
    const p = await this.find(id);
    if (p.approved) throw new BadRequestException("البوست ده اتوافق عليه قبل كده");
    await this.change(me, id, { approved: true }, "approve", { approved: false }, { approved: true });
  }

  /** «اتنشر»: the actual publish time, for the KPI «في الميعاد ÷ المخطط». */
  async published(me: CurrentUser, id: string) {
    const p = await this.find(id);
    if (p.publishedAt) throw new BadRequestException("البوست ده اتسجّل إنه اتنشر");
    if (!p.approved) throw new BadRequestException("البوست لسه مستني موافقة مدير التسويق");
    const now = new Date();
    await this.change(me, id, { publishedAt: now }, "published", { publishedAt: null }, { publishedAt: now.toISOString() });
  }

  async archive(me: CurrentUser, id: string) {
    const p = await this.find(id);
    await this.change(me, id, { archivedAt: new Date() }, "archive", { title: p.title, at: p.at.toISOString() }, null);
  }

  private async change(me: CurrentUser, id: string, data: Prisma.PostUncheckedUpdateInput, action: string, before: unknown, after: unknown) {
    await this.db.$transaction(async (tx) => {
      await tx.post.update({ where: { id }, data });
      await this.audit.record({ module: "marketing", entity: "Post", entityId: id, action, userId: me.id, before, after }, tx);
    });
  }

  private async find(id: string): Promise<PostRecord> {
    const p = await this.db.post.findFirst({ where: { id, archivedAt: null }, select: ROW });
    if (!p) throw new NotFoundException(NO_POST);
    return p;
  }

  private async check(input: PostInput) {
    if (!allowedValue((await this.settings.all()).channels, input.channel)) throw new BadRequestException("اختار الـ Channel من القايمة");
    if (input.campaignId && !(await this.db.campaign.count({ where: { id: input.campaignId, archivedAt: null } }))) throw new BadRequestException("الكامبين دي مش موجودة");
  }
}

const nextMonth = (m: string) => { const [y, mm] = m.split("-").map(Number) as [number, number]; return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`; };
/** «YYYY-MM-DDTHH:mm» in Cairo → the instant. */
const cairo = (local: string) => {
  const [d, t] = local.split("T") as [string, string];
  const [h, m] = t.split(":").map(Number) as [number, number];
  return new Date(dayStart(d).getTime() + (h * 60 + m) * 60_000);
};

function toRow(p: PostRecord, now: Date): PostRow {
  return {
    id: p.id, title: p.title, channel: p.channel, campaign: p.campaign, at: p.at.toISOString(), description: p.description,
    approved: p.approved, publishedAt: p.publishedAt?.toISOString() ?? null, state: postState(p, now),
  };
}
