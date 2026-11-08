"use client";
import { useState, type ReactNode } from "react";
import type { CampaignInput, CampaignRow } from "@places/contracts";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { day, money, short } from "@/lib/format";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { useFields, useMe } from "@/lib/me";
import { useCampaignActions, useCampaigns, useChannels } from "./use-campaigns";

/** The demo's «الكامبينز» tab (marketing.js): the table, a new campaign, edit, archive. */
export function Campaigns() {
  const t = useTranslations("marketing.campaigns");
  const { can } = useMe();
  const list = useCampaigns();
  const [editing, setEditing] = useState<CampaignRow | "new" | null>(null);
  const items = list.data ?? [];
  // M-09 field permissions: a hidden field's column is left out (the API blanks its value anyway)
  const fields = useFields("marketing");
  const cols: [string, (c: CampaignRow) => ReactNode, string?][] = [
    [t("head.campaign"), (c) => <span key="n"><b>{c.name}</b>{c.target && <span className="sub">{c.target}</span>}</span>],
    ["Channel", (c) => serverText(c.channel)],
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
      {can("marketing", "create") && (
        <div className="row end"><button className="btn" onClick={() => setEditing("new")}><Icon name="plus" />{t("new")}</button></div>
      )}
      {list.error && <Note kind="warn">{list.error.message}</Note>}
      <Table head={shown.map(([h]) => h)} empty={list.isPending ? t("loading") : t("empty")} rows={items.map((c) => shown.map(([, cell]) => cell(c)))} />
      {editing && <CampaignForm campaign={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
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
  const { save, archive } = useCampaignActions();
  const options = c && !channels.includes(c.channel) ? [c.channel, ...channels] : channels; // keeps a channel switched off since
  // M-09 field permissions: a hidden field has no input; a read-only one is shown locked (the API keeps it either way)
  const fields = useFields("marketing");
  const only = (key: string, node: ReactNode): ReactNode =>
    !fields.shows(key) ? null : fields.edits(key) ? node : <fieldset key={key} className="field-lock" disabled>{node}</fieldset>;
  return (
    <Modal title={c ? t("editTitle", { name: c.name }) : t("newTitle")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const text = (k: string) => String(f.get(k) ?? "").trim();
        const body: CampaignInput = {
          name: text("name"), channel: text("channel"), startsOn: text("startsOn"), endsOn: text("endsOn"),
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
