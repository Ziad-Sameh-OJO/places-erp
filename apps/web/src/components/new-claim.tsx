"use client";
import { useQueryClient } from "@tanstack/react-query";
import type { ClaimsView } from "@places/contracts";
import { Field, Icon, Modal, Note, onFormSubmit, useAction } from "./ui";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

/**
 * «اطلب مطالبة» (demo claims.js `claimNew`, 9.17): from Finance's claims tab, or from a deal's drawer with its company
 * and unit filled in. Shared because both the finance and the deals screens open it.
 */
export function NewClaim({ entities, initial, onClose }: { entities: ClaimsView["entities"]; initial?: { company: string; unit: string; unitInfo: string }; onClose: () => void }) {
  const t = useTranslations("ui.claim");
  const run = useAction();
  const qc = useQueryClient();
  const save = onFormSubmit((d) => run(async () => {
    await api.post("/claims", Object.fromEntries(["company", "unit", "unitInfo", "amount", "side", "kind", "entityId", "note"].map((k) => [k, String(d.get(k) ?? "")])));
    await qc.invalidateQueries({ queryKey: ["finance"] }); onClose();
  }, t("sent")));
  return (
    <Modal title={t("title")} onClose={onClose}>
      <form className="grid" onSubmit={save}>
        <Note>{t("note")}</Note>
        <Field label={t("company")} req wide><input name="company" required defaultValue={initial?.company} /></Field>
        <Field label={t("unit")} req><input name="unit" required defaultValue={initial?.unit} /></Field>
        <Field label={t("side")} req><select name="side" defaultValue="client"><option value="client">{t("client")}</option><option value="owner">{t("owner")}</option></select></Field>
        <Field label={t("unitInfo")} req wide><input name="unitInfo" required defaultValue={initial?.unitInfo} placeholder={t("unitInfoPlaceholder")} /></Field>
        <Field label={t("entity")} req><select name="entityId" defaultValue="places">{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label={t("amount")} req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required /></Field>
        <Field label={t("kind")} req><input name="kind" required placeholder={t("kindPlaceholder")} /></Field>
        <Field label={t("financeNote")} wide><input name="note" placeholder={t("optional")} /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button><button className="btn"><Icon name="send" />{t("send")}</button></div>
      </form>
    </Modal>
  );
}
