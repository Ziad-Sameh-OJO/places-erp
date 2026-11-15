"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AhmedDashboard, AhmedTeam, Compared, PacedBar } from "@places/contracts";
import { DASH_PERIODS, fromDecimal, localDate, quarterOfDay, teamTone, type DashPeriod } from "@places/domain";
import { Card, Chip, Empty } from "@/components/ui";
import { PeriodPicker } from "@/components/period-picker";
import { dateLocale, money, num, short } from "@/lib/format";
import { useMe } from "@/lib/me";
import { Person, Tile } from "./dashboard-page";
import { useAhmedDashboard } from "./use-dashboard";

/**
 * Ahmed Islam's dashboard on one page (management, 16 Nov): everything above the fold on a laptop, cards stacked on a
 * phone. The period against the previous one up to the same point; every number opens the page behind it, filtered
 * where that page takes a filter. The colours are the current tokens.
 */
export function AhmedPage() {
  const t = useTranslations("dashboard.ahmed");
  const [period, setPeriod] = useState<DashPeriod>("today");
  const [quarter, setQuarter] = useState(() => quarterOfDay(localDate(new Date())));
  const [person, setPerson] = useState<string | null>(null);
  const q = useAhmedDashboard(period, quarter);
  const d = q.data;
  return (
    <div className="dash-a">
      <Header period={period} onPeriod={setPeriod} quarter={quarter} onQuarter={setQuarter} updated={q.dataUpdatedAt} />
      {!d ? <Empty text={t("loading")} icon="clock" /> : <>
        <Strip d={d} />
        <div className="dash-row">
          <Funnel d={d} />
          <Targets d={d} />
        </div>
        <div className="dash-row">
          <Teams teams={d.teams} onPerson={setPerson} />
          <Attention d={d} />
        </div>
        <div className="dash-row three">
          {d.money && <MoneyCard m={d.money} />}
          {d.inventory && <InventoryCard inv={d.inventory} />}
          {d.marketing && <MarketingCard m={d.marketing} />}
        </div>
      </>}
      {person && <Person id={person} onClose={() => setPerson(null)} />}
    </div>
  );
}

function Header({ period, onPeriod, quarter, onQuarter, updated }: { period: DashPeriod; onPeriod: (p: DashPeriod) => void; quarter: string; onQuarter: (q: string) => void; updated: number }) {
  const t = useTranslations("dashboard.ahmed");
  const { me } = useMe();
  const time = (ms: number) => new Date(ms).toLocaleTimeString(dateLocale(), { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit" });
  return (
    <div className="dash-head">
      <h2>{t("hello", { name: me?.name.split(" ")[0] ?? "" })}</h2>
      <div className="seg" role="group" aria-label={t("period")}>
        {DASH_PERIODS.map((p) => <button key={p} aria-pressed={period === p} onClick={() => onPeriod(p)}>{t(`periods.${p}`)}</button>)}
      </div>
      {period === "quarter" && <PeriodPicker value={quarter} onChange={(v) => v && onQuarter(v)} />}
      <span className="spacer" />
      {updated > 0 && <small className="hint">{t("updated", { time: time(updated) })}</small>}
    </div>
  );
}

/** ▲ / ▼ in %; nothing when there was nothing before to compare with. */
const delta = (c: Compared<number>) => (c.before > 0 ? ((c.now - c.before) / c.before) * 100 : null);
const moneyDelta = (c: Compared<string>) => delta({ now: fromDecimal(c.now), before: fromDecimal(c.before) });

function Strip({ d }: { d: AhmedDashboard }) {
  const t = useTranslations("dashboard.ahmed.strip");
  const s = d.strip, leads = `/leads?from=${d.from}&to=${d.to}`;
  const tile = (key: "visits" | "meetings" | "doneDeals" | "leads" | "units", c: Compared, icon: Parameters<typeof Tile>[0]["icon"], href: string) =>
    <Tile key={key} label={t(key)} value={num(c.now)} sub={t("before", { n: num(c.before) })} delta={delta(c)} icon={icon} href={href} />;
  return (
    <div className="kpis sm">
      {tile("visits", s.visits, "pin", "/reports")}
      {tile("meetings", s.meetings, "users", "/reports")}
      {tile("doneDeals", s.doneDeals, "handshake", "/deals")}
      {s.collected && <Tile label={t("collected")} value={money(s.collected.now)} sub={t("before", { n: money(s.collected.before) })} delta={moneyDelta(s.collected)} icon="wallet" href="/finance?tab=cash" />}
      {tile("leads", s.leads, "sparkle", leads)}
      {tile("units", s.units, "building", "/inventory")}
    </div>
  );
}

/** Fresh → Done Deal: the leads in each stage now, and how many of them the next stage has. */
function Funnel({ d }: { d: AhmedDashboard }) {
  const t = useTranslations("dashboard.ahmed.funnel");
  const max = Math.max(1, ...d.funnel.map((s) => s.count));
  return (
    <Card title={t("title")} icon="layers" className="wide">
      <div className="hbars">
        {d.funnel.map((s) => (
          <Link key={s.stage} href={`/leads?stage=${encodeURIComponent(s.stage)}`} className="hb">
            <span className="hb-l">{s.stage}</span><div className="bar"><i style={{ width: `${(s.count / max) * 100}%` }} /></div>
            <span className="hb-v">{num(s.count)}</span>
            <small className="hint conv">{s.next == null ? "" : t("next", { pct: s.next })}</small>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** The quarter's and the year's target with the «المفروض نكون هنا النهارده» marker, or a link to set it. */
function Targets({ d }: { d: AhmedDashboard }) {
  const t = useTranslations("dashboard.ahmed.targets");
  return (
    <Card title={t("title")} icon="trend">
      <Paced label={t("quarter", { quarter: d.quarter })} bar={d.targets.quarter} />
      <Paced label={t("year", { year: d.year })} bar={d.targets.year} />
    </Card>
  );
}

function Paced({ label, bar }: { label: string; bar: PacedBar }) {
  const t = useTranslations("dashboard.ahmed.targets");
  const goal = bar.goal === "" ? 0 : fromDecimal(bar.goal);
  if (!goal) return <div className="paced"><b>{label}</b><Link className="btn ghost sm" href="/kpis">{t("set")}</Link></div>;
  const pct = bar.percent ?? 0, mark = bar.expected ? (fromDecimal(bar.expected) / goal) * 100 : null, behind = mark != null && pct < mark;
  return (
    <Link href="/reports" className="paced">
      <div className="row">
        <b>{label}</b><span className="spacer" />
        {bar.achieved !== "" && <small className="hint" title={t("of", { achieved: money(bar.achieved), goal: money(bar.goal) })}>{t("of", { achieved: short(bar.achieved), goal: short(bar.goal) })}</small>}
        <Chip tone={pct >= 100 ? "ok" : behind ? "bad" : "warn"}>{bar.percent == null ? "—" : `${bar.percent}%`}</Chip>
      </div>
      <div className={`bar ${pct >= 100 ? "" : behind ? "bad" : "warn"}`}>
        <i style={{ width: `${Math.min(100, pct)}%` }} />
        {mark != null && <b className="mark" style={{ insetInlineStart: `${Math.min(100, mark)}%` }} title={t("mark")} />}
      </div>
      {(mark != null || bar.perDay) && <small className="hint">
        {mark != null && t("should", { amount: short(bar.expected) })}
        {bar.perDay && <> · {t("perDay", { amount: short(bar.perDay) })}</>}
      </small>}
    </Link>
  );
}

const pctText = (p: number | null) => (p == null ? "—" : `${p}%`);

/** The teams by their quarter percent; a row opens its people in place, a person opens his performance. */
function Teams({ teams, onPerson }: { teams: AhmedTeam[]; onPerson: (id: string) => void }) {
  const t = useTranslations("dashboard.ahmed.teams");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card title={t("title")} icon="users" className="wide">
      {!teams.length ? <p className="hint">{t("none")}</p> : <div className="tbl-wrap"><table className="dash-teams">
        <thead><tr><th>{t("team")}</th><th>{t("percent")}</th><th>Showings</th><th>Meetings</th><th>Deals</th></tr></thead>
        <tbody>{teams.map((x) => (
          <Fragment key={x.tlId}>
            <tr className="click" onClick={() => setOpen(open === x.tlId ? null : x.tlId)} aria-expanded={open === x.tlId} tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") setOpen(open === x.tlId ? null : x.tlId); }}>
              <td><span aria-hidden className="hint">{open === x.tlId ? "▾" : "◂"}</span> {x.team ?? x.tl}<small className="hint"> · {x.tl}</small></td>
              <td><Chip tone={teamTone(x.percent)}>{pctText(x.percent)}</Chip></td>
              <td className="num">{num(x.visits)}</td><td className="num">{num(x.meetings)}</td><td className="num">{num(x.deals)}</td>
            </tr>
            {open === x.tlId && x.members.map((p) => (
              <tr key={p.employeeId} className="click sub" onClick={() => onPerson(p.employeeId)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onPerson(p.employeeId); }}>
                <td>{p.name}</td><td><Chip tone={teamTone(p.percent)}>{pctText(p.percent)}</Chip></td>
                <td className="num">{num(p.visits)}</td><td className="num">{num(p.meetings)}</td><td className="num">{num(p.deals)}</td>
              </tr>
            ))}
          </Fragment>
        ))}</tbody>
      </table></div>}
    </Card>
  );
}

/** «محتاج انتباهك»: a count each, opening its list. */
function Attention({ d }: { d: AhmedDashboard }) {
  const t = useTranslations("dashboard.ahmed.attention");
  return (
    <Card title={t("title")} icon="alert">
      {d.attention.map((a) => (
        <Link key={a.key} href={a.href} className="acct">
          <Chip tone={a.count ? "bad" : "ok"}>{num(a.count)}</Chip><span className="spacer">{t(a.key, { days: d.staleDays })}</span>
        </Link>
      ))}
    </Card>
  );
}

function MoneyCard({ m }: { m: NonNullable<AhmedDashboard["money"]> }) {
  const t = useTranslations("dashboard.ahmed.money");
  const due = m.due ? fromDecimal(m.due) : 0, got = m.collected ? fromDecimal(m.collected) : 0;
  return (
    <Card title={t("title")} icon="wallet">
      <Link href="/contracts" className="paced">
        <div className="row"><span>{t("collected")}</span><span className="spacer" /><b>{money(m.collected || null)}</b></div>
        {due > 0 && <div className="bar"><i style={{ width: `${Math.min(100, (got / due) * 100)}%` }} /></div>}
        <small className="hint">{t("expected", { amount: money(m.due || null) })}</small>
      </Link>
      {m.receivables != null && <Link href="/finance?tab=bs" className="acct"><span className="spacer">{t("receivables")}</span><b>{money(m.receivables)}</b></Link>}
      <Link href="/contracts" className="acct"><span className="spacer">{t("nextWeek", { count: m.nextWeek.count })}</span><b>{money(m.nextWeek.amount)}</b></Link>
    </Card>
  );
}

function InventoryCard({ inv }: { inv: NonNullable<AhmedDashboard["inventory"]> }) {
  const t = useTranslations("dashboard.ahmed.inventory");
  return (
    <Card title={t("title")} icon="building">
      <Link href="/inventory?type=Rent" className="acct"><span className="spacer">For Rent</span><b>{num(inv.rent)}</b></Link>
      <Link href="/inventory?type=Resale" className="acct">
        <span className="spacer">For Sale<small>{inv.types.map((x) => `${x.type} ${num(x.count)}`).join(" · ")}</small></span><b>{num(inv.sale)}</b>
      </Link>
      <Link href="/inventory" className="acct"><span className="spacer">{t("newWeek")}</span><b>{num(inv.newThisWeek)}</b></Link>
      <Link href="/inventory" className="acct"><span className="spacer">{t("closedMonth")}</span><b>{num(inv.closedThisMonth)}</b></Link>
    </Card>
  );
}

function MarketingCard({ m }: { m: NonNullable<AhmedDashboard["marketing"]> }) {
  const t = useTranslations("dashboard.ahmed.marketing");
  return (
    <Card title={t("title")} icon="megaphone">
      <div className="row">
        <small className="hint">{t("today")}</small>
        {m.today.length ? m.today.map((c) => <Link key={c.channel} href="/marketing"><Chip>{c.channel} {num(c.leads)}</Chip></Link>) : <small className="hint">{t("noLeads")}</small>}
      </div>
      <Link href="/marketing" className="acct"><span className="spacer">{t("cpq")}</span><b>{money(m.costPerQualified)}</b></Link>
      <Link href="/marketing?tab=camps" className="row">
        {m.live.map((c) => <Chip key={c.id} tone="ok">{c.name}</Chip>)}
        {m.off.map((c) => <Chip key={c.id} tone="bad">{c.name}</Chip>)}
        {!m.live.length && !m.off.length && <small className="hint">{t("noCampaigns")}</small>}
      </Link>
    </Card>
  );
}
