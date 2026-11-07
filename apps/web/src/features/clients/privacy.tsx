"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ClientFile } from "@places/contracts";
import { Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { day } from "@/lib/format";

/**
 * M-10 3.1 «موافقة على التواصل التسويقي» (اه / لا) and M-10 2.3 «عميل عايز يمسح بياناته: الطلب بيروح للإدارة».
 * Whoever may log a contact on the file writes them; everyone else reads.
 */
export function PrivacyBits({ file }: { file: ClientFile }) {
  const t = useTranslations("clients.privacy");
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const editable = can("clients", "create");
  const refresh = () => qc.invalidateQueries({ queryKey: ["client", file.id] });
  const setConsent = (v: string) => run(async () => {
    await api.put(`/clients/${file.id}/consent`, { consent: v === "yes" });
    await refresh();
  }, t("saved"));
  const askDeletion = () => {
    const reason = window.prompt(t("why"));
    if (!reason) return;
    void run(async () => {
      await api.post(`/clients/${file.id}/deletion-request`, { reason });
      await refresh();
    }, t("sent"));
  };
  const consent = file.marketingConsent == null ? "" : file.marketingConsent ? "yes" : "no";
  return (
    <>
      <div className="row">
        <span className="hint">{t("consentLabel")}</span>
        {editable
          ? <select value={consent} onChange={(e) => void setConsent(e.target.value)} aria-label={t("consent")}>
              {consent === "" && <option value="">{t("notAsked")}</option>}
              <option value="yes">{t("yes")}</option><option value="no">{t("no")}</option>
            </select>
          : <b>{consent === "yes" ? t("yes") : consent === "no" ? t("no") : "—"}</b>}
        <span className="spacer" />
        {editable && !file.deletionAsked && <button className="btn ghost sm" onClick={askDeletion}>{t("ask")}</button>}
      </div>
      {file.deletionAsked && (
        <Note kind="warn">{t("pending")} · {file.deletionAsked.reason} · {file.deletionAsked.by ?? "—"} · {day(file.deletionAsked.at)}</Note>
      )}
    </>
  );
}
