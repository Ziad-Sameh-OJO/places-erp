"use client";
import { useTranslations } from "next-intl";
import { CANCEL_REASONS, type CancelReason } from "@places/domain";
import { Field, Icon, Modal, onFormSubmit } from "@/components/ui";

/**
 * Client, 22 Nov: Cancellation isn't saved on the click. This asks why, from the client's list (the filter «سبب
 * الإلغاء» reads it), with a comment if the salesperson wants to add one; closing it leaves the stage as it was.
 */
export function CancelReasonModal({ name, onSave, onClose }: { name: string; onSave: (reason: CancelReason, note: string) => void; onClose: () => void }) {
  const t = useTranslations("leads.cancel");
  return (
    <Modal title={t("title", { name })} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((d) => {
        const reason = String(d.get("reason") ?? "");
        if (!(CANCEL_REASONS as readonly string[]).includes(reason)) return;
        onSave(reason as CancelReason, String(d.get("note") ?? "").trim());
      })}>
        <Field label={t("reason")} req wide>
          <select name="reason" required defaultValue="">
            <option value="" disabled>{t("pick")}</option>
            {CANCEL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label={t("comment")} wide><textarea name="note" maxLength={2000} rows={3} placeholder={t("commentPh")} /></Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={onClose}>{t("back")}</button>
          <button className="btn"><Icon name="check" />{t("save")}</button>
        </div>
      </form>
    </Modal>
  );
}
