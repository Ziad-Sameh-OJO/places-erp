"use client";
import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import { LEAD_ACTIONS, type LeadOptions, type LeadSummary, type Settings } from "@places/contracts";
import { KpiTile } from "@/components/blocks";
import { DateInput, Icon, useToast } from "@/components/ui";
import { num } from "@/lib/format";
import { type LeadQuery, STAGE_TAB_LIST, activeCount, moreCount, sameFilters, subTabsOf } from "./filters";
import type { SavedFilter } from "@/lib/saved-filters";
import { SaveModal, SavedChip } from "@/components/saved-filters";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";
import { CANCEL_REASONS, PICKABLE_STAGES, PROPERTY_TYPES } from "@places/domain";
import { stageTone } from "./lead-bits";
import { MultiPick } from "./multi-pick";

const LEAD_TYPES = ["Rent", "Resale", "Primary", "Income"] as const;

/** «مقارنة بالأسبوع اللي فات»: % change, none when last week had nothing (demo U.delta). */
const delta = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);

/** The demo's four tiles over the person's whole scope. «كل الليدز» clears the filters. */
export function LeadKpis({ s, onReset }: { s: LeadSummary; onReset: () => void }) {
  const t = useTranslations("leads.kpis");
  const qualifiedPct = s.total ? Math.round((s.qualified / s.total) * 100) : 0;
  return (
    <div className="kpis">
      <KpiTile label={t("all")} value={num(s.total)} sub={t("allSub")} icon="users" delta={delta(s.thisWeek, s.lastWeek)} onClick={onReset} />
      <KpiTile label="Fresh" value={num(s.fresh)} sub={t("freshSub")} icon="phone" />
      <KpiTile label="Qualified" value={num(s.qualified)} sub={t("qualifiedSub", { pct: qualifiedPct })} icon="star" tone="ok" />
      <KpiTile label="No Answer" value={num(s.noAnswer)} sub={t("noAnswerSub")} icon="clock" tone="warn" />
    </div>
  );
}

/**
 * The stages of «غيّر المرحلة» as a small dashboard on the leads page (client, 16 Nov): each stage's count and its
 * share of the leads at a glance. A card filters the list by that stage; pressing it again clears it.
 */
export function StageDashboard({ s, f, onPick }: { s: LeadSummary; f: LeadQuery; onPick: (f: LeadQuery) => void }) {
  const t = useTranslations("leads.stageDash");
  return (
    <section className="stage-dash" aria-label={t("title")}>
      {PICKABLE_STAGES.map((st) => {
        const n = s.stages[st] ?? 0, pct = s.total ? Math.round((n / s.total) * 100) : 0;
        return (
          <button key={st} type="button" className={`sd-tile ${stageTone(st) || "plain"}`} aria-pressed={f.stage === st} title={t("open", { stage: st })}
            onClick={() => onPick({ ...f, stage: f.stage === st ? "" : st })}>
            <span className="sd-name">{serverText(st)}</span>
            <strong className="num">{num(n)}</strong>
            <span className="sd-bar" aria-hidden><i style={{ width: `${pct}%` }} /></span>
            <small>{t("pct", { pct })}</small>
          </button>
        );
      })}
    </section>
  );
}

/**
 * The demo's «العروض»: «كل الليدز», the stage tabs (14.5), the person's own views, and «احفظ الفلتر ده كعرض». A stage
 * tab keeps the other filters; a saved view replaces them. The counts live in the tiles and the stage dashboard above,
 * not here too (client, 17 Nov: the same number three times on one page).
 */
export function ViewsBar({ f, views, onPick, onAdd, onRemove }: {
  f: LeadQuery; views: SavedFilter[];
  onPick: (f: LeadQuery) => void; onAdd: (v: SavedFilter) => void; onRemove: (i: number) => void;
}) {
  const t = useTranslations("leads.views");
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const known = (activeCount(f) === 1 && !!f.stage) || views.some((v) => sameFilters(v.f as LeadQuery, f));
  const stage = (st: string) => onPick({ ...f, stage: st });
  const sub = subTabsOf(f.stage);
  return (
    <>
    <div className="views-bar" role="toolbar" aria-label={t("label")}>
      <span className="lbl">{t("title")}</span>
      <button className="vchip" aria-pressed={!f.stage} onClick={() => stage("")}>{t("presets.total")}</button>
      {STAGE_TAB_LIST.map((x) => (
        <button key={x.stage} className="vchip" aria-pressed={f.stage === x.stage || !!x.sub?.some((y) => y === f.stage)} onClick={() => stage(x.stage)}>
          {x.stage}
        </button>
      ))}
      {views.map((v, i) => (
        <SavedChip key={`${v.name}-${i}`} name={v.name} on={sameFilters(v.f as LeadQuery, f)} removeLabel={t("remove")}
          onPick={() => onPick(v.f as LeadQuery)} onRemove={() => { onRemove(i); toast(t("removed")); }} />
      ))}
      {activeCount(f) > 0 && !known && <button type="button" className="vchip add" onClick={() => setSaving(true)}><Icon name="plus" />{t("saveThis")}</button>}
      {saving && (
        <SaveModal title={t("saveTitle")} label={t("name")} placeholder={t("namePlaceholder")} save={t("save")} onClose={() => setSaving(false)}
          onSave={(name) => { onAdd({ name, f: { ...f } }); setSaving(false); toast(t("saved", { name })); }} />
      )}
    </div>
    {sub.length > 0 && (
      <div className="views-bar" role="toolbar" aria-label={t("insideInterested")}>
        <span className="lbl">{t("insideInterested")}</span>
        {sub.map((x) => <button key={x} className="vchip" aria-pressed={f.stage === x} onClick={() => stage(f.stage === x ? "Interested" : x)}>{x}</button>)}
      </div>
    )}
    </>
  );
}

/**
 * The leads' filters, the client's list (22 Nov): the ones used every day in the row (search, Sales, the team,
 * Channel, Area), the rest under «فلاتر أكتر» (Project, Type, Campaign, the company, Space, Budget, the creation /
 * assign / action dates, Last action, Assign from, Created by, Duplicated, the cancel reason). They all work together,
 * and with the stage tabs; a filter on a field hidden from the person isn't offered (the API drops it too).
 */
export function LeadsToolbar({ f, set, settings, options }: {
  f: LeadQuery; set: (f: LeadQuery) => void; settings: Settings | undefined; options: LeadOptions | undefined;
}) {
  const on = (k: keyof LeadQuery) => (e: { target: { value: string } }) => set({ ...f, [k]: e.target.value });
  const t = useTranslations("leads.filters");
  const fields = useFields("leads"); // M-09: no filter on a hidden field (the API drops such filters too)
  const n = activeCount(f), more = moreCount(f);
  const [open, setOpen] = useState(false);
  const range = (label: string, a: keyof LeadQuery, b: keyof LeadQuery, input: (k: keyof LeadQuery, ph: string) => ReactNode) => (
    <div className="ff range" role="group" aria-label={label}><span>{label}</span><div>{input(a, t("from"))}{input(b, t("to"))}</div></div>
  );
  const day = (k: keyof LeadQuery, ph: string) => <DateInput value={f[k] ?? ""} onChange={on(k)} aria-label={ph} />;
  const number = (k: keyof LeadQuery, ph: string) => <input type="number" min="0" inputMode="numeric" value={f[k] ?? ""} onChange={on(k)} placeholder={ph} aria-label={ph} />;
  const pick = (label: string, k: keyof LeadQuery, all: string, opts: { value: string; label: string }[]) => (
    <label className="ff"><span>{label}</span><select value={f[k] ?? ""} onChange={on(k)}><option value="">{all}</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  );
  const people = (xs: { id: string; name: string }[] | undefined) => (xs ?? []).map((p) => ({ value: p.id, label: p.name }));
  return (
    <>
    <div className="toolbar">
      <label className="search"><Icon name="search" /><input type="search" placeholder={t("search")} value={f.q ?? ""} onChange={on("q")} aria-label={t("searchLabel")} /></label>
      {!!options?.salespeople.length && (
        <MultiPick label="Sales" all={t("allSales")} picked={f.assignedToId ?? ""} options={options.salespeople} onChange={(v) => set({ ...f, assignedToId: v })} />
      )}
      {!!options?.teamLeaders.length && (
        <select value={f.teamLeaderId ?? ""} onChange={on("teamLeaderId")} aria-label={t("team")}>
          <option value="">{t("allTeams")}</option>{options.teamLeaders.map((p) => <option key={p.id} value={p.id}>{t("teamOf", { name: p.name })}</option>)}
        </select>
      )}
      {fields.shows("channel") && <select value={f.channel ?? ""} onChange={(e) => set({ ...f, channel: e.target.value, channelType: "" })} aria-label="Channel">
        <option value="">{t("allChannels")}</option>{settings?.channels.map(({ value }) => <option key={value} value={value}>{value}</option>)}
      </select>}
      {/* «نوع الـ Channel» (22 Nov): the picked channel's types, switched-off ones too (old leads keep theirs) */}
      {fields.shows("channel") && !!f.channel && !!settings?.channelTypes[f.channel]?.length && <select value={f.channelType ?? ""} onChange={on("channelType")} aria-label={t("channelType")}>
        <option value="">{t("allChannelTypes")}</option>{(settings.channelTypes[f.channel] ?? []).map(({ value }) => <option key={value} value={value}>{value}</option>)}
      </select>}
      {fields.shows("area") && <>
        <input className="area-f" list="lead-areas" value={f.area ?? ""} onChange={on("area")} placeholder={t("allAreas")} aria-label="Area" />
        <datalist id="lead-areas">{settings?.areas.map(({ value }) => <option key={value} value={value}>{serverText(value)}</option>)}</datalist>
      </>}
      <button type="button" className={`btn sm ${open || more ? "" : "ghost"}`} aria-expanded={open} aria-controls="lead-more-filters" onClick={() => setOpen(!open)}>
        <Icon name="filter" />{more ? t("moreOn", { count: more }) : t("more")}
      </button>
      {n > 0 && <button className="btn ghost sm" onClick={() => set({})}><Icon name="x" />{t("clear", { count: n })}</button>}
    </div>
    {(open || more > 0) && (
      <div className="more-filters" id="lead-more-filters">
        {fields.shows("propertyType") && pick("Project", "propertyType", t("all"), PROPERTY_TYPES.map((x) => ({ value: x, label: x })))}
        {fields.shows("type") && pick("Type", "type", t("all"), LEAD_TYPES.map((x) => ({ value: x, label: x })))}
        {fields.shows("campaign") && !!options?.campaigns.length && pick("Campaign", "campaignId", t("allCampaigns"),
          options.campaigns.filter((c) => !f.channel || c.channel === f.channel).map((c) => ({ value: c.id, label: c.name })))}
        {fields.shows("company") && <label className="ff"><span>{t("company")}</span><input value={f.company ?? ""} onChange={on("company")} placeholder={t("companyPh")} /></label>}
        {fields.shows("space") && range(t("space"), "spaceMin", "spaceMax", number)}
        {fields.shows("budget") && range("Budget", "budgetMin", "budgetMax", number)}
        {range(t("created"), "from", "to", day)}
        {range(t("assigned"), "assignedFrom", "assignedTo", day)}
        {range(t("actionDate"), "actionFrom", "actionTo", day)}
        {pick(t("lastAction"), "action", t("anyAction"), LEAD_ACTIONS.map((x) => ({ value: x, label: t(`actions.${x}`) })))}
        {!!options?.salespeople.length && pick(t("assignFrom"), "previousOwnerId", t("anyone"), people(options.salespeople))}
        {!!options?.salespeople.length && pick(t("assignTo"), "wentToId", t("anyone"), people(options.salespeople))}
        {!!options?.creators.length && pick(t("createdBy"), "createdById", t("anyone"), people(options.creators))}
        {pick("Duplicated", "duplicated", t("all"), [{ value: "true", label: t("dupYes") }, { value: "false", label: t("dupNo") }])}
        {pick("Showing / Meeting", "visit", t("all"), [{ value: "visit", label: "Showing" }, { value: "meeting", label: "Meeting" }])}
        {range(t("visitDate"), "visitFrom", "visitTo", day)}
        {pick(t("cancelReason"), "cancelReason", t("all"), CANCEL_REASONS.map((x) => ({ value: x, label: x })))}
      </div>
    )}
    </>
  );
}
