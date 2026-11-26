"use client";
import { type ReactNode, useEffect, useState } from "react";
import type { KpiBandsInput, KpiCardSummary, KpiCompany, KpiSheetSetup } from "@places/contracts";
import { SHEET_FIELD_KEYS, type SheetField } from "@places/domain";
import { Avatar, Card, Chip, Empty, Icon, Note, Tabs, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { dayTime, money } from "@/lib/format";
import { useFields, useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { DailyBoard } from "@/features/reports/daily";
import { IdealEmployee } from "../hr/ideal";
import { KpiCardBody, KpiDrawer } from "./kpi-drawer";
import { bandOf } from "./kpi-view";
import { type Scope, useBoard, useCompany, useKpiLog, useRefreshKpis } from "./use-kpis";
import { PeriodPicker } from "@/components/period-picker";
import { HistoryFigures, HistoryTab } from "./history";

type Tab = Scope | "log" | "daily" | "ideal" | "history" | "settings";
const barTone = (t: string) => (t === "ok" ? "" : t);
export const Bar = ({ pct, tone }: { pct: number; tone: string }) => <div className={`bar ${barTone(tone)}`}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
/** HR 15 Nov · «الربع» / «الشهر»: which progress a card shows (the API sends both). */
export type Period = "quarter" | "month";
export function PeriodSwitch({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const t = useTranslations("kpis.period");
  return (
    <div className="seg" role="group" aria-label={t("label")}>
      {(["quarter", "month"] as const).map((p) => <button key={p} aria-pressed={value === p} onClick={() => onChange(p)}>{t(p)}</button>)}
    </div>
  );
}
const BAND = ["bad", "warn", "ok2", "ok"] as const;
const bandTone = (score: number, s: { low: number; partial: number }) => (score < s.low ? "bad" : score < s.partial ? "warn" : "ok");
export const moneyChip = (v: string | null) => (v && Number(v) ? <Chip tone={Number(v) > 0 ? "ok" : "bad"} plain>{Number(v) > 0 ? "+" : "−"}{money(v.replace("-", ""))}</Chip> : null);

/** M-12 · مؤشرات الأداء (demo kpis.js): كارتي · فريقي · كل الشركة · التقارير والتغييرات. */
export function KpisPage() {
  const t = useTranslations("kpis");
  const me = useBoard("me"), team = useBoard("team");
  const { can } = useMe();
  const all = !!me.data?.seesAll;
  const mine = me.data?.cards[0];
  const tabs: [Tab, string, number?][] = [
    ...(mine ? [["me", t("tabs.me")] as [Tab, string]] : []),
    ...(team.data?.cards.length ? [["team", t("tabs.team"), team.data.cards.length] as [Tab, string, number]] : []),
    ...(all ? [["all", t("tabs.all")] as [Tab, string]] : []),
    ...(all || team.data?.cards.length ? [["daily", t("tabs.daily")] as [Tab, string]] : []),
    ...(all ? [["log", t("tabs.log")] as [Tab, string]] : []),
    // 7.11: not for the KPI watcher (money); the list itself is the HR one, so it needs «hr: view»
    ...(me.data?.seesMoney && can("hr", "view") ? [["ideal", t("tabs.ideal")] as [Tab, string]] : []),
    // 14.12: past quarters' figures typed by hand, by the admins and HR
    ...(can("kpis", "edit") || can("hr", "edit") ? [["history", t("history.tab")] as [Tab, string]] : []),
    // the quarters, the money bands, the watcher and the sheet's lines: off the cards' page, in their own tab
    ...(all ? [["settings", t("tabs.settings")] as [Tab, string]] : []),
  ];
  const [pick, setPick] = useState<Tab | null>(null);
  // 11.16: «افتح الكارت» from home and its KPI lines: «/kpis?card=<id>»
  const [deep, setDeep] = useState<string | null>(null);
  useEffect(() => { setDeep(new URLSearchParams(window.location.search).get("card")); }, []);
  const tab = tabs.find((x) => x[0] === pick)?.[0] ?? tabs[0]?.[0];
  if (me.isPending || team.isPending) return <Empty text={t("common.loading")} />;
  if (!tab) return <Card><Empty text={t("noCard")} icon="chart" /></Card>;
  return (
    <>
      <div className="row"><Tabs<Tab> items={tabs} value={tab} onChange={setPick} /></div>
      {tab === "me" && mine ? <MyCard id={mine.id} /> : tab === "team" ? <Board scope="team" /> : tab === "all" ? <Company /> : tab === "daily" ? <DailyBoard /> : tab === "ideal" ? <IdealEmployee /> : tab === "history" ? <HistoryTab /> : tab === "settings" ? <Settings /> : <Log />}
      {deep && <KpiDrawer id={deep} onClose={() => setDeep(null)} />}
    </>
  );
}

function MyCard({ id }: { id: string }) {
  return <KpiCardBody id={id} />;
}

type Sort = "dept" | "low" | "high";
function Board({ scope, note, extra }: { scope: "team" | "all" | "mine"; note?: ReactNode; extra?: { n: number; label: string; sub: string } | undefined }) {
  const t = useTranslations("kpis");
  const [pickedQuarter, setPickedQuarter] = useState(""); // 14.12: "" = the current quarter
  const q = useBoard(scope, true, pickedQuarter);
  const { can } = useMe();
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>(scope === "all" ? "dept" : "low");
  const [period, setPeriod] = useState<Period>("quarter");
  const [find, setFind] = useState("");
  const [band, setBand] = useState<number | null>(null);
  const score = useFields("kpis").shows("score");
  if (!q.data) return <Empty text={t("common.loading")} />;
  const { cards, quarter, scale } = q.data;
  const shown = (c: KpiCardSummary) => (period === "month" ? c.month : c);
  const avg = cards.length ? cards.reduce((s, c) => s + shown(c).score, 0) / cards.length : 0;
  const approved = cards.filter((c) => c.approved).length;
  const inBand = [0, 1, 2, 3].map((i) => cards.filter((c) => bandOf(shown(c).score, scale) === i).length);
  const bandLabel = [t("view.under", { v: scale.low }), `${scale.low}–${scale.partial}%`, `${scale.partial}–${scale.full}%`, `+${scale.full}%`];
  const word = find.trim().toLowerCase();
  const list = cards
    .filter((c) => (band == null || bandOf(shown(c).score, scale) === band) && (!word || [c.name, serverText(c.title), serverText(c.department), c.follower].some((x) => x.toLowerCase().includes(word))))
    .sort((x, y) => (sort === "high" ? shown(y).score - shown(x).score : shown(x).score - shown(y).score));
  // «بالقسم»: the departments by name, each one's people lowest first
  const groups = sort === "dept" ? [...new Set(list.map((c) => c.department))].sort((x, y) => serverText(x).localeCompare(serverText(y), "ar")).map((d) => ({ d, rows: list.filter((c) => c.department === d) })) : [{ d: "", rows: list }];
  const stat = (n: ReactNode, tone: string, label: string, sub: string) => <div className="kx-stat"><strong className={`num ${tone}`}>{n}</strong><span><b>{label}</b>{sub}</span></div>;
  return (
    <div className="kx">
      <div className="kx-strip">
        {stat(cards.length, "", t("board.cards"), `${serverText(quarter.label)} · ${quarter.status === "open" ? t("view.quarterOpen") : t("view.quarterClosed")}`)}
        {score && stat(`${Math.round(avg)}%`, bandTone(avg, scale), scope === "all" ? t("view.companyAvg") : t("view.teamAvg"), period === "month" ? t("period.month") : t("view.goal", { v: scale.partial }))}
        {stat(<>{approved}<small> / {cards.length}</small></>, approved === cards.length && cards.length ? "ok" : "", t("common.approved"), approved === cards.length ? t("view.allApproved") : t("view.waiting", { n: cards.length - approved }))}
        {extra ? stat(extra.n, extra.n ? "warn" : "", extra.label, extra.sub) : stat(cards.filter((c) => c.below > 0).length, "", t("view.haveBelow"), t("view.haveBelowSub"))}
      </div>
      {score && cards.length > 0 && (
        <section className="kx-card">
          <div className="kx-h"><h3>{t("view.whereStand")}</h3><small className="hint">{t("view.pickBand")}</small></div>
          <div className="kx-dist" aria-hidden="true">{inBand.map((n, i) => n > 0 && <i key={i} className={BAND[i]} style={{ flex: n }} />)}</div>
          <div className="kx-leg">
            {inBand.map((n, i) => <button key={i} className={`kx-pill ${BAND[i]}`} aria-pressed={band === i} onClick={() => setBand(band === i ? null : i)}>{bandLabel[i]} · <b className="num">{n}</b></button>)}
          </div>
        </section>
      )}
      <section className="kx-card">
        <div className="kx-tool">
          <label className="search"><Icon name="search" /><input value={find} onChange={(e) => setFind(e.target.value)} placeholder={t("view.find")} aria-label={t("view.find")} /></label>
          <PeriodPicker value={pickedQuarter || quarter.id} onChange={setPickedQuarter} bare />
          <PeriodSwitch value={period} onChange={setPeriod} />
          <div className="seg" role="group" aria-label={t("board.sort")}>
            {(["dept", "low", "high"] as const).map((k) => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{k === "dept" ? t("view.byDept") : k === "low" ? t("board.lowFirst") : t("board.highFirst")}</button>)}
          </div>
        </div>
        <div className="kx-rows">
          <div className="kx-tr hd"><span>{t("view.employee")}</span><span>{t("view.follower")}</span><span>{score ? t("view.result") : ""}</span><span>{t("view.belowCol")}</span><span>{t("view.approval")}</span><span /></div>
          {groups.map((g) => (
            <div key={g.d} className="kx-group">
              {sort === "dept" && <div className="kx-grp">{serverText(g.d)}<small>· {t("view.groupInfo", { n: g.rows.length })}{score && ` · ${t("view.groupAvg", { v: Math.round(g.rows.reduce((s, c) => s + shown(c).score, 0) / g.rows.length) })}`}</small></div>}
              {g.rows.map((c) => <CardRow key={c.id} c={c} period={period} onOpen={() => setOpen(c.id)} />)}
            </div>
          ))}
          {!list.length && <Empty text={cards.length ? t("view.noMatch") : t("board.empty")} icon="chart" />}
        </div>
      </section>
      <Note>{note ?? t.rich("board.note", { b: (x) => <b>{x}</b> })}</Note>
      {q.data.missing.length > 0 && (
        <Card title={t("inv.missing")} icon="users" extra={<Chip tone="warn">{q.data.missing.length}</Chip>}>
          {q.data.missing.map((p) => <NoCard key={p.id} p={p} onMade={setOpen} />)}
        </Card>
      )}
      {pickedQuarter && (can("kpis", "edit") || can("hr", "edit")) && <HistoryFigures period={pickedQuarter} />}
      {open && <KpiDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/**
 * 11.19 · demo inventory.js invView «kpis»: Manar's own card and her team's, from inside the inventory, and a card for
 * anyone on the team who has none (she follows it). Approving her own card stays with her follower (Nancy).
 */
export function InventoryKpis({ onBack }: { onBack: () => void }) {
  const t = useTranslations("kpis");
  return (
    <>
      <div className="row"><button className="btn ghost" onClick={onBack}><Icon name="building" />{t("inv.back")}</button><span className="spacer" /></div>
      <Board scope="mine" note={t("inv.note")} />
    </>
  );
}

/** One person on the board, as a line that reads across: who, who follows, the result, what is under target, approved. */
function CardRow({ c, period, onOpen }: { c: KpiCardSummary; period: Period; onOpen: () => void }) {
  const t = useTranslations("kpis");
  const score = useFields("kpis").shows("score"); // M-09: a hidden result isn't shown (the API blanks it)
  const s = period === "month" ? c.month : c;
  return (
    <button className="kx-tr" onClick={onOpen}>
      <span className="kx-who"><Avatar id={c.employeeId} name={c.name} /><span><b>{c.name}</b><small>{serverText(c.title)}</small></span></span>
      <span className="kx-mut" data-label={t("view.follower")}>{c.follower}</span>
      <span className={`kx-bar ${s.tone}`}>{score && <><span className="kx-track"><i style={{ width: `${Math.max(0, Math.min(100, s.score))}%` }} /></span><b className="num">{Math.round(s.score)}%</b></>}</span>
      <span>{c.below > 0 ? t("view.belowN", { count: c.below }) : <span className="kx-mut">—</span>}</span>
      <span className="kx-chips">{c.approved ? <Chip tone="ok" plain>{t("common.approved")}</Chip> : <Chip plain>{t("board.awaitingApproval")}</Chip>}{moneyChip(c.money)}</span>
      <span className="kx-mut kx-go" aria-hidden="true">‹</span>
    </button>
  );
}

function Company() {
  const t = useTranslations("kpis");
  const q = useCompany(true);
  const [open, setOpen] = useState<string | null>(null);
  const none = q.data?.noCard ?? [];
  return (
    <>
      <Board scope="all" extra={q.data && { n: none.length, label: t("view.noCard"), sub: none.length ? t("view.noCardSub") : t("view.noCardNone") }} />
      {none.length > 0 && (
        <Card title={t("company.noCard")} icon="users" extra={<Chip tone="warn">{none.length}</Chip>}>
          {none.map((p) => <NoCard key={p.id} p={p} onMade={setOpen} />)}
        </Card>
      )}
      {open && <KpiDrawer id={open} onClose={() => setOpen(null)} edit />}
    </>
  );
}

/** «الإعدادات»: the quarters, who runs the KPIs, the money bands and the sheet's lines (they sat under the company's cards). */
function Settings() {
  const q = useCompany(true);
  const t = useTranslations("kpis");
  if (!q.data) return <Empty text={t("common.loading")} />;
  return (
    <>
      <Quarters c={q.data} />
      {q.data.can.edit && <Watchers c={q.data} />}
      {q.data.bands && <Bands b={q.data.bands} edit={q.data.can.edit} />}
      {q.data.sheetSetup && <SheetSetup s={q.data.sheetSetup} edit={q.data.can.edit} />}
    </>
  );
}

function Quarters({ c }: { c: KpiCompany }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const cur = c.quarters[0];
  const start = () => { if (confirm(t("quarters.startConfirm"))) void run(async () => { await api.post("/kpis/quarter/next"); await refresh(); }, t("quarters.startedOk")); };
  const close = () => { if (confirm(t("quarters.closeConfirm"))) void run(async () => { await api.post("/kpis/quarter/close"); await refresh(); }, t("quarters.closedOk")); };
  const sheets = () => { if (confirm(t("quarters.sheetsConfirm"))) void run(async () => { await api.post("/kpis/quarter/sheets"); await refresh(); }, t("quarters.sheetsOk")); };
  return (
    <Card title={t("quarters.title")} icon="calendar" sub={t("quarters.sub")}
      extra={cur && <Chip tone={cur.status === "open" ? "ok" : "warn"}>{serverText(cur.label)} · {cur.status === "open" ? t("quarters.running") : t("board.closed")}</Chip>}>
      <Table head={[t("board.quarter"), t("quarters.cardsCount"), t("quarters.avg")]} rows={c.quarters.map((x) => [<b key="q">{serverText(x.label)}</b>, x.cards, x.avg == null ? "—" : `${x.avg}%`])} />
      {c.sheets && <Note kind="ok">{t("quarters.sheetsSent", { by: c.sheets.by })}</Note>}
      {c.can.sheets && <Note kind="warn">{t("quarters.reviewSheets")}</Note>}
      <div className="row end">
        {c.can.close && <button className="btn" onClick={close}><Icon name="send" />{t("quarters.close")}</button>}
        {c.can.sheets && <button className="btn" onClick={sheets}><Icon name="check" />{t("quarters.approveSheets")}</button>}
        {cur && <button className="btn ghost" onClick={start}><Icon name="plus" />{t("quarters.start")}</button>}
      </div>
    </Card>
  );
}

function NoCard({ p, onMade }: { p: KpiCompany["noCard"][number]; onMade: (id: string) => void }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const make = () => void run(async () => { const r = await api.post<{ id: string }>("/kpis/cards", { employeeId: p.id }); await refresh(); onMade(r.id); }, t("company.newCardOk", { name: p.name }));
  return <div className="line-item"><span><b>{p.name}</b><small className="hint">{serverText(p.title)}</small></span><button className="btn ghost sm" onClick={make}><Icon name="plus" />{t("company.makeCard")}</button></div>;
}

function Watchers({ c }: { c: KpiCompany }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const ids = c.watchers.map((w) => w.userId);
  const save = (userIds: string[]) => void run(async () => { await api.put("/kpis/watchers", { userIds }); await refresh(); }, t("common.saved"));
  return (
    <Card title={t("watchers.title")} icon="chart" sub={t("watchers.sub")}>
      <div className="row">
        {c.watchers.map((w) => <button key={w.userId} className="btn ghost sm" onClick={() => save(ids.filter((x) => x !== w.userId))} aria-label={t("common.remove", { name: w.name })}>{w.name} <Icon name="x" /></button>)}
        {!c.watchers.length && <span className="hint">{t("watchers.none")}</span>}
        <select value="" aria-label={t("watchers.add")} onChange={(e) => e.target.value && save([...ids, e.target.value])}>
          <option value="">{t("common.addMenu")}</option>
          {c.people.filter((p) => !ids.includes(p.userId)).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
        </select>
      </div>
    </Card>
  );
}

function Bands({ b, edit }: { b: KpiBandsInput; edit: boolean }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const save = (d: FormData) => void run(async () => {
    await api.put("/kpis/bands", Object.fromEntries((Object.keys(b) as (keyof KpiBandsInput)[]).map((k) => [k, Number(d.get(k))])));
    await refresh();
  }, t("bands.savedOk"));
  const n = (k: keyof KpiBandsInput) => edit ? <input name={k} type="number" defaultValue={b[k]} style={{ width: 64 }} aria-label={k} /> : <b>{b[k]}</b>;
  return (
    <Card title={t("bands.title")} icon="wallet" sub={t("bands.sub")}>
      <form onSubmit={onFormSubmit(save)}>
        <div className="tiers">
          <div className="tier ok"><b>{t.rich("bands.top", { v: () => n("top") })}</b><span>{t.rich("bands.topPay", { v: () => n("rewardPercent") })}</span></div>
          <div className="tier ok"><b>{n("full")}%</b><span>{t("bands.full")}</span></div>
          <div className="tier warn"><b>{t.rich("bands.partial", { v: () => n("partial"), full: b.full })}</b><span>{t("bands.partialPay", { cut: b.cutPercent })}</span></div>
          <div className="tier warn2"><b>{t("bands.below", { v: b.partial })}</b><span>{t.rich("bands.belowPay", { v: () => n("cutPercent") })}</span></div>
          <div className="tier bad"><b>{t.rich("bands.low", { v: () => n("low") })}</b><span>{t("bands.lowPay", { cut: b.cutPercent })}</span></div>
        </div>
        {edit && <div className="row end"><button className="btn ghost"><Icon name="check" />{t("bands.save")}</button></div>}
      </form>
    </Card>
  );
}

/** 11.18 · demo clients.js «الخانات اللي في الورقة» + «الجوايز»: what every quarterly sheet shows from now on. */
function SheetSetup({ s, edit }: { s: KpiSheetSetup; edit: boolean }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const toggle = (k: SheetField, on: boolean) => void run(async () => {
    await api.put("/kpis/sheet/fields", { fields: on ? [...s.fields, k] : s.fields.filter((x) => x !== k) }); await refresh();
  }, t("common.saved"));
  const add = (d: FormData) => void run(async () => {
    await api.post("/kpis/sheet/bonuses", { minPct: Number(d.get("minPct")), amount: String(d.get("amount") ?? "") }); await refresh();
  }, t("common.saved"));
  const del = (id: string) => void run(async () => { await api.del(`/kpis/sheet/bonuses/${id}`); await refresh(); }, t("common.saved"));
  return (
    <Card title={t("sheet.title")} icon="filter" sub={t("sheet.sub")}>
      <div className="row">
        {SHEET_FIELD_KEYS.map((k) => <label key={k} className="tog"><input type="checkbox" checked={s.fields.includes(k)} disabled={!edit} onChange={(e) => toggle(k, e.target.checked)} />{t(`sheet.f.${k}`)}</label>)}
      </div>
      <h4 className="mini-h">{t("sheet.bonuses")}</h4>
      <Table head={[t("sheet.minPct"), t("sheet.amount"), ""]} rows={s.bonuses.map((b) => [<span key="p" className="num">{b.minPct}%</span>, money(b.amount),
        edit ? <button key="x" className="btn ghost sm" onClick={() => del(b.id)} aria-label={t("common.remove", { name: `${b.minPct}%` })}><Icon name="x" /></button> : ""])} />
      {edit && <form className="row" onSubmit={onFormSubmit(add)}>
        <input name="minPct" type="number" min="1" placeholder={t("sheet.minPctPh")} aria-label={t("sheet.minPctPh")} required style={{ maxWidth: 120 }} />
        <input name="amount" type="number" min="1" placeholder={t("sheet.amount")} aria-label={t("sheet.amount")} required style={{ maxWidth: 120 }} />
        <button className="btn ghost sm"><Icon name="plus" />{t("common.add")}</button>
      </form>}
    </Card>
  );
}

function Log() {
  const t = useTranslations("kpis");
  const q = useKpiLog();
  return (
    <Card title={t("log.title")} icon="clock" sub={t("log.sub")} extra={<Chip tone="info">{q.data?.length ?? 0}</Chip>}>
      <div className="timeline">
        {q.data?.map((l, i) => <div key={i}>{serverText(l.text)}<small>{l.by} · {dayTime(l.at)}</small></div>)}
        {q.data && !q.data.length && <Empty text={t("log.empty")} icon="clock" />}
      </div>
    </Card>
  );
}

