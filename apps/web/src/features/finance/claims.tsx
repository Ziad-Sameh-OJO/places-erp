"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClaimView, ClaimsView } from "@places/contracts";
import { localDate } from "@places/domain";
import { Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day, money } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useCash, useRefreshFinance } from "./use-finance";
import { VoucherById } from "./voucher";

type Filter = "open" | "requested" | "approved" | "paid" | "all";
const TONE: Record<ClaimView["status"], "warn" | "info" | "ok" | "bad"> = { requested: "warn", issued: "info", approved: "warn", einvoice: "info", paid: "ok", rejected: "bad" };
export const useClaims = (f: Filter = "open") => useQuery({ queryKey: ["finance", "claims", f], queryFn: () => api.get<ClaimsView>(`/claims?status=${f}`) });
/** what waits on the accountant: to issue, the e-invoice, a payment to record */
export const claimsWaiting = (v: ClaimsView | undefined) => v?.items.filter((c) => c.status === "requested" || c.status === "approved" || (c.receiptAsked && c.status !== "paid")).length ?? 0;
const pdf = (c: ClaimView, doc: "claim" | "receipt") => `/api/v1/claims/${c.id}/pdf?doc=${doc}`;

/** M-07 · «المطالبات» (9.17, demo claims.js `claimsTab`): the claim's whole way from the request to the cash receipt. */
export function Claims() {
  const { can, me } = useMe();
  const [f, setF] = useState<Filter>("open");
  const q = useClaims(f);
  const run = useAction();
  const refresh = useRefreshFinance();
  const [modal, setModal] = useState<{ kind: "new" | "reject" | "einvoice" | "collect"; c?: ClaimView } | null>(null);
  const [voucher, setVoucher] = useState<string | null>(null);
  if (!q.data) return <Empty text="بيحمّل…" icon="clock" />;
  const fin = can("finance", "approve"), post = can("finance", "create");
  const step = (c: ClaimView, path: string, ok: string, body?: unknown) => run(async () => { await api.post(`/claims/${c.id}/${path}`, body); await refresh(); setModal(null); }, ok);
  const act = (c: ClaimView) => {
    const mine = c.by.id === me?.id;
    return (
      <span className="row">
        {fin && c.status === "requested" && <><button className="btn sm" onClick={() => void step(c, "issue", "المطالبة اتعملت من القالب · بالختم والإمضا")}>اعتمد واعمل المطالبة</button><button className="btn ghost sm" onClick={() => setModal({ kind: "reject", c })}>ارفض</button></>}
        {can("finance", "edit") && (c.status === "approved" || c.status === "issued") && <button className={`btn ${c.status === "approved" ? "" : "ghost"} sm`} onClick={() => setModal({ kind: "einvoice", c })}>{c.status === "approved" ? "اترفعت الفاتورة الإلكترونية" : "ارفع الفاتورة"}</button>}
        {post && ["issued", "approved", "einvoice"].includes(c.status) && <button className={`btn ${c.receiptAsked ? "" : "ghost"} sm`} onClick={() => setModal({ kind: "collect", c })}>اتحصّلت · اعمل الإيصال</button>}
        {mine && c.status === "issued" && <button className="btn sm" onClick={() => void step(c, "client-approved", "اتبلّغت المالية ترفع الفاتورة الإلكترونية")}>العميل اعتمد</button>}
        {mine && ["issued", "approved", "einvoice"].includes(c.status) && !c.receiptAsked && <button className="btn ghost sm" onClick={() => void step(c, "ask-receipt", "اتبعت للمالية")}>العميل دفع · اطلب إيصال</button>}
        {c.status === "paid" && <><a className="btn ghost sm" href={pdf(c, "receipt")} target="_blank" rel="noreferrer">{c.receiptNo}</a>{c.move && <a className="mono click" onClick={() => setVoucher(c.move!.id)}>{c.move.no}</a>}</>}
        {c.status === "rejected" && c.why}
      </span>
    );
  };
  return (
    <>
      <Note>السيلز بيطلب المطالبة من الصفقة (الشركة · بيانات الوحدة · المبلغ) ← «اعتمد واعمل المطالبة» بتطلع من القالب بالختم والإمضا ← السيلز يبعتها للعميل ويعلّم «العميل اعتمد» ← انت بترفع الفاتورة الإلكترونية وتكتب رقمها ← لما العميل يدفع «اتحصّلت · اعمل الإيصال» بيعمل إذن توريد بالمبلغ، و«إيصال استلام النقدية» بيتعمل من نفس البيانات.</Note>
      <div className="row">
        <div className="seg" role="group">{([["open", "مفتوحة"], ["requested", "مستنيتك"], ["approved", "الفاتورة"], ["paid", "اتحصّلت"], ["all", "الكل"]] as const).map(([k, l]) => <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
        <span className="spacer" />
        {can("master", "view") && <a className="btn ghost sm" href="/master"><Icon name="file" />عدّل القوالب</a>}
        {can("deals", "create") && <button className="btn sm" onClick={() => setModal({ kind: "new" })}><Icon name="plus" />اطلب مطالبة</button>}
      </div>
      <Table head={["المطالبة", "الشركة", "الوحدة", "المبلغ", "طلبها", "الحالة", ""]} empty="مفيش مطالبات"
        rows={q.data.items.map((c) => [
          <span key="n">{c.status === "requested" || c.status === "rejected" ? <span className="mono">{c.no}</span> : <a className="mono click" href={pdf(c, "claim")} target="_blank" rel="noreferrer">{c.no}</a>}</span>,
          <span key="c">{c.company}<span className="sub">باسم {c.entity.name}</span></span>,
          <span key="u">{c.unit}<span className="sub">{c.unitInfo}</span></span>,
          <b key="a">{money(c.amount)}</b>,
          <span key="b">{c.by.name}<span className="sub">{day(c.at)}</span></span>,
          <span key="s"><Chip tone={TONE[c.status]}>{c.label}</Chip>{c.einvoice && <span className="sub">فاتورة {c.einvoice.no}</span>}{c.receiptAsked && c.status !== "paid" && <span className="sub">العميل دفع وطالب إيصال</span>}</span>,
          act(c),
        ])} />
      {modal?.kind === "new" && <NewClaim entities={q.data.entities} onClose={() => setModal(null)} />}
      {modal?.kind === "reject" && modal.c && (
        <Modal title={`ارفض ${modal.c.no}`} onClose={() => setModal(null)}>
          <form className="grid" onSubmit={onFormSubmit((d) => step(modal.c!, "reject", "اترفضت", { why: d.get("why") }))}>
            <Field label="سبب الرفض" req wide><input name="why" required /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setModal(null)}>إلغاء</button><button className="btn">ارفض</button></div>
          </form>
        </Modal>
      )}
      {modal?.kind === "einvoice" && modal.c && (
        <Modal title={`الفاتورة الإلكترونية · ${modal.c.no}`} onClose={() => setModal(null)}>
          <form className="grid" onSubmit={onFormSubmit((d) => step(modal.c!, "einvoice", "اتسجّلت", { no: d.get("no"), date: d.get("date") }))}>
            <Note>{modal.c.company} · {money(modal.c.amount)} · ارفعها على بورتال الفاتورة الإلكترونية واكتب رقمها هنا.</Note>
            <Field label="رقم الفاتورة الإلكترونية" req><input name="no" required placeholder="مثلاً: EG-2026-001245" dir="ltr" /></Field>
            <Field label="تاريخ الرفع" req><input name="date" type="date" defaultValue={localDate(new Date())} max={localDate(new Date())} required /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setModal(null)}>إلغاء</button><button className="btn"><Icon name="check" />اترفعت</button></div>
          </form>
        </Modal>
      )}
      {modal?.kind === "collect" && modal.c && <Collect c={modal.c} incomes={q.data.incomes} onSave={(body) => step(modal.c!, "collect", "اتحصّلت · الإيصال جاهز", body)} onClose={() => setModal(null)} />}
      {voucher && <VoucherById id={voucher} onClose={() => setVoucher(null)} />}
    </>
  );
}

/** «اتحصّلت · اعمل الإيصال»: the receive voucher's two sides; the amount and the party are the claim's. */
function Collect({ c, incomes, onSave, onClose }: { c: ClaimView; incomes: ClaimsView["incomes"]; onSave: (b: unknown) => void; onClose: () => void }) {
  const cash = useCash().data;
  return (
    <Modal title={`إذن توريد · ${c.no}`} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((d) => onSave({ toId: d.get("toId"), accountId: d.get("accountId"), date: d.get("date") }))}>
        <Note>{c.company} · <b>{money(c.amount)}</b> · {c.kind} · بعد الحفظ «إيصال استلام النقدية» بيتعمل من نفس بيانات المطالبة.</Note>
        <Field label="اتحصّلت في" req><select name="toId" required defaultValue=""><option value="" disabled>اختار</option>{cash?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="بند الإيراد" req><select name="accountId" required defaultValue=""><option value="" disabled>اختار</option>{incomes.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
        <Field label="التاريخ" req><input name="date" type="date" defaultValue={localDate(new Date())} max={localDate(new Date())} required /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn"><Icon name="check" />سجّل واعمل الإيصال</button></div>
      </form>
    </Modal>
  );
}

/** «اطلب مطالبة» (demo `claimNew`); the deal it belongs to comes with deals (5.1/5.2). */
function NewClaim({ entities, onClose }: { entities: ClaimsView["entities"]; onClose: () => void }) {
  const run = useAction();
  const refresh = useRefreshFinance();
  const save = onFormSubmit((d) => run(async () => {
    await api.post("/claims", Object.fromEntries(["company", "unit", "unitInfo", "amount", "side", "kind", "entityId", "note"].map((k) => [k, String(d.get(k) ?? "")])));
    await refresh(); onClose();
  }, "اتبعتت للمالية"));
  return (
    <Modal title="اطلب مطالبة" onClose={onClose}>
      <form className="grid" onSubmit={save}>
        <Note>المطالبة بتروح للمالية تعتمدها، وبتتعمل أوتوماتيك على القالب. المبلغ مش شرط يبقى نفس العمولة.</Note>
        <Field label="اسم الشركة (زي ما هيتكتب في المطالبة)" req wide><input name="company" required /></Field>
        <Field label="الوحدة" req><input name="unit" required /></Field>
        <Field label="المطالبة على" req><select name="side" defaultValue="client"><option value="client">الـ Client</option><option value="owner">الـ Owner</option></select></Field>
        <Field label="بيانات الوحدة" req wide><input name="unitInfo" required placeholder="المشروع · المبنى · الدور · المساحة · التشطيب · المنطقة" /></Field>
        <Field label="المطالبة باسم" req><select name="entityId" defaultValue="places">{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="المبلغ" req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required /></Field>
        <Field label="نوع العمولة" req><input name="kind" required placeholder="مثلاً: عمولة تأجير" /></Field>
        <Field label="ملاحظة للمالية" wide><input name="note" placeholder="اختياري" /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn"><Icon name="send" />ابعت للمالية</button></div>
      </form>
    </Modal>
  );
}
