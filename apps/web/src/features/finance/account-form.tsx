"use client";
import { useState } from "react";
import type { AccountNode } from "@places/contracts";
import { Field, Modal, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { SYSTEM_CODES, flatten, useRefreshFinance } from "./use-finance";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** «حساب جديد في الشجرة» (demo acctNew): the code comes from the parent; an opening balance posts its own entry. */
export function AccountForm({ roots, parentId, onClose }: { roots: AccountNode[]; parentId: string | null; onClose: () => void }) {
  const run = useAction();
  const refresh = useRefreshFinance();
  const [busy, setBusy] = useState(false);
  const all = flatten(roots);
  const parents = all.filter(({ node }) => !SYSTEM_CODES.has(node.code));
  const leaves = all.filter(({ leaf, node }) => leaf && node.code !== "34");
  const submit = onFormSubmit(async (d) => {
    const s = (k: string) => String(d.get(k) ?? "").trim();
    const body: Record<string, string> = { parentId: s("parentId"), name: s("name") };
    if (s("kind")) body.kind = s("kind");
    if (s("opening") && Number(s("opening")) > 0) { body.opening = s("opening"); body.date = s("date"); if (s("counterId")) body.counterId = s("counterId"); }
    setBusy(true);
    await run(async () => { const r = await api.post<{ code: string }>("/finance/accounts", body); await refresh(); onClose(); return r; }, "اتضاف الحساب");
    setBusy(false);
  });
  return (
    <Modal title="حساب جديد في الشجرة" onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Field label="تحت حساب" req wide>
          <select name="parentId" defaultValue={parentId ?? ""} required>
            <option value="" disabled>اختار</option>
            {parents.map(({ node, path }) => <option key={node.id} value={node.id}>{node.code} · {path.join(" ← ")}</option>)}
          </select>
        </Field>
        <Field label="اسم الحساب" req wide><input name="name" required minLength={2} maxLength={120} /></Field>
        <Field label="نوعه (للخزن والبنوك)">
          <select name="kind" defaultValue=""><option value="">عادي</option><option value="treasury">خزنة</option><option value="bank">بنك</option><option value="wallet">محفظة</option></select>
        </Field>
        <Field label="رصيد افتتاحي"><input name="opening" inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="0" /></Field>
        <Field label="الطرف التاني للقيد">
          <select name="counterId" defaultValue=""><option value="">أرباح محتجزة (33)</option>{leaves.map(({ node }) => <option key={node.id} value={node.id}>{node.code} · {node.name}</option>)}</select>
        </Field>
        <Field label="تاريخ الرصيد"><input type="date" name="date" defaultValue={today()} max={today()} /></Field>
        <Note>الكود بيتعمل لوحده من كود الحساب الأب. لو كتبت رصيد افتتاحي، بيتعمله قيد متوازن لوحده.</Note>
        <button className="btn" disabled={busy}>{busy ? "بيحفظ…" : "ضيف الحساب"}</button>
      </form>
    </Modal>
  );
}
