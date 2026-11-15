"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { LeadOptions, LeadSummary, Settings } from "@places/contracts";
import { KpiTile } from "@/components/blocks";
import { Field, Icon, Modal, onFormSubmit, useToast } from "@/components/ui";
import { num } from "@/lib/format";
import { type LeadQuery, STAGE_TAB_LIST, type SavedView, activeCount, sameFilters, subTabsOf } from "./filters";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";
import { PROPERTY_TYPES } from "@places/domain";
import { MultiPick } from "./multi-pick";

/** «مقارنة بالأسبوع اللي فات»: % change, none when last week had nothing (demo U.delta). */
const delta = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);

/** The demo's four tiles over the person's whole scope. «كل الليدز» clears the filters. */
export function LeadKpis({ s, onReset }: { s: LeadSummary; onReset: () => void }) {
  const t = useTranslations("leads.kpis");
  const qualifiedPct = s.total ? Math.round((s.qualified / s.total) * 100) : 0;
  return (
    <div className="kpis">
      <KpiTile label={t("all")} value={num(s.total)} sub={t("allSub")} icon="users" delta={delta(s.thisWeek, s.lastWeek)} onClick={onReset} />
      <KpiTile label="Fresh" value={num(s.fresh)} sub={t("freshSub")} icon="sparkle" />
      <KpiTile label="Qualified" value={num(s.qualified)} sub={t("qualifiedSub", { pct: qualifiedPct })} icon="star" tone="ok" />
      <KpiTile label="No Answer" value={num(s.noAnswer)} sub={t("noAnswerSub")} icon="clock" tone="warn" />
    </div>
  );
}

/**
 * The demo's «العروض»: «كل الليدز», the stage tabs (14.5) with their counts, the person's own views, and «احفظ الفلتر ده
 * كعرض». A stage tab keeps the other filters; a saved view replaces them.
 */
export function ViewsBar({ f, s, views, onPick, onAdd, onRemove }: {
  f: LeadQuery; s: LeadSummary | undefined; views: SavedView[];
  onPick: (f: LeadQuery) => void; onAdd: (v: SavedView) => void; onRemove: (i: number) => void;
}) {
  const t = useTranslations("leads.views");
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const known = (activeCount(f) === 1 && !!f.stage) || views.some((v) => sameFilters(v.f, f));
  const count = (stage: string) => (s ? num(s.stages[stage] ?? 0) : "…");
  const stage = (st: string) => onPick({ ...f, stage: st });
  const sub = subTabsOf(f.stage);
  return (
    <>
    <div className="views-bar" role="toolbar" aria-label={t("label")}>
      <span className="lbl">{t("title")}</span>
      <button className="vchip" aria-pressed={!f.stage} onClick={() => stage("")}>{t("presets.total")}<b>{s ? num(s.total) : "…"}</b></button>
      {STAGE_TAB_LIST.map((x) => (
        <button key={x.stage} className="vchip" aria-pressed={f.stage === x.stage || !!x.sub?.some((y) => y === f.stage)} onClick={() => stage(x.stage)}>
          {x.stage}<b>{count(x.stage)}</b>
        </button>
      ))}
      {views.map((v, i) => (
        <button key={`${v.name}-${i}`} className="vchip" aria-pressed={sameFilters(v.f, f)} onClick={() => onPick(v.f)}>
          <Icon name="star" />{v.name}
          <span className="vx" role="button" aria-label={t("remove")} onClick={(e) => { e.stopPropagation(); onRemove(i); toast(t("removed")); }}>×</span>
        </button>
      ))}
      {activeCount(f) > 0 && !known && <button className="vchip add" onClick={() => setSaving(true)}><Icon name="plus" />{t("saveThis")}</button>}
      {saving && (
        <Modal title={t("saveTitle")} onClose={() => setSaving(false)}>
          <form className="grid" onSubmit={onFormSubmit((d) => { const name = String(d.get("name") ?? "").trim(); if (!name) return; onAdd({ name, f }); setSaving(false); toast(t("saved", { name })); })}>
            <Field label={t("name")} req wide><input name="name" required placeholder={t("namePlaceholder")} /></Field>
            <div className="row end wide"><button className="btn"><Icon name="star" />{t("save")}</button></div>
          </form>
        </Modal>
      )}
    </div>
    {sub.length > 0 && (
      <div className="views-bar" role="toolbar" aria-label={t("insideInterested")}>
        <span className="lbl">{t("insideInterested")}</span>
        {sub.map((x) => <button key={x} className="vchip" aria-pressed={f.stage === x} onClick={() => stage(f.stage === x ? "Interested" : x)}>{x}<b>{count(x)}</b></button>)}
      </div>
    )}
    </>
  );
}

/**
 * The demo's filters (14.6: no campaign filter; several salespeople, the team, the area typed or picked, the type).
 * They all work together, and with the stage tabs.
 */
export function LeadsToolbar({ f, set, settings, options }: {
  f: LeadQuery; set: (f: LeadQuery) => void; settings: Settings | undefined; options: LeadOptions | undefined;
}) {
  const on = (k: keyof LeadQuery) => (e: { target: { value: string } }) => set({ ...f, [k]: e.target.value });
  const t = useTranslations("leads.filters");
  const fields = useFields("leads"); // M-09: no filter on a hidden field (the API drops such filters too)
  const n = activeCount(f);
  return (
    <div className="toolbar">
      <label className="search"><Icon name="search" /><input type="search" placeholder={t("search")} value={f.q ?? ""} onChange={on("q")} aria-label={t("searchLabel")} /></label>
      {fields.shows("channel") && <select value={f.channel ?? ""} onChange={on("channel")} aria-label="Channel">
        <option value="">{t("allChannels")}</option>{settings?.channels.map(({ value }) => <option key={value} value={value}>{value}</option>)}
      </select>}
      {!!options?.salespeople.length && (
        <MultiPick label="Sales" all={t("allSales")} picked={f.assignedToId ?? ""} options={options.salespeople} onChange={(v) => set({ ...f, assignedToId: v })} />
      )}
      {!!options?.teamLeaders.length && (
        <select value={f.teamLeaderId ?? ""} onChange={on("teamLeaderId")} aria-label={t("team")}>
          <option value="">{t("allTeams")}</option>{options.teamLeaders.map((p) => <option key={p.id} value={p.id}>{t("teamOf", { name: p.name })}</option>)}
        </select>
      )}
      {fields.shows("area") && <>
        <input className="area-f" list="lead-areas" value={f.area ?? ""} onChange={on("area")} placeholder={t("allAreas")} aria-label="Area" />
        <datalist id="lead-areas">{settings?.areas.map(({ value }) => <option key={value} value={value}>{serverText(value)}</option>)}</datalist>
      </>}
      {fields.shows("propertyType") && <select value={f.propertyType ?? ""} onChange={on("propertyType")} aria-label={t("type")}>
        <option value="">{t("allTypes")}</option>{PROPERTY_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>}
      <select value={f.qualified ?? ""} onChange={on("qualified")} aria-label="Qualified">
        <option value="">{t("qualifiedAll")}</option><option value="true">{t("qualifiedOnly")}</option><option value="false">{t("notQualified")}</option>
      </select>
      <label className="date-f"><span>{t("from")}</span><input type="date" value={f.from ?? ""} onChange={on("from")} /></label>
      <label className="date-f"><span>{t("to")}</span><input type="date" value={f.to ?? ""} onChange={on("to")} /></label>
      {n > 0 && <button className="btn ghost sm" onClick={() => set({})}><Icon name="x" />{t("clear", { count: n })}</button>}
    </div>
  );
}
