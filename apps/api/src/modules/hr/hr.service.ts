import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@places/db";
import type { EmployeeFile, EmployeeFilters, EmployeePatch, EmployeeRow, EmployeesView } from "@places/contracts";
import { fromDecimal, tiersProblem, toDecimal } from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { HrRepository, type EmployeeRowDb, type Tx } from "./hr.repository";
import { hideEmployee, keepEmployee } from "./hr-fields";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const money = (v: { toFixed(n: number): string }) => toDecimal(fromDecimal(v.toFixed(2)));

/**
 * M-05 · the employee file (7.1): salary, target, scheme, full / part-time (and whether a part-timer has deductions),
 * per-person deduction tiers, a fixed schedule, the leave balance. HR edits it (hr: edit); the Super Admin only views
 * (Q49 — the M-09 matrix gives admin hr: view / export). Every change is audited with its old and new values (Q50).
 */
@Injectable()
export class HrService {
  constructor(private readonly repo: HrRepository, private readonly audit: AuditService) {}

  /** The data scope as a filter on employees: all · my department · my team · me (M-09 2.7). */
  private scope(me: CurrentUser): Prisma.EmployeeWhereInput {
    switch (me.grants.scope) {
      case "all": return {};
      case "dept": return me.department ? { department: me.department } : { userId: me.id };
      case "team": return { id: { in: me.teamIds } };
      case "own": return { userId: me.id };
    }
  }

  async list(me: CurrentUser, f: EmployeeFilters): Promise<EmployeesView> {
    // AND: the filters narrow the scope, never replace it (a department filter mustn't lift a department scope)
    const where: Prisma.EmployeeWhereInput = { AND: [
      this.scope(me),
      f.department ? { department: f.department } : {},
      f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { department: { contains: f.q, mode: "insensitive" } }, { jobTitle: { contains: f.q, mode: "insensitive" } }] } : {},
    ] };
    const [rows, deps] = await Promise.all([this.repo.employees(where), this.repo.departments(this.scope(me))]);
    const hidden = me.fields.hidden("hr");
    return { items: rows.map((e) => hideEmployee(this.row(e), hidden)), departments: deps.map((d) => d.department) };
  }

  async file(me: CurrentUser, id: string): Promise<EmployeeFile> {
    const e = await this.repo.employee(id, this.scope(me));
    if (!e) throw new NotFoundException("الموظف مش موجود");
    return hideEmployee(this.view(e), me.fields.hidden("hr"));
  }

  async update(me: CurrentUser, id: string, sent: EmployeePatch, run: Run): Promise<EmployeeFile> {
    // M-09 field permissions: what the person may not change keeps its stored value (the form sends the whole file)
    const fixed = me.fields.fixed("hr");
    const stored = fixed.size ? await this.repo.employee(id, this.scope(me)) : null;
    const p = stored ? keepEmployee(sent, this.view(stored), fixed) : sent;
    if (p.deductionTiers) { const bad = tiersProblem(p.deductionTiers); if (bad) throw new BadRequestException(bad); }
    if (fromDecimal(p.salary) < 0 || (p.target && fromDecimal(p.target) < 0)) throw new BadRequestException("المبالغ مابتبقاش بالسالب");
    return run(async (tx) => {
      const before = await this.repo.employee(id, this.scope(me), tx);
      if (!before) throw new NotFoundException("الموظف مش موجود");
      const data: Prisma.EmployeeUncheckedUpdateInput = {
        salary: p.salary,
        ...(p.target !== undefined ? { target: p.target } : {}),
        ...(p.commissionPct !== undefined ? { commissionPct: p.commissionPct } : {}),
        ...(p.partTime !== undefined ? { partTime: p.partTime } : {}),
        ...(p.partTimeDeductions !== undefined ? { partTimeDeductions: p.partTimeDeductions } : {}),
        ...(p.leaveBalance !== undefined ? { leaveBalance: p.leaveBalance } : {}),
        ...(p.joinedAt !== undefined ? { joinedAt: p.joinedAt ? new Date(`${p.joinedAt}T00:00:00Z`) : null } : {}),
        ...(p.deductionTiers !== undefined ? { deductionTiers: p.deductionTiers ?? Prisma.DbNull } : {}),
        ...(p.fixedSchedule !== undefined ? { fixedSchedule: p.fixedSchedule || null } : {}),
      };
      const after = await this.repo.update(id, data, tx);
      const b = this.view(before), a = this.view(after);
      const keys = ["salary", "target", "commissionPct", "partTime", "partTimeDeductions", "leaveBalance", "joinedAt", "deductionTiers", "fixedSchedule"] as const;
      const changed = keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
      if (changed.length) await this.audit.record({ module: "hr", entity: "Employee", entityId: id, action: "update", userId: me.id,
        before: Object.fromEntries(changed.map((k) => [k, b[k]])), after: Object.fromEntries(changed.map((k) => [k, a[k]])) }, tx);
      return hideEmployee(a, me.fields.hidden("hr"));
    });
  }

  private row(e: EmployeeRowDb): EmployeeRow {
    return { id: e.id, userId: e.userId, name: e.name, jobTitle: e.jobTitle, department: e.department, partTime: e.partTime,
      salary: money(e.salary), target: money(e.target), commissionPct: e.commissionPct.toFixed(2), leaveBalance: e.leaveBalance, customTiers: e.deductionTiers != null };
  }

  private view(e: EmployeeRowDb): EmployeeFile {
    return { ...this.row(e), email: e.user.email, manager: e.manager, team: e.team, joinedAt: e.joinedAt ? e.joinedAt.toISOString().slice(0, 10) : null,
      partTimeDeductions: e.partTimeDeductions, deductionTiers: (e.deductionTiers as EmployeeFile["deductionTiers"]) ?? null, fixedSchedule: e.fixedSchedule };
  }
}
