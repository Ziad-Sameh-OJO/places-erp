"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Achievements, DealSheetRow } from "@places/contracts";
import { Fab, Kanban, KpiTile } from "@/components/blocks";
import { Card, Chip, Empty, ExportButton, Icon, Note, Table, Tabs } from "@/components/ui";
import { day, money, num, short } from "@/lib/format";
import { useFields, useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
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
  const tr = useTranslations("deals");
  const { can, me } = useMe();
  const isSales = !!me?.roles.includes("sales");
  const [tab, setTab] = useState<Tab | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const sheet = useDealSheet();
  const fields = useFields("deals"); // M-09: what the role doesn't see has no tile, column or tab
  // a notification links to /deals?open=…
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("open"); if (id) setOpen(id); }, []);
  const t = tab ?? (isSales ? "me" : "board");
  const items = sheet.data?.items ?? [];
  const tot = sheet.data?.totals;
  const openRow = items.find((d) => d.id === open);
  const tabs: [Tab, string][] = [...(isSales ? [["me", tr("tabs.me")] as [Tab, string]] : []), ["board", "Done Deals board"], ["sheet", tr("tabs.sheet")], ...(fields.shows("shares") ? [["split", tr("tabs.split")] as [Tab, string]] : []), ["achv", "Achievements"]];

  return (
    <>
      <div className="kpis">
        {fields.shows("collected") && <KpiTile label={tr("kpis.net")} value={tot ? money(tot.collected) : "…"} sub={tot ? tr("kpis.netSub", { count: tot.deals, n: num(tot.deals) }) : ""} icon="handshake" />}
        {fields.shows("expected") && <KpiTile label={tr("kpis.expected")} value={tot ? money(tot.expected) : "…"} sub={tot && fields.shows("collected") ? tr("kpis.expectedSub", { pct: String(Math.round(pct(tot.collected, tot.expected))) }) : ""} icon="wallet" tone="ok" />}
        {fields.shows("remaining") && <KpiTile label={tr("kpis.remaining")} value={tot ? money(tot.remaining) : "…"} sub={tr("kpis.remainingSub")} icon="clock" tone="warn" />}
        {fields.shows("commission") && <KpiTile label={tr("kpis.commission")} value={tot ? money(tot.commission) : "…"} sub={tr("kpis.commissionSub")} icon="trend" />}
      </div>
      <div className="row">
        <Tabs value={t} onChange={setTab} items={tabs} />
        <span className="spacer" />
        {/* the list as it is filtered on screen: the sheet tab is the deals on the sheet with its search */}
        <ExportButton module="deals" path="/deals/export" filename={tr("export.file")} label={tr("export.label")}
          query={new URLSearchParams(t === "sheet" ? { sheet: "1", ...(q.trim() ? { q: q.trim() } : {}) } : {})} />
        <ExportButton module="deals" path="/deals/split/export" filename={tr("export.splitFile")} label={tr("export.splitLabel")} />
        {can("deals", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />{tr("newDeal")}</button>}
      </div>
      {sheet.error && <Note kind="warn">{sheet.error.message}</Note>}
      {!sheet.data && !sheet.error && <Empty text={tr("loading")} icon="clock" />}
      {sheet.data && t === "board" && (
        <Kanban itemKey={(d) => d.id} onOpen={(d) => setOpen(d.id)}
          lanes={LANES.map((s) => ({ key: s, title: s, tone: ST_TONE[s], items: items.filter((d) => d.status === s) }))}
          card={(d) => (
            <>
              <div className="row"><b className="spacer">{d.company}</b>{d.offTarget && <Chip tone="bad">Alarm</Chip>}{d.sellers.some((s) => !s.approved) && <Chip tone="warn">{tr("board.sellerWaiting")}</Chip>}</div>
              <span className="hint mono">{d.code} · {d.unitCode}{fields.shows("type") && ` · ${d.type}`}</span>
              {fields.shows("expected") && <b className="num">{money((Number(d.commissionOwner) + Number(d.commissionClient)).toFixed(2))}</b>}
              {fields.shows("expected") && fields.shows("collected") && <Bar p={pct(d.collected, (Number(d.commissionOwner) + Number(d.commissionClient)).toFixed(2))} tone={Number(d.remaining) > 0 ? "warn" : ""} />}
              <div className="row"><span className="hint spacer">Buyer: {names(d.buyers)}</span><span className="hint">{day(d.closedAt)}</span></div>
            </>
          )} />
      )}
      {sheet.data && t === "sheet" && <Sheet rows={items.filter((d) => onSheet(d.status))} q={q} setQ={setQ} onOpen={setOpen} />}
      {sheet.data && t === "split" && fields.shows("shares") && <Split rows={items} onOpen={setOpen} />}
      {(t === "achv" || t === "me") && <Board mine={t === "me"} />}
      {can("deals", "create") && <Fab onClick={() => setCreating(true)} label={tr("newDeal")} />}
      {creating && <DealForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setOpen(id); }} />}
      {openRow && <DealDrawer d={openRow} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The client's «admin done deal 2026» sheet, column for column. */
function Sheet({ rows, q, setQ, onOpen }: { rows: DealSheetRow[]; q: string; setQ: (v: string) => void; onOpen: (id: string) => void }) {
  const t = useTranslations("deals");
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((d) => [d.company, d.code, d.unitCode, d.location, names(d.buyers), names(d.sellers)].join(" ").toLowerCase().includes(needle)) : rows;
  const side = (d: DealSheetRow, s: "buyer" | "seller", f: (x: DealSheetRow["shares"][number]) => string) => d.shares.filter((x) => x.side === s).map(f).join(" / ") || "—";
  const fields = useFields("deals");
  // [field (none = always shown), head, cell]: a hidden field's column is left out (M-09)
  const cols: [string | null, string, (d: DealSheetRow) => ReactNode][] = [
    [null, "Date", (d) => monthOf(d.firstPaidAt)], [null, "company", (d) => <span key="c"><b>{d.company}</b><span className="sub mono">{d.code}</span></span>],
    ["space", "space", (d) => t("sqm", { space: num(d.space) })], ["type", "type", (d) => d.type], ["location", "location", (d) => d.location], [null, "buyer", (d) => names(d.buyers)],
    [null, "seller", (d) => <span key="s">{names(d.sellers)}{d.sellers.some((s) => !s.approved) && <span className="sub"><Chip tone="warn">{t("sheet.waitingManar")}</Chip></span>}</span>],
    ["source", "source", (d) => serverText(d.source)],
    ["collectedOwner", "owner side", (d) => money(d.collectedOwner)], ["collectedClient", "client side", (d) => money(d.collectedClient)], ["collected", "net commission", (d) => <b key="n">{money(d.collected)}</b>],
    ["shares", "buyer %", (d) => side(d, "buyer", (x) => `${x.schemePercent}%`)], ["shares", "buyer commission", (d) => side(d, "buyer", (x) => short(x.commission))],
    ["shares", "seller %", (d) => side(d, "seller", (x) => `${x.schemePercent}%`)], ["shares", "seller commission", (d) => side(d, "seller", (x) => short(x.commission))],
    [null, "tcr", (d) => <span key="t" className="mono">{d.tcrs.join(" · ") || "—"}</span>],
    ["note", "note", (d) => <span key="no" className="wrap">{d.note}{d.targetBase && <span className="sub">{t("sheet.targetAt", { amount: money(d.targetBase) })}</span>}</span>],
    [null, "deal date", (d) => day(d.closedAt)],
  ];
  const shownCols = cols.filter(([k]) => !k || fields.shows(k));
  return (
    <>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder={t("sheet.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("sheet.searchLabel")} /></label>
        <span className="hint">{t("sheet.afterApproval")}</span>
      </div>
      <Table head={shownCols.map(([, h]) => h)} empty={t("sheet.empty")} onRow={(i) => onOpen(shown[i]!.id)}
        rows={shown.map((d) => shownCols.map(([, , cell]) => cell(d)))} />
    </>
  );
}

/** M-02 6.1 (voice notes 27/10): every deal, every salesperson — share, what entered the target, commission. */
function Split({ rows, onOpen }: { rows: DealSheetRow[]; onOpen: (id: string) => void }) {
  const t = useTranslations("deals");
  const lines = rows.flatMap((d) => d.shares.map((x) => ({ d, x })));
  return (
    <>
      <Note>{t("split.note")}</Note>
      <Table head={[t("split.deal"), t("sales"), t("split.side"), t("split.share"), t("inTarget"), t("split.percent"), t("split.commission"), t("split.tl")]} empty={t("split.empty")}
        onRow={(i) => onOpen(lines[i]!.d.id)}
        rows={lines.map(({ d, x }) => [
          <span key="d" className="mono">{d.code}<span className="sub">{d.company}</span></span>, x.name,
          <Chip key="s" tone={x.side === "buyer" ? "info" : "acc"}>{x.side === "buyer" ? "Buyer" : "Seller"}</Chip>, money(x.share),
          d.offTarget ? <Chip key="t" tone="warn">{t("offTarget")}</Chip> : money(x.targetShare), `${x.schemePercent}%`, <b key="c">{money(x.commission)}</b>, x.tl ?? "—",
        ])} />
    </>
  );
}

/** Achievements: the month's Leaderboard (M-12 targets); «إنجازاتي» adds the salesperson's own ring and rank on top. */
function Board({ mine }: { mine: boolean }) {
  const t = useTranslations("deals");
  const q = useAchievements();
  const achieved = useFields("deals").shows("achieved");
  if (!q.data) return q.error ? <Note kind="warn">{q.error.message}</Note> : <Empty text={t("loading")} icon="clock" />;
  const a: Achievements = q.data;
  const meRow = a.rows.find((r) => r.employeeId === a.mine);
  const max = Math.max(1, ...a.rows.map((r) => Number(r.achieved)));
  return (
    <>
      {mine && meRow && (
        <>
          <section className="achv-hero">
            {achieved && <div className="ring" style={{ "--p": Math.min(100, meRow.percent) } as React.CSSProperties}><b className="num">{Math.round(meRow.percent)}%</b><small>{t("achv.ofTarget")}</small></div>}
            <div><span className="eyebrow">{t("achv.rank", { count: String(a.rows.length), label: serverText(a.label) })}</span><h2>#{meRow.rank} · {meRow.name}</h2>{achieved && <p>{t("achv.yourTarget", { achieved: money(meRow.achieved), value: money(meRow.value) })}</p>}</div>
          </section>
          <div className="kpis">
            <KpiTile label="Transactions" value={num(meRow.transactions)} sub={t("achv.txSub")} icon="handshake" />
            <KpiTile label={t("achv.visitsDone")} value={num(meRow.visitsDone)} sub="Visit Done" icon="pin" tone="ok" />
          </div>
        </>
      )}
      <Card title="Leaderboard" icon="star" sub={t("achv.boardSub", { label: serverText(a.label) })}>
        <Table head={["#", t("sales"), "Transactions", ...(achieved ? [t("inTarget"), t("achv.target")] : []), t("achv.visits")]} empty={t("achv.empty")}
          rows={a.rows.map((r) => [
            <span key="r" className={`rank r${r.rank}`}>{r.rank}</span>, <span key="n" className={r.employeeId === a.mine ? "me-row" : ""}>{r.name}{r.tl && <span className="sub">{r.tl}</span>}</span>,
            num(r.transactions), ...(achieved ? [<div key="v" className="cell-bar"><span className="num">{short(r.achieved)}</span><Bar p={(Number(r.achieved) / max) * 100} /></div>,
            <span key="t">{Math.round(r.percent)}% <span className="sub">{t("achv.of", { value: short(r.value) })}</span></span>] : []), num(r.visitsDone),
          ])} />
      </Card>
    </>
  );
}
