"use client";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MarketingDashboard } from "@places/contracts";
import { KpiTile } from "@/components/blocks";
import { Card, Chip, Empty, Note } from "@/components/ui";
import { api } from "@/lib/api";
import { money, num } from "@/lib/format";
import { useCampaigns } from "./use-campaigns";

const COLORS = ["#0037ff", "#5a7dff", "#08875c", "#f2b64d", "#c22a37", "#6a3df0", "#0a7f9e"];
type Range = "7" | "30" | "month" | "all" | "custom";
const RANGES: [Range, string][] = [["7", "آخر 7 أيام"], ["30", "آخر 30 يوم"], ["month", "الشهر ده"], ["all", "كل الوقت"], ["custom", "فترة مخصصة"]];

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
  const [range, setRange] = useState<Range>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [channel, setChannel] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const campaigns = useCampaigns().data ?? [];
  const qs = new URLSearchParams({ ...period(range, custom), ...(channel ? { channel } : {}), ...(campaignId ? { campaignId } : {}) }).toString();
  const q = useQuery({ queryKey: ["marketing-dashboard", qs], queryFn: () => api.get<MarketingDashboard>(`/marketing/campaigns/dashboard?${qs}`), placeholderData: keepPreviousData });
  const d = q.data;
  const channels = [...new Set(campaigns.map((c) => c.channel))];
  return (
    <>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="الفترة">
          {RANGES.map(([k, l]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}
        </div>
        {range === "custom" && (
          <>
            <label className="date-f"><span>من</span><input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="date-f"><span>لحد</span><input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </>
        )}
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setCampaignId(""); }} aria-label="Channel">
          <option value="">كل الـ Channels</option>{channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="الكامبين">
          <option value="">كل الكامبينز</option>
          {campaigns.filter((c) => !channel || c.channel === channel).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {q.error && <Note kind="warn">{q.error.message}</Note>}
      <div className="kpis">
        <KpiTile label="إجمالي الليدز" value={d ? num(d.total.leads) : "…"} sub="في الفترة دي" icon="users" />
        <KpiTile label="Qualified" value={d ? num(d.total.qualified) : "…"} sub={`${d?.total.rate ?? 0}% نسبة التأهيل`} icon="star" tone="ok" />
        <KpiTile label="صرف الكامبينز" value={d ? money(d.spent) : "…"} sub={`${d?.campaignCount ?? 0} كامبين`} icon="megaphone" tone="warn" />
        <KpiTile label="تكلفة الـ Qualified" value={d ? money(d.costPerQualified) : "…"} sub="للّيد الواحد" icon="trend" />
      </div>
      <div className="cols wide">
        <Card title="Channels ← Campaigns" icon="layers" sub="إجمالي كل channel ومتفرع منه الكامبينز">
          <div className="tree">
            {d?.channels.length ? d.channels.map((c) => (
              <details key={c.channel} open>
                <summary><b>{c.channel}</b><span className="num">{c.leads} ليد</span><Chip tone="ok">{`${c.qualified} Qualified`}</Chip><span className="num hide-sm">{c.rate ?? 0}%</span></summary>
                <div className="kids">
                  {c.campaigns.map((x) => (
                    <div key={x.id} className="kid">
                      <span>{x.name}{x.target && <small>{x.target}</small>}</span><span className="num">{x.leads} ليد</span>
                      <Chip tone="ok">{`${x.qualified} Qualified`}</Chip><span className="num hide-sm">{x.rate ?? 0}% · {money(x.costPerLead)}/ليد</span>
                    </div>
                  ))}
                  {c.noCampaign > 0 && <div className="kid"><span className="hint">من غير كامبين</span><span className="num">{c.noCampaign} ليد</span><span /><span /></div>}
                </div>
              </details>
            )) : <Empty text="مفيش ليدز في الفترة دي" />}
          </div>
        </Card>
        <Card title="الليدز حسب الـ channel" icon="chart">
          {d && <Donut rows={d.channels.map((c, i) => ({ label: c.channel, value: c.leads, color: COLORS[i % COLORS.length]! }))} center={num(d.total.leads)} sub="ليد" />}
          <h4 className="mini-h">البوستات اللي جابت ليدز</h4>
          {d?.posts.length ? <HBars rows={d.posts.map((p) => ({ label: p.post, value: p.leads }))} /> : <p className="hint">مفيش ليدز متربطة ببوست في الفترة دي</p>}
        </Card>
      </div>
      <Note>Qualified = أول ما الليد يوصل Interested أو أي مرحلة بعدها بيتحسب أوتوماتيك هنا، وبيفضل محسوب حتى لو رجع Not Interested أو No Answer.</Note>
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
