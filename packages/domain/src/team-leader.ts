/**
 * M-12 · Team Leaders (voice note 6): the team target is the sum of its salespeople's targets; the TL earns a
 * percentage of each team member's share, and that percentage comes from the tier the whole team reached.
 */
import { type Piasters, percentOf } from "./money.ts";

/** Tiers sorted by `below`: "if the team achieved less than `below` %, the TL gets `percent` %". The last tier has below = Infinity. */
export interface TlTier { readonly below: number; readonly percent: number }

export interface TeamResult {
  readonly goal: Piasters;
  readonly achieved: Piasters;
  readonly achievedPercent: number;
  readonly tier: TlTier;
  readonly commission: Piasters;
}

export function teamResult(
  members: ReadonlyArray<{ readonly goal: Piasters; readonly achieved: Piasters; readonly shareOfCollections: Piasters }>,
  tiers: readonly TlTier[],
): TeamResult {
  if (tiers.length === 0) throw new RangeError("teamResult: at least one tier is required");
  const sorted = [...tiers].sort((a, b) => a.below - b.below);
  const goal = members.reduce((s, m) => s + m.goal, 0);
  const achieved = members.reduce((s, m) => s + m.achieved, 0);
  const achievedPercent = goal > 0 ? (achieved / goal) * 100 : 0;
  const tier = sorted.find((t) => achievedPercent < t.below) ?? sorted[sorted.length - 1]!;
  const base = members.reduce((s, m) => s + m.shareOfCollections, 0);
  return { goal, achieved, achievedPercent, tier, commission: percentOf(base, tier.percent) };
}
