"use client";
import type { TicketRow } from "@places/contracts";
import { Chip } from "@/components/ui";

/** Demo «ST»: the status colours. */
const TONE: Record<string, "warn" | "info" | "ok" | "bad"> = { Open: "warn", "In Progress": "info", Resolved: "ok", Closed: "ok" };
export const PRIORITY: Record<string, string> = { normal: "عادية", high: "عالية" };

export function TicketChips({ t }: { t: Pick<TicketRow, "type" | "typeLabel" | "priority" | "status"> }) {
  return (
    <>
      {t.type === "dispute" && <Chip tone="bad">نزاع</Chip>}
      {t.type !== "dispute" && t.type !== "request" && <Chip tone="info">{t.typeLabel}</Chip>}
      {t.priority === "high" && <Chip tone="warn">عالية</Chip>}
      <Chip tone={TONE[t.status] ?? ""}>{t.status}</Chip>
    </>
  );
}
