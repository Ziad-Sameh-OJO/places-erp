/**
 * «نوع الـ Channel» (client, 22 Nov): under each channel in «الإعدادات ← القوايم», a list the marketing types itself —
 * Instagram → Reel, Story, Post… A lead that came on that channel says which one. A channel without a list has no
 * type. The values follow the lists' rules (M-13 2.1): switched off, never deleted, so old leads keep theirs.
 */
import { type ListAction, type ListValue, allowedValue, listActions, listChangeProblem } from "./lists.ts";

export type ChannelTypes = Readonly<Record<string, readonly ListValue[]>>;

/** The types a form offers for this channel: its active ones, in the order they were added. */
export const channelTypesOf = (all: ChannelTypes, channel: string | null | undefined): string[] =>
  channel ? (all[channel] ?? []).filter((t) => t.active).map((t) => t.value) : [];

/**
 * Saving the lists: each list under a channel of the channels list, nothing deleted (switch off instead). Returns
 * the problem (Arabic, shown as is) and what the save does (add / off), which decides who may make it.
 */
export function channelTypesChange(before: ChannelTypes, after: ChannelTypes, channels: readonly string[]): { problem: string | null; actions: ListAction[] } {
  const stranger = Object.keys(after).find((c) => !channels.includes(c));
  if (stranger) return { problem: `«${stranger}» مش Channel في القايمة`, actions: [] };
  const actions = new Set<ListAction>();
  for (const channel of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const problem = listChangeProblem(before[channel] ?? [], after[channel] ?? []);
    if (problem) return { problem, actions: [] };
    for (const a of listActions(before[channel] ?? [], after[channel] ?? [])) actions.add(a);
  }
  return { problem: null, actions: [...actions] };
}

/**
 * A lead's type: one of its channel's active types, or the one the lead already has (switched off since). Empty is
 * fine: the type is optional.
 */
export function channelTypeProblem(all: ChannelTypes, channel: string, type: string | null | undefined, current: string | null = null): string | null {
  if (!type) return null;
  if (!all[channel]?.length) return `«${channel}» مالهاش أنواع`;
  return allowedValue(all[channel]!, type, current) ? null : `«${type}» مش من أنواع «${channel}»`;
}
