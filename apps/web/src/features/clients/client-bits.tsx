import type { ClientKind } from "@places/domain";
import { Chip } from "@/components/ui";

/** The demo's chips: «عميل» accent, «مالك» green; «الاتنين» shows both. */
const KIND_CHIPS: Record<ClientKind, [string, "acc" | "ok"][]> = {
  client: [["عميل", "acc"]], owner: [["مالك", "ok"]], both: [["عميل", "acc"], ["مالك", "ok"]],
};
export const KIND_WORD: Record<ClientKind, string> = { client: "عميل", owner: "مالك", both: "عميل + مالك" };
export const KindChips = ({ kind }: { kind: ClientKind }) => <>{KIND_CHIPS[kind].map(([t, tone]) => <Chip key={t} tone={tone}>{t}</Chip>)}</>;
