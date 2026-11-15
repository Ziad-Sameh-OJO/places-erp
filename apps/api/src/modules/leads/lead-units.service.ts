import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { JourneyEntry, ListOfOptionsInput, ShortlistInput, UnitJourney } from "@places/contracts";
import { type JourneyStage, unitJourney } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { InventoryService } from "../inventory/inventory.service";
import { UnitDocumentsService } from "../inventory/unit-documents.service";
import { leadScope } from "./lead-scope";
import { LeadsRepository } from "./leads.repository";
import { LeadUnitsRepository } from "./lead-units.repository";

const NO_LEAD = "الليد ده مش موجود أو مبقاش معاك";

/**
 * 14.8 – 14.11 (T-28) · the lead's units log: List of options → Visits → Short list → Meeting, each step dated with
 * its units; a List of options made from the inventory for one of the salesperson's leads, and the Short list picked
 * by hand, are recorded here (Activity line, audit, the same transaction).
 */
@Injectable()
export class LeadUnitsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadUnitsRepository,
    private readonly leads: LeadsRepository,
    private readonly inventory: InventoryService,
    private readonly docs: UnitDocumentsService,
    private readonly audit: AuditService,
  ) {}

  /** 14.8 · the log, stage by stage. A lead outside the caller's scope is a 404. */
  async journey(me: CurrentUser, id: string): Promise<UnitJourney> {
    if (!(await this.leads.findInScope(leadScope(me) as never, id))) throw new NotFoundException(NO_LEAD);
    const [steps, visits] = await Promise.all([this.repo.steps(id), this.repo.visits(id)]);
    const ids = [...new Set([...steps.flatMap((s) => s.unitIds), ...visits.flatMap((v) => v.units.map((u) => u.unitId))])];
    const byUser = [...new Set([...steps, ...visits].map((s) => s.byUserId))];
    const [units, people] = await Promise.all([this.inventory.journeyUnits(ids), this.leads.userNames(byUser)]);
    const noProject = me.fields.hidden("inventory").has("project"); // M-09
    const unit = new Map(units.map((u) => [u.id, { id: u.id, code: u.code, project: noProject ? "" : u.project }]));
    const name = new Map(people.map((p) => [p.userId, p.name]));
    const of = (unitIds: string[]) => unitIds.flatMap((u) => unit.get(u) ?? []);
    const entries: JourneyEntry[] = [
      ...steps.map((s) => ({ id: s.id, stage: s.kind as JourneyStage, at: s.at.toISOString(), by: name.get(s.byUserId) ?? null, units: of(s.unitIds), extra: null, outcome: null })),
      ...visits.map((v) => ({ id: v.id, stage: (v.kind === "meeting" ? "meeting" : "visit") as JourneyStage, at: v.at.toISOString(), by: name.get(v.byUserId) ?? null,
        units: of(v.units.map((u) => u.unitId)), extra: v.extra, outcome: v.outcome === "done" ? "done" as const : v.outcome === "not_done" ? "not_done" as const : null })),
    ];
    return { stages: unitJourney(entries) };
  }

  /** 14.11 · «احفظ كترشيح»: the units picked by hand from the inventory, kept on the lead as its Short list. */
  async shortlist(me: CurrentUser, id: string, input: ShortlistInput): Promise<UnitJourney> {
    const open = await this.inventory.openForVisit(input.unitIds);
    if (input.unitIds.some((u) => !open.has(u))) throw new BadRequestException("فيه وحدة مش متاحة · اختار من القايمة");
    const codes = await this.inventory.codes(input.unitIds);
    await this.db.$transaction(async (tx) => {
      if (!(await this.leads.findInScope(leadScope(me) as never, id, tx))) throw new NotFoundException(NO_LEAD);
      const step = await this.repo.addStep(tx, id, "shortlist", input.unitIds, me.id);
      const activity = await this.leads.addActivity(tx, id, "comment", `Short list: ${codes.map((u) => u.code).join("، ")}`, me.id);
      await this.leads.markActed(tx, id, activity.at);
      await this.leads.addSuggestedUnits(tx, id, input.unitIds, me.id);
      await this.audit.record({ module: "leads", entity: "LeadUnitStep", entityId: step.id, action: "shortlist", userId: me.id, after: { leadId: id, unitIds: input.unitIds } }, tx);
    });
    return this.journey(me, id);
  }

  /**
   * 14.9 · the inventory's List of options for one of the salesperson's leads: the file as usual (the lead's name on
   * the cover unless another is typed), then «اتبعتله List فيها …» in its Activity and a List step in its log. The file
   * is made first, so a failed render records nothing.
   */
  async listOfOptions(me: CurrentUser, id: string, input: ListOfOptionsInput): Promise<{ name: string; mime: string; body: Buffer }> {
    if (!me.grants.can("inventory", "view")) throw new ForbiddenException("مش مسموحلك تشوف الانفنتوري");
    const lead = await this.leads.findInScope(leadScope(me) as never, id);
    if (!lead) throw new NotFoundException(NO_LEAD);
    const doc = await this.docs.renderList(me, { ...input, client: input.client ?? lead.name });
    const codes = new Map((await this.inventory.codes(input.unitIds)).map((u) => [u.id, u.code]));
    await this.db.$transaction(async (tx) => {
      if (!(await this.leads.findInScope(leadScope(me) as never, id, tx))) throw new NotFoundException(NO_LEAD);
      const step = await this.repo.addStep(tx, id, "list", input.unitIds, me.id);
      const text = `اتبعتله List of options فيها: ${input.unitIds.map((u) => codes.get(u)).join("، ")} · ${cairoDay(step.at)}`;
      const activity = await this.leads.addActivity(tx, id, "comment", text, me.id);
      await this.leads.markActed(tx, id, activity.at);
      await this.leads.addSuggestedUnits(tx, id, input.unitIds, me.id);
      await this.audit.record({ module: "leads", entity: "LeadUnitStep", entityId: step.id, action: "list", userId: me.id, after: { leadId: id, unitIds: input.unitIds, text } }, tx);
    });
    return doc;
  }
}

const cairoDay = (d: Date) => d.toLocaleDateString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", dateStyle: "medium" });
