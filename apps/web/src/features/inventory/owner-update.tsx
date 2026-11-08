"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { UnitDetail } from "@places/contracts";
import { Field, Icon, Modal, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * 2.29 · the demo's «ابديت مع المالك النهارده» (inventory.js:158): the owner was spoken to today. The API sets the
 * last update, closes the unit's open «متابعة مع المالك» and writes it on the owner's file; a comment is optional.
 */
export function OwnerUpdateButton({ u }: { u: UnitDetail }) {
  const t = useTranslations("inventory.ownerUpdate");
  const qc = useQueryClient();
  const run = useAction();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const save = () => void run(async () => {
    setBusy(true);
    try {
      await api.post(`/inventory/units/${u.id}/owner-update`, comment.trim() ? { comment: comment.trim() } : {});
      setOpen(false);
      setComment("");
      await Promise.all([qc.invalidateQueries({ queryKey: ["unit"] }), qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["tasks"] })]);
    } finally { setBusy(false); }
  }, t("done"));
  return (
    <>
      <button className="btn ghost" onClick={() => setOpen(true)}><Icon name="clock" />{t("button")}</button>
      {open && <Modal title={`${t("button")} · ${u.code}`} onClose={() => setOpen(false)}>
        <div className="grid">
          <Field label={t("comment")} wide><textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder={t("placeholder")} /></Field>
          <div className="row end wide">
            <span className="hint spacer">{t("hint")}</span>
            <button className="btn" disabled={busy} onClick={save}><Icon name="check" />{t("save")}</button>
          </div>
        </div>
      </Modal>}
    </>
  );
}
