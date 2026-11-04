"use client";
import { useState } from "react";
import type { LeadOptions, LeadSummary, Settings } from "@places/contracts";
import { KpiTile } from "@/components/blocks";
import { Field, Icon, Modal, onFormSubmit, useToast } from "@/components/ui";
import { num } from "@/lib/format";
import { type LeadQuery, PRESETS, type SavedView, activeCount, sameFilters } from "./filters";

/** «مقارنة بالأسبوع اللي فات»: % change, none when last week had nothing (demo U.delta). */
const delta = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);

/** The demo's four tiles over the person's whole scope. «كل الليدز» clears the filters. */
export function LeadKpis({ s, onReset }: { s: LeadSummary; onReset: () => void }) {
  const qualifiedPct = s.total ? Math.round((s.qualified / s.total) * 100) : 0;
  return (
    <div className="kpis">
      <KpiTile label="كل الليدز" value={num(s.total)} sub="في نطاقك · مقارنة بالأسبوع اللي فات" icon="users" delta={delta(s.thisWeek, s.lastWeek)} onClick={onReset} />
      <KpiTile label="Fresh" value={num(s.fresh)} sub="لسه محدش كلّمهم" icon="sparkle" />
      <KpiTile label="Qualified" value={num(s.qualified)} sub={`${qualifiedPct}% نسبة التأهيل`} icon="star" tone="ok" />
      <KpiTile label="No Answer" value={num(s.noAnswer)} sub="بتتنقل بالروتيشن كل يوم" icon="clock" tone="warn" />
    </div>
  );
}

/** The demo's «العروض»: built-in views with counts, the person's own, and «احفظ الفلتر ده كعرض». */
export function ViewsBar({ f, s, views, onPick, onAdd, onRemove }: {
  f: LeadQuery; s: LeadSummary | undefined; views: SavedView[];
  onPick: (f: LeadQuery) => void; onAdd: (v: SavedView) => void; onRemove: (i: number) => void;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const known = PRESETS.some((p) => sameFilters(p.f, f)) || views.some((v) => sameFilters(v.f, f));
  return (
    <div className="views-bar" role="toolbar" aria-label="العروض المحفوظة">
      <span className="lbl">العروض:</span>
      {PRESETS.map((p) => (
        <button key={p.name} className="vchip" aria-pressed={sameFilters(p.f, f)} onClick={() => onPick(p.f)}>{p.name}<b>{s ? num(s[p.count]) : "…"}</b></button>
      ))}
      {views.map((v, i) => (
        <button key={`${v.name}-${i}`} className="vchip" aria-pressed={sameFilters(v.f, f)} onClick={() => onPick(v.f)}>
          <Icon name="star" />{v.name}
          <span className="vx" role="button" aria-label="امسح العرض" onClick={(e) => { e.stopPropagation(); onRemove(i); toast("اتمسح العرض"); }}>×</span>
        </button>
      ))}
      {activeCount(f) > 0 && !known && <button className="vchip add" onClick={() => setSaving(true)}><Icon name="plus" />احفظ الفلتر ده كعرض</button>}
      {saving && (
        <Modal title="احفظ الفلتر كعرض" onClose={() => setSaving(false)}>
          <form className="grid" onSubmit={onFormSubmit((d) => { const name = String(d.get("name") ?? "").trim(); if (!name) return; onAdd({ name, f }); setSaving(false); toast(`اتحفظ «${name}» · هتلاقيه فوق الفلاتر`); })}>
            <Field label="اسم العرض" req wide><input name="name" required placeholder="مثلاً: التجمع · Qualified" /></Field>
            <div className="row end wide"><button className="btn"><Icon name="star" />احفظ</button></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/** The demo's filters. Changing the channel clears the campaign (campaigns belong to a channel). */
export function LeadsToolbar({ f, set, settings, options }: {
  f: LeadQuery; set: (f: LeadQuery) => void; settings: Settings | undefined; options: LeadOptions | undefined;
}) {
  const on = (k: keyof LeadQuery) => (e: { target: { value: string } }) => set({ ...f, [k]: e.target.value, ...(k === "channel" ? { campaignId: "" } : {}) });
  const campaigns = (options?.campaigns ?? []).filter((c) => !f.channel || c.channel === f.channel);
  const n = activeCount(f);
  return (
    <div className="toolbar">
      <label className="search"><Icon name="search" /><input type="search" placeholder="اسم، موبايل، شركة، كود" value={f.q ?? ""} onChange={on("q")} aria-label="بحث في الليدز" /></label>
      <select value={f.channel ?? ""} onChange={on("channel")} aria-label="Channel">
        <option value="">كل الـ channels</option>{settings?.channels.map(({ value }) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select value={f.campaignId ?? ""} onChange={on("campaignId")} aria-label="Campaign">
        <option value="">كل الكامبينز</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {!!options?.salespeople.length && (
        <select value={f.assignedToId ?? ""} onChange={on("assignedToId")} aria-label="Sales">
          <option value="">كل السيلز</option>{options.salespeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <select value={f.area ?? ""} onChange={on("area")} aria-label="Area">
        <option value="">كل المناطق</option>{settings?.areas.map(({ value }) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select value={f.qualified ?? ""} onChange={on("qualified")} aria-label="Qualified">
        <option value="">Qualified؟ الكل</option><option value="true">Qualified بس</option><option value="false">مش Qualified</option>
      </select>
      <label className="date-f"><span>من</span><input type="date" value={f.from ?? ""} onChange={on("from")} /></label>
      <label className="date-f"><span>لحد</span><input type="date" value={f.to ?? ""} onChange={on("to")} /></label>
      {n > 0 && <button className="btn ghost sm" onClick={() => set({})}><Icon name="x" />مسح {n} فلتر</button>}
    </div>
  );
}
