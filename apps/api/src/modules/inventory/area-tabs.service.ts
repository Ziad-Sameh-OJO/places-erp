import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { AreaTabInput, AreaTabView, UnitFilters } from "@places/contracts";
import { areaTabLabel, fillsUnitFolder, keepsInventory, staleBefore } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryRepository } from "./inventory.repository";
import { shownFilters, withMissing } from "./inventory.service";

const NO_TAB = "التاب ده مش موجود";

/**
 * M-03 7.2 · the area tabs under the list. «Customized»: the inventory team adds, changes and removes them (12.8:
 * the department's own setting, so it's the inventory edit permission, not the admin's settings). Audited.
 */
@Injectable()
export class AreaTabsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly repo: InventoryRepository, private readonly audit: AuditService) {}

  /** The tabs in order, each with the available units in it under the list's other filters. */
  async list(me: CurrentUser, filters: UnitFilters): Promise<AreaTabView[]> {
    const tabs = await this.repo.areaTabs();
    const hidden = me.fields.hidden("inventory"), f = shownFilters(filters, hidden); // the same rule as the list: no filtering by a hidden field
    const s = { insider: keepsInventory(me.grants), seesDrafts: fillsUnitFolder(me.roles, me.grants), staleBefore: staleBefore(new Date()), hidden };
    const counts = await this.repo.areaTabCounts(s, await withMissing(this.repo, s, f), tabs);
    return tabs.map((t, i) => ({ ...t, label: areaTabLabel(t), count: counts[i]! }));
  }

  async create(me: CurrentUser, input: AreaTabInput) {
    return this.db.$transaction(async (tx) => {
      await this.refuseTwin(tx, input, null);
      const tab = await tx.areaTab.create({ data: { min: input.min, max: input.max } });
      await this.audit.record({ module: "inventory", entity: "AreaTab", entityId: tab.id, action: "create", userId: me.id, after: { label: areaTabLabel(tab), ...input } }, tx);
      return { id: tab.id, label: areaTabLabel(tab), min: tab.min, max: tab.max };
    });
  }

  async update(me: CurrentUser, id: string, input: AreaTabInput) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.areaTab.findUnique({ where: { id } });
      if (!before) throw new NotFoundException(NO_TAB);
      await this.refuseTwin(tx, input, id);
      const tab = await tx.areaTab.update({ where: { id }, data: { min: input.min, max: input.max } });
      await this.audit.record({
        module: "inventory", entity: "AreaTab", entityId: id, action: "update", userId: me.id,
        before: { label: areaTabLabel(before), min: before.min, max: before.max }, after: { label: areaTabLabel(tab), ...input },
      }, tx);
      return { id, label: areaTabLabel(tab), min: tab.min, max: tab.max };
    });
  }

  /** The units Manar had put in it go back to «by their area» (the foreign key sets them to null). */
  async remove(me: CurrentUser, id: string) {
    await this.db.$transaction(async (tx) => {
      const tab = await tx.areaTab.findUnique({ where: { id } });
      if (!tab) throw new NotFoundException(NO_TAB);
      const units = await tx.unit.count({ where: { areaTabId: id } });
      await tx.areaTab.delete({ where: { id } });
      await this.audit.record({ module: "inventory", entity: "AreaTab", entityId: id, action: "delete", userId: me.id, before: { label: areaTabLabel(tab), min: tab.min, max: tab.max, units } }, tx);
    });
  }

  /** The same range twice would be two identical tabs. */
  private async refuseTwin(tx: Pick<PrismaClient, "areaTab">, t: AreaTabInput, except: string | null) {
    const twin = await tx.areaTab.findFirst({ where: { min: t.min, max: t.max, ...(except ? { id: { not: except } } : {}) } });
    if (twin) throw new ConflictException(`فيه تاب «${areaTabLabel(twin)}» بنفس المساحات`);
  }
}
