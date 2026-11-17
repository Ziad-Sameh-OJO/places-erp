"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CompanyDashboard, DashPerson, StageCount, TargetBar } from "@places/contracts";
import type { IconName } from "@places/ui";
import { fromDecimal } from "@places/domain";
import { Avatar, Card, Chip, Empty, Icon, Modal } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { dateLocale, money, num } from "@/lib/format";
import { useMe } from "@/lib/me";
import { MyKpisCard } from "@/features/kpis/today";
import { AhmedPage } from "./ahmed-dashboard";
import { markLanded, useCompanyDashboard, useDashboardLayout, useMyDashboard, usePerson } from "./use-dashboard";

/**
 * 14.1–14.3 · «Dashboard» (management meeting, 15 Nov): Ahmed Islam's layout (14.2), Safwat's (14.3), or the smaller
 * one of the person's role. Built from the same cards; every number opens the page behind it with the filter set.
 * What the system doesn't hold yet shows «قريباً». The colours are the current tokens (the new palette comes later).
 */
export function DashboardPage() {
  const t = useTranslations("dashboard");
  const layout = useDashboardLayout().data?.layout;
  useEffect(() => { markLanded(); }, []);
  if (!layout) return <Empty text={t("loading")} icon="clock" />;
  return layout === "role" ? <RoleDashboard /> : layout === "ahmed" ? <AhmedPage /> : <Safwat />;
}

/** 14.3 · Safwat's layout (Ahmed's is its own page: ahmed-dashboard.tsx). */
function Safwat() {
  const t = useTranslations("dashboard");
  const { data: d } = useCompanyDashboard(true);
  const [person, setPerson] = useState<string | null>(null);
  if (!d) return <Empty text={t("loading")} icon="clock" />;
  return (
    <>
      <Hero sub={t("companySub", { quarter: d.quarter })} />
      <TodaySafwat d={d} />
      <CompanyCard d={d} />
      {d.finance && <Finance f={d.finance} />}
      <div className="cols">
        <Sales d={d} onPerson={setPerson} />
        {d.marketing && <Marketing m={d.marketing} />}
      </div>
      {person && <Person id={person} onClose={() => setPerson(null)} />}
    </>
  );
}

/** «Good morning, <الاسم>» (14.3) over the date. */
function Hero({ sub }: { sub: string }) {
  const t = useTranslations("dashboard");
  const { me } = useMe();
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hourCycle: "h23" }));
  const date = now.toLocaleDateString(dateLocale(), { timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="hero">
      <div className="hero-txt">
        <span className="eyebrow">{date}</span>
        <h2><bdi dir="ltr">{t(hour < 12 ? "morning" : "evening", { name: me?.name.split(" ")[0] ?? "" })}</bdi></h2>
        <p>{sub}</p>
      </div>
    </section>
  );
}

/** A number that opens its page; a tile without a link is just shown. */
export function Tile({ label, value, sub, icon, href, tone, delta }: { label: string; value: ReactNode; sub?: string; icon: IconName; href?: string; tone?: "ok" | "warn" | "bad"; delta?: number | null }) {
  const router = useRouter();
  return <KpiTile label={label} value={value} {...(sub ? { sub } : {})} icon={icon} {...(tone ? { tone } : {})} delta={delta ?? null} {...(href ? { onClick: () => router.push(href) } : {})} />;
}

/** What the system doesn't hold yet (Sits 14.16, Threshold, Block, كونفورمنج): asked before it's built. */
function Soon({ label, icon }: { label: string; icon: IconName }) {
  const t = useTranslations("dashboard");
  return <KpiTile label={label} value={<span className="hint">{t("soon")}</span>} sub={t("soonSub")} icon={icon} />;
}

/** Names only (who was pulled from, who came late): a chip each, or «مفيش». */
function Names({ title, icon, names, href, tone }: { title: string; icon: IconName; names: string[]; href?: string; tone: "warn" | "bad" }) {
  const t = useTranslations("dashboard");
  return (
    <Card title={title} icon={icon} extra={href ? <Link className="btn ghost sm" href={href}>{t("open")}</Link> : <Chip tone={names.length ? tone : "ok"}>{names.length}</Chip>}>
      {names.length ? <div className="row">{names.map((n) => <Chip key={n} tone={tone}>{n}</Chip>)}</div> : <p className="hint">{t("nobody")}</p>}
    </Card>
  );
}

const leadsOn = (day: string, more = "") => `/leads?from=${day}&to=${day}${more}`;

/** 14.3 «Today»: everything that happened today. */
function TodaySafwat({ d }: { d: CompanyDashboard }) {
  const t = useTranslations("dashboard.today");
  return (
    <>
      <Card title={t("titleSafwat")} icon="clock">
        <div className="kpis">
          <Tile label={t("leads")} value={num(d.today.leads)} sub={t("interested", { count: d.today.interested })} icon="users" href={leadsOn(d.day)} />
          <Tile label={t("interestedTile")} value={num(d.today.interested)} icon="star" href={leadsOn(d.day, "&qualified=true")} />
          <Tile label={t("units")} value={num(d.today.units)} icon="building" href="/inventory" />
          <Tile label={t("visits")} value={num(d.today.visits)} icon="pin" href="/reports" />
          <Tile label={t("meetings")} value={num(d.today.meetings)} icon="users" href="/reports" />
          {d.today.paid != null && <Tile label={t("paid")} value={money(d.today.paid)} icon="wallet" tone="warn" href="/finance?tab=cash" />}
          {d.today.received != null && <Tile label={t("received")} value={money(d.today.received)} icon="bank" tone="ok" href="/finance?tab=cash" />}
          <Soon label={t("threshold")} icon="alert" />
          <Soon label={t("blocks")} icon="lock" />
          <Soon label={t("sits")} icon="swap" />
        </div>
      </Card>
      <div className="cols">
        <Names title={t("pulled")} icon="swap" names={d.today.pulled} tone="warn" />
        {d.today.late && <Names title={t("late")} icon="clock" names={d.today.late} tone="bad" href="/hr?tab=att" />}
      </div>
    </>
  );
}

/** 14.2 «الشركة حسب المرحلة»: a bar each; a click opens the leads filtered by that stage. */
function Stages({ stages, title }: { stages: StageCount[]; title?: string }) {
  const t = useTranslations("dashboard.stages");
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <Card title={title ?? t("title")} icon="layers" sub={t("sub")}>
      <div className="hbars">
        {stages.map((s) => (
          <Link key={s.stage} href={`/leads?stage=${encodeURIComponent(s.stage)}`} className="hb" style={{ color: "inherit", textDecoration: "none" }}>
            <span className="hb-l">{s.stage}</span><div className="bar"><i style={{ width: `${(s.count / max) * 100}%` }} /></div><span className="hb-v">{num(s.count)}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** A target bar: «600,000 من 1,000,000 · 60%». */
function Goal({ label, bar, href }: { label: string; bar: TargetBar; href?: string }) {
  const t = useTranslations("dashboard.targets");
  const pct = bar.percent ?? 0;
  const body = (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="row"><b>{label}</b><span className="spacer" /><Chip tone={pct >= 100 ? "ok" : pct >= 50 ? "warn" : "bad"}>{bar.percent == null ? "—" : `${bar.percent}%`}</Chip></div>
      <div className={`bar ${pct >= 100 ? "" : pct >= 50 ? "warn" : "bad"}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
      {bar.goal !== "" && <small className="hint">{fromDecimal(bar.goal) > 0 ? t("of", { achieved: money(bar.achieved || null), goal: money(bar.goal) }) : t("noGoal")}</small>}
    </div>
  );
  return href ? <Link href={href} style={{ color: "inherit", textDecoration: "none" }}>{body}</Link> : body;
}

function Targets({ d }: { d: CompanyDashboard }) {
  const t = useTranslations("dashboard.targets");
  return (
    <Card title={t("title")} icon="trend">
      <div style={{ display: "grid", gap: 18 }}>
        <Goal label={t("quarter", { quarter: d.quarter })} bar={d.targets.quarter} href="/reports" />
        <Goal label={t("year", { year: d.year })} bar={d.targets.year} href="/reports" />
      </div>
    </Card>
  );
}

/** One person on a team or a list: avatar, name, percent; a click opens his performance. */
function PersonRow({ p, onPerson }: { p: DashPerson; onPerson: (id: string) => void }) {
  return (
    <div className="acct click" role="button" tabIndex={0} onClick={() => onPerson(p.employeeId)} onKeyDown={(e) => { if (e.key === "Enter") onPerson(p.employeeId); }}>
      <Avatar id={p.userId} name={p.name} sm /><span className="spacer">{p.name}</span>
      <b className="num">{p.percent == null ? "—" : `${p.percent}%`}</b>
    </div>
  );
}

/** 14.3 «Company»: the year's and quarter's target, their Visits and Meetings, and the stages. */
function CompanyCard({ d }: { d: CompanyDashboard }) {
  const t = useTranslations("dashboard.company");
  return (
    <>
      <Card title={t("title")} icon="chart">
        <div className="kpis sm">
          <Tile label={t("visitsQ")} value={num(d.activity.quarter.visits)} icon="pin" href="/reports" />
          <Tile label={t("meetingsQ")} value={num(d.activity.quarter.meetings)} icon="users" href="/reports" />
          <Tile label={t("visitsY")} value={num(d.activity.year.visits)} icon="pin" href="/reports" />
          <Tile label={t("meetingsY")} value={num(d.activity.year.meetings)} icon="users" href="/reports" />
        </div>
      </Card>
      <div className="cols">
        <Targets d={d} />
        <Stages stages={d.stages} />
      </div>
    </>
  );
}

/** 14.3 «Finance»: balance, custody, advances, receivables, the month's income; a budget line past its budget is marked broken. */
function Finance({ f }: { f: NonNullable<CompanyDashboard["finance"]> }) {
  const t = useTranslations("dashboard.finance");
  return (
    <>
      <Card title={t("title")} icon="wallet">
        <div className="kpis">
          <Tile label={t("balance")} value={money(f.balance)} icon="bank" href="/finance?tab=dash" />
          <Tile label={t("advances")} value={money(f.advances)} icon="users" href="/finance?tab=dash" />
          <Tile label={t("receivables")} value={money(f.receivables)} icon="file" href="/finance?tab=bs" />
          <Tile label={t("income")} value={money(f.incomeMonth)} icon="trend" tone="ok" href="/finance?tab=pnl" />
          <Soon label={t("sits")} icon="swap" />
        </div>
      </Card>
      <div className="cols">
        <Card title={t("custody")} icon="wallet" extra={<Link className="btn ghost sm" href="/finance?tab=custody">{t("open")}</Link>}>
          {f.custody.length ? f.custody.map((h) => <div key={h.name} className="acct"><Icon name="id" /><span className="spacer">{h.name}</span><b className="num">{money(h.balance)}</b></div>)
            : <p className="hint">{t("noCustody")}</p>}
        </Card>
        <Card title={t("broken")} icon="alert" extra={<Link className="btn ghost sm" href="/finance?tab=budget">{t("open")}</Link>}>
          {f.broken.length ? f.broken.map((b) => (
            <div key={b.accountId} className="acct"><Chip tone="bad">{t("brokenMark")}</Chip><span className="spacer">{b.name}<small>{t("brokenRow", { spent: money(b.spent), budget: money(b.budget), pct: b.pct })}</small></span></div>
          )) : <p className="hint">{t("noBroken")}</p>}
        </Card>
      </div>
    </>
  );
}

/** 14.3 «Sales»: the first three, the top achiever, the ideal employee; Block and Threshold aren't in the system yet. */
function Sales({ d, onPerson }: { d: CompanyDashboard; onPerson: (id: string) => void }) {
  const t = useTranslations("dashboard.sales");
  return (
    <Card title={t("title")} icon="trend">
      <small className="hint">{t("top")}</small>
      {d.sales.top.length ? d.sales.top.map((p) => <PersonRow key={p.employeeId} p={p} onPerson={onPerson} />) : <p className="hint">{t("none")}</p>}
      <div className="kpis sm" style={{ marginTop: 12 }}>
        <Tile label={t("achiever")} value={d.sales.topAchiever?.name ?? "—"} {...(d.sales.topAchiever ? { sub: money(d.sales.topAchiever.achieved || null) } : {})} icon="star" tone="ok" href="/reports" />
        <Tile label={t("ideal")} value={d.sales.ideal?.name ?? "—"} icon="gift" href="/hr?tab=ideal" />
        <Soon label={t("blocks")} icon="lock" />
        <Soon label={t("threshold")} icon="alert" />
      </div>
    </Card>
  );
}

/** 14.3 «Marketing»: the running campaigns green, the stopped ones red. */
function Marketing({ m }: { m: NonNullable<CompanyDashboard["marketing"]> }) {
  const t = useTranslations("dashboard.marketing");
  return (
    <Card title={t("title")} icon="megaphone" extra={<Link className="btn ghost sm" href="/marketing?tab=camps">{t("open")}</Link>}>
      {m.live.length + m.off.length ? <div className="row">
        {m.live.map((c) => <Chip key={c.id} tone="ok">{c.name} · {t("live")}</Chip>)}
        {m.off.map((c) => <Chip key={c.id} tone="bad">{c.name} · {t("off")}</Chip>)}
      </div> : <p className="hint">{t("none")}</p>}
    </Card>
  );
}

/** 14.2 · a click on a person: Showings, Meetings and the target for the week, the month and the quarter. */
export function Person({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("dashboard.person");
  const p = usePerson(id).data;
  return (
    <Modal title={p ? t("title", { name: p.name }) : t("loading")} onClose={onClose}>
      {!p ? <p className="hint">{t("loading")}</p> : <div style={{ display: "grid", gap: 16 }}>
        {p.periods.map((x) => (
          <div key={x.key} style={{ display: "grid", gap: 8 }}>
            <div className="kpis sm">
              <KpiTile label={`${t(x.key)} · ${t("visits")}`} value={num(x.visits)} icon="pin" />
              <KpiTile label={`${t(x.key)} · ${t("meetings")}`} value={num(x.meetings)} icon="users" />
              <KpiTile label={`${t(x.key)} · ${t("achieved")}`} value={money(x.target?.achieved || null)} icon="trend" />
            </div>
            {x.target?.goal ? <Goal label={`${t(x.key)} · ${t("target")}`} bar={x.target} /> : null}
          </div>
        ))}
        <div className="row end"><Link className="btn ghost sm" href="/reports">{t("open")}</Link></div>
      </div>}
    </Modal>
  );
}

/** 14.1 · the smaller dashboard of a role: my numbers today, my leads by stage, my month and quarter, my KPIs. */
function RoleDashboard() {
  const t = useTranslations("dashboard.mine");
  const { data: d } = useMyDashboard(true);
  if (!d) return <Empty text={t("loading")} icon="clock" />;
  return (
    <>
      <Hero sub={t("sub")} />
      <div className="kpis">
        <Tile label={t("leads")} value={num(d.today.leads)} icon="users" href={leadsOn(d.day)} />
        <Tile label={t("visits")} value={num(d.today.visits)} icon="pin" />
        <Tile label={t("meetings")} value={num(d.today.meetings)} icon="users" />
      </div>
      <div className="cols">
        <Stages stages={d.stages} title={t("stages")} />
        {d.targets && <Card title={t("targets")} icon="trend">
          <div style={{ display: "grid", gap: 18 }}>
            <Goal label={t("month")} bar={d.targets.month} />
            <Goal label={t("quarter")} bar={d.targets.quarter} />
          </div>
        </Card>}
      </div>
      <MyKpisCard />
    </>
  );
}
