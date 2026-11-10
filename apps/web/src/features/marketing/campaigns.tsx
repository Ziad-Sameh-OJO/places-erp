"use client";
import { useNewParam } from "@/lib/new-param";
import { useState, type ReactNode } from "react";
import type { CampaignInput, CampaignRow } from "@places/contracts";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { day, money, short } from "@/lib/format";
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
    [t("head.campaign"), (c) => <span key="n"><b>{c.name}</b>{c.target && <span className="sub">{c.target}</span>}</span>],
    [t("head.source"), (c) => <span key="ch">{serverText(c.channel)}{c.page && <span className="sub">{c.page}</span>}</span>],
    [t("head.period"), (c) => <span key="p">{day(c.startsOn)} → {day(c.endsOn)}<span className="sub"><LiveChip c={c} /></span></span>],
    [t("head.budget"), (c) => <span key="b" className="n">{money(c.budget)}</span>, "budget"],
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

/** The demo's «شغالة» / «خلصت», plus one that hasn't started yet. */
function LiveChip({ c }: { c: CampaignRow }) {
  const t = useTranslations("marketing.campaigns.live");
  if (c.live) return <Chip tone="ok">{t("on")}</Chip>;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  return c.startsOn > today ? <Chip tone="info">{t("soon")}</Chip> : <Chip>{t("over")}</Chip>;
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
        const body: CampaignInput = {
          name: text("name"), channel: text("channel"), startsOn: text("startsOn"), endsOn: text("endsOn"), ...(pageName ? { page: pageName } : {}),
          budget: text("budget") || "0", spent: text("spent") || "0",
          ...(text("target") ? { target: text("target") } : {}), ...(text("adUrl") ? { adUrl: text("adUrl") } : {}), ...(text("note") ? { note: text("note") } : {}),
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
        <Field label={t("start")} req><input name="startsOn" type="date" required defaultValue={c?.startsOn ?? ""} /></Field>
        <Field label={t("end")} req><input name="endsOn" type="date" required defaultValue={c?.endsOn ?? ""} /></Field>
        {only("budget", <Field label={t("budget")}><input name="budget" inputMode="decimal" defaultValue={c ? c.budget : ""} /></Field>)}
        {only("spent", <Field label={t("spent")}><input name="spent" inputMode="decimal" defaultValue={c ? c.spent : ""} /></Field>)}
        {only("target", <Field label={t("target")}><input name="target" defaultValue={c?.target ?? ""} /></Field>)}
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
