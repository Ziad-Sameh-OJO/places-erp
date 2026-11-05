"use client";
import Link from "next/link";
import type { ModuleKey } from "@places/domain";
import { useMe } from "@/lib/me";
import { NAV } from "@/lib/nav";
import { Card, Icon, Note } from "@/components/ui";
import { MyHandIns } from "@/features/reports/daily";
import { ActivitiesCard } from "@/features/kpis/activities-card";

/** Home: until each role's dashboard is ported (with its module), a greeting and the pages this person can open. */
export default function HomePage() {
  const { me, can } = useMe();
  if (!me) return <p className="hint">بيحمّل…</p>;
  const pages = (Object.keys(NAV) as ModuleKey[]).filter((k) => k !== "home" && can(k));
  return (
    <>
      <Card title={`أهلاً ${me.name}`} icon="home" sub={me.roleLabels.join(" + ")}>
        <Note>لوحة كل دور (مهامي النهارده) هتتبني مع موديولاتها في المراحل الجاية. الموجود دلوقتي: الحسابات والصلاحيات، والإعدادات، والإشعارات.</Note>
      </Card>
      <MyHandIns />
      <ActivitiesCard />
      {pages.length > 0 && <div className="cols">
        {pages.map((k) => (
          <Link key={k} href={`/${k}`} className="card kpi-btn" style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card-head"><h3><span className="ico"><Icon name={NAV[k]!.icon} /></span><span>{NAV[k]!.label}<small>{NAV[k]!.sub}</small></span></h3></div>
          </Link>
        ))}
      </div>}
    </>
  );
}
