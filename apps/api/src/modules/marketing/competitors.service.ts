import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { CompetitorInput, CompetitorRow } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";

const ROW = { id: true, month: true, name: true, note: true, strong: true } as const;
const NOT_FOUND = "المنافس ده مش موجود";
const TWICE = "المنافس ده متضاف للشهر ده";

/**
 * 14.14 · the monthly competitors report's rows: who, what they put out, and the marketing manager's «قوي / مش قوي».
 * Small enough to read Prisma here (as PostsService).
 */
@Injectable()
export class CompetitorsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService) {}

  list(month: string): Promise<CompetitorRow[]> {
    return this.db.competitor.findMany({ where: { month }, select: ROW, orderBy: { createdAt: "asc" } });
  }

  async add(me: CurrentUser, input: CompetitorInput): Promise<CompetitorRow> {
    if (await this.db.competitor.findUnique({ where: { month_name: { month: input.month, name: input.name } } })) throw new ConflictException(TWICE);
    return this.db.$transaction(async (tx) => {
      const row = await tx.competitor.create({ data: { month: input.month, name: input.name, note: input.note || null, createdById: me.id }, select: ROW });
      await this.audit.record({ module: "marketing", entity: "Competitor", entityId: row.id, action: "create", userId: me.id, after: { ...row, summary: `تقرير المنافسين ${row.month}: ${row.name}` } }, tx);
      return row;
    }).catch((e: unknown) => {
      if ((e as { code?: unknown } | null)?.code === "P2002") throw new ConflictException(TWICE); // two adds at once: the unique (month, name) caught the second
      throw e;
    });
  }

  async rate(me: CurrentUser, id: string, strong: boolean | null): Promise<CompetitorRow> {
    const before = await this.find(id);
    return this.db.$transaction(async (tx) => {
      const row = await tx.competitor.update({ where: { id }, data: { strong }, select: ROW });
      await this.audit.record({ module: "marketing", entity: "Competitor", entityId: id, action: "rate", userId: me.id, before: { strong: before.strong }, after: { strong, summary: `${row.name}: ${strong === null ? "من غير تقييم" : strong ? "قوي" : "مش قوي"}` } }, tx);
      return row;
    });
  }

  async remove(me: CurrentUser, id: string): Promise<void> {
    const before = await this.find(id);
    await this.db.$transaction(async (tx) => {
      await tx.competitor.delete({ where: { id } });
      await this.audit.record({ module: "marketing", entity: "Competitor", entityId: id, action: "delete", userId: me.id, before }, tx);
    });
  }

  private async find(id: string): Promise<CompetitorRow> {
    const row = await this.db.competitor.findUnique({ where: { id }, select: ROW });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }
}
