import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { AddComment, ChangeStage, CreateLead, LeadDetail, LeadFilters, LeadRow, Paged } from "@places/contracts";
import { LEAD_STAGES, type LeadStage, LeadRouter, isQualifiedAfter } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";
import { type LeadDetailRecord, type LeadRecord, LeadsRepository } from "./leads.repository";

const toDb = (s: LeadStage) => s.toUpperCase().replace(/ /g, "_") as never;
/** FOLLOW_UP_TO_VISIT → «Follow up to Visit»: the API speaks the stage names the team uses. */
const STAGE_LABEL = new Map<string, string>(LEAD_STAGES.map((s) => [s.toUpperCase().replace(/ /g, "_"), s]));

/** M-01 use cases. The rules themselves live in @places/domain; this class orchestrates them with the database. */
@Injectable()
export class LeadsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly repo: LeadsRepository, private readonly audit: AuditService) {}

  /** Sales see their own leads, a TL their team's, operations and the sales director all of them (M-01 4). */
  async list(me: CurrentUser, f: LeadFilters): Promise<Paged<LeadRow>> {
    const [rows, total] = await this.repo.list(ownedBy(me) as never, f);
    const names = await this.salespeopleNames(rows.map((r) => r.assignedToId));
    return { items: rows.map((r) => toRow(r, names)), total, page: f.page, pageSize: f.pageSize };
  }

  /** The lead drawer. A lead outside the caller's scope is a 404, not a 403: it doesn't say the lead exists. */
  async get(me: CurrentUser, id: string): Promise<LeadDetail> {
    const lead = await this.repo.detail(ownedBy(me) as never, id);
    if (!lead) throw new NotFoundException();
    const [salespeople, people] = await Promise.all([
      this.salespeopleNames([lead.assignedToId]),
      this.repo.userNames([...new Set(lead.activities.map((a) => a.byUserId).filter(isId))]),
    ]);
    return toDetail(lead, salespeople, new Map(people.map((p) => [p.userId, p.name])));
  }

  /** A comment (or a call result) on the Activity tab. It is an action, so it stops the SLA clock (M-01: «من غير أي أكشن»). */
  async addComment(me: CurrentUser, id: string, input: AddComment) {
    await this.db.$transaction(async (tx) => {
      const lead = await this.repo.findInScope(ownedBy(me) as never, id, tx);
      if (!lead) throw new NotFoundException();
      const activity = await this.repo.addActivity(tx, id, "comment", input.text, me.id);
      await this.repo.markActed(tx, id, activity.at);
      await this.audit.record({ module: "leads", entity: "LeadActivity", entityId: activity.id, action: "comment", userId: me.id, after: { leadId: id, text: input.text } }, tx);
    });
    return this.get(me, id);
  }

  private async salespeopleNames(ids: Array<string | null>) {
    return new Map((await this.repo.employeeNames([...new Set(ids.filter(isId))])).map((e) => [e.id, e.name]));
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
        },
      });
      await this.repo.addActivity(tx, lead.id, "assign", await this.createdText(tx, me, assignedToId), me.id);
      if (input.note) await this.repo.addActivity(tx, lead.id, "comment", input.note, me.id);
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
          noAnswerCount: input.stage === "No Answer" ? { increment: 1 } : undefined },
      });
      const activity = await this.repo.addActivity(tx, id, "stage", `المرحلة بقت ${input.stage}${input.note ? ` · ${input.note}` : ""}`, me.id);
      await this.repo.markActed(tx, id, activity.at);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "stage", userId: me.id, before: { stage: lead.stage }, after: { stage: next.stage } }, tx);
      return next;
    });
  }

  /** The first line of the Activity, in the demo's words: who entered the lead and where it went. */
  private async createdText(tx: Prisma.TransactionClient, me: CurrentUser, assignedToId: string | null) {
    const by = `اتعمل بواسطة ${me.name}`;
    if (!assignedToId) return by;
    if (assignedToId === me.employeeId) return `${by} · فضل عنده (هو اللي دخّله)`;
    const [salesperson] = await this.repo.employeeNames([assignedToId], tx);
    return `${by} · اتوزع لـ ${salesperson?.name ?? ""}`;
  }
}

const isId = (x: string | null): x is string => !!x;
const iso = (d: Date | null) => d?.toISOString() ?? null;

function toRow({ assignedToId, ...r }: LeadRecord, names: Map<string, string>): LeadRow {
  return {
    ...r, stage: STAGE_LABEL.get(r.stage) ?? r.stage,
    assignedTo: assignedToId ? { id: assignedToId, name: names.get(assignedToId) ?? "" } : null,
    assignedAt: iso(r.assignedAt), arrivedAt: r.arrivedAt.toISOString(), createdAt: r.createdAt.toISOString(),
  };
}

function toDetail(lead: LeadDetailRecord, salespeople: Map<string, string>, people: Map<string, string>): LeadDetail {
  const { activities, company, budget, firstActionAt, space, condition, note, noAnswerCount, rotation, ...row } = lead;
  return {
    ...toRow(row, salespeople), space, condition, note, noAnswerCount, rotation,
    company: company?.name ?? null, budget: budget?.toFixed(2) ?? null, firstActionAt: iso(firstActionAt), // money on the wire is a decimal string
    activities: activities.map(({ byUserId, at, ...a }) => ({
      ...a, at: at.toISOString(), by: byUserId ? { id: byUserId, name: people.get(byUserId) ?? "" } : null,
    })),
  };
}
