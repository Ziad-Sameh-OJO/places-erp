"use client";
import { useEffect, useState } from "react";
import type { Achievements, DealSheetRow } from "@places/contracts";
import { Fab, Kanban, KpiTile } from "@/components/blocks";
import { Card, Chip, Empty, ExportButton, Icon, Note, Table, Tabs } from "@/components/ui";
import { day, money, num, short } from "@/lib/format";
import { useMe } from "@/lib/me";
import { DealDrawer } from "./deal-drawer";
import { DealForm } from "./deal-form";
import { LANES, ST_TONE, monthOf, names, onSheet, useAchievements, useDealSheet } from "./use-deals";

type Tab = "me" | "board" | "sheet" | "split" | "achv";
const pct = (a: string, b: string) => (Number(b) > 0 ? Math.min(100, (Number(a) / Number(b)) * 100) : 0);
const Bar = ({ p, tone = "" }: { p: number; tone?: string }) => <div className={`bar ${tone}`}><i style={{ width: `${p}%` }} /></div>;

/**
 * M-02 · الصفقات (demo deals.js): «لوحة الإيرادات» on top, then the Done Deals board, the done-deals sheet, «تفاصيل
 * الصفقات» per salesperson, Achievements and «إنجازاتي». What each person sees is the API's scope.
 */
export function DealsPage() {
  const { can, me } = useMe();
  const isSales = !!me?.roles.includes("sales");
  const [tab, setTab] = useState<Tab | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const sheet = useDealSheet();
  // a notification links to /deals?open=…
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("open"); if (id) setOpen(id); }, []);
  const t = tab ?? (isSales ? "me" : "board");
  const items = sheet.data?.items ?? [];
  const tot = sheet.data?.totals;
  const openRow = items.find((d) => d.id === open);
  const tabs: [Tab, string][] = [...(isSales ? [["me", "إنجازاتي"] as [Tab, string]] : []), ["board", "Done Deals board"], ["sheet", "شيت الـ Done Deals"], ["split", "تفاصيل الصفقات"], ["achv", "Achievements"]];

  return (
    <>
      <div className="kpis">
        <KpiTile label="صافي الكوميشن" value={tot ? money(tot.collected) : "…"} sub={tot ? `${num(tot.deals)} صفقة اتحصّل منها · Owner + Client` : ""} icon="handshake" />
        <KpiTile label="الكوميشن المتوقع" value={tot ? money(tot.expected) : "…"} sub={tot ? `${Math.round(pct(tot.collected, tot.expected))}% اتحصّل` : ""} icon="wallet" tone="ok" />
        <KpiTile label="المتبقي" value={tot ? money(tot.remaining) : "…"} sub="لسه متحصّلش" icon="clock" tone="warn" />
        <KpiTile label="عمولات السيلز" value={tot ? money(tot.commission) : "…"} sub="نسبة كل سيلز من نصيبه" icon="trend" />
      </div>
      <div className="row">
        <Tabs value={t} onChange={setTab} items={tabs} />
        <span className="spacer" />
        {/* the list as it is filtered on screen: the sheet tab is the deals on the sheet with its search */}
        <ExportButton module="deals" path="/deals/export" filename="الصفقات.xlsx" label="تصدير الصفقات"
          query={new URLSearchParams(t === "sheet" ? { sheet: "1", ...(q.trim() ? { q: q.trim() } : {}) } : {})} />
        <ExportButton module="deals" path="/deals/split/export" filename="تفاصيل الصفقات.xlsx" label="تصدير تفاصيل الصفقات" />
        {can("deals", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />سجّل صفقة</button>}
      </div>
      {sheet.error && <Note kind="warn">{sheet.error.message}</Note>}
      {!sheet.data && !sheet.error && <Empty text="بيحمّل…" icon="clock" />}
      {sheet.data && t === "board" && (
        <Kanban itemKey={(d) => d.id} onOpen={(d) => setOpen(d.id)}
          lanes={LANES.map((s) => ({ key: s, title: s, tone: ST_TONE[s], items: items.filter((d) => d.status === s) }))}
          card={(d) => (
            <>
              <div className="row"><b className="spacer">{d.company}</b>{d.offTarget && <Chip tone="bad">Alarm</Chip>}{d.sellers.some((s) => !s.approved) && <Chip tone="warn">Seller مستني منار</Chip>}</div>
              <span className="hint mono">{d.code} · {d.unitCode} · {d.type}</span>
              <b className="num">{money((Number(d.commissionOwner) + Number(d.commissionClient)).toFixed(2))}</b>
              <Bar p={pct(d.collected, (Number(d.commissionOwner) + Number(d.commissionClient)).toFixed(2))} tone={Number(d.remaining) > 0 ? "warn" : ""} />
              <div className="row"><span className="hint spacer">Buyer: {names(d.buyers)}</span><span className="hint">{day(d.closedAt)}</span></div>
            </>
          )} />
      )}
      {sheet.data && t === "sheet" && <Sheet rows={items.filter((d) => onSheet(d.status))} q={q} setQ={setQ} onOpen={setOpen} />}
      {sheet.data && t === "split" && <Split rows={items} onOpen={setOpen} />}
      {(t === "achv" || t === "me") && <Board mine={t === "me"} />}
      {can("deals", "create") && <Fab onClick={() => setCreating(true)} label="سجّل صفقة" />}
      {creating && <DealForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setOpen(id); }} />}
      {openRow && <DealDrawer d={openRow} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The client's «admin done deal 2026» sheet, column for column. */
function Sheet({ rows, q, setQ, onOpen }: { rows: DealSheetRow[]; q: string; setQ: (v: string) => void; onOpen: (id: string) => void }) {
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((d) => [d.company, d.code, d.unitCode, d.location, names(d.buyers), names(d.sellers)].join(" ").toLowerCase().includes(needle)) : rows;
  const side = (d: DealSheetRow, s: "buyer" | "seller", f: (x: DealSheetRow["shares"][number]) => string) => d.shares.filter((x) => x.side === s).map(f).join(" / ") || "—";
  return (
    <>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder="الشركة، الوحدة، السيلز" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الشيت" /></label>
        <span className="hint">بتظهر هنا بعد موافقة الـ Office Manager</span>
      </div>
      <Table head={["Date", "company", "space", "type", "location", "buyer", "seller", "source", "owner side", "client side", "net commission", "buyer %", "buyer commission", "seller %", "seller commission", "tcr", "note", "deal date"]}
        empty="مفيش صفقات في الشيت" onRow={(i) => onOpen(shown[i]!.id)}
        rows={shown.map((d) => [
          monthOf(d.firstPaidAt), <span key="c"><b>{d.company}</b><span className="sub mono">{d.code}</span></span>, `${num(d.space)} م`, d.type, d.location, names(d.buyers),
          <span key="s">{names(d.sellers)}{d.sellers.some((s) => !s.approved) && <span className="sub"><Chip tone="warn">مستني منار</Chip></span>}</span>, d.source,
          money(d.collectedOwner), money(d.collectedClient), <b key="n">{money(d.collected)}</b>,
          side(d, "buyer", (x) => `${x.schemePercent}%`), side(d, "buyer", (x) => short(x.commission)), side(d, "seller", (x) => `${x.schemePercent}%`), side(d, "seller", (x) => short(x.commission)), <span key="t" className="mono">{d.tcrs.join(" · ") || "—"}</span>,
          <span key="no" className="wrap">{d.note}{d.targetBase && <span className="sub">التارجت بـ {money(d.targetBase)}</span>}</span>, day(d.closedAt),
        ])} />
    </>
  );
}

/** M-02 6.1 (voice notes 27/10): every deal, every salesperson — share, what entered the target, commission. */
function Split({ rows, onOpen }: { rows: DealSheetRow[]; onOpen: (id: string) => void }) {
  const lines = rows.flatMap((d) => d.shares.map((x) => ({ d, x })));
  return (
    <>
      <Note>لكل صفقة: الكوميشن اللي اتحصّل بيتقسم نصين (Buyer / Seller)، وكل نص بيتقسم على عدد السيلز اللي في الجهة دي. نصيب السيلز هو اللي بيدخل التارجت بتاعه، وعمولته = نسبته × نصيبه.</Note>
      <Table head={["الصفقة", "السيلز", "الجهة", "نصيبه من الكوميشن", "دخل في التارجت", "نسبته", "عمولته", "الـ Team Leader"]} empty="مفيش صفقات اتحصّل منها"
        onRow={(i) => onOpen(lines[i]!.d.id)}
        rows={lines.map(({ d, x }) => [
          <span key="d" className="mono">{d.code}<span className="sub">{d.company}</span></span>, x.name,
          <Chip key="s" tone={x.side === "buyer" ? "info" : "acc"}>{x.side === "buyer" ? "Buyer" : "Seller"}</Chip>, money(x.share),
          d.offTarget ? <Chip key="t" tone="warn">خارج التارجت</Chip> : money(x.targetShare), `${x.schemePercent}%`, <b key="c">{money(x.commission)}</b>, x.tl ?? "—",
        ])} />
    </>
  );
}

/** Achievements: the month's Leaderboard (M-12 targets); «إنجازاتي» adds the salesperson's own ring and rank on top. */
function Board({ mine }: { mine: boolean }) {
  const q = useAchievements();
  if (!q.data) return q.error ? <Note kind="warn">{q.error.message}</Note> : <Empty text="بيحمّل…" icon="clock" />;
  const a: Achievements = q.data;
  const meRow = a.rows.find((r) => r.employeeId === a.mine);
  const max = Math.max(1, ...a.rows.map((r) => Number(r.achieved)));
  return (
    <>
      {mine && meRow && (
        <>
          <section className="achv-hero">
            <div className="ring" style={{ "--p": Math.min(100, meRow.percent) } as React.CSSProperties}><b className="num">{Math.round(meRow.percent)}%</b><small>من التارجت</small></div>
            <div><span className="eyebrow">ترتيبك بين {a.rows.length} سيلز · {a.label}</span><h2>#{meRow.rank} · {meRow.name}</h2><p>دخلك في التارجت {money(meRow.achieved)} من {money(meRow.value)}</p></div>
          </section>
          <div className="kpis">
            <KpiTile label="Transactions" value={num(meRow.transactions)} sub="صفقة اسمك فيها واتحصّل منها" icon="handshake" />
            <KpiTile label="زيارات خلصت" value={num(meRow.visitsDone)} sub="Visit Done" icon="pin" tone="ok" />
          </div>
        </>
      )}
      <Card title="Leaderboard" icon="star" sub={`${a.label} · مترتب باللي دخل في التارجت (نصيب كل سيلز من الكوميشن)`}>
        <Table head={["#", "السيلز", "Transactions", "دخل في التارجت", "التارجت", "زيارات"]} empty="مفيش سيلز"
          rows={a.rows.map((r) => [
            <span key="r" className={`rank r${r.rank}`}>{r.rank}</span>, <span key="n" className={r.employeeId === a.mine ? "me-row" : ""}>{r.name}{r.tl && <span className="sub">{r.tl}</span>}</span>,
            num(r.transactions), <div key="v" className="cell-bar"><span className="num">{short(r.achieved)}</span><Bar p={(Number(r.achieved) / max) * 100} /></div>,
            <span key="t">{Math.round(r.percent)}% <span className="sub">من {short(r.value)}</span></span>, num(r.visitsDone),
          ])} />
      </Card>
    </>
  );
}
