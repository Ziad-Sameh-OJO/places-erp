"use client";
import { useQueryClient } from "@tanstack/react-query";
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
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const editable = can("clients", "create");
  const refresh = () => qc.invalidateQueries({ queryKey: ["client", file.id] });
  const setConsent = (v: string) => run(async () => {
    await api.put(`/clients/${file.id}/consent`, { consent: v === "yes" });
    await refresh();
  }, "اتسجّل");
  const askDeletion = () => {
    const reason = window.prompt("ليه العميل عايز يمسح بياناته؟ الطلب هيروح للإدارة");
    if (!reason) return;
    void run(async () => {
      await api.post(`/clients/${file.id}/deletion-request`, { reason });
      await refresh();
    }, "الطلب اتبعت للإدارة");
  };
  const consent = file.marketingConsent == null ? "" : file.marketingConsent ? "yes" : "no";
  return (
    <>
      <div className="row">
        <span className="hint">موافق على التواصل التسويقي:</span>
        {editable
          ? <select value={consent} onChange={(e) => void setConsent(e.target.value)} aria-label="موافق على التواصل التسويقي">
              {consent === "" && <option value="">لسه ماتسألش</option>}
              <option value="yes">اه</option><option value="no">لا</option>
            </select>
          : <b>{consent === "yes" ? "اه" : consent === "no" ? "لا" : "—"}</b>}
        <span className="spacer" />
        {editable && !file.deletionAsked && <button className="btn ghost sm" onClick={askDeletion}>طلب مسح البيانات</button>}
      </div>
      {file.deletionAsked && (
        <Note kind="warn">طلب مسح البيانات مستني الإدارة (حماية البيانات) · {file.deletionAsked.reason} · {file.deletionAsked.by ?? "—"} · {day(file.deletionAsked.at)}</Note>
      )}
    </>
  );
}
