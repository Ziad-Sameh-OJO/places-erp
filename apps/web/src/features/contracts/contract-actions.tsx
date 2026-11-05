"use client";
import type { ContractDetail } from "@places/contracts";
import { Field, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { ago, money } from "@/lib/format";
import { useRefreshContracts } from "./use-contracts";

/** 6.4 in the contract drawer: a value change (asked → management decides) and «فسخ العقد» (reason · penalty). */
export function ContractActions({ c }: { c: ContractDetail }) {
  const { can } = useMe();
  if (c.status !== "Active") return null;
  return (
    <>
      {c.pending ? <PendingValue c={c} decide={can("contracts", "approve") && !c.pending.mine} />
        : can("contracts", "create") && <ProposeValue c={c} />}
      {can("contracts", "approve") && <Terminate c={c} />}
    </>
  );
}

function PendingValue({ c, decide }: { c: ContractDetail; decide: boolean }) {
  const run = useAction();
  const refresh = useRefreshContracts();
  const p = c.pending!;
  const send = (decision: "approve" | "reject") => void run(async () => {
    await api.post(`/contracts/${c.id}/value/decision`, { decision });
    await refresh();
  }, decision === "approve" ? "القيمة اتغيرت · والأقساط اللي لسه اتوزعت تاني" : "الطلب اترفض");
  return (
    <Note kind="warn">
      <b>طلب تغيير القيمة:</b> {money(c.value)} ← {money(p.value)} · {p.reason}{p.by ? ` · ${p.by}` : ""} · {ago(p.at)}
      {decide ? <span className="row end"><button type="button" className="btn ghost sm" onClick={() => send("reject")}>رفض</button><button type="button" className="btn sm" onClick={() => send("approve")}>موافقة</button></span>
        : <span className="sub">مستني موافقة الإدارة</span>}
    </Note>
  );
}

function ProposeValue({ c }: { c: ContractDetail }) {
  const run = useAction();
  const refresh = useRefreshContracts();
  const send = (d: FormData) => void run(async () => {
    await api.post(`/contracts/${c.id}/value`, { value: String(d.get("value") ?? "").trim(), reason: String(d.get("reason") ?? "") });
    await refresh();
  }, "اتبعت للإدارة توافق");
  return (
    <form className="card flat grid" onSubmit={onFormSubmit(send)}>
      <div className="card-head wide"><h3><span className="ico"><Icon name="wallet" /></span><span>تغيير قيمة العقد<small>أي تعديل بعد التوقيع محتاج موافقة الإدارة</small></span></h3></div>
      <Field label="القيمة الجديدة" req><input name="value" required inputMode="decimal" type="number" min={1} step="0.01" defaultValue={Number(c.value)} /></Field>
      <Field label="السبب" req><input name="reason" required minLength={2} maxLength={500} /></Field>
      <div className="row end wide"><button className="btn ghost sm">ابعت للموافقة</button></div>
    </form>
  );
}

function Terminate({ c }: { c: ContractDetail }) {
  const run = useAction();
  const refresh = useRefreshContracts();
  const send = (d: FormData) => void run(async () => {
    await api.post(`/contracts/${c.id}/terminate`, { reason: String(d.get("reason") ?? ""), penalty: String(d.get("penalty") || "0") });
    await refresh();
  }, "العقد اتفسخ · الوحدة رجعت متاحة في الانفنتوري");
  return (
    <form className="card flat grid" onSubmit={onFormSubmit(send)}>
      <div className="card-head wide"><h3><span className="ico"><Icon name="x" /></span><span>فسخ العقد</span></h3></div>
      <Field label="السبب" req><input name="reason" required minLength={2} maxLength={500} placeholder="سبب الفسخ" /></Field>
      <Field label="الغرامة"><input name="penalty" inputMode="decimal" type="number" min={0} step="0.01" defaultValue={0} /></Field>
      <div className="row end wide"><button className="btn danger sm">فسخ العقد</button></div>
    </form>
  );
}
