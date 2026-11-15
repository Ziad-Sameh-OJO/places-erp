/**
 * 14.8 · the lead's units log (management meeting, 15 Nov): every step with its date and its units, in the order a
 * client goes through them — the List of options he was sent, the Visits, the Short list, the Meeting. It replaces
 * keeping a PDF for every time: the PDF is made again whenever someone asks for it.
 */
export const JOURNEY_STAGES = ["list", "visit", "shortlist", "meeting"] as const;
export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export interface JourneyStep { readonly stage: JourneyStage; readonly at: string }

/** The steps by stage, in the stages' order, each stage oldest first; an empty stage is still there (the page shows «لسه»). */
export function unitJourney<T extends JourneyStep>(steps: readonly T[]): { stage: JourneyStage; steps: T[] }[] {
  return JOURNEY_STAGES.map((stage) => ({
    stage,
    steps: steps.filter((s) => s.stage === stage).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  }));
}

/**
 * 14.11 · the recommendations with the units the client already visited first (and marked), the rest in their order.
 * A visited unit that doesn't match any more isn't added: the log shows it.
 */
export function visitedFirst<T extends { readonly id: string }>(items: readonly T[], visited: ReadonlySet<string>): (T & { visited: boolean })[] {
  const marked = items.map((u) => ({ ...u, visited: visited.has(u.id) }));
  return [...marked.filter((u) => u.visited), ...marked.filter((u) => !u.visited)];
}
