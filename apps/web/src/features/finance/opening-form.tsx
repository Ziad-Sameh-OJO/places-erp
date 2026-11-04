"use client";
import { useState } from "react";
import type { AccountNode } from "@places/contracts";
import { Field, Modal, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { flatten, SYSTEM_CODES, useRefreshFinance } from "./use-finance";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** 9.5 · الأرصدة الافتتاحية: each leaf's balance in its own direction; the difference closes to retained earnings (33). */
export function OpeningForm({ roots, onClose }: { roots: AccountNode[]; onClose: () => void }) {
  const run = useAction();
  const refresh = useRefreshFinance();
  const [busy, setBusy] = useState(false);
  const leaves = flatten(roots).filter(({ leaf, node }) => leaf && !SYSTEM_CODES.has(node.code) && !node.code.startsWith("4") && !node.code.startsWith("5"));
  const submit = onFormSubmit(async (d) => {
    const lines = leaves.map(({ node }) => ({ accountId: node.id, amount: String(d.get(node.id) ?? "").trim() })).filter((l) => l.amount && Number(l.amount) > 0);
    setBusy(true);
    await run(async () => { await api.post("/finance/opening", { date: d.get("date"), lines }); await refresh(); onClose(); }, "اتسجلت الأرصدة الافتتاحية");
    setBusy(false);
  });
  return (
    <Modal title="الأرصدة الافتتاحية" onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Note>اكتب رصيد كل حساب يوم البداية، كل حساب في اتجاهه (الأصول مدين، والخصوم دائن). الفرق بيتقفل على الأرباح المحتجزة (33) في قيد واحد.</Note>
        <Field label="يوم البداية" req wide><input type="date" name="date" defaultValue={today()} max={today()} required /></Field>
        {leaves.map(({ node, path }) => (
          <Field key={node.id} label={`${node.code} · ${node.name}`}><input name={node.id} inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="0" title={path.join(" ← ")} /></Field>
        ))}
        <button className="btn" disabled={busy}>{busy ? "بيحفظ…" : "سجّل الأرصدة"}</button>
      </form>
    </Modal>
  );
}
