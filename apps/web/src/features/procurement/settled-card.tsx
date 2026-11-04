"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CashView, PurchaseView } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { day, money } from "@/lib/format";

/**
 * demo finance.js prCard «طلبات مشتريات مستنية الصرف» (10.2): what procurement settled, waiting for finance. «اصرفها»
 * posts one payment voucher for the request's (locked) amount on its line, from the safe or bank finance picks.
 * Self-contained so finance can mount it on its cash tab; it shows nothing when the queue is empty.
 */
export function SettledPurchasesCard() {
  const { can } = useMe();
  const q = useQuery({ queryKey: ["procurement", "settled"], queryFn: () => api.get<PurchaseView[]>("/procurement/purchases/settled") });
  const [pay, setPay] = useState<PurchaseView | null>(null);
  const items = q.data ?? [];
  if (!items.length) return null;
  const canPost = can("finance", "create");
  return (
    <Card title="طلبات مشتريات مستنية الصرف" icon="cart" sub="المشتريات سوّتها وبلّغت · الصرف من الخزنة والقيد عندك" extra={<Chip tone="warn">{items.length}</Chip>} className="attn">
      <Table head={["الطلب", "البند", "المورد", "اتدفع من (حسب المشتريات)", "المبلغ", ""]}
        rows={items.map((p) => [
          <span key="i"><b>{p.item}</b><span className="sub mono">{p.no} · {day(p.settledAt)}</span></span>,
          p.account.name, p.vendor ?? "—", p.paidFrom?.name ?? "—", <b key="a">{money(p.amount)}</b>,
          canPost ? <button key="b" className="btn sm" onClick={() => setPay(p)}>اصرفها</button> : "",
        ])} />
      {pay && <PostForm p={pay} onClose={() => setPay(null)} />}
    </Card>
  );
}

function PostForm({ p, onClose }: { p: PurchaseView; onClose: () => void }) {
  const run = useAction();
  const qc = useQueryClient();
  const cash = useQuery({ queryKey: ["finance", "cash"], queryFn: () => api.get<CashView>("/finance/cash") });
  const post = (d: FormData) => void run(async () => {
    const date = String(d.get("date") ?? "");
    await api.post(`/procurement/purchases/${p.id}/post`, { fromId: String(d.get("fromId") ?? ""), ...(date ? { date } : {}) });
    // the voucher moved a safe and an expense line: everything finance shows is stale now
    await Promise.all([qc.invalidateQueries({ queryKey: ["procurement"] }), qc.invalidateQueries({ queryKey: ["finance"] })]);
    onClose();
  }, "اترحّل · اتعمل إذن الصرف وقيده");
  return (
    <Modal title={`إذن صرف · ${p.no}`} onClose={onClose}>
      {/* rendered once the safes are in, so the select starts on the safe procurement said it paid from */}
      {cash.data && <form className="grid" onSubmit={onFormSubmit(post)}>
        <Field label="من خزنة / بنك" req>
          <select name="fromId" required defaultValue={p.paidFrom?.id ?? ""}>
            <option value="" disabled>اختار</option>
            {cash.data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {money(a.balance)}</option>)}
          </select>
        </Field>
        <Field label="التاريخ"><input name="date" type="date" /></Field>
        <Field label="البند"><input value={`${p.account.code} · ${p.account.name}`} readOnly /></Field>
        <Field label="المبلغ"><input value={money(p.amount)} readOnly /></Field>
        <Field label="البيان" wide><input value={`${p.item}${p.vendor ? ` · ${p.vendor}` : ""}`} readOnly /></Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button className="btn"><Icon name="check" />سجّل</button>
        </div>
      </form>}
    </Modal>
  );
}
