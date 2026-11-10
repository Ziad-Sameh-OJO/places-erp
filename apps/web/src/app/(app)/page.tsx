"use client";
import Link from "next/link";
import { inboxOrder, keepsCompaniesSheet, keepsInventory } from "@places/domain";
import { useMe } from "@/lib/me";
import { NAV, type NavKey } from "@/lib/nav";
import { useTranslations } from "next-intl";
import { Card, Chip, Icon } from "@/components/ui";
import { dateLocale } from "@/lib/format";
import { MyHandIns } from "@/features/reports/daily";
import { ActivitiesCard } from "@/features/kpis/activities-card";
import { HandoversCard } from "@/features/access/handovers";
import { MyBroadcasts } from "@/features/marketing/broadcast";
import { Inbox, type InboxLine } from "@/components/inbox";
import { openSearch } from "@/components/command-palette";
import { useBulkLines, useLeadToday, useNewCompanyLines } from "@/features/leads/today";
import { LatestNotifications, useMyNotifications } from "@/features/notifications/latest";
import { MyTeamTasks } from "@/features/inventory/team-tasks";
import { useMissingUnitLines } from "@/features/inventory/today";
import { useFinanceTodo } from "@/features/finance/today";
import { MyKpisCard, useKpiLines } from "@/features/kpis/today";

/**
 * Home = «مهامي النهارده» (1.22, demo home.js): everything waiting for this person's action now, the late first.
 * The leads give the SLA alarms and the day's visits; each later task adds its own lines here.
 */
export default function HomePage() {
  const { me, can } = useMe();
  const tNav = useTranslations("nav");
  const t = useTranslations("pages");
  const leads = useLeadToday(!!me && can("leads"));
  const bulks = useBulkLines(!!me && can("leads", "approve"));
  const companies = useNewCompanyLines(keepsCompaniesSheet(me?.roles ?? []));
  const missingUnits = useMissingUnitLines(!!me && keepsInventory({ can })); // 2.20 · the API keeps Manar's and Randa's apart
  const collect = useFinanceTodo(!!me && can("finance", "create")); // 9.19 · the accountant's whole «مستنيك النهارده»
  const kpis = useKpiLines(); // 11.16 · approve / enter / hand in (everyone: the API answers with their own)
  const unread = useMyNotifications().data?.unread ?? 0;
  if (!me) return <p className="hint">{t("loading")}</p>;
  const lines: InboxLine[] = inboxOrder([...(leads.data ?? []), ...bulks, ...companies, ...missingUnits, ...collect, ...kpis]); // each module's lines, the late first
  const urgent = lines.filter((x) => x.tone === "bad").length;
  const pages = (Object.keys(NAV) as NavKey[]).filter((k) => k !== "home" && can(k));

  return (
    <>
      <Hero name={me.name} total={lines.length} urgent={urgent} unread={unread} canCreateLead={can("leads", "create")} />
      <MyKpisCard />
      <MyHandIns />
      <HandoversCard />
      <MyBroadcasts />
      <ActivitiesCard />
      <MyTeamTasks />
      <div className="cols wide">
        <Card title={t("home.todayTitle")} icon="check" sub={t("home.todaySub")} extra={<Chip tone={urgent ? "bad" : "ok"}>{urgent ? t("home.late", { count: urgent }) : t("home.onTime")}</Chip>}>
          {leads.isLoading ? <p className="hint">{t("loading")}</p> : <Inbox lines={lines} />}
        </Card>
        <Card title={t("home.latestNotifications")} icon="bell"><LatestNotifications /></Card>
      </div>
      {!can("leads") && pages.length > 0 && <div className="cols">
        {pages.map((k) => (
          <Link key={k} href={`/${k}`} className="card kpi-btn" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card-head"><h3><span className="ico"><Icon name={NAV[k].icon} /></span><span>{tNav(`modules.${k}.label`)}<small>{tNav(`modules.${k}.sub`)}</small></span></h3></div>
          </Link>
        ))}
      </div>}
    </>
  );
}

/** The demo's hero: the date, the greeting, how many things wait (and how many are late), the new notifications. */
function Hero({ name, total, urgent, unread, canCreateLead }: { name: string; total: number; urgent: number; unread: number; canCreateLead: boolean }) {
  const t = useTranslations("pages.home");
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hourCycle: "h23" }));
  const date = now.toLocaleDateString(dateLocale(), { timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="hero">
      <div className="hero-txt">
        <span className="eyebrow">{date}</span>
        <h2>{t(hour < 12 ? "morning" : "evening", { name: name.split(" ")[0] ?? "" })}</h2>
        <p>{total ? <>{t.rich("waiting", { total, b: (c) => <b>{c}</b> })}{urgent ? t.rich("waitingLate", { urgent, b: (c) => <b>{c}</b> }) : null}.</> : t("nothing")}</p>
        <div className="hero-actions">
          {canCreateLead && <Link className="btn" href="/leads?new=1"><Icon name="plus" />{t("newLead")}</Link>}
          <button className="btn ghost" onClick={openSearch}><Icon name="search" />{t("quickSearch")} <kbd>⌘K</kbd></button>
        </div>
      </div>
      <div className="hero-stats">
        <div><b className="num">{total}</b><span>{t("statToday")}</span></div>
        <div><b className="num">{urgent}</b><span>{t("statLate")}</span></div>
        <div><b className="num">{unread}</b><span>{t("statUnread")}</span></div>
      </div>
    </section>
  );
}
