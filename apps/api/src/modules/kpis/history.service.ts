import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { HistoricalFigureInput, HistoricalFigures, HistoricalKind } from "@places/contracts";
import { historicalProblem, periodId, quarterLabel } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { HistoryRepository } from "./history.repository";

const MODULE = "kpis";
const KIND_LABEL: Record<HistoricalKind, string> = { score: "نتيجة الـ KPIs", target: "التارجت", achieved: "المحقق" };

/**
 * 14.12 · a past quarter's figures typed by hand (Q4 2025, before the system): each person's KPI result, target and
 * achieved, shown under that quarter in the «سنة + ربع» filter. Read and typed by the admins (kpis: edit) and HR (hr: edit).
 */
@Injectable()
export class HistoryService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: HistoryRepository,
    private readonly audit: AuditService,
  ) {}

  private allowed(me: CurrentUser) {
    if (!me.grants.can("kpis", "edit") && !me.grants.can("hr", "edit")) throw new ForbiddenException("أرقام الأرباع اللي فاتت للأدمن والـ HR");
  }

  async list(me: CurrentUser, period: string): Promise<HistoricalFigures> {
    this.allowed(me);
    const [rows, people] = await Promise.all([this.repo.list(period), this.repo.people()]);
    const names = new Map(people.map((p) => [p.id, p.name]));
    const users = new Map(people.map((p) => [p.userId, p.name]));
    return {
      period, label: quarterLabel(period), can: { edit: true },
      people: people.map((p) => ({ id: p.id, name: p.name })),
      rows: rows.map((r) => ({
        id: r.id, period: r.period, employeeId: r.employeeId, name: names.get(r.employeeId) ?? "—", kind: r.kind as HistoricalKind,
        value: r.value.toFixed(2), note: r.note, by: users.get(r.createdById) ?? "", at: r.updatedAt.toISOString(),
      })).sort((a, b) => a.name.localeCompare(b.name, "ar")),
    };
  }

  /** One figure per person, kind and quarter: typing it again replaces it (the old value stays in the audit log). */
  async save(me: CurrentUser, input: HistoricalFigureInput) {
    this.allowed(me);
    const period = periodId(input.year, input.quarter);
    const problem = historicalProblem(period, new Date());
    if (problem) throw new BadRequestException(problem);
    const person = (await this.repo.people()).find((p) => p.id === input.employeeId);
    if (!person) throw new NotFoundException("الموظف مش موجود");
    return this.db.$transaction(async (tx) => {
      const before = await this.repo.find(period, input.employeeId, input.kind, tx);
      const row = await this.repo.save({ period, employeeId: input.employeeId, kind: input.kind, value: input.value, note: input.note || null, createdById: me.id }, tx);
      await this.audit.record({ module: MODULE, entity: "HistoricalFigure", entityId: row.id, action: before ? "update" : "create", userId: me.id,
        before: before && { value: before.value.toFixed(2), note: before.note },
        after: { value: input.value, note: input.note ?? null, summary: `${KIND_LABEL[input.kind]} ${person.name} (${quarterLabel(period)}) = ${input.value}` } }, tx);
      return { id: row.id };
    });
  }

  async remove(me: CurrentUser, id: string) {
    this.allowed(me);
    await this.db.$transaction(async (tx) => {
      const row = await this.repo.one(id, tx);
      if (!row) throw new NotFoundException("الرقم ده مش موجود");
      await this.repo.remove(id, tx);
      await this.audit.record({ module: MODULE, entity: "HistoricalFigure", entityId: id, action: "delete", userId: me.id,
        before: { period: row.period, employeeId: row.employeeId, kind: row.kind, value: row.value.toFixed(2), note: row.note } }, tx);
    });
  }
}
