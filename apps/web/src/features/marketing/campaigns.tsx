"use client";
import { useNewParam } from "@/lib/new-param";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CampaignInput, CampaignRow, CampaignUnitOption } from "@places/contracts";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day, money, num, short } from "@/lib/format";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { useFields, useMe } from "@/lib/me";
import { useCampaignActions, useCampaigns, useChannels, usePages } from "./use-campaigns";

/** The demo's «الكامبينز» tab (marketing.js): the table, a new campaign, edit, archive. */
export function Campaigns() {
  const t = useTranslations("marketing.campaigns");
  const { can } = useMe();
  const list = useCampaigns();
  const [editing, setEditing] = useState<CampaignRow | "new" | null>(null);
  useNewParam("campaign", () => setEditing("new"), can("marketing", "create")); // «جديد ← كامبين» (0.16)
  const [pages, setPages] = useState(false);
  const items = list.data ?? [];
  // M-09 field permissions: a hidden field's column is left out (the API blanks its value anyway)
  const fields = useFields("marketing");
  const cols: [string, (c: CampaignRow) => ReactNode, string?][] = [
    [t("head.campaign"), (c) => <span key="n"><b>{c.name}</b>{c.units.length ? <span className="sub">{c.units.map((u) => <span key={u.id}><span className="mono">{u.code}</span> {u.project} </span>)}</span> : c.target && <span className="sub">{c.target}</span>}</span>],
    [t("head.source"), (c) => <span key="ch">{serverText(c.channel)}{c.page && <span className="sub">{c.page}</span>}</span>],
    [t("head.period"), (c) => <span key="p">{day(c.startsOn)} → {c.endsOn ? day(c.endsOn) : t("ongoing")}<span className="sub"><LiveChip c={c} /></span></span>],
    // 4.20 · per day, and under it what that adds up to so far (per day × the days); a campaign from before shows its total
    [t("head.budget"), (c) => c.dailyBudget ? (
      <span key="b" className="n">{t("perDay", { amount: money(c.dailyBudget) })}<span className="sub">{t(c.endsOn && c.endsOn < cairoToday() ? "soFarEnded" : "soFar", { total: money(c.budget), days: c.days })}</span></span>
    ) : <span key="b" className="n">{money(c.budget)}</span>, "budget"],
    [t("head.spent"), (c) => <SpentBar key="s" c={c} />, "spent"],
    [t("head.leads"), (c) => <span key="l" className="n">{c.leads}</span>],
    ["Qualified", (c) => <span key="q" className="n">{c.qualified}</span>],
    [t("head.costPerLead"), (c) => <span key="c" className="n">{money(c.costPerLead)}</span>, "costPerLead"],
    ["", (c) => (
      <span key="a" className="row">
        {c.adUrl && <a className="lnk mono" href={c.adUrl} target="_blank" rel="noreferrer">{t("adLink")}</a>}
        {can("marketing", "edit") && <button className="btn ghost sm" onClick={() => setEditing(c)}>{t("edit")}</button>}
      </span>
    )],
  ];
  const shown = cols.filter(([, , k]) => !k || fields.shows(k));
  return (
    <>
      {(can("marketing", "create") || can("marketing", "edit")) && (
        <div className="row end">
          {can("marketing", "edit") && <button className="btn ghost" onClick={() => setPages(true)}><Icon name="list" />{t("pageNames")}</button>}
          {can("marketing", "create") && <button className="btn" onClick={() => setEditing("new")}><Icon name="plus" />{t("new")}</button>}
        </div>
      )}
      {list.error && <Note kind="warn">{list.error.message}</Note>}
      <Table head={shown.map(([h]) => h)} empty={list.isPending ? t("loading") : t("empty")} rows={items.map((c) => shown.map(([, cell]) => cell(c)))} />
      {editing && <CampaignForm campaign={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {pages && <PageNames onClose={() => setPages(false)} />}
    </>
  );
}

const NEW_PAGE = "__new";

/**
 * 4.19 · «أسماء الصفحات» (demo marketing.js `pageNames`): rename (its campaigns follow), remove (they keep the name), add.
 * Every change is audited by the API.
 */
function PageNames({ onClose }: { onClose: () => void }) {
  const t = useTranslations("marketing.campaigns.pages");
  const run = useAction();
  const list = usePages().data ?? [];
  const { addPage, renamePage, removePage } = useCampaignActions();
  return (
    <Modal title={t("title")} onClose={onClose}>
      <Note>{t("note")}</Note>
      <div className="grid">
        {list.map((p) => (
          <div key={p.id} className="row wide">
            <input defaultValue={p.name} aria-label={t("label")} onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== p.name) void run(() => renamePage(p.id, name).catch((err: unknown) => { e.target.value = p.name; throw err; }), t("renamed"));
            }} />
            <span className="hint">{t("count", { n: p.campaigns })}</span>
            <button className="btn ghost sm" onClick={() => { if (confirm(t("confirm", { name: p.name }))) void run(() => removePage(p.id), t("removed")); }}><Icon name="x" />{t("remove")}</button>
          </div>
        ))}
      </div>
      <form className="row" onSubmit={onFormSubmit((f) => run(async () => { await addPage(String(f.get("name") ?? "").trim()); }, t("added")))}>
        <input name="name" required placeholder={t("addPh")} aria-label={t("addPh")} />
        <button className="btn"><Icon name="plus" />{t("add")}</button>
      </form>
    </Modal>
  );
}

const cairoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** The demo's «شغالة» / «خلصت», plus one that hasn't started yet. */
function LiveChip({ c }: { c: CampaignRow }) {
  const t = useTranslations("marketing.campaigns.live");
  if (c.live) return <Chip tone="ok">{t("on")}</Chip>;
  return c.startsOn > cairoToday() ? <Chip tone="info">{t("soon")}</Chip> : <Chip>{t("over")}</Chip>;
}

/**
 * 4.20 · «الوحدات المستهدفة (من شيت الانفنتوري)» (demo `unitPicker`): a table of the available units (and the ones the
 * campaign already has) with a fixed header, a search by code, project or area, and «N متحددة».
 */
function UnitPicker({ campaignId, picked, onChange }: { campaignId: string | null; picked: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("marketing.campaigns.form");
  const [q, setQ] = useState("");
  const units = useQuery({ queryKey: ["campaign-units", campaignId], queryFn: () => api.get<CampaignUnitOption[]>(`/marketing/campaigns/units${campaignId ? `?campaignId=${campaignId}` : ""}`) }).data ?? [];
  const inv = useFields("inventory"); // M-09: the area and space follow the inventory's field rules
  const needle = q.trim().toLowerCase();
  const list = units.filter((u) => !needle || `${u.code} ${u.project} ${u.area} ${u.type}`.toLowerCase().includes(needle));
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <div className="field wide">
      <span>{t("units")} <small className="hint">{t("picked", { n: picked.length })}</small></span>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("unitSearch")} aria-label={t("unitSearch")} />
      <div className="unit-pick">
        <table className="unit-pick-t">
          <thead><tr><th /><th>Code</th><th>Project</th><th>Type</th>{inv.shows("area") && <th>{t("area")}</th>}{inv.shows("space") && <th>{t("space")}</th>}</tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="unit-pick-row">
                <td><input type="checkbox" id={`cpu-${u.id}`} checked={picked.includes(u.id)} onChange={() => toggle(u.id)} aria-label={u.code} /></td>
                <td className="mono"><label htmlFor={`cpu-${u.id}`}>{u.code}</label></td>
                <td><label htmlFor={`cpu-${u.id}`}>{u.project}</label></td>
                <td>{u.type}</td>
                {inv.shows("area") && <td>{serverText(u.area)}</td>}
                {inv.shows("space") && <td className="n">{num(u.space)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="hint">{t("noUnits")}</p>}
      </div>
    </div>
  );
}

function SpentBar({ c }: { c: CampaignRow }) {
  const pct = Number(c.budget) ? (Number(c.spent) / Number(c.budget)) * 100 : 0; // a hidden budget comes blank: no bar
  return <div className="cell-bar"><span className="num">{short(c.spent)}</span><div className={`bar ${pct > 90 ? "warn" : ""}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div></div>;
}

/** «كامبين جديدة» / «تعديل» (M-04 2.1 step 1 · 3.1): name, channel, period, budget, cost, target, ad link, notes. */
function CampaignForm({ campaign: c, onClose }: { campaign: CampaignRow | null; onClose: () => void }) {
  const t = useTranslations("marketing.campaigns.form");
  const run = useAction();
  const { can } = useMe();
  const channels = useChannels().data ?? [];
  const { save, archive, addPage } = useCampaignActions();
  const pages = (usePages().data ?? []).map((p) => p.name);
  const [page, setPage] = useState(c?.page ?? "");
  const [units, setUnits] = useState<string[]>(c?.units.map((u) => u.id) ?? []);
  const today = cairoToday();
  const stopped = !!c?.endsOn && c.endsOn <= today;
  const options = c && !channels.includes(c.channel) ? [c.channel, ...channels] : channels; // keeps a channel switched off since
  // M-09 field permissions: a hidden field has no input; a read-only one is shown locked (the API keeps it either way)
  const fields = useFields("marketing");
  const only = (key: string, node: ReactNode): ReactNode =>
    !fields.shows(key) ? null : fields.edits(key) ? node : <fieldset key={key} className="field-lock" disabled>{node}</fieldset>;
  return (
    <Modal title={c ? t("editTitle", { name: c.name }) : t("newTitle")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const text = (k: string) => String(f.get(k) ?? "").trim();
        // «+ اسم جديد…»: the name joins «أسماء الصفحات» first (demo pickedPage)
        const pageName = page === NEW_PAGE ? text("pageNew") : page;
        if (page === NEW_PAGE && pageName && !pages.includes(pageName)) await addPage(pageName);
        // 4.20 · no end date: «مستمرة» until «وقّفها النهارده» (an end already passed stays as it was), or back on (demo campEdit)
        const endsOn = text("state") === "off" ? (stopped ? c!.endsOn : today) : null;
        const body: CampaignInput = {
          name: text("name"), channel: text("channel"), startsOn: text("startsOn"), endsOn, ...(pageName ? { page: pageName } : {}),
          budget: c && !c.dailyBudget ? c.budget || "0" : "0", ...(text("daily") ? { dailyBudget: text("daily") } : {}), spent: text("spent") || (c ? c.spent || "0" : "0"),
          unitIds: units, ...(!units.length && c?.target ? { target: c.target } : {}),
          ...(text("adUrl") ? { adUrl: text("adUrl") } : {}), ...(text("note") ? { note: text("note") } : {}),
        };
        await save(c?.id ?? null, body);
        onClose();
      }, c ? t("updated") : t("created")))}>
        <Field label={t("name")} req><input name="name" required defaultValue={c?.name ?? ""} /></Field>
        <Field label="Channel" req>
          <select name="channel" required defaultValue={c?.channel ?? ""}>{options.map((x) => <option key={x} value={x}>{serverText(x)}</option>)}</select>
        </Field>
        <Field label={t("page")}>
          <select name="page" value={page} onChange={(e) => setPage(e.target.value)}>
            <option value="">—</option>
            {pages.map((p) => <option key={p} value={p}>{p}</option>)}
            {c?.page && !pages.includes(c.page) && <option value={c.page}>{c.page}</option>}
            <option value={NEW_PAGE}>{t("pageNew")}</option>
          </select>
          {page === NEW_PAGE && <input name="pageNew" required autoFocus placeholder={t("pageNewPh")} aria-label={t("pageNewPh")} />}
        </Field>
        <Field label={t("start")} req><input name="startsOn" type="date" required defaultValue={c?.startsOn ?? today} /></Field>
        {only("budget", <Field label={t("daily")} req={!c}><input name="daily" inputMode="decimal" required={!c} defaultValue={c?.dailyBudget ?? ""} placeholder={c && !c.dailyBudget && c.budget ? t("before", { total: money(c.budget) }) : ""} /></Field>)}
        {c && only("spent", <Field label={t("spent")}><input name="spent" inputMode="decimal" defaultValue={c.spent} /></Field>)}
        {c && (
          <Field label={t("state")}>
            <select name="state" defaultValue={stopped ? "off" : "on"}>
              <option value="on">{t("on")}</option>
              <option value="off">{stopped ? t("offOn", { date: day(c.endsOn!) }) : t("off")}</option>
            </select>
          </Field>
        )}
        {only("target", <UnitPicker campaignId={c?.id ?? null} picked={units} onChange={setUnits} />)}
        {only("adUrl", <Field label={t("adUrl")}><input name="adUrl" type="url" dir="ltr" defaultValue={c?.adUrl ?? ""} /></Field>)}
        {only("note", <Field label={t("note")} wide><textarea name="note" defaultValue={c?.note ?? ""} /></Field>)}
        <div className="row end wide">
          {c && can("marketing", "delete") && (
            <button type="button" className="btn ghost" onClick={() => void run(async () => { await archive(c.id); onClose(); }, t("archived"))}>{t("archive")}</button>
          )}
          <span className="spacer" />
          <button className="btn">{c ? t("save") : t("saveNew")}</button>
        </div>
      </form>
    </Modal>
  );
}
