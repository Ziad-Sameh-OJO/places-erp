import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

/** 14.8 – 14.11 · the lead's units log: its Lists / Short lists and its Visits / Meetings with their units. Prisma only. */
@Injectable()
export class LeadUnitsRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  addStep(tx: Prisma.TransactionClient, leadId: string, kind: "list" | "shortlist", unitIds: string[], byUserId: string) {
    return tx.leadUnitStep.create({ data: { leadId, kind, unitIds, byUserId } });
  }

  steps(leadId: string) {
    return this.db.leadUnitStep.findMany({ where: { leadId }, select: { id: true, kind: true, unitIds: true, byUserId: true, at: true } });
  }

  visits(leadId: string) {
    return this.db.leadVisit.findMany({
      where: { leadId },
      select: { id: true, kind: true, at: true, extra: true, outcome: true, byUserId: true, units: { select: { unitId: true } } },
    });
  }

  /** 14.11: the units shown to the client in a Visit / Meeting marked Done. */
  async visitedUnitIds(leadId: string): Promise<Set<string>> {
    const rows = await this.db.visitUnit.findMany({ where: { visit: { leadId, outcome: "done" } }, select: { unitId: true } });
    return new Set(rows.map((r) => r.unitId));
  }
}
