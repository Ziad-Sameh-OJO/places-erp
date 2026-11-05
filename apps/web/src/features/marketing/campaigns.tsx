"use client";
import { useState } from "react";
import type { CampaignInput, CampaignRow } from "@places/contracts";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { day, money, short } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useCampaignActions, useCampaigns, useChannels } from "./use-campaigns";

/** The demo's «الكامبينز» tab (marketing.js): the table, a new campaign, edit, archive. */
export function Campaigns() {
  const { can } = useMe();
  const list = useCampaigns();
  const [editing, setEditing] = useState<CampaignRow | "new" | null>(null);
  const items = list.data ?? [];
  return (
    <>
      {can("marketing", "create") && (
        <div className="row end"><button className="btn" onClick={() => setEditing("new")}><Icon name="plus" />كامبين جديدة</button></div>
      )}
      {list.error && <Note kind="warn">{list.error.message}</Note>}
      <Table head={["الكامبين", "Channel", "الفترة", "الميزانية", "اتصرف", "الليدز", "Qualified", "تكلفة الليد", ""]}
        empty={list.isPending ? "بيحمّل…" : "مفيش كامبينز"}
        rows={items.map((c) => [
          <span key="n"><b>{c.name}</b>{c.target && <span className="sub">{c.target}</span>}</span>,
          c.channel,
          <span key="p">{day(c.startsOn)} → {day(c.endsOn)}<span className="sub"><LiveChip c={c} /></span></span>,
          <span key="b" className="n">{money(c.budget)}</span>,
          <SpentBar key="s" c={c} />,
          <span key="l" className="n">{c.leads}</span>,
          <span key="q" className="n">{c.qualified}</span>,
          <span key="c" className="n">{money(c.costPerLead)}</span>,
          <span key="a" className="row">
            {c.adUrl && <a className="lnk mono" href={c.adUrl} target="_blank" rel="noreferrer">لينك الإعلان</a>}
            {can("marketing", "edit") && <button className="btn ghost sm" onClick={() => setEditing(c)}>تعديل</button>}
          </span>,
        ])} />
      {editing && <CampaignForm campaign={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** The demo's «شغالة» / «خلصت», plus one that hasn't started yet. */
function LiveChip({ c }: { c: CampaignRow }) {
  if (c.live) return <Chip tone="ok">شغالة</Chip>;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  return c.startsOn > today ? <Chip tone="info">لسه هتبدأ</Chip> : <Chip>خلصت</Chip>;
}

function SpentBar({ c }: { c: CampaignRow }) {
  const pct = Number(c.budget) ? (Number(c.spent) / Number(c.budget)) * 100 : 0;
  return <div className="cell-bar"><span className="num">{short(c.spent)}</span><div className={`bar ${pct > 90 ? "warn" : ""}`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div></div>;
}

/** «كامبين جديدة» / «تعديل» (M-04 2.1 step 1 · 3.1): name, channel, period, budget, cost, target, ad link, notes. */
function CampaignForm({ campaign: c, onClose }: { campaign: CampaignRow | null; onClose: () => void }) {
  const run = useAction();
  const { can } = useMe();
  const channels = useChannels().data ?? [];
  const { save, archive } = useCampaignActions();
  const options = c && !channels.includes(c.channel) ? [c.channel, ...channels] : channels; // keeps a channel switched off since
  return (
    <Modal title={c ? `تعديل · ${c.name}` : "كامبين جديدة"} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const text = (k: string) => String(f.get(k) ?? "").trim();
        const body: CampaignInput = {
          name: text("name"), channel: text("channel"), startsOn: text("startsOn"), endsOn: text("endsOn"),
          budget: text("budget") || "0", spent: text("spent") || "0",
          ...(text("target") ? { target: text("target") } : {}), ...(text("adUrl") ? { adUrl: text("adUrl") } : {}), ...(text("note") ? { note: text("note") } : {}),
        };
        await save(c?.id ?? null, body);
        onClose();
      }, c ? "الكامبين اتعدّلت" : "الكامبين اتضافت · الليدز هتتربط بيها"))}>
        <Field label="اسم الكامبين" req><input name="name" required defaultValue={c?.name ?? ""} /></Field>
        <Field label="Channel" req>
          <select name="channel" required defaultValue={c?.channel ?? ""}>{options.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </Field>
        <Field label="البداية" req><input name="startsOn" type="date" required defaultValue={c?.startsOn ?? ""} /></Field>
        <Field label="النهاية" req><input name="endsOn" type="date" required defaultValue={c?.endsOn ?? ""} /></Field>
        <Field label="الميزانية"><input name="budget" inputMode="decimal" defaultValue={c ? c.budget : ""} /></Field>
        <Field label="اتصرف"><input name="spent" inputMode="decimal" defaultValue={c ? c.spent : ""} /></Field>
        <Field label="المشروع / الوحدات المستهدفة"><input name="target" defaultValue={c?.target ?? ""} /></Field>
        <Field label="لينك الإعلان"><input name="adUrl" type="url" dir="ltr" defaultValue={c?.adUrl ?? ""} /></Field>
        <Field label="ملاحظات" wide><textarea name="note" defaultValue={c?.note ?? ""} /></Field>
        <div className="row end wide">
          {c && can("marketing", "delete") && (
            <button type="button" className="btn ghost" onClick={() => void run(async () => { await archive(c.id); onClose(); }, "الكامبين اتأرشفت")}>أرشفة</button>
          )}
          <span className="spacer" />
          <button className="btn">{c ? "حفظ" : "حفظ · هتظهر في الليدز تحت الـ channel بتاعها"}</button>
        </div>
      </form>
    </Modal>
  );
}
