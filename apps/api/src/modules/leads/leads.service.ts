import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import type { ChangeStage, CreateLead, LeadFilters } from "@places/contracts";
import { type LeadStage, LeadRouter, isQualifiedAfter } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { LeadsRepository } from "./leads.repository";

const toDb = (s: LeadStage) => s.toUpperCase().replace(/ /g, "_") as never;

/** M-01 use cases. The rules themselves live in @places/domain; this class orchestrates them with the database. */
@Injectable()
export class LeadsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly repo: LeadsRepository, private readonly audit: AuditService) {}

  async list(me: CurrentUser, f: LeadFilters) {
    const [items, total] = await this.repo.list(ownedBy(me) as never, f);
    return { items, total, page: f.page, pageSize: f.pageSize };
  }

  /** Create → duplicate check by phone (Q7: Operations decides) → route by area round-robin (Q1–Q3) → audit. */
  async create(me: CurrentUser, input: CreateLead) {
    const dup = await this.repo.findByPhone(input.phones);
    if (dup) throw new ConflictException({ duplicateOf: dup.code }); // goes to Operations' duplicate queue in the UI

    return this.db.$transaction(async (tx) => {
      const routing = await tx.setting.findUnique({ where: { key: "routing" } });
      const state = (routing?.value as { cursor: Record<string, number>; skipTurns: Record<string, number> } | null) ?? { cursor: {}, skipTurns: {} };
      const pools = ((await tx.setting.findUnique({ where: { key: "areaRouting" } }))?.value ?? {}) as Record<string, string[]>;
      const router = new LeadRouter(state);
      let assignedToId = input.assignToId ?? null;
      if (assignedToId) router.assignedByHand(assignedToId);
      else if (me.employeeId && me.grants.scope === "own") assignedToId = me.employeeId; // Q3: a salesperson's own lead stays theirs
      else assignedToId = router.next(input.area, pools[input.area] ?? []);
      await tx.setting.upsert({ where: { key: "routing" }, update: { value: router.snapshot() as never }, create: { key: "routing", value: router.snapshot() as never } });

      const [{ n }] = (await this.repo.nextCode(tx)) as [{ n: bigint }];
      const lead = await tx.lead.create({
        data: {
          code: `L-${n}`, name: input.name, phones: input.phones, area: input.area, type: input.type, space: input.space ?? null,
          condition: input.condition ?? null, budget: input.budget ?? null, channel: input.channel, campaignId: input.campaignId ?? null,
          assignedToId, assignedAt: assignedToId ? new Date() : null, createdById: me.id,
          activities: input.note ? { create: { kind: "comment", text: input.note, byUserId: me.id } } : undefined,
        },
      });
      await this.audit.record({ module: "leads", entity: "Lead", entityId: lead.id, action: "create", userId: me.id, after: lead }, tx);
      return lead;
    });
  }

  /** Stage change: Qualified is sticky (isQualifiedAfter), the SLA clock stops on the first action. */
  async changeStage(me: CurrentUser, id: string, input: ChangeStage) {
    return this.db.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({ where: { id, ...(ownedBy(me) as object) } });
      if (!lead) throw new NotFoundException();
      const next = await tx.lead.update({
        where: { id },
        data: { stage: toDb(input.stage), qualified: isQualifiedAfter(lead.qualified, input.stage), touched: true,
          noAnswerCount: input.stage === "No Answer" ? { increment: 1 } : undefined,
          activities: { create: { kind: "stage", text: `المرحلة بقت ${input.stage}${input.note ? ` · ${input.note}` : ""}`, byUserId: me.id } } },
      });
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "stage", userId: me.id, before: { stage: lead.stage }, after: { stage: next.stage } }, tx);
      return next;
    });
  }
}
