import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { KEEP, ROTATION, TELESALES, type DraftDecision, type DraftKind, type DraftRow } from "@places/contracts";
import { LEAD_STAGES, LeadRouter, draftMinutesLeft, isNamedIn } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LeadsRepository } from "./leads.repository";
import { LeadsService } from "./leads.service";
import { LeadRulesService } from "./lead-rules.service";

const STAGE = new Map<string, string>(LEAD_STAGES.map((s) => [s.toUpperCase().replace(/ /g, "_"), s]));
const TAB: Record<DraftKind, string> = { draft: "الـ Draft", admin: "الـ Draft Admin" };

/**
 * 1.26 «Draft» (and 1.27 «Draft Admin»): leads the system took from their salesperson wait here, seen only by the
 * people «قواعد الليدز» names (draft.see / draftAdmin.see, Operations by default) and the admin. They decide: it stays
 * («يفضل»), or goes to the rotation, a salesperson, or back to the one it came from — like Operations' hand assignment
 * (1.14), that person's next turn is used up. Times are kept for Operations' KPI item (11.15).
 */
@Injectable()
export class DraftsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly rules: LeadRulesService,
    private readonly leads: LeadsService,
  ) {}

  /** The rule's people and the admin; everyone else gets 403, like a missing permission. */
  private async mustSee(me: CurrentUser, kind: DraftKind) {
    const rules = await this.rules.get();
    if (!isNamedIn(kind === "draft" ? rules.draft.see : rules.draftAdmin.see, { userId: me.id, roles: me.roles })) {
      throw new ForbiddenException(`${TAB[kind]} ظاهر للي «قواعد الليدز» بتحددهم بس`);
    }
  }

  async list(me: CurrentUser, kind: DraftKind, now = new Date()): Promise<DraftRow[]> {
    await this.mustSee(me, kind);
    const rows = await this.repo.drafts(kind);
    const names = new Map((await this.repo.employeeNames([...new Set(rows.map((r) => r.fromId).filter((x): x is string => !!x))])).map((e) => [e.id, e.name]));
    return rows.map((r) => {
      const l = r.lead;
      const lastAction = [l.assignedAt, l.createdAt, l.activities[0]?.at].filter((d): d is Date => !!d).reduce((a, b) => (b > a ? b : a));
      return {
        id: r.id, at: r.at.toISOString(), days: r.days, kept: !!r.keptAt, lastAction: lastAction.toISOString(),
        lead: { id: l.id, code: l.code, name: l.name, company: l.company?.name ?? null, stage: STAGE.get(l.stage) ?? l.stage, kind: l.kind === "BROKER" ? "broker" : "client", area: l.area },
        from: r.fromId ? { id: r.fromId, name: names.get(r.fromId) ?? "" } : null,
        minutesLeft: r.keptAt ? 0 : draftMinutesLeft(r.at, now),
      };
    });
  }

  async decide(me: CurrentUser, id: string, input: DraftDecision) {
    const draft = await this.db.leadDraft.findUnique({ where: { id }, select: { kind: true } });
    if (!draft) throw new NotFoundException("الليد ده مش في الـ Draft");
    const kind = kindOf(draft.kind);
    await this.mustSee(me, kind);
    if (input.to === KEEP) return this.keep(me, id, kind);
    // the Draft Admin can also send it to Telesales (1.27, «قواعد الليدز ← No Answer»'s Telesales)
    const tele = kind === "admin" && input.to === TELESALES ? await this.repo.telesalesEmployee((await this.rules.get()).noAnswer.telesales) : null;
    if (kind === "admin" && input.to === TELESALES && !tele) throw new BadRequestException("مفيش Telesales متاح");
    const picked = tele ?? (input.to === ROTATION ? null : (await this.repo.routingPeople()).find((p) => p.id === input.to));
    if (input.to !== ROTATION && !picked) throw new BadRequestException("اختار سيلز من القايمة");
    const sent = await this.db.$transaction(async (tx) => {
      const d = await this.repo.openDraft(tx, id);
      if (!d) throw new ConflictException("القرار ده اتاخد قبل كده");
      const router = new LeadRouter(await this.repo.lockRouting(tx));
      const to = picked?.id ?? router.next(d.lead.area, await this.leads.areaPool(tx, d.lead.area));
      if (!to) throw new BadRequestException("مفيش سيلز متاح على الـ area دي · اختار سيلز معيّن");
      if (picked && !tele) router.assignedByHand(picked.id); // a hand-picked person, the old one too, uses up their turn (Q2)
      const now = new Date();
      // from the Draft Admin the lead starts over («رجع Fresh», demo); from the Draft it keeps its stage
      const fresh = kind === "admin" ? { stage: "FRESH" as const, touched: false, firstActionAt: null, rotation: 1, ownedByTelesales: !!tele } : {};
      const moved = await tx.lead.updateMany({ where: { id: d.lead.id, draft: kind }, data: { draft: null, assignedToId: to, assignedAt: now, slaWarnedAt: null, ...fresh } });
      if (!moved.count) throw new ConflictException("القرار ده اتاخد قبل كده");
      await this.repo.saveRouting(tx, router.snapshot());
      const decision = tele ? "telesales" : !picked ? "rotation" : picked.id === d.fromId ? "back" : "hand";
      await tx.leadDraft.update({ where: { id }, data: { decidedAt: now, decidedById: me.id, decision, toId: to } });
      const [person, from] = await this.repo.employeeNames([to, ...(d.fromId ? [d.fromId] : [])], tx).then((rows) => [to, d.fromId].map((x) => rows.find((r) => r.id === x)));
      await this.repo.addActivity(tx, d.lead.id, "assign", kind === "admin"
        ? `اتبعت من الـ Draft Admin لـ ${person?.name ?? "—"} (كان ${STAGE.get(d.stage) ?? d.stage} عند ${from?.name ?? "—"}) · رجع Fresh`
        : `اتوزع من ${TAB[kind]} لـ ${person?.name ?? "—"}${decision === "rotation" ? " (بالروتيشن)" : ""}`, me.id);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: d.lead.id, action: "draft-route", userId: me.id,
        before: { draft: kind, assignedToId: null, from: d.fromId }, after: { draft: null, assignedToId: to, decision } }, tx);
      return { leadId: d.lead.id, name: d.lead.name, to };
    });
    const owner = await this.repo.ownerAccounts(sent.to);
    if (owner) await this.notifications.notify({ event: "lead.assigned", text: kind === "admin" ? `ليد ${sent.name} اتبعتلك من الـ Draft Admin` : `ليد ${sent.name} اتحوّلك من الـ Draft`, link: `/leads?open=${sent.leadId}`, to: [owner.userId], channels: [...(await this.rules.get()).newLead.ch] });
    return { id: sent.leadId, assignedTo: { id: sent.to } };
  }

  /** «يفضل في الـ Draft»: reviewed, it stays here (the clock stops for the KPI); later it can still be sent to someone. */
  private async keep(me: CurrentUser, id: string, kind: DraftKind) {
    return this.db.$transaction(async (tx) => {
      const d = await this.repo.openDraft(tx, id);
      if (!d) throw new ConflictException("القرار ده اتاخد قبل كده");
      if (d.keptAt) throw new BadRequestException(`اتراجع قبل كده · فاضل في ${TAB[kind]}`);
      const now = new Date();
      await tx.leadDraft.update({ where: { id }, data: { keptAt: now, keptById: me.id } });
      await this.repo.addActivity(tx, d.lead.id, "assign", `${me.name} راجعته وقررت يفضل في ${TAB[kind]}`, me.id);
      await this.audit.record({ module: "leads", entity: "LeadDraft", entityId: id, action: "keep", userId: me.id, after: { keptAt: now.toISOString() } }, tx);
      return { id: d.lead.id, assignedTo: null };
    });
  }
}

const kindOf = (k: string): DraftKind => (k === "admin" ? "admin" : "draft");
