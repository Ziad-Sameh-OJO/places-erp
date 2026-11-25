"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ContractDetail, StoredFile } from "@places/contracts";
import { DateInput, Field, Icon, Modal, onFormSubmit, useAction, useToast } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import { fromDecimal, toDecimal } from "@places/domain";
import { api } from "@/lib/api";
import { moneyExact } from "@/lib/format";
import { useFields } from "@/lib/me";
import { useContractForm, useRefreshContracts } from "./use-contracts";

/**
 * M-11 2.1 step 1: the salesperson uploads the contract on an approved deal — PDF, start, end, value, yearly increase —
 * and the system builds the installment table (value ÷ number of installments, M-11 3.2), or it's written line by line
 * («أو جدول مخصص», 3.2: a down payment, then quarterly…) and must add up to the value (the API checks it again).
 */
export function ContractForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("contracts");
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshContracts();
  const form = useContractForm(true);
  const fields = useFields("contracts");
  const [file, setFile] = useState<StoredFile | null>(null);
  const [custom, setCustom] = useState(false);
  const [lines, setLines] = useState([{ dueOn: "", amount: "" }]);
  const [value, setValue] = useState("");
  const isAmount = (s: string) => /^\d+(\.\d{1,2})?$/.test(s.trim());
  const total = toDecimal(lines.reduce((s, l) => s + (isAmount(l.amount) ? fromDecimal(l.amount) : 0), 0));
  const setLine = (i: number, p: Partial<(typeof lines)[number]>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const deals = form.data?.deals ?? [];
  const send = (d: FormData) => {
    if (!file) return toast(t("form.needFile"), "bad");
    const v = value.trim();
    if (!isAmount(v) || (custom && lines.some((l) => !isAmount(l.amount)))) return toast(t("form.badAmount"), "bad");
    return run(async () => {
      const c = await api.post<ContractDetail>("/contracts", {
        dealId: String(d.get("dealId") ?? ""), startsOn: String(d.get("startsOn") ?? ""), endsOn: String(d.get("endsOn") ?? ""), value: v,
        escalation: Number(d.get("escalation") || 0), fileId: file.id,
        schedule: custom ? { lines: lines.map((l) => ({ dueOn: l.dueOn, amount: l.amount.trim() })) } : { count: Number(d.get("count")), everyMonths: Number(d.get("everyMonths")) },
      });
      await refresh();
      onCreated(c.id);
    }, t("form.saved"));
  };
  return (
    <Modal title={t("newContract")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(send)}>
        <Field label={t("fields.deal")} req wide>
          <select name="dealId" required defaultValue="">
            <option value="" disabled>{form.isPending ? t("loading") : deals.length ? t("form.pickDeal") : t("form.noDeals")}</option>
            {deals.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.company} · {x.unitCode}</option>)}
          </select>
        </Field>
        <Field label={t("fields.starts")} req><DateInput name="startsOn" required /></Field>
        <Field label={t("fields.ends")} req><DateInput name="endsOn" required /></Field>
        <Field label={t("fields.value")} req><input name="value" required inputMode="decimal" type="number" min={1} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        {/* M-09: a hidden yearly increase has no input, a read-only one is locked at 0 (the API sets 0 either way) */}
        {fields.shows("escalation") && (fields.edits("escalation")
          ? <Field label={t("form.escalation")}><input name="escalation" type="number" min={0} max={100} step="0.01" defaultValue={0} /></Field>
          : <fieldset className="field-lock" disabled><Field label={t("form.escalation")}><input name="escalation" type="number" defaultValue={0} /></Field></fieldset>)}
        <div className="wide"><label className="tog"><input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} /><span>{t("form.custom")}</span></label></div>
        {custom ? (
          <div className="wide">
            {lines.map((l, i) => (
              <div key={i} className="row">
                <DateInput required value={l.dueOn} onChange={(e) => setLine(i, { dueOn: e.target.value })} aria-label={t("form.lineDate", { n: i + 1 })} />
                <input required inputMode="decimal" type="number" min={0.01} step="0.01" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} aria-label={t("form.lineAmount", { n: i + 1 })} />
                {lines.length > 1 && <button type="button" className="btn ghost sm" aria-label={t("form.removeLine")} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="x" /></button>}
              </div>
            ))}
            <div className="row">
              {lines.length < 120 && <button type="button" className="btn ghost sm" onClick={() => setLines([...lines, { dueOn: "", amount: "" }])}><Icon name="plus" />{t("form.addLine")}</button>}
              <span className={`hint ${isAmount(value) && total !== toDecimal(fromDecimal(value)) ? "bad-t" : ""}`}>{t("form.total", { total: moneyExact(total), value: isAmount(value) ? moneyExact(value) : "—" })}</span>
            </div>
          </div>
        ) : <>
          <Field label={t("form.count")} req><input name="count" type="number" required min={1} max={120} defaultValue={12} /></Field>
          <Field label={t("form.every")} req><input name="everyMonths" type="number" required min={1} max={24} defaultValue={1} /></Field>
        </>}
        <Field label={t("form.file")} req wide>
          <div className="row"><FileUpload kind="pdf" onUploaded={setFile} />{file && <span className="hint"><Icon name="file" /> {file.name}</span>}</div>
        </Field>
        <div className="row end wide">
          <span className="hint spacer">{t(custom ? "form.customHint" : "form.hint")}</span>
          <button className="btn"><Icon name="check" />{t("form.submit")}</button>
        </div>
      </form>
    </Modal>
  );
}
