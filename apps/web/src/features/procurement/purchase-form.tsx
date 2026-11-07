"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BudgetLineRow, StoredFile } from "@places/contracts";
import { attachmentProblem, fromDecimal } from "@places/domain";
import { Field, Icon, Modal, onFormSubmit, useAction, useToast } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import { api } from "@/lib/api";
import { short } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useRefreshProcurement, useVendors } from "./use-purchases";

/** Uploaded files so far, with both upload buttons (a receipt photo or a PDF of the quotes). */
export function Attachments({ files, onAdd }: { files: StoredFile[]; onAdd: (f: StoredFile) => void }) {
  const t = useTranslations("procurement");
  return (
    <div className="wide">
      <div className="row"><FileUpload kind="pdf" onUploaded={onAdd} /><FileUpload kind="image" label={t("form.receiptPhoto")} onUploaded={onAdd} /></div>
      {files.length > 0 && <p className="hint"><Icon name="file" /> {files.map((f) => f.name).join(" · ")}</p>}
    </div>
  );
}

/** demo «طلب شراء / دفع»: الحاجة · المبلغ · البند (من شجرة الحسابات) · المورد · المرفقات → ابعت للموافقة. */
export function PurchaseForm({ lines, onClose }: { lines: BudgetLineRow[]; onClose: () => void }) {
  const t = useTranslations("procurement");
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshProcurement();
  const vendors = useVendors();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const send = (d: FormData) => {
    const amount = String(d.get("amount") ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return toast(t("form.badAmount"), "bad");
    // 0.9: the same rule the API checks, so Mokhtar hears it before anything is sent
    const missing = attachmentProblem(fromDecimal(amount), files.length);
    if (missing) return toast(serverText(missing), "bad");
    return run(async () => {
      await api.post("/procurement/purchases", {
        item: String(d.get("item") ?? ""), amount, accountId: String(d.get("accountId") ?? ""),
        vendor: String(d.get("vendor") ?? "").trim() || undefined, attachments: files.map((f) => f.id),
      });
      await refresh();
      onClose();
    }, t("form.sent"));
  };
  return (
    <Modal title={t("form.title")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(send)}>
        <Field label={t("form.item")} req><input name="item" required minLength={2} maxLength={160} /></Field>
        <Field label={t("common.amount")} req><input name="amount" required inputMode="decimal" type="number" min={1} step="0.01" /></Field>
        <Field label={t("form.line")} req>
          <select name="accountId" required defaultValue="">
            <option value="" disabled>{t("form.chooseLine")}</option>
            {lines.map((l) => <option key={l.accountId} value={l.accountId}>{l.code} · {serverText(l.name)}{l.left != null ? ` · ${t("common.left", { amount: short(l.left) })}` : ""}</option>)}
          </select>
        </Field>
        <Field label={t("common.vendor")}>
          <input name="vendor" list="vendorList" maxLength={80} />
          <datalist id="vendorList">{(vendors.data ?? []).map((v) => <option key={v} value={v} />)}</datalist>
        </Field>
        <Field label={t("form.attachments")} wide><Attachments files={files} onAdd={(f) => setFiles((x) => [...x, f])} /></Field>
        <div className="row end wide">
          <span className="hint spacer">{t("form.approvalRule")}</span>
          <button className="btn"><Icon name="send" />{t("form.submit")}</button>
        </div>
      </form>
    </Modal>
  );
}
