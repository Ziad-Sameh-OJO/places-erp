"use client";
import { useState } from "react";
import type { ContractDetail, StoredFile } from "@places/contracts";
import { Field, Icon, Modal, onFormSubmit, useAction, useToast } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import { api } from "@/lib/api";
import { useContractForm, useRefreshContracts } from "./use-contracts";

/**
 * M-11 2.1 step 1: the salesperson uploads the contract on an approved deal — PDF, start, end, value, yearly increase —
 * and the system builds the installment table (value ÷ number of installments, M-11 3.2).
 */
export function ContractForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshContracts();
  const form = useContractForm(true);
  const [file, setFile] = useState<StoredFile | null>(null);
  const deals = form.data?.deals ?? [];
  const send = (d: FormData) => {
    if (!file) return toast("ارفع ملف العقد PDF", "bad");
    const value = String(d.get("value") ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return toast("المبلغ بالجنيه، ولحد قرشين بعد العلامة", "bad");
    return run(async () => {
      const c = await api.post<ContractDetail>("/contracts", {
        dealId: String(d.get("dealId") ?? ""), startsOn: String(d.get("startsOn") ?? ""), endsOn: String(d.get("endsOn") ?? ""), value,
        escalation: Number(d.get("escalation") || 0), fileId: file.id,
        schedule: { count: Number(d.get("count")), everyMonths: Number(d.get("everyMonths")) },
      });
      await refresh();
      onCreated(c.id);
    }, "العقد اتسجّل · وجدول الأقساط اتعمل");
  };
  return (
    <Modal title="عقد جديد" onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(send)}>
        <Field label="الصفقة" req wide>
          <select name="dealId" required defaultValue="">
            <option value="" disabled>{form.isPending ? "بيحمّل…" : deals.length ? "اختار الصفقة" : "مفيش صفقات متوافق عليها من غير عقد"}</option>
            {deals.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.company} · {x.unitCode}</option>)}
          </select>
        </Field>
        <Field label="البداية" req><input name="startsOn" type="date" required /></Field>
        <Field label="النهاية" req><input name="endsOn" type="date" required /></Field>
        <Field label="القيمة" req><input name="value" required inputMode="decimal" type="number" min={1} step="0.01" /></Field>
        <Field label="الزيادة السنوية %"><input name="escalation" type="number" min={0} max={100} step="0.01" defaultValue={0} /></Field>
        <Field label="عدد الأقساط" req><input name="count" type="number" required min={1} max={120} defaultValue={12} /></Field>
        <Field label="قسط كل (شهر)" req><input name="everyMonths" type="number" required min={1} max={24} defaultValue={1} /></Field>
        <Field label="ملف العقد (PDF)" req wide>
          <div className="row"><FileUpload kind="pdf" onUploaded={setFile} />{file && <span className="hint"><Icon name="file" /> {file.name}</span>}</div>
        </Field>
        <div className="row end wide">
          <span className="hint spacer">القسط = القيمة ÷ عدد الأقساط، من أول يوم في العقد.</span>
          <button className="btn"><Icon name="check" />سجّل العقد</button>
        </div>
      </form>
    </Modal>
  );
}
