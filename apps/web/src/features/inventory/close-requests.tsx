"use client";
import { useQueryClient } from "@tanstack/react-query";
import type { UnitDetail } from "@places/contracts";
import { Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";

const closedAs = (type: string) => (type === "Rent" ? "Rented" : "Sold");
const confirmer = (type: string) => (type === "Rent" ? "منار" : "رندا");

/**
 * Q16 (demo unit drawer): a Done Deal approved on the unit waits for Manar (Rent) or Randa (Resale / Income) to
 * confirm the close; a confirmed one says which deal closed which side (Q17: the other side stays open).
 */
export function CloseRequests({ unit }: { unit: UnitDetail }) {
  const qc = useQueryClient();
  const run = useAction();
  const confirm = (dealId: string, type: string) => void run(async () => {
    await api.post(`/inventory/units/${unit.id}/locks/${dealId}/confirm`);
    await Promise.all([qc.invalidateQueries({ queryKey: ["unit"] }), qc.invalidateQueries({ queryKey: ["units"] })]);
  }, `${unit.code} اتقفلت · ${closedAs(type)}`);
  return (
    <>
      {unit.locks.map((l) => l.status === "pending"
        ? (
          <Note key={l.dealId} kind="warn">
            <b>Done Deal {l.dealCode} اتوافق عليها.</b> الوحدة بتتقفل ({l.type}) بعد تأكيد {confirmer(l.type)}.{" "}
            {l.canConfirm && <button className="btn sm" onClick={() => confirm(l.dealId, l.type)}><Icon name="check" />أكّد القفل ({closedAs(l.type)})</button>}
          </Note>
        )
        : <Note key={l.dealId}>الـ {l.type} اتقفل ({closedAs(l.type)}) بـ Done Deal {l.dealCode}{l.lockedAt ? ` · ${day(l.lockedAt)}` : ""}</Note>)}
    </>
  );
}
