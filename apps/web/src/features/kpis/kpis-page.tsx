"use client";
import { useState } from "react";
import type { KpiBandsInput, KpiCardSummary, KpiCompany } from "@places/contracts";
import { Avatar, Card, Chip, Empty, Icon, Note, Tabs, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { dayTime, money } from "@/lib/format";
import { useFields, useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { DailyBoard } from "@/features/reports/daily";
import { IdealEmployee } from "../hr/ideal";
import { KpiCardBody, KpiDrawer } from "./kpi-drawer";
import { type Scope, useBoard, useCompany, useKpiLog, useRefreshKpis } from "./use-kpis";

type Tab = Scope | "log" | "daily" | "ideal";
const barTone = (t: string) => (t === "ok" ? "" : t);
export const Bar = ({ pct, tone }: { pct: number; tone: string }) => <div className={`bar ${barTone(tone)}`}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
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
  ];
  const [pick, setPick] = useState<Tab | null>(null);
  const tab = tabs.find((x) => x[0] === pick)?.[0] ?? tabs[0]?.[0];
  if (me.isPending || team.isPending) return <Empty text={t("common.loading")} />;
  if (!tab) return <Card><Empty text={t("noCard")} icon="chart" /></Card>;
  return (
    <>
      <div className="row"><Tabs<Tab> items={tabs} value={tab} onChange={setPick} /></div>
      {tab === "me" && mine ? <MyCard id={mine.id} /> : tab === "team" ? <Board scope="team" /> : tab === "all" ? <Company /> : tab === "daily" ? <DailyBoard /> : tab === "ideal" ? <IdealEmployee /> : <Log />}
    </>
  );
}

function MyCard({ id }: { id: string }) {
  return <section className="card"><KpiCardBody id={id} /></section>;
}

function Board({ scope }: { scope: "team" | "all" }) {
  const t = useTranslations("kpis");
  const q = useBoard(scope);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<"low" | "high">("low");
  const score = useFields("kpis").shows("score");
  if (!q.data) return <Empty text={t("common.loading")} />;
  const { cards, quarter } = q.data;
  const list = sort === "low" ? cards : [...cards].reverse();
  const avg = cards.length ? cards.reduce((s, c) => s + c.score, 0) / cards.length : 0;
  const approved = cards.filter((c) => c.approved).length;
  return (
    <>
      <Note>{t.rich("board.note", { b: (x) => <b>{x}</b> })}</Note>
      <div className="kpis sm">
        <KpiTile label={t("board.cards")} value={cards.length} sub={scope === "all" ? t("tabs.all") : t("board.yourTeam")} icon="users" />
        {score && <KpiTile label={t("board.average")} value={`${Math.round(avg)}%`} sub={serverText(quarter.label)} icon="chart" />}
        <KpiTile label={t("common.approved")} value={t("board.approvedOf", { n: approved, total: cards.length })} sub={t("board.byFollower")} icon="check" tone={approved === cards.length ? "ok" : "warn"} />
        <KpiTile label={t("board.quarter")} value={quarter.status === "open" ? t("board.open") : t("board.closed")} sub={quarter.status === "open" ? t("board.updating") : t("board.saved")} icon="clock" />
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label={t("board.sort")}>
          <button aria-pressed={sort === "low"} onClick={() => setSort("low")}>{t("board.lowFirst")}</button>
          <button aria-pressed={sort === "high"} onClick={() => setSort("high")}>{t("board.highFirst")}</button>
        </div>
      </div>
      <div className="kpi-cards">
        {list.map((c) => <CardTile key={c.id} c={c} onOpen={() => setOpen(c.id)} />)}
        {!list.length && <Empty text={t("board.empty")} icon="chart" />}
      </div>
      {open && <KpiDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CardTile({ c, onOpen }: { c: KpiCardSummary; onOpen: () => void }) {
  const t = useTranslations("kpis");
  const score = useFields("kpis").shows("score"); // M-09: a hidden result isn't shown (the API blanks it)
  return (
    <button className="kpi-card" onClick={onOpen}>
      <span className="row"><Avatar id={c.employeeId} name={c.name} /><span className="kc-who"><b>{c.name}</b><small>{serverText(c.title)} · {t("followedBy", { name: c.follower })}</small></span>{score && <b className={`num kc-score ${c.tone}`}>{Math.round(c.score)}%</b>}</span>
      {score && <Bar pct={c.score} tone={c.tone} />}
      <span className="row">
        {score && <Chip tone={c.tone} plain>{serverText(c.tier)}</Chip>}{moneyChip(c.money)}
        {c.below > 0 && <Chip tone="warn" plain>{t("board.below", { count: c.below })}</Chip>}
        {c.approved ? <Chip tone="ok" plain>{t("common.approved")}</Chip> : <Chip plain>{t("board.awaitingApproval")}</Chip>}
      </span>
    </button>
  );
}

function Company() {
  const t = useTranslations("kpis");
  const q = useCompany(true);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Board scope="all" />
      {q.data && <Quarters c={q.data} />}
      {q.data && q.data.noCard.length > 0 && (
        <Card title={t("company.noCard")} icon="users" extra={<Chip tone="warn">{q.data.noCard.length}</Chip>}>
          {q.data.noCard.map((p) => <NoCard key={p.id} p={p} onMade={setOpen} />)}
        </Card>
      )}
      {q.data?.can.edit && <Watchers c={q.data} />}
      {q.data?.bands && <Bands b={q.data.bands} edit={q.data.can.edit} />}
      {open && <KpiDrawer id={open} onClose={() => setOpen(null)} edit />}
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

