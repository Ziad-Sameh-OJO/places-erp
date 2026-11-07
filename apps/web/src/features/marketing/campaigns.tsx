"use client";
import { useState } from "react";
import type { CampaignInput, CampaignRow } from "@places/contracts";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { day, money, short } from "@/lib/format";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { useMe } from "@/lib/me";
import { useCampaignActions, useCampaigns, useChannels } from "./use-campaigns";

/** The demo's «الكامبينز» tab (marketing.js): the table, a new campaign, edit, archive. */
export function Campaigns() {
  const t = useTranslations("marketing.campaigns");
  const { can } = useMe();
  const list = useCampaigns();
  const [editing, setEditing] = useState<CampaignRow | "new" | null>(null);
  const items = list.data ?? [];
  return (
    <>
      {can("marketing", "create") && (
        <div className="row end"><button className="btn" onClick={() => setEditing("new")}><Icon name="plus" />{t("new")}</button></div>
      )}
      {list.error && <Note kind="warn">{list.error.message}</Note>}
      <Table head={[t("head.campaign"), "Channel", t("head.period"), t("head.budget"), t("head.spent"), t("head.leads"), "Qualified", t("head.costPerLead"), ""]}
        empty={list.isPending ? t("loading") : t("empty")}
        rows={items.map((c) => [
          <span key="n"><b>{c.name}</b>{c.target && <span className="sub">{c.target}</span>}</span>,
          serverText(c.channel),
          <span key="p">{day(c.startsOn)} → {day(c.endsOn)}<span className="sub"><LiveChip c={c} /></span></span>,
          <span key="b" className="n">{money(c.budget)}</span>,
          <SpentBar key="s" c={c} />,
          <span key="l" className="n">{c.leads}</span>,
          <span key="q" className="n">{c.qualified}</span>,
          <span key="c" className="n">{money(c.costPerLead)}</span>,
          <span key="a" className="row">
            {c.adUrl && <a className="lnk mono" href={c.adUrl} target="_blank" rel="noreferrer">{t("adLink")}</a>}
            {can("marketing", "edit") && <button className="btn ghost sm" onClick={() => setEditing(c)}>{t("edit")}</button>}
          </span>,
        ])} />
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
  const pct = Number(c.budget) ? (Number(c.spent) / Number(c.budget)) * 100 : 0;
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
        <Field label={t("budget")}><input name="budget" inputMode="decimal" defaultValue={c ? c.budget : ""} /></Field>
        <Field label={t("spent")}><input name="spent" inputMode="decimal" defaultValue={c ? c.spent : ""} /></Field>
        <Field label={t("target")}><input name="target" defaultValue={c?.target ?? ""} /></Field>
        <Field label={t("adUrl")}><input name="adUrl" type="url" dir="ltr" defaultValue={c?.adUrl ?? ""} /></Field>
        <Field label={t("note")} wide><textarea name="note" defaultValue={c?.note ?? ""} /></Field>
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
