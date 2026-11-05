"use client";
import { useState } from "react";
import type { KpiBandsInput, KpiCardSummary, KpiCompany } from "@places/contracts";
import { Avatar, Card, Chip, Empty, Icon, Note, Tabs, Table, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { dayTime, money } from "@/lib/format";
import { KpiCardBody, KpiDrawer } from "./kpi-drawer";
import { type Scope, useBoard, useCompany, useKpiLog, useRefreshKpis } from "./use-kpis";

type Tab = Scope | "log";
const barTone = (t: string) => (t === "ok" ? "" : t);
export const Bar = ({ pct, tone }: { pct: number; tone: string }) => <div className={`bar ${barTone(tone)}`}><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
export const moneyChip = (v: string | null) => (v && Number(v) ? <Chip tone={Number(v) > 0 ? "ok" : "bad"} plain>{Number(v) > 0 ? "+" : "−"}{money(v.replace("-", ""))}</Chip> : null);

/** M-12 · مؤشرات الأداء (demo kpis.js): كارتي · فريقي · كل الشركة · التقارير والتغييرات. */
export function KpisPage() {
  const me = useBoard("me"), team = useBoard("team");
  const all = !!me.data?.seesAll;
  const mine = me.data?.cards[0];
  const tabs: [Tab, string, number?][] = [
    ...(mine ? [["me", "كارتي"] as [Tab, string]] : []),
    ...(team.data?.cards.length ? [["team", "فريقي", team.data.cards.length] as [Tab, string, number]] : []),
    ...(all ? [["all", "كل الشركة"] as [Tab, string], ["log", "التقارير والتغييرات"] as [Tab, string]] : []),
  ];
  const [pick, setPick] = useState<Tab | null>(null);
  const tab = tabs.find((t) => t[0] === pick)?.[0] ?? tabs[0]?.[0];
  if (me.isPending || team.isPending) return <Empty text="بيحمّل…" />;
  if (!tab) return <Card><Empty text="مفيش كارت KPIs ليك في الربع ده" icon="chart" /></Card>;
  return (
    <>
      <div className="row"><Tabs<Tab> items={tabs} value={tab} onChange={setPick} /></div>
      {tab === "me" && mine ? <MyCard id={mine.id} /> : tab === "team" ? <Board scope="team" /> : tab === "all" ? <Company /> : <Log />}
    </>
  );
}

function MyCard({ id }: { id: string }) {
  return <section className="card"><KpiCardBody id={id} /></section>;
}

function Board({ scope }: { scope: "team" | "all" }) {
  const q = useBoard(scope);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<"low" | "high">("low");
  if (!q.data) return <Empty text="بيحمّل…" />;
  const { cards, quarter } = q.data;
  const list = sort === "low" ? cards : [...cards].reverse();
  const avg = cards.length ? cards.reduce((s, c) => s + c.score, 0) / cards.length : 0;
  const approved = cards.filter((c) => c.approved).length;
  return (
    <>
      <Note>البند <b>الأوتوماتيك</b> السيستم بيقيسه لوحده من الموديولات، و<b>التسليم</b> الموظف بيسجّله، و<b>اليدوي</b> بيدخّله المتابع. النتيجة = مجموع (الوزن × التحقيق).</Note>
      <div className="kpis sm">
        <KpiTile label="الكروت" value={cards.length} sub={scope === "all" ? "كل الشركة" : "فريقك"} icon="users" />
        <KpiTile label="المتوسط" value={`${Math.round(avg)}%`} sub={quarter.label} icon="chart" />
        <KpiTile label="اتعتمد" value={`${approved} من ${cards.length}`} sub="من المتابع" icon="check" tone={approved === cards.length ? "ok" : "warn"} />
        <KpiTile label="الربع" value={quarter.status === "open" ? "مفتوح" : "اتقفل"} sub={quarter.status === "open" ? "النتايج بتتحدّث" : "النتايج اتحفظت"} icon="clock" />
      </div>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="الترتيب">
          <button aria-pressed={sort === "low"} onClick={() => setSort("low")}>الأقل الأول</button>
          <button aria-pressed={sort === "high"} onClick={() => setSort("high")}>الأعلى الأول</button>
        </div>
      </div>
      <div className="kpi-cards">
        {list.map((c) => <CardTile key={c.id} c={c} onOpen={() => setOpen(c.id)} />)}
        {!list.length && <Empty text="مفيش كروت ليك" icon="chart" />}
      </div>
      {open && <KpiDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CardTile({ c, onOpen }: { c: KpiCardSummary; onOpen: () => void }) {
  return (
    <button className="kpi-card" onClick={onOpen}>
      <span className="row"><Avatar id={c.employeeId} name={c.name} /><span className="kc-who"><b>{c.name}</b><small>{c.title} · يتابعه: {c.follower}</small></span><b className={`num kc-score ${c.tone}`}>{Math.round(c.score)}%</b></span>
      <Bar pct={c.score} tone={c.tone} />
      <span className="row">
        <Chip tone={c.tone} plain>{c.tier}</Chip>{moneyChip(c.money)}
        {c.below > 0 && <Chip tone="warn" plain>{c.below} بند تحت المستهدف</Chip>}
        {c.approved ? <Chip tone="ok" plain>اتعتمد</Chip> : <Chip plain>مستني اعتماد</Chip>}
      </span>
    </button>
  );
}

function Company() {
  const q = useCompany(true);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Board scope="all" />
      {q.data && <Quarters c={q.data} />}
      {q.data && q.data.noCard.length > 0 && (
        <Card title="موظفين من غير كارت KPIs" icon="users" extra={<Chip tone="warn">{q.data.noCard.length}</Chip>}>
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
  const run = useAction(), refresh = useRefreshKpis();
  const cur = c.quarters[0];
  const start = () => { if (confirm("تبدأ الربع الجديد؟ نتايج الربع ده هتتحفظ، وكل كارت هيبدأ بنفس البنود والأوزان من غير أرقام.")) void run(async () => { await api.post("/kpis/quarter/next"); await refresh(); }, "الربع الجديد بدأ · عدّلوا البنود براحتكم"); };
  const close = () => { if (confirm("تقفل الربع؟ نتيجة كل كارت وفلوسه هتتحفظ ومفيش تعديل بعدها.")) void run(async () => { await api.post("/kpis/quarter/close"); await refresh(); }, "الربع اتقفل"); };
  return (
    <Card title="الأرباع" icon="calendar" sub="كل ربع بيبدأ بنسخة من كروت الربع اللي قبله، وبعدها تعدّلوا البنود براحتكم"
      extra={cur && <Chip tone={cur.status === "open" ? "ok" : "warn"}>{cur.label} · {cur.status === "open" ? "شغال" : "اتقفل"}</Chip>}>
      <Table head={["الربع", "عدد الكروت", "متوسط النتيجة"]} rows={c.quarters.map((x) => [<b key="q">{x.label}</b>, x.cards, x.avg == null ? "—" : `${x.avg}%`])} />
      <div className="row end">
        {c.can.close && <button className="btn" onClick={close}><Icon name="send" />اقفل الربع</button>}
        {cur && <button className="btn ghost" onClick={start}><Icon name="plus" />ابدأ ربع جديد</button>}
      </div>
    </Card>
  );
}

function NoCard({ p, onMade }: { p: KpiCompany["noCard"][number]; onMade: (id: string) => void }) {
  const run = useAction(), refresh = useRefreshKpis();
  const make = () => void run(async () => { const r = await api.post<{ id: string }>("/kpis/cards", { employeeId: p.id }); await refresh(); onMade(r.id); }, `كارت جديد لـ ${p.name}`);
  return <div className="line-item"><span><b>{p.name}</b><small className="hint">{p.title}</small></span><button className="btn ghost sm" onClick={make}><Icon name="plus" />اعمل كارت</button></div>;
}

function Watchers({ c }: { c: KpiCompany }) {
  const run = useAction(), refresh = useRefreshKpis();
  const ids = c.watchers.map((w) => w.userId);
  const save = (userIds: string[]) => void run(async () => { await api.put("/kpis/watchers", { userIds }); await refresh(); }, "اتحفظ");
  return (
    <Card title="مسؤول الـ KPIs" icon="chart" sub="بيشوف كل الكروت والتقارير وأي تغيير، وبيتبلّغ بيه · من غير أي حاجة ليها علاقة بالفلوس">
      <div className="row">
        {c.watchers.map((w) => <button key={w.userId} className="btn ghost sm" onClick={() => save(ids.filter((x) => x !== w.userId))} aria-label={`شيل ${w.name}`}>{w.name} <Icon name="x" /></button>)}
        {!c.watchers.length && <span className="hint">محدش</span>}
        <select value="" aria-label="ضيف مسؤول" onChange={(e) => e.target.value && save([...ids, e.target.value])}>
          <option value="">ضيف…</option>
          {c.people.filter((p) => !ids.includes(p.userId)).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
        </select>
      </div>
    </Card>
  );
}

function Bands({ b, edit }: { b: KpiBandsInput; edit: boolean }) {
  const run = useAction(), refresh = useRefreshKpis();
  const save = (d: FormData) => void run(async () => {
    await api.put("/kpis/bands", Object.fromEntries((Object.keys(b) as (keyof KpiBandsInput)[]).map((k) => [k, Number(d.get(k))])));
    await refresh();
  }, "اتحفظ · كل الكروت اتحسبت تاني");
  const n = (k: keyof KpiBandsInput) => edit ? <input name={k} type="number" defaultValue={b[k]} style={{ width: 64 }} aria-label={k} /> : <b>{b[k]}</b>;
  return (
    <Card title="شرايح الفلوس" icon="wallet" sub="واحدة للكل · الحسبة على المرتب أو بونص الكوارتر حسب كل موظف">
      <form onSubmit={onFormSubmit(save)}>
        <div className="tiers">
          <div className="tier ok"><b>{n("top")}% وأكتر</b><span>البونص كامل + مكافأة {n("rewardPercent")}%</span></div>
          <div className="tier ok"><b>{n("full")}%</b><span>بونص كامل</span></div>
          <div className="tier warn"><b>{n("partial")}% لحد {b.full}%</b><span>بونص جزئي (النقص لحد {b.cutPercent}%)</span></div>
          <div className="tier warn2"><b>أقل من {b.partial}%</b><span>خصم {n("cutPercent")}% + خطة تحسين</span></div>
          <div className="tier bad"><b>أقل من {n("low")}%</b><span>Threshold: البونص بيتلغي + خصم {b.cutPercent}% من المرتب + إنذار</span></div>
        </div>
        {edit && <div className="row end"><button className="btn ghost"><Icon name="check" />احفظ الشرايح</button></div>}
      </form>
    </Card>
  );
}

function Log() {
  const q = useKpiLog();
  return (
    <Card title="سجل التغييرات" icon="clock" sub="كل تعديل على الـ KPIs، ومين عمله وإمتى" extra={<Chip tone="info">{q.data?.length ?? 0}</Chip>}>
      <div className="timeline">
        {q.data?.map((l, i) => <div key={i}>{l.text}<small>{l.by} · {dayTime(l.at)}</small></div>)}
        {q.data && !q.data.length && <Empty text="مفيش تغييرات لسه" icon="clock" />}
      </div>
    </Card>
  );
}

