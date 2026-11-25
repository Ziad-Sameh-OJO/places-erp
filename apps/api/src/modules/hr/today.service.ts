import { Injectable } from "@nestjs/common";
import type { TodayLine } from "@places/contracts";
import { clockOn } from "@places/db";
import { excuseDeduction, excuseRefused, localDate, WORK_START } from "@places/domain";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { AttendanceService } from "./attendance.service";
import { ExcusesService } from "./excuses.service";
import { HrRepository } from "./hr.repository";
import { LeavesService } from "./leaves.service";
import { PeopleCareService } from "./people-care.service";
import { WarningsService } from "./warnings.service";
import { ImprovementService } from "./improvement.service";
import { CareerService } from "./career.service";
import { EmployeeFileService } from "./employee-file.service";

/**
 * 0.18 · «مهامي النهارده» from HR (demo home.js): the leaves and Excuses whose turn is mine (the TL's first, then HR's,
 * as each service decides `canDecide`), «نسي البصمة» waiting for HR's Confirmation, the 1:1 actions due, and (HR, 15 Nov)
 * after the work start, who hasn't punched today, for HR to decide.
 */
@Injectable()
export class HrTodayService {
  constructor(private readonly leaves: LeavesService, private readonly excuses: ExcusesService, private readonly attendance: AttendanceService, private readonly care: PeopleCareService, private readonly repo: HrRepository, private readonly file: EmployeeFileService, private readonly career: CareerService, private readonly warnings: WarningsService, private readonly plans: ImprovementService) {}

  async lines(me: CurrentUser): Promise<TodayLine[]> {
    const approves = me.grants.can("hr", "approve"), now = new Date(), today = localDate(now);
    const hr = me.grants.scope === "all" && me.grants.can("hr", "edit");
    const decides = hr && clockOn(now, today)! >= WORK_START;
    const [leaves, excuses, forgot, actions, missing, rules, left, due, warnings, plans] = await Promise.all([
      approves ? this.leaves.list(me) : [],
      approves ? this.excuses.list(me) : [],
      approves ? this.attendance.forgotWaiting(me) : [],
      me.grants.can("hr", "edit") ? this.care.actions(me).then((a) => a.items) : [],
      decides ? this.attendance.day(me, today).then((d) => d.missing) : [],
      this.repo.deductionRules(),
      me.grants.can("hr", "edit") && me.grants.scope === "all" ? this.file.left(me) : [], // the month's last week: who has no 1-to-1 yet
      me.grants.can("hr", "edit") ? this.career.due(me) : [],
      hr ? this.warnings.todayLines() : [], // HR 15 Nov: who needs a warning this month
      approves ? this.plans.todayLines(me) : [], // the TL's plans to write · HR's plans to read and follow
    ]);
    const names = missing.slice(0, 5).map((m) => m.name).join("، ") + (missing.length > 5 ? "…" : "");
    return [
      ...leaves.filter((l) => l.canDecide).map((l): TodayLine => ({ kind: l.canDecide === "tl" ? "leaveTl" : "leaveHr", tone: "warn", id: l.id, values: { name: l.name, type: l.type, from: l.from, to: l.to } })),
      ...excuses.filter((x) => x.canDecide).map((x): TodayLine => ({ kind: x.canDecide === "tl" ? "excuseTl" : "excuseHr", tone: excuseRefused(x.number, rules) ? "bad" : "warn", id: x.id, values: { name: x.name, n: x.number, day: x.day, cost: excuseRefused(x.number, rules) ? "fifth" : excuseDeduction(x.number, rules) ? "half" : "free" } })),
      ...forgot.map((f): TodayLine => ({ kind: "forgot", tone: "bad", id: f.id, values: { name: f.name, day: f.day } })),
      ...actions.filter((a) => a.due <= today).map((a): TodayLine => ({ kind: "hrAction", tone: "bad", id: a.employeeId, values: { action: a.action, name: a.name, due: a.due } })),
      ...(missing.length ? [{ kind: "noPunch", tone: "warn", id: today, values: { n: missing.length, names } } satisfies TodayLine] : []),
      ...left.slice(0, 1).map((): TodayLine => ({ kind: "oneOnOneLeft", tone: "warn", id: "", values: { n: left.length, names: left.join("، ") } })),
      // «المسار الوظيفي»: due a promotion after the latest closed quarter, until HR records it
      ...due.map((r): TodayLine => ({ kind: "careerDue", tone: "warn", id: r.employeeId, values: { name: r.name, from: r.level?.name ?? "", to: r.next?.name ?? "" } })),
      ...warnings, ...plans,
    ];
  }
}
