"use client";
import { useRef, useState, type ReactNode } from "react";
import type { DealCollected, DealSheetRow } from "@places/contracts";
import { DEAL_TYPES, localDate } from "@places/domain";
import { Drawer, Stepper } from "@/components/blocks";
import { NewClaim } from "@/components/new-claim";
import { Chip, Field, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day, money, num } from "@/lib/format";
import { useMe } from "@/lib/me";
import { LANES, ST_TONE, live, monthOf, names, onSheet, useAchievements, useCashAccounts, useClaimsAll, useCollectForm, useDeal, useRefreshDeals } from "./use-deals";

const Head = ({ icon, title, sub, extra }: { icon: "users" | "check" | "file" | "wallet" | "x"; title: string; sub?: string; extra?: ReactNode }) => (
  <div className="card-head"><h3><span className="ico"><Icon name={icon} /></span><span>{title}{sub && <small>{sub}</small>}</span></h3>{extra}</div>
);

/** The demo's deal drawer (deals.js `dealDrawer`): the deal, its split, the review, the note, claims, collections, cancelling. */
export function DealDrawer({ d, onClose }: { d: DealSheetRow; onClose: () => void }) {
  const { can } = useMe();
  const detail = useDeal(d.id).data;
  const mine = useAchievements().data?.mine; // the caller's employee id: their own line on a TCR
  const run = useAction();
  const refresh = useRefreshDeals();
  const post = (path: string, body: unknown, ok: string, method: "post" | "put" = "post") => run(async () => { await api[method](`/deals/${d.id}/${path}`, body); await refresh(); }, ok);
  const sellerWait = d.sellers.some((s) => !s.approved);
  const kv: [string, ReactNode][] = [
    ["الشركة (company)", d.company], ["الوحدة", <span key="u"><span className="mono">{d.unitCode}</span> · {d.location}</span>], ["المساحة (space)", `${num(d.space)} م`],
    ["النوع (type)", d.type], ["Buyer", names(d.buyers)], ["Seller", names(d.sellers)], ["المصدر (source)", d.source],
    ["عمولة متوقعة من الـ Owner", money(d.commissionOwner)], ["عمولة متوقعة من الـ Client", money(d.commissionClient)],
    ["المحصّل (owner side / client side)", `${money(d.collectedOwner)} / ${money(d.collectedClient)}`], ["صافي الكوميشن", money(d.collected)],
    ["المتبقي", money(d.remaining)], ["Date (أول تحصيل)", monthOf(d.firstPaidAt)], ["deal date", day(d.closedAt)],
  ];
  return (
    <Drawer title={d.company} sub={`${d.code} · Done Deal`} onClose={onClose}
      chips={<><Chip tone={ST_TONE[d.status]}>{d.status}</Chip>{d.offTarget && <Chip tone="warn">خارج التارجت</Chip>}</>}>
      {d.offTarget && <Note kind="warn"><b>Alarm للـ Office Manager:</b> الصفقة اتسجّلت وقت القفل بس، يعني ممكن السيلز كان شغال عليها من غير ما يسجّلها. بتتحسب Done Deal عادي، بس متدخلش في تارجت السيلز.</Note>}
      {d.status === "Cancelled" && <Note kind="warn"><b>الصفقة اتلغت:</b> الإيرادات والـ Achievements والعمولات اتخصمت أوتوماتيك.</Note>}
      {sellerWait && <Note kind="warn"><b>الـ Seller:</b> {names(d.sellers.filter((s) => !s.approved))} (الـ Agent بتاع {d.unitCode}) مستني موافقة منار قبل ما يتسجّل. {can("inventory", "approve") && <button className="btn sm" onClick={() => void post("seller", {}, "الـ Seller اتسجّل في الصفقة")}><Icon name="check" />وافقي على الـ Seller</button>}</Note>}
      <Stepper stages={LANES} current={d.status === "Rejected" ? "Pending Review" : d.status} />
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {(d.note || d.targetBase) && <Note><b>note:</b> {d.note}{d.targetBase && <> · التارجت بيتحسب بـ {money(d.targetBase)} بدل {money(d.collected)}</>}</Note>}
      <section className="card flat">
        <Head icon="users" title="تقسيم الكوميشن" sub="نص للـ Buyer ونص للـ Seller، وكل نص على عدد السيلز في الجهة دي" />
        {d.shares.length ? d.shares.map((x) => (
          <div key={x.salesId} className="line-item"><span>{x.name} · {x.side === "buyer" ? "Buyer" : "Seller"} · نصيبه {money(x.share)} · نسبته {x.schemePercent}%</span><b className="num">{money(x.commission)}</b></div>
        )) : <p className="hint">التقسيم بيبدأ من أول تحصيل.</p>}
        {sellerWait && <p className="hint">نص الـ Seller بيتوزّع بعد موافقة منار.</p>}
      </section>
      {d.status === "Rejected" && detail?.reviewNote && <Note kind="warn">سبب الرفض: {detail.reviewNote}</Note>}
      {d.status === "Pending Review" && (can("deals", "approve") ? <Review d={d} post={post} /> : <Note>مستنية مراجعة الـ Office Manager.</Note>)}
      {live(d.status) && can("deals", "edit") && (
        <form className="card flat" onSubmit={onFormSubmit((f) => post("note", { note: String(f.get("note") ?? ""), targetBase: String(f.get("targetBase") ?? "") || null }, "اتحفظت · بتغيّر التارجت بس", "put"))}>
          <Head icon="file" title="note (Office Manager / المالية)" sub="بيغيّر اللي متحدد فيها بس" />
          <div className="grid">
            <Field label="الملاحظة"><input name="note" defaultValue={d.note ?? ""} placeholder="مثلاً: التارجت يتحسب بمبلغ تاني" /></Field>
            <Field label="التارجت يتحسب بمبلغ (اختياري)"><input name="targetBase" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={d.targetBase ?? ""} /></Field>
          </div>
          <div className="row end"><button className="btn ghost sm">احفظ</button></div>
        </form>
      )}
      <Claims d={d} />
      <section className="card flat">
        <Head icon="wallet" title="التحصيل والـ TCR" extra={onSheet(d.status) ? <Chip tone={Number(d.remaining) > 0 ? "warn" : "ok"}>{Number(d.remaining) > 0 ? `باقي ${money(d.remaining)}` : "اتحصّلت بالكامل"}</Chip> : undefined} />
        {detail?.tcrs.length ? detail.tcrs.map((x) => {
          const left = x.signatures.filter((s) => !s.signedAt).length;
          const mineOpen = x.signatures.some((s) => s.id === mine && !s.signedAt);
          return (
            <div key={x.id} className="line-item">
              <span>
                <b className="mono">{x.code}</b> · {day(x.date)} · {x.side === "owner" ? "من الـ Owner" : "من الـ Client"} · <b className="num">{money(x.amount)}</b>
                <span className="sub">{x.signatures.map((s) => `${s.name} ${s.signedAt ? "✓" : "· لسه"}`).join(" · ")}</span>
              </span>
              <span className="row">
                {left ? <Chip tone="warn">مستني إمضاء {left}</Chip> : <Chip tone="ok">اتمضت</Chip>}
                <a className="btn ghost sm" href={`/api/v1/deals/${d.id}/tcrs/${x.id}/pdf`} target="_blank" rel="noreferrer"><Icon name="file" />TCR</a>
                {mineOpen && <button className="btn sm" onClick={() => void post(`tcrs/${x.id}/sign`, {}, `مضيت على ${x.code}`)}>امضي</button>}
              </span>
            </div>
          );
        }) : d.payments.length ? d.payments.map((p, i) => (
          <div key={i} className="line-item"><span>{day(p.at)} · {p.side === "owner" ? "من الـ Owner" : "من الـ Client"}</span><b className="num">{money(p.amount)}</b></div>
        )) : <p className="hint">مفيش تحصيل لسه · المالية هي اللي بتسجّل التحصيل</p>}
        {live(d.status) && Number(d.remaining) > 0 && can("finance", "create") && <Collect d={d} onDone={refresh} />}
      </section>
      {live(d.status) && can("deals", "delete") && (
        <form className="card flat" onSubmit={onFormSubmit((f) => post("cancel", { reason: String(f.get("reason") ?? "") }, "الصفقة اتلغت · الإيرادات والـ Achievements والعمولات اتخصمت أوتوماتيك"))}>
          <Head icon="x" title="إلغاء الصفقة" />
          <div className="row"><input name="reason" required placeholder="سبب الإلغاء" aria-label="سبب الإلغاء" /><button className="btn danger">إلغاء الصفقة</button></div>
        </form>
      )}
    </Drawer>
  );
}

/** Q9: the Office Manager may correct any field before approving; a rejection needs its reason. */
function Review({ d, post }: { d: DealSheetRow; post: (path: string, body: unknown, ok: string) => Promise<void> }) {
  const sales = useAchievements().data?.rows ?? [];
  const ref = useRef<HTMLFormElement>(null);
  const send = (v: "approve" | "reject") => {
    const f = new FormData(ref.current!);
    if (v === "reject") return post("review", { decision: "reject", reason: String(f.get("reason") ?? "") }, "الصفقة رجعت للسيلز بالسبب");
    const buyers = f.getAll("buyers").map(String);
    return post("review", {
      decision: "approve", space: Number(f.get("space")), type: f.get("type"), location: f.get("location"),
      commissionOwner: f.get("commissionOwner"), commissionClient: f.get("commissionClient"), ...(buyers.length ? { buyers } : {}),
    }, "اتسجّلت في شيت الـ Done Deals · والتسويق وصلها Alarm");
  };
  return (
    <form className="card flat" ref={ref} onSubmit={(e) => e.preventDefault()}>
      <Head icon="check" title="مراجعة الـ Office Manager" sub="تقدري تعدّلي أي خانة قبل ما توافقي" />
      <div className="grid">
        <Field label="المساحة"><input name="space" type="number" min="1" defaultValue={d.space} /></Field>
        <Field label="النوع"><select name="type" defaultValue={d.type}>{DEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <Field label="المبنى / المشروع"><input name="location" defaultValue={d.location} /></Field>
        <Field label="عمولة من الـ Owner"><input name="commissionOwner" inputMode="decimal" defaultValue={d.commissionOwner} /></Field>
        <Field label="عمولة من الـ Client"><input name="commissionClient" inputMode="decimal" defaultValue={d.commissionClient} /></Field>
        <Field label="سيلز الـ Buyer">
          <select name="buyers" multiple size={3} defaultValue={d.buyers.map((b) => b.id)}>
            {[...new Map([...d.buyers.map((b) => [b.id, b.name] as const), ...sales.map((s) => [s.employeeId, s.name] as const)])].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
      </div>
      <div className="row">
        <input name="reason" placeholder="سبب الرفض (لو هترفضي)" aria-label="سبب الرفض" />
        <button type="button" className="btn danger" onClick={() => void send("reject")}>رفض</button>
        <button type="button" className="btn" onClick={() => void send("approve")}>موافقة وتسجيل في الشيت</button>
      </div>
    </form>
  );
}

/** «سجّل تحصيل» (5.3, the accountant's meeting 4 Nov): the side, the safe / bank, the amount; the first one needs the revenue line. */
function Collect({ d, onDone }: { d: DealSheetRow; onDone: () => Promise<unknown> }) {
  const run = useAction();
  const cash = useCashAccounts(true).data;
  const first = d.payments.length === 0;
  const incomes = useCollectForm(first).data?.incomes ?? [];
  const send = onFormSubmit((f) => run(async () => {
    const r = await api.post<DealCollected>(`/deals/${d.id}/collections`, {
      side: f.get("side"), toId: f.get("toId"), amount: String(f.get("amount") ?? "").trim(), date: f.get("date"), ...(first ? { revenueId: f.get("revenueId") } : {}),
    });
    await onDone();
    return r;
  }, "اتسجّل التحصيل · إذن التوريد والقيد اتعملوا"));
  return (
    <form className="grid" onSubmit={send}>
      <Field label="من" req><select name="side" defaultValue="client"><option value="client">من الـ Client</option><option value="owner">من الـ Owner</option></select></Field>
      <Field label="لخزنة / بنك" req>
        <select name="toId" required defaultValue=""><option value="" disabled>{cash ? "اختار" : "بيحمّل…"}</option>{cash?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </Field>
      <Field label={`المبلغ (الباقي ${money(d.remaining)})`} req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required placeholder="المبلغ" /></Field>
      <Field label="التاريخ" req><input name="date" type="date" defaultValue={localDate(new Date())} max={localDate(new Date())} required /></Field>
      {first && (
        <Field label="نوع الإيراد (أول تحصيل بيثبت العمولة كلها)" req wide>
          <select name="revenueId" required defaultValue=""><option value="" disabled>اختار</option>{incomes.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
        </Field>
      )}
      <div className="row end wide"><button className="btn ghost"><Icon name="plus" />سجّل تحصيل</button></div>
    </form>
  );
}

/**
 * «المطالبات وإيصالات الاستلام» (9.17, demo claims.js `claimsBlock`). A claim isn't linked to a deal in the API yet, so the
 * drawer lists the caller's claims on this company and unit, and «اطلب مطالبة» fills both in.
 */
function Claims({ d }: { d: DealSheetRow }) {
  const { can } = useMe();
  const q = useClaimsAll();
  const [asking, setAsking] = useState(false);
  if (!q.data) return null;
  const mine = q.data.items.filter((c) => c.company === d.company && c.unit === d.unitCode);
  return (
    <section className="card flat">
      <Head icon="file" title="المطالبات وإيصالات الاستلام" sub="اطلب مطالبة للعميل · وبعد الدفع إيصال استلام نقدية" extra={mine.length ? <Chip plain>{mine.length}</Chip> : undefined} />
      {mine.map((c) => (
        <div key={c.id} className="line-item">
          <span><b className="mono">{c.no}</b> · {c.company} · <b>{money(c.amount)}</b> <Chip plain tone={c.status === "paid" ? "ok" : c.status === "rejected" ? "bad" : "warn"}>{c.label}</Chip>{c.einvoice && <small className="hint"> · فاتورة {c.einvoice.no}</small>}</span>
          <span className="row">
            {c.status !== "requested" && c.status !== "rejected" && <a className="btn ghost sm" href={`/api/v1/claims/${c.id}/pdf?doc=claim`} target="_blank" rel="noreferrer">المطالبة</a>}
            {c.status === "paid" && <a className="btn sm" href={`/api/v1/claims/${c.id}/pdf?doc=receipt`} target="_blank" rel="noreferrer">إيصال الاستلام {c.receiptNo}</a>}
          </span>
        </div>
      ))}
      {live(d.status) && can("deals", "create") && <div className="row end"><button className="btn ghost sm" onClick={() => setAsking(true)}><Icon name="plus" />اطلب مطالبة</button></div>}
      {asking && <NewClaim entities={q.data.entities} initial={{ company: d.company, unit: d.unitCode, unitInfo: `${d.location} · ${num(d.space)} م · ${d.type}` }} onClose={() => setAsking(false)} />}
    </section>
  );
}
