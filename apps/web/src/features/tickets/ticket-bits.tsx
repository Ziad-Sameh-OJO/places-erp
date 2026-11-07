"use client";
import type { TicketRow } from "@places/contracts";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui";
import { serverText } from "@/lib/server-text";

/** Demo «ST»: the status colours. */
const TONE: Record<string, "warn" | "info" | "ok" | "bad"> = { Open: "warn", "In Progress": "info", Resolved: "ok", Closed: "ok" };
/** The priority's name in the reader's language; an unknown key shows as it is. */
export function usePriority() {
  const t = useTranslations("tickets.priority");
  return (p: string) => (p === "normal" || p === "high" ? t(p) : p);
}

export function TicketChips({ t }: { t: Pick<TicketRow, "type" | "typeLabel" | "priority" | "status"> }) {
  const tr = useTranslations("tickets.chips");
  return (
    <>
      {t.type === "dispute" && <Chip tone="bad">{tr("dispute")}</Chip>}
      {t.type !== "dispute" && t.type !== "request" && <Chip tone="info">{serverText(t.typeLabel)}</Chip>}
      {t.priority === "high" && <Chip tone="warn">{tr("high")}</Chip>}
      <Chip tone={TONE[t.status] ?? ""}>{t.status}</Chip>
    </>
  );
}
