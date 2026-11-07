"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { UnitDetail } from "@places/contracts";
import { Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";

const closedAs = (type: string) => (type === "Rent" ? "Rented" : "Sold");

/**
 * Q16 (demo unit drawer): a Done Deal approved on the unit waits for Manar (Rent) or Randa (Resale / Income) to
 * confirm the close; a confirmed one says which deal closed which side (Q17: the other side stays open).
 */
export function CloseRequests({ unit }: { unit: UnitDetail }) {
  const t = useTranslations("inventory.closeRequests");
  const qc = useQueryClient();
  const run = useAction();
  const confirmer = (type: string) => (type === "Rent" ? t("manar") : t("randa"));
  const confirm = (dealId: string, type: string) => void run(async () => {
    await api.post(`/inventory/units/${unit.id}/locks/${dealId}/confirm`);
    await Promise.all([qc.invalidateQueries({ queryKey: ["unit"] }), qc.invalidateQueries({ queryKey: ["units"] })]);
  }, t("closedToast", { code: unit.code, as: closedAs(type) }));
  return (
    <>
      {unit.locks.map((l) => l.status === "pending"
        ? (
          <Note key={l.dealId} kind="warn">
            <b>{t("approved", { code: l.dealCode })}</b> {t("waits", { type: l.type, who: confirmer(l.type) })}{" "}
            {l.canConfirm && <button className="btn sm" onClick={() => confirm(l.dealId, l.type)}><Icon name="check" />{t("confirm", { as: closedAs(l.type) })}</button>}
          </Note>
        )
        : <Note key={l.dealId}>{t("closed", { type: l.type, as: closedAs(l.type), code: l.dealCode })}{l.lockedAt ? ` · ${day(l.lockedAt)}` : ""}</Note>)}
    </>
  );
}
