"use client";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MarketingDashboard } from "@places/contracts";
import { KpiTile } from "@/components/blocks";
import { Card, Chip, Empty, Note } from "@/components/ui";
import { api } from "@/lib/api";
import { money, num } from "@/lib/format";
import { useFields } from "@/lib/me";
import { NotQualified } from "./not-qualified";
import { useCampaigns } from "./use-campaigns";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";

const COLORS = ["#0037ff", "#5a7dff", "#08875c", "#f2b64d", "#c22a37", "#6a3df0", "#0a7f9e"];
type Range = "7" | "30" | "month" | "all" | "custom";
/** Names in marketing.dashboard.ranges.r<key>. */
const RANGES: readonly Range[] = ["7", "30", "month", "all", "custom"];

const cairoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
/** The demo's ranges as Cairo days (M-04 3.2: «فلتر بالأيام والأسابيع والشهور والتواريخ»). */
function period(r: Range, custom: { from: string; to: string }): { from?: string; to?: string } {
  const today = cairoDay(new Date());
  if (r === "all") return {};
  if (r === "custom") return { ...(custom.from ? { from: custom.from } : {}), ...(custom.to ? { to: custom.to } : {}) };
  if (r === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: cairoDay(new Date(Date.now() - (Number(r) - 1) * 86_400_000)), to: today };
}

/** The demo's «Dashboard» tab (marketing.js): Channels ← Campaigns with Qualified and the rate, the donut, the posts. */
export function Dashboard() {
  const t = useTranslations("marketing.dashboard");
  const [range, setRange] = useState<Range>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [channel, setChannel] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const campaigns = useCampaigns().data ?? [];
  const filter = { ...period(range, custom), ...(channel ? { channel } : {}), ...(campaignId ? { campaignId } : {}) };
  const qs = new URLSearchParams(filter).toString();
  const q = useQuery({ queryKey: ["marketing-dashboard", qs], queryFn: () => api.get<MarketingDashboard>(`/marketing/campaigns/dashboard?${qs}`), placeholderData: keepPreviousData });
  const d = q.data;
  const fields = useFields("marketing"); // M-09: the money tiles go with a hidden «اتصرف»
  const channels = [...new Set(campaigns.map((c) => c.channel))];
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label={t("period")}>
          {RANGES.map((k) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{t(`ranges.r${k}`)}</button>)}
        </div>
        {range === "custom" && (
          <>
            <label className="date-f"><span>{t("from")}</span><input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="date-f"><span>{t("to")}</span><input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </>
        )}
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setCampaignId(""); }} aria-label="Channel">
          <option value="">{t("allChannels")}</option>{channels.map((c) => <option key={c} value={c}>{serverText(c)}</option>)}
        </select>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label={t("campaign")}>
          <option value="">{t("allCampaigns")}</option>
          {campaigns.filter((c) => !channel || c.channel === channel).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {q.error && <Note kind="warn">{q.error.message}</Note>}
      <div className="kpis">
        <KpiTile label={t("kpi.leads")} value={d ? num(d.total.leads) : "…"} sub={t("kpi.inPeriod")} icon="users" />
        <KpiTile label="Qualified" value={d ? num(d.total.qualified) : "…"} sub={t("kpi.rate", { rate: d?.total.rate ?? 0 })} icon="star" tone="ok" />
        {fields.shows("spent") && <KpiTile label={t("kpi.spent")} value={d ? money(d.spent) : "…"} sub={t("kpi.campaigns", { count: d?.campaignCount ?? 0 })} icon="megaphone" tone="warn" />}
        {fields.shows("costPerQualified") && <KpiTile label={t("kpi.costPerQualified")} value={d ? money(d.costPerQualified) : "…"} sub={t("kpi.perLead")} icon="trend" />}
      </div>
      <div className="cols wide">
        <Card title={t("tree.title")} icon="layers" sub={t("tree.sub")}>
          <div className="tree">
            {d?.channels.length ? d.channels.map((c) => (
              <details key={c.channel} open>
                <summary><b>{serverText(c.channel)}</b><span className="num">{t("leads", { count: c.leads })}</span><Chip tone="ok">{`${c.qualified} Qualified`}</Chip><span className="num hide-sm">{c.rate ?? 0}%</span></summary>
                <div className="kids">
                  {c.campaigns.map((x) => (
                    <div key={x.id} className="kid">
                      <span>{x.name}{x.target && <small>{x.target}</small>}</span><span className="num">{t("leads", { count: x.leads })}</span>
                      <Chip tone="ok">{`${x.qualified} Qualified`}</Chip><span className="num hide-sm">{t("rateCost", { rate: x.rate ?? 0, cost: money(x.costPerLead) })}</span>
                    </div>
                  ))}
                  {c.noCampaign > 0 && <div className="kid"><span className="hint">{t("noCampaign")}</span><span className="num">{t("leads", { count: c.noCampaign })}</span><span /><span /></div>}
                </div>
              </details>
            )) : <Empty text={t("empty")} />}
          </div>
        </Card>
        <Card title={t("byChannel")} icon="chart">
          {d && <Donut rows={d.channels.map((c, i) => ({ label: serverText(c.channel), value: c.leads, color: COLORS[i % COLORS.length]! }))} center={num(d.total.leads)} sub={t("lead")} />}
          <h4 className="mini-h">{t("posts")}</h4>
          {d?.posts.length ? <HBars rows={d.posts.map((p) => ({ label: p.post, value: p.leads }))} /> : <p className="hint">{t("noPosts")}</p>}
        </Card>
      </div>
      <NotQualified filter={filter} />
      <Note>{t("note")}</Note>
    </>
  );
}

/** demo ui.js `U.donut` */
function Donut({ rows, center, sub }: { rows: { label: string; value: number; color: string }[]; center: string; sub: string }) {
  const tot = rows.reduce((s, r) => s + r.value, 0) || 1, R = 42, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={sub}>
        <circle r={R} cx="60" cy="60" fill="none" stroke="var(--sunken)" strokeWidth="14" />
        {rows.map((r) => {
          const len = (r.value / tot) * C;
          const el = <circle key={r.label} r={R} cx="60" cy="60" fill="none" stroke={r.color} strokeWidth="14" strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} transform="rotate(-90 60 60)"><title>{`${r.label}: ${r.value}`}</title></circle>;
          off += len;
          return el;
        })}
        <text x="60" y="58" textAnchor="middle" className="d-big">{center}</text>
        <text x="60" y="74" textAnchor="middle" className="d-sub">{sub}</text>
      </svg>
      <ul className="legend">
        {rows.map((r) => <li key={r.label}><i style={{ background: r.color }} /><span>{r.label}</span><b className="num">{num(r.value)}</b><small className="num">{Math.round((r.value / tot) * 100)}%</small></li>)}
      </ul>
    </div>
  );
}

/** demo ui.js `U.hbars` */
function HBars({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => <div key={r.label} className="hb"><span className="hb-l">{r.label}</span><div className="bar"><i style={{ width: `${(r.value / max) * 100}%` }} /></div><span className="hb-v">{num(r.value)}</span></div>)}
    </div>
  );
}
