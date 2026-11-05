import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { InventoryReportView } from "@places/contracts";
import { inventoryReportText, localDate } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";

const NOT_YET = "التقرير لسه ماطلعش · بيطلع لوحده في ميعاده («التقارير ومواعيدها»)";

/**
 * 2.18 · M-03 3.1: the daily report the reports engine makes at its time (apps/worker inventory-report, 11.10); Manar
 * approves it — the time is recorded for her KPI — and the report's recipients get it (the demo's «اعتمد وابعت للإدارة»).
 */
@Injectable()
export class DailyReportService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async get(day = localDate(new Date())): Promise<InventoryReportView> {
    const r = await this.db.inventoryReport.findUnique({ where: { day: new Date(`${day}T00:00:00Z`) } });
    if (!r) throw new NotFoundException(NOT_YET);
    const by = r.approvedById ? await this.db.employee.findUnique({ where: { userId: r.approvedById }, select: { name: true } }) : null;
    return {
      day, newUnits: r.newUnits, updated: r.updated, closed: r.closed, unconfirmed: r.unconfirmed, generatedAt: r.generatedAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null, approvedBy: r.approvedById ? { id: r.approvedById, name: by?.name ?? "" } : null,
    };
  }

  async approve(me: CurrentUser, day: string): Promise<InventoryReportView> {
    const date = new Date(`${day}T00:00:00Z`);
    const r = await this.db.$transaction(async (tx) => {
      const report = await tx.inventoryReport.findUnique({ where: { day: date } });
      if (!report) throw new NotFoundException(NOT_YET);
      // once: a second click (or two at once) doesn't send it twice
      const claimed = await tx.inventoryReport.updateMany({ where: { id: report.id, approvedAt: null }, data: { approvedAt: new Date(), approvedById: me.id } });
      if (!claimed.count) throw new BadRequestException("التقرير اتعتمد قبل كده");
      await this.audit.record({ module: "inventory", entity: "InventoryReport", entityId: report.id, action: "approve", userId: me.id, after: { day } }, tx);
      return report;
    });
    if (r.sendTo.length) await this.notifications.notify({ event: "inventory.report_sent", userIds: r.sendTo, link: `/inventory?report=${day}`, text: `${inventoryReportText(r)} (${day})` });
    return this.get(day);
  }
}
