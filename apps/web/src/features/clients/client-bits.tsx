import type { ClientKind } from "@places/domain";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui";

/** «عميل» / «مالك»; «الاتنين» shows both. A kind, not a status, so no colour (client, 17 Nov: the demo's red «عميل» read as an error). */
const KIND_CHIPS: Record<ClientKind, ("client" | "owner")[]> = { client: ["client"], owner: ["owner"], both: ["client", "owner"] };
export function KindChips({ kind }: { kind: ClientKind }) {
  const t = useTranslations("clients.kind");
  return <>{KIND_CHIPS[kind].map((k) => <Chip key={k}>{t(k)}</Chip>)}</>;
}
