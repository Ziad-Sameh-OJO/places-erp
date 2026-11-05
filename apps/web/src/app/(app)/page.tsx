"use client";
import Link from "next/link";
import { inboxOrder, keepsCompaniesSheet, type ModuleKey } from "@places/domain";
import { useMe } from "@/lib/me";
import { NAV } from "@/lib/nav";
import { Card, Chip, Icon } from "@/components/ui";
import { MyHandIns } from "@/features/reports/daily";
import { ActivitiesCard } from "@/features/kpis/activities-card";
import { HandoversCard } from "@/features/access/handovers";
import { MyBroadcasts } from "@/features/marketing/broadcast";
import { Inbox, type InboxLine } from "@/components/inbox";
import { useBulkLines, useLeadToday, useNewCompanyLines } from "@/features/leads/today";
import { LatestNotifications, useMyNotifications } from "@/features/notifications/latest";
import { MyTeamTasks } from "@/features/inventory/team-tasks";

/**
 * Home = «مهامي النهارده» (1.22, demo home.js): everything waiting for this person's action now, the late first.
 * The leads give the SLA alarms and the day's visits; each later task adds its own lines here.
 */
export default function HomePage() {
  const { me, can } = useMe();
  const leads = useLeadToday(!!me && can("leads"));
  const bulks = useBulkLines(!!me && can("leads", "approve"));
  const companies = useNewCompanyLines(keepsCompaniesSheet(me?.roles ?? []));
  const unread = useMyNotifications().data?.unread ?? 0;
  if (!me) return <p className="hint">بيحمّل…</p>;
  const lines: InboxLine[] = inboxOrder([...(leads.data ?? []), ...bulks, ...companies]); // each module's lines, the late first
  const urgent = lines.filter((x) => x.tone === "bad").length;
  const pages = (Object.keys(NAV) as ModuleKey[]).filter((k) => k !== "home" && can(k));

  return (
    <>
      <Hero name={me.name} total={lines.length} urgent={urgent} unread={unread} canCreateLead={can("leads", "create")} />
      <MyHandIns />
      <HandoversCard />
      <MyBroadcasts />
      <ActivitiesCard />
      <MyTeamTasks />
      <div className="cols wide">
        <Card title="مهامي النهارده" icon="check" sub="مترتبة: المتأخر الأول" extra={<Chip tone={urgent ? "bad" : "ok"}>{urgent ? `${urgent} متأخر` : "كله في الميعاد"}</Chip>}>
          {leads.isLoading ? <p className="hint">بيحمّل…</p> : <Inbox lines={lines} />}
        </Card>
        <Card title="آخر الإشعارات" icon="bell"><LatestNotifications /></Card>
      </div>
      {!can("leads") && pages.length > 0 && <div className="cols">
        {pages.map((k) => (
          <Link key={k} href={`/${k}`} className="card kpi-btn" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card-head"><h3><span className="ico"><Icon name={NAV[k]!.icon} /></span><span>{NAV[k]!.label}<small>{NAV[k]!.sub}</small></span></h3></div>
          </Link>
        ))}
      </div>}
    </>
  );
}

/** The demo's hero: the date, the greeting, how many things wait (and how many are late), the new notifications. */
function Hero({ name, total, urgent, unread, canCreateLead }: { name: string; total: number; urgent: number; unread: number; canCreateLead: boolean }) {
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hourCycle: "h23" }));
  const date = now.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", weekday: "long", day: "numeric", month: "long" });
  return (
    <section className="hero">
      <div className="hero-txt">
        <span className="eyebrow">{date}</span>
        <h2>{hour < 12 ? "صباح الخير" : "مساء الخير"}، {name.split(" ")[0]}</h2>
        <p>{total ? <>عندك <b>{total}</b> حاجة محتاجة أكشن النهارده{urgent ? <>، منهم <b>{urgent}</b> متأخرين</> : null}.</> : "مفيش حاجة مستنياك دلوقتي."}</p>
        {canCreateLead && <div className="hero-actions"><Link className="btn" href="/leads?new=1"><Icon name="plus" />ليد جديد</Link></div>}
      </div>
      <div className="hero-stats">
        <div><b className="num">{total}</b><span>مهام النهارده</span></div>
        <div><b className="num">{urgent}</b><span>متأخر</span></div>
        <div><b className="num">{unread}</b><span>إشعار جديد</span></div>
      </div>
    </section>
  );
}
