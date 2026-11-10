import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { activeValues, type AreaRoute, type RoutingCell, type RoutingView } from "@places/contracts";
import { setAreaMember, type AreaRouting } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { LeadsRepository } from "./leads.repository";

const KEY = "areaRouting";

/**
 * 1.12 · «إعدادات توزيع المناطق»: who covers each area (M-01 Q1). New leads in an area rotate between them (1.13,
 * LeadRouter). Changed by whoever may edit the routing settings; every tick is audited in its transaction.
 */
@Injectable()
export class RoutingService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async view(): Promise<RoutingView> {
    const [settings, salespeople, row] = await Promise.all([this.settings.all(), this.repo.routingPeople(), this.db.setting.findUnique({ where: { key: KEY } })]);
    return { areas: activeValues(settings.areas), salespeople, routing: (row?.value ?? {}) as AreaRouting };
  }

  /**
   * 1.30 · who a new lead in this area would go to: today's pool as the rotation sees it (no one switched off or on
   * leave, 1.13/1.15), in its order. Empty means nobody covers it and the lead waits for Operations.
   */
  async forArea(area: string): Promise<AreaRoute> {
    const ids = await this.repo.areaPool(this.db, area);
    const names = new Map((await this.repo.employeeNames(ids)).map((p) => [p.id, p.name]));
    return { salespeople: ids.flatMap((id) => { const name = names.get(id); return name ? [{ id, name }] : []; }) };
  }

  /** One tick. The row is locked while it changes, so two ticks at once (two areas, or two people) both stay. */
  async set(me: CurrentUser, cell: RoutingCell): Promise<RoutingView> {
    const [settings, people] = await Promise.all([this.settings.all(), this.repo.routingPeople()]);
    if (cell.on && !activeValues(settings.areas).includes(cell.area)) throw new BadRequestException("اختار Area من القايمة");
    const person = people.find((p) => p.id === cell.employeeId);
    if (cell.on && !person) throw new BadRequestException("السيلز ده مش موجود");
    await this.db.$transaction(async (tx) => {
      await tx.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: {} }, update: {} });
      const [row] = await tx.$queryRaw<Array<{ value: AreaRouting }>>`SELECT "value" FROM "system"."Setting" WHERE "key" = ${KEY} FOR UPDATE`;
      const before = row?.value ?? {};
      const after = setAreaMember(before, cell.area, cell.employeeId, cell.on);
      await tx.setting.update({ where: { key: KEY }, data: { value: after } });
      await this.audit.record({
        module: "settings", entity: "AreaRouting", entityId: cell.area, action: cell.on ? "add" : "remove", userId: me.id,
        before: { area: cell.area, salespeople: before[cell.area] ?? [] },
        after: { area: cell.area, salespeople: after[cell.area], changed: person?.name ?? cell.employeeId },
      }, tx);
    });
    return this.view();
  }
}
