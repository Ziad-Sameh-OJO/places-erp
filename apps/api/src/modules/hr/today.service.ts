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

/**
 * 0.18 · «مهامي النهارده» from HR (demo home.js): the leaves and Excuses whose turn is mine (the TL's first, then HR's,
 * as each service decides `canDecide`), «نسي البصمة» waiting for HR's Confirmation, the 1:1 actions due, and (HR, 15 Nov)
 * after the work start, who hasn't punched today, for HR to decide.
 */
@Injectable()
export class HrTodayService {
  constructor(private readonly leaves: LeavesService, private readonly excuses: ExcusesService, private readonly attendance: AttendanceService, private readonly care: PeopleCareService, private readonly repo: HrRepository) {}

  async lines(me: CurrentUser): Promise<TodayLine[]> {
    const approves = me.grants.can("hr", "approve"), now = new Date(), today = localDate(now);
    const decides = me.grants.scope === "all" && me.grants.can("hr", "edit") && clockOn(now, today)! >= WORK_START;
    const [leaves, excuses, forgot, actions, missing, rules] = await Promise.all([
      approves ? this.leaves.list(me) : [],
      approves ? this.excuses.list(me) : [],
      approves ? this.attendance.forgotWaiting(me) : [],
      me.grants.can("hr", "edit") ? this.care.actions().then((a) => a.items) : [],
      decides ? this.attendance.day(me, today).then((d) => d.missing) : [],
      this.repo.deductionRules(),
    ]);
    const names = missing.slice(0, 5).map((m) => m.name).join("، ") + (missing.length > 5 ? "…" : "");
    return [
      ...leaves.filter((l) => l.canDecide).map((l): TodayLine => ({ kind: l.canDecide === "tl" ? "leaveTl" : "leaveHr", tone: "warn", id: l.id, values: { name: l.name, type: l.type, from: l.from, to: l.to } })),
      ...excuses.filter((x) => x.canDecide).map((x): TodayLine => ({ kind: x.canDecide === "tl" ? "excuseTl" : "excuseHr", tone: excuseRefused(x.number, rules) ? "bad" : "warn", id: x.id, values: { name: x.name, n: x.number, day: x.day, cost: excuseRefused(x.number, rules) ? "fifth" : excuseDeduction(x.number, rules) ? "half" : "free" } })),
      ...forgot.map((f): TodayLine => ({ kind: "forgot", tone: "bad", id: f.id, values: { name: f.name, day: f.day } })),
      ...actions.filter((a) => a.due <= today).map((a): TodayLine => ({ kind: "hrAction", tone: "bad", id: a.employeeId, values: { action: a.action, name: a.name, due: a.due } })),
      ...(missing.length ? [{ kind: "noPunch", tone: "warn", id: today, values: { n: missing.length, names } } satisfies TodayLine] : []),
    ];
  }
}
