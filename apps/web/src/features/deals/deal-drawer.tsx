"use client";
import { useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { DealCollected, DealSheetRow, DealTcr } from "@places/contracts";
import { DEAL_TYPES, execState, localDate } from "@places/domain";
import { Drawer, Stepper } from "@/components/blocks";
import { NewClaim } from "@/components/new-claim";
import { Chip, Field, Icon, Modal, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day, money, num } from "@/lib/format";
import { useFields, useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { LANES, ST_TONE, live, monthOf, names, onSheet, useAchievements, useCashAccounts, useClaimsAll, useCollectForm, useDeal, useRefreshDeals } from "./use-deals";
import { useRecent } from "@/lib/quick";

const Head = ({ icon, title, sub, extra }: { icon: "users" | "check" | "file" | "wallet" | "x"; title: string; sub?: string; extra?: ReactNode }) => (
  <div className="card-head"><h3><span className="ico"><Icon name={icon} /></span><span>{title}{sub && <small>{sub}</small>}</span></h3>{extra}</div>
);

const bold = (ch: ReactNode) => <b>{ch}</b>;

/** M-09 field permissions: a hidden field has no input; a read-only one is shown locked (the API keeps it either way). */
function useOnly() {
  const fields = useFields("deals");
  const only = (key: string, node: ReactNode): ReactNode =>
    !fields.shows(key) ? null : fields.edits(key) ? node : <fieldset key={key} className="field-lock" disabled>{node}</fieldset>;
  return { fields, only };
}

/** The demo's deal drawer (deals.js `dealDrawer`): the deal, its split, the review, the note, claims, collections, cancelling. */
export function DealDrawer({ d, onClose }: { d: DealSheetRow; onClose: () => void }) {
  const t = useTranslations("deals.drawer");
  const td = useTranslations("deals");
  const { can } = useMe();
  const { fields, only } = useOnly();
  const detail = useDeal(d.id).data;
  useRecent("deal", d.id, `${d.code} · ${d.company}`); // 0.14
  const mine = useAchievements().data?.mine; // the caller's employee id: their own line on a TCR
  const run = useAction();
  const refresh = useRefreshDeals();
  const post = (path: string, body: unknown, ok: string, method: "post" | "put" = "post") => run(async () => { await api[method](`/deals/${d.id}/${path}`, body); await refresh(); }, ok);
  const sellerWait = d.sellers.some((s) => !s.approved);
  const [editing, setEditing] = useState<DealTcr | null>(null);
  const fromSide = (side: "owner" | "client") => (side === "owner" ? td("fromOwner") : td("fromClient"));
  // [label, value, field (none = always shown)]: a hidden field's row is left out (M-09)
  const kv = ([
    [t("kv.company"), d.company], [t("kv.unit"), <span key="u"><span className="mono">{d.unitCode}</span>{fields.shows("location") && ` · ${d.location}`}</span>], [t("kv.space"), td("sqm", { space: num(d.space) }), "space"],
    [t("kv.type"), d.type, "type"], ["Buyer", names(d.buyers)], ["Seller", names(d.sellers)], [t("kv.source"), serverText(d.source), "source"],
    [t("kv.commOwner"), money(d.commissionOwner), "commissionOwner"], [t("kv.commClient"), money(d.commissionClient), "commissionClient"],
    [t("kv.collected"), `${money(d.collectedOwner)} / ${money(d.collectedClient)}`, "collected"], [t("kv.net"), money(d.collected), "collected"],
    [t("kv.remaining"), money(d.remaining), "remaining"], [t("kv.firstPaid"), monthOf(d.firstPaidAt)], ["deal date", day(d.closedAt)],
  ] as [string, ReactNode, string?][]).filter(([, , k]) => !k || fields.shows(k));
  return (
    <Drawer title={d.company} sub={`${d.code} · Done Deal`} onClose={onClose}
      chips={<><Chip tone={ST_TONE[d.status]}>{d.status}</Chip>{d.offTarget && <Chip tone="warn">{td("offTarget")}</Chip>}</>}>
      {d.offTarget && <Note kind="warn">{t.rich("alarm", { b: bold })}</Note>}
      {d.status === "Cancelled" && <Note kind="warn">{t.rich("cancelledNote", { b: bold })}</Note>}
      {sellerWait && <Note kind="warn">{t.rich("sellerWait", { b: bold, names: names(d.sellers.filter((s) => !s.approved)), unit: d.unitCode })} {can("inventory", "approve") && <button className="btn sm" onClick={() => void post("seller", {}, t("sellerAdded"))}><Icon name="check" />{t("approveSeller")}</button>}</Note>}
      <Stepper stages={LANES} current={d.status === "Rejected" ? "Pending Review" : d.status} />
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {fields.shows("note") && (d.note || d.targetBase) && <Note><b>note:</b> {d.note}{d.targetBase && <>{t("targetBasedOn", { base: money(d.targetBase), collected: money(d.collected) })}</>}</Note>}
      {fields.shows("shares") && <section className="card flat">
        <Head icon="users" title={t("split")} sub={t("splitSub")} />
        {d.shares.length ? d.shares.map((x) => (
          <div key={x.salesId} className="line-item"><span>{x.name} · {x.side === "buyer" ? "Buyer" : "Seller"} · {t("shareLine", { share: money(x.share), pct: String(x.schemePercent) })}</span><b className="num">{money(x.commission)}</b></div>
        )) : <p className="hint">{t("splitStarts")}</p>}
        {sellerWait && <p className="hint">{t("sellerHalf")}</p>}
      </section>}
      {d.status === "Rejected" && detail?.reviewNote && <Note kind="warn">{t("rejectReason", { reason: detail.reviewNote })}</Note>}
      {d.status === "Pending Review" && (can("deals", "approve") ? <Review d={d} post={post} /> : <Note>{t("waitingReview")}</Note>)}
      {live(d.status) && (fields.shows("execution") || fields.shows("papers")) && <ExecPapers d={d} post={post} />}
      {live(d.status) && fields.shows("note") && (can("deals", "approve") || can("finance", "edit")) && (
        <form className="card flat" onSubmit={onFormSubmit((f) => post("note", { note: String(f.get("note") ?? ""), targetBase: String(f.get("targetBase") ?? "") || null }, t("noteForm.saved"), "put"))}>
          <Head icon="file" title={t("noteForm.title")} sub={t("noteForm.sub")} />
          <div className="grid">
            {only("note", <Field label={t("noteForm.note")}><input name="note" defaultValue={d.note ?? ""} placeholder={t("noteForm.notePh")} /></Field>)}
            {only("targetBase", <Field label={t("noteForm.targetBase")}><input name="targetBase" inputMode="decimal" pattern="\d+(\.\d{1,2})?" defaultValue={d.targetBase ?? ""} /></Field>)}
          </div>
          <div className="row end"><button className="btn ghost sm">{t("noteForm.save")}</button></div>
        </form>
      )}
      <Claims d={d} />
      <section className="card flat">
        <Head icon="wallet" title={t("collection")} extra={onSheet(d.status) && fields.shows("remaining") ? <Chip tone={Number(d.remaining) > 0 ? "warn" : "ok"}>{Number(d.remaining) > 0 ? t("left", { amount: money(d.remaining) }) : t("fullyCollected")}</Chip> : undefined} />
        {detail?.tcrs.length ? detail.tcrs.map((x) => {
          const left = x.signatures.filter((s) => !s.signedAt).length;
          const mineOpen = x.signatures.some((s) => s.id === mine && !s.signedAt);
          return (
            <div key={x.id} className="line-item">
              <span>
                <b className="mono">{x.code}</b> · {day(x.date)} · {fromSide(x.side)}{fields.shows("payments") && <> · <b className="num">{money(x.amount)}</b></>}
                <span className="sub">{x.signatures.map((s) => `${s.name} ${s.signedAt ? "✓" : t("notSigned")}`).join(" · ")}</span>
              </span>
              <span className="row">
                {left ? <Chip tone="warn">{t("waitingSigs", { count: String(left) })}</Chip> : <Chip tone="ok">{t("signed")}</Chip>}
                <a className="btn ghost sm" href={`/api/v1/deals/${d.id}/tcrs/${x.id}/pdf`} target="_blank" rel="noreferrer"><Icon name="file" />TCR</a>
                {mineOpen && <button className="btn sm" onClick={() => void post(`tcrs/${x.id}/sign`, {}, t("signedToast", { code: x.code }))}>{t("sign")}</button>}
                {onSheet(d.status) && can("finance", "edit") && fields.edits("collected") && fields.shows("payments") && <button className="btn ghost sm" title={t("editTitle")} onClick={() => setEditing(x)}>{t("edit")}</button>}
              </span>
              {x.edited && <span className="sub hint" style={{ flexBasis: "100%" }}>{t("edited", { from: money(x.edited.from), to: money(x.amount), reason: x.edited.reason })}</span>}
            </div>
          );
        }) : d.payments.length ? d.payments.map((p, i) => (
          <div key={i} className="line-item"><span>{day(p.at)} · {fromSide(p.side)}</span>{fields.shows("payments") && <b className="num">{money(p.amount)}</b>}</div>
        )) : <p className="hint">{t("noCollection")}</p>}
        {live(d.status) && fields.edits("collected") && fields.shows("remaining") && Number(d.remaining) > 0 && can("finance", "create") && <Collect d={d} onDone={refresh} />}
      </section>
      {editing && <EditCollection dealId={d.id} tcr={editing} onClose={() => setEditing(null)} onDone={refresh} />}
      {live(d.status) && can("deals", "delete") && (
        <form className="card flat" onSubmit={onFormSubmit((f) => post("cancel", { reason: String(f.get("reason") ?? "") }, t("cancelled")))}>
          <Head icon="x" title={t("cancel")} />
          <div className="row"><input name="reason" required placeholder={t("cancelReason")} aria-label={t("cancelReason")} /><button className="btn danger">{t("cancel")}</button></div>
        </form>
      )}
    </Drawer>
  );
}

const EXEC_CHIP = { "on-time": ["ok", "onTime"], late: ["warn", "late"], overdue: ["bad", "overdue"] } as const;

/**
 * «التنفيذ والأوراق» (demo deals.js execPapers · M-02 3.1, KPIs in M-12): the Office Manager sets when the deal is due to
 * be carried out and marks it done; Finance checks its papers (contract · mandate · registration). Others only see them.
 */
function ExecPapers({ d, post }: { d: DealSheetRow; post: (path: string, body: unknown, ok: string, method?: "post" | "put") => Promise<void> }) {
  const t = useTranslations("deals.exec");
  const { can } = useMe();
  const { fields } = useOnly();
  const om = can("deals", "approve") && fields.edits("execution"), fin = can("finance", "edit") && fields.edits("papers");
  const state = execState(d.execDueAt, d.executedAt, localDate(new Date()));
  const papers = (ok: boolean) => {
    const note = ok ? "" : (window.prompt(t("whatsWrong")) ?? "").trim();
    if (!ok && !note) return;
    void post("papers", ok ? { ok } : { ok, note }, t("reviewed"), "put");
  };
  return (
    <section className="card flat">
      <Head icon="check" title={t("title")} extra={state && fields.shows("execution") ? <Chip tone={EXEC_CHIP[state][0]}>{t(`chip.${EXEC_CHIP[state][1]}`)}</Chip> : undefined} />
      {fields.shows("execution") && <div className="row">
        {om ? (
          <>
            <label className="row hint">{t("due")} <input type="date" defaultValue={d.execDueAt ?? ""} onBlur={(e) => { if (e.target.value && e.target.value !== d.execDueAt) void post("execution", { execDueAt: e.target.value }, t("dueSaved"), "put"); }} /></label>
            {d.executedAt ? <span className="hint">{t("executedOn", { date: day(d.executedAt) })}</span> : <button className="btn ghost sm" onClick={() => void post("execution", { executed: true }, t("executedToast"), "put")}><Icon name="check" />{t("executed")}</button>}
          </>
        ) : <span className="hint">{t("dueRead", { date: day(d.execDueAt) })}{d.executedAt && ` · ${t("executedOn", { date: day(d.executedAt) })}`}</span>}
      </div>}
      {fields.shows("papers") && <div className="row">
        <span className="hint">{t("papers")}</span>
        {d.papersOk == null ? <Chip plain>{t("notReviewed")}</Chip> : <><Chip tone={d.papersOk ? "ok" : "bad"}>{d.papersOk ? t("ok") : t("wrong")}</Chip>{d.papersNote && <small className="hint">{d.papersNote}</small>}</>}
        {fin && <><button className="btn ghost sm" onClick={() => papers(true)}>{t("ok")}</button><button className="btn ghost sm" onClick={() => papers(false)}>{t("wrong")}</button></>}
      </div>}
    </section>
  );
}

/** Q9: the Office Manager may correct any field before approving; a rejection needs its reason. */
function Review({ d, post }: { d: DealSheetRow; post: (path: string, body: unknown, ok: string) => Promise<void> }) {
  const t = useTranslations("deals.review");
  const sales = useAchievements().data?.rows ?? [];
  const { only } = useOnly();
  const ref = useRef<HTMLFormElement>(null);
  const send = (v: "approve" | "reject") => {
    const f = new FormData(ref.current!);
    if (v === "reject") return post("review", { decision: "reject", reason: String(f.get("reason") ?? "") }, t("rejected"));
    const buyers = f.getAll("buyers").map(String);
    // a field she may not change has no (or a locked) input: it isn't sent, and the API keeps it
    const sent = (k: string) => (f.get(k) == null ? {} : { [k]: k === "space" ? Number(f.get(k)) : f.get(k) });
    return post("review", {
      decision: "approve", ...sent("space"), ...sent("type"), ...sent("location"), ...sent("commissionOwner"), ...sent("commissionClient"), ...(buyers.length ? { buyers } : {}),
      ...(f.get("externalCommission") ? { externalCommission: f.get("externalCommission") } : {}),
    }, t("approved"));
  };
  return (
    <form className="card flat" ref={ref} onSubmit={(e) => e.preventDefault()}>
      <Head icon="check" title={t("title")} sub={t("sub")} />
      <div className="grid">
        {only("space", <Field label={t("space")}><input name="space" type="number" min="1" defaultValue={d.space} /></Field>)}
        {only("type", <Field label={t("type")}><select name="type" defaultValue={d.type}>{DEAL_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>)}
        {only("location", <Field label={t("location")}><input name="location" defaultValue={d.location} /></Field>)}
        {only("commissionOwner", <Field label={t("commOwner")}><input name="commissionOwner" inputMode="decimal" defaultValue={d.commissionOwner} /></Field>)}
        {only("commissionClient", <Field label={t("commClient")}><input name="commissionClient" inputMode="decimal" defaultValue={d.commissionClient} /></Field>)}
        <Field label={t("external")}><input name="externalCommission" inputMode="decimal" placeholder="0" /></Field>
        <Field label={t("buyers")}>
          <select name="buyers" multiple size={3} defaultValue={d.buyers.map((b) => b.id)}>
            {[...new Map([...d.buyers.map((b) => [b.id, b.name] as const), ...sales.map((s) => [s.employeeId, s.name] as const)])].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
      </div>
      <div className="row">
        <input name="reason" placeholder={t("reasonPh")} aria-label={t("reason")} />
        <button type="button" className="btn danger" onClick={() => void send("reject")}>{t("reject")}</button>
        <button type="button" className="btn" onClick={() => void send("approve")}>{t("approve")}</button>
      </div>
    </form>
  );
}

/** 5.15 «تعديل يدوي» (demo deals.js payEdit): Finance corrects a collection / TCR with a reason; the audit keeps both amounts. */
function EditCollection({ dealId, tcr, onClose, onDone }: { dealId: string; tcr: DealTcr; onClose: () => void; onDone: () => Promise<unknown> }) {
  const t = useTranslations("deals.editCollection");
  const run = useAction();
  const send = onFormSubmit((f) => run(async () => {
    await api.put(`/deals/${dealId}/tcrs/${tcr.id}`, { amount: String(f.get("amount") ?? "").trim(), reason: String(f.get("reason") ?? "").trim() });
    await onDone();
    onClose();
  }, t("saved")));
  return (
    <Modal title={t("title", { code: tcr.code })} onClose={onClose}>
      <form className="grid" onSubmit={send}>
        <Note>{t("note")}</Note>
        <Field label={t("amount")} req wide><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required defaultValue={tcr.amount} /></Field>
        <Field label={t("reason")} req wide><input name="reason" required placeholder={t("reasonPh")} /></Field>
        <div className="row end wide"><button className="btn">{t("save")}</button></div>
      </form>
    </Modal>
  );
}

/** «سجّل تحصيل» (5.3, the accountant's meeting 4 Nov): the side, the safe / bank, the amount; the first one needs the revenue line. */
function Collect({ d, onDone }: { d: DealSheetRow; onDone: () => Promise<unknown> }) {
  const t = useTranslations("deals.collect");
  const td = useTranslations("deals");
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
  }, t("saved")));
  return (
    <form className="grid" onSubmit={send}>
      <Field label={t("from")} req><select name="side" defaultValue="client"><option value="client">{td("fromClient")}</option><option value="owner">{td("fromOwner")}</option></select></Field>
      <Field label={t("to")} req>
        <select name="toId" required defaultValue=""><option value="" disabled>{cash ? td("pick") : td("loading")}</option>{cash?.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </Field>
      <Field label={t("amountLeft", { left: money(d.remaining) })} req><input name="amount" inputMode="decimal" pattern="\d+(\.\d{1,2})?" required placeholder={t("amount")} /></Field>
      <Field label={t("date")} req><input name="date" type="date" defaultValue={localDate(new Date())} max={localDate(new Date())} required /></Field>
      {first && (
        <Field label={t("revenue")} req wide>
          <select name="revenueId" required defaultValue=""><option value="" disabled>{td("pick")}</option>{incomes.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
        </Field>
      )}
      <div className="row end wide"><button className="btn ghost"><Icon name="plus" />{t("submit")}</button></div>
    </form>
  );
}

/**
 * «المطالبات وإيصالات الاستلام» (9.17, demo claims.js `claimsBlock`). A claim isn't linked to a deal in the API yet, so the
 * drawer lists the caller's claims on this company and unit, and «اطلب مطالبة» fills both in.
 */
function Claims({ d }: { d: DealSheetRow }) {
  const t = useTranslations("deals.claims");
  const td = useTranslations("deals");
  const { can } = useMe();
  const { fields } = useOnly();
  const q = useClaimsAll();
  const [asking, setAsking] = useState(false);
  if (!q.data) return null;
  const mine = q.data.items.filter((c) => c.company === d.company && c.unit === d.unitCode);
  return (
    <section className="card flat">
      <Head icon="file" title={t("title")} sub={t("sub")} extra={mine.length ? <Chip plain>{mine.length}</Chip> : undefined} />
      {mine.map((c) => (
        <div key={c.id} className="line-item">
          <span><b className="mono">{c.no}</b> · {c.company} · <b>{money(c.amount)}</b> <Chip plain tone={c.status === "paid" ? "ok" : c.status === "rejected" ? "bad" : "warn"}>{serverText(c.label)}</Chip>{c.einvoice && <small className="hint">{t("invoice", { no: c.einvoice.no })}</small>}</span>
          <span className="row">
            {c.status !== "requested" && c.status !== "rejected" && <a className="btn ghost sm" href={`/api/v1/claims/${c.id}/pdf?doc=claim`} target="_blank" rel="noreferrer">{t("claim")}</a>}
            {c.status === "paid" && <a className="btn sm" href={`/api/v1/claims/${c.id}/pdf?doc=receipt`} target="_blank" rel="noreferrer">{t("receipt", { no: c.receiptNo ?? "" })}</a>}
          </span>
        </div>
      ))}
      {live(d.status) && can("deals", "create") && <div className="row end"><button className="btn ghost sm" onClick={() => setAsking(true)}><Icon name="plus" />{t("ask")}</button></div>}
      {asking && <NewClaim entities={q.data.entities} initial={{ company: d.company, unit: d.unitCode, unitInfo: [fields.shows("location") && d.location, fields.shows("space") && td("sqm", { space: num(d.space) }), fields.shows("type") && d.type].filter(Boolean).join(" · ") }} onClose={() => setAsking(false)} />}
    </section>
  );
}
