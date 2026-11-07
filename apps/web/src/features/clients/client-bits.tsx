import type { ClientKind } from "@places/domain";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui";

/** The demo's chips: «عميل» accent, «مالك» green; «الاتنين» shows both. */
const KIND_CHIPS: Record<ClientKind, ["client" | "owner", "acc" | "ok"][]> = {
  client: [["client", "acc"]], owner: [["owner", "ok"]], both: [["client", "acc"], ["owner", "ok"]],
};
export function KindChips({ kind }: { kind: ClientKind }) {
  const t = useTranslations("clients.kind");
  return <>{KIND_CHIPS[kind].map(([k, tone]) => <Chip key={k} tone={tone}>{t(k)}</Chip>)}</>;
}
