import type { Prisma } from "@places/db";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { ownedBy } from "../../core/authz/scope";

/**
 * The leads a person reaches: their data scope (M-09 2.7) — and, for a salesperson, the leads they're tagged on with
 * the Team Leader's approval (client, 11 Nov), to see and work them with their owner.
 */
export function leadScope(me: CurrentUser): Prisma.LeadWhereInput {
  const own = ownedBy(me) as Prisma.LeadWhereInput;
  if (me.grants.scope === "all" || !me.employeeId) return own;
  return { OR: [own, { tags: { some: { employeeId: me.employeeId, status: "APPROVED" } } }] };
}
