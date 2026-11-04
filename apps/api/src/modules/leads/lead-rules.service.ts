import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { LeadRulesInput, LeadRulesOptions } from "@places/contracts";
import { DEFAULT_LEAD_RULES, OWNER, OWNER_TL, leadRulesProblem, type LeadRules } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { AccessService } from "../access/access.service";
import { LeadsRepository } from "./leads.repository";

const KEY = "leadRules";

/**
 * 1.29 · «قواعد الليدز والتوزيع»: every timing and every person responsible for the leads. The jobs (SLA, No Answer,
 * Draft, the deal Alarm) and the leads list read them through get(), never numbers in the code. Saving checks the
 * combination (domain) and the people / roles named, audits before / after, and refreshes the working calendar.
 */
@Injectable()
export class LeadRulesService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly time: BusinessTimeService,
  ) {}

  /** The saved rules over the defaults (a rule added later gets its default until someone changes it). */
  async get(): Promise<LeadRules> {
    const row = await this.db.setting.findUnique({ where: { key: KEY } });
    return merge(DEFAULT_LEAD_RULES, (row?.value ?? {}) as Partial<LeadRules>);
  }

  async options(): Promise<LeadRulesOptions> {
    const [roles, people, telesales] = await Promise.all([this.access.listRoles(), this.repo.activePeople(), this.repo.activeWithRole("telesales")]);
    return { roles: roles.map((r) => ({ key: r.key, label: r.label })), people, telesales };
  }

  async set(me: CurrentUser, input: LeadRulesInput): Promise<LeadRules> {
    const problem = leadRulesProblem(input);
    if (problem) throw new BadRequestException(problem);
    await this.checkNames(input);
    const before = await this.get();
    await this.db.$transaction(async (tx) => {
      await tx.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: input as never }, update: { value: input as never } });
      await this.audit.record({ module: "settings", entity: "Setting", entityId: KEY, action: "update", userId: me.id, before, after: input }, tx);
    });
    this.time.invalidate(); // the SLA's hours / weekdays off may have changed
    return input;
  }

  /** Everyone named must exist: a role key, a person still working here (user id), «owner» or «ownerTl». */
  private async checkNames(r: LeadRulesInput) {
    const { roles, people, telesales } = await this.options();
    const known = new Set<string>([OWNER, OWNER_TL, ...roles.map((x) => x.key), ...people.map((x) => x.id)]);
    const lists = [r.sla.warn, r.sla.pull, r.newLead, r.noAnswer.notify, r.visit.postpone, r.visit.postponeInfo, r.visit.notDone, r.close.notify, r.draft.see, r.draft.notify, r.draftAdmin.see, r.draftAdmin.notify];
    const unknown = lists.flatMap((w) => w.to).find((x) => !known.has(x));
    if (unknown) throw new BadRequestException("فيه دور أو شخص مش موجود في المسؤولين");
    if (r.noAnswer.telesales && !telesales.some((t) => t.id === r.noAnswer.telesales)) throw new BadRequestException("اختار Telesales من القايمة");
  }
}

/** Deep merge of saved values over the defaults (objects only; arrays and values are taken as saved). */
function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== "object" || Array.isArray(over) || !base || typeof base !== "object" || Array.isArray(base)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = k in out ? merge(out[k], v) : v;
  return out as T;
}
