import type { CurrentUser } from "../auth/current-user.decorator";

/**
 * Data scope as a Prisma `where` fragment for records that have an owner (e.g. a lead's assignedToId):
 * own → my records · team → my team's · dept → my department's · all → everything (M-09 2.7).
 */
export function ownedBy(me: CurrentUser, field = "assignedToId"): Record<string, unknown> {
  switch (me.grants.scope) {
    case "all": return {};
    case "dept": return me.department ? {} : { [field]: me.employeeId }; // department filter is applied by each module
    case "team": return { [field]: { in: me.teamIds } };
    case "own": return { [field]: me.employeeId };
  }
}
