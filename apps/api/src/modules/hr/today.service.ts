import { Injectable } from "@nestjs/common";
import type { TodayLine } from "@places/contracts";
import { excuseDeduction, localDate } from "@places/domain";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { AttendanceService } from "./attendance.service";
import { ExcusesService } from "./excuses.service";
import { LeavesService } from "./leaves.service";
import { PeopleCareService } from "./people-care.service";
import { EmployeeFileService } from "./employee-file.service";

/**
 * 0.18 · «مهامي النهارده» from HR (demo home.js): the leaves and Excuses whose turn is mine (the TL's first, then HR's,
 * as each service decides `canDecide`), «نسي البصمة» waiting for HR's Confirmation, and the 1:1 actions due.
 */
@Injectable()
export class HrTodayService {
  constructor(private readonly leaves: LeavesService, private readonly excuses: ExcusesService, private readonly attendance: AttendanceService, private readonly care: PeopleCareService, private readonly file: EmployeeFileService) {}

  async lines(me: CurrentUser): Promise<TodayLine[]> {
    const approves = me.grants.can("hr", "approve");
    const [leaves, excuses, forgot, actions, left] = await Promise.all([
      approves ? this.leaves.list(me) : [],
      approves ? this.excuses.list(me) : [],
      approves ? this.attendance.forgotWaiting(me) : [],
      me.grants.can("hr", "edit") ? this.care.actions().then((a) => a.items) : [],
      me.grants.can("hr", "edit") && me.grants.scope === "all" ? this.file.left(me) : [], // the month's last week: who has no 1-to-1 yet
    ]);
    return [
      ...leaves.filter((l) => l.canDecide).map((l): TodayLine => ({ kind: l.canDecide === "tl" ? "leaveTl" : "leaveHr", tone: "warn", id: l.id, values: { name: l.name, type: l.type, from: l.from, to: l.to } })),
      ...excuses.filter((x) => x.canDecide).map((x): TodayLine => ({ kind: x.canDecide === "tl" ? "excuseTl" : "excuseHr", tone: x.number >= 5 ? "bad" : "warn", id: x.id, values: { name: x.name, n: x.number, day: x.day, cost: x.number >= 5 ? "fifth" : excuseDeduction(x.number) ? "half" : "free" } })),
      ...forgot.map((f): TodayLine => ({ kind: "forgot", tone: "bad", id: f.id, values: { name: f.name, day: f.day } })),
      ...actions.filter((a) => a.due <= localDate(new Date())).map((a): TodayLine => ({ kind: "hrAction", tone: "bad", id: a.employeeId, values: { action: a.action, name: a.name, due: a.due } })),
      ...left.slice(0, 1).map((): TodayLine => ({ kind: "oneOnOneLeft", tone: "warn", id: "", values: { n: left.length, names: left.join("، ") } })),
    ];
  }
}
