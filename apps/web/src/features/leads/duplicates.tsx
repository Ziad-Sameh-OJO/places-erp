"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ROTATION, type DuplicateDecision, type DuplicateRow, type LeadSide, type NewLeadRequestRow } from "@places/contracts";
import { DUPLICATE_FIELDS } from "@places/domain";
import { useFields, useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { Card, Chip, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { useDecideDuplicate, useDuplicates } from "./use-duplicates";
import { BulkReviewModal, useBulkPending } from "./bulk";
import { useNewLeads, useRouteNewLead } from "./use-new-leads";
import { useLeadOptions } from "./use-leads";

/**
 * Demo «طلبات مستنية الأوبريشن»: each bulk entry with «راجع التوزيع» (1.19), each duplicate with «قرّري» (M-01 Q7),
 * each New Lead from Telesales with its clock and «قرّر» (1.17). Only for people who may decide.
 */
export function OperationsQueue() {
  const t = useTranslations("leads.queue");
  const { can } = useMe();
  const dupes = useDuplicates(can("leads", "approve"));
  const bulks = useBulkPending(can("leads", "approve"));
  const newLeads = useNewLeads(can("leads", "approve"));
  const [open, setOpen] = useState<DuplicateRow | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [routing, setRouting] = useState<NewLeadRequestRow | null>(null);
  const items = dupes.data ?? [], fresh = newLeads.data ?? [];
  const pendBulk = bulks.data ?? [];
  const reviewing = pendBulk.find((b) => b.id === review);
  if (!items.length && !pendBulk.length && !fresh.length) return null;
  return (
    <Card className="attn" title={t("title")} icon="alert" extra={<Chip tone="warn">{items.length + pendBulk.length + fresh.length}</Chip>}>
      {pendBulk.map((b) => (
        <div className="line-item" key={b.id}>
          <span><Icon name="upload" /><span>{t.rich("bulk", { name: b.by.name, count: b.total, b: (c) => <b className="num">{c}</b> })} · {b.channel} / {b.campaign?.name ?? "—"}</span></span>
          <button className="btn sm" onClick={() => setReview(b.id)}>{t("reviewSplit")}</button>
        </div>
      ))}
      {items.map((x) => (
        <div className="line-item" key={x.id}>
          {/* the text in one inner span: .line-item > span is a flex row, and on phones each piece became its own column */}
          <span><Icon name="users" /><span>{t.rich("duplicate", { name: x.entry.name, by: x.by.name, code: x.lead.code, b: (c) => <b>{c}</b> })}</span></span>
          <button className="btn sm" onClick={() => setOpen(x)}>{t("decideF")}</button>
        </div>
      ))}
      {fresh.map((x) => (
        <div className="line-item" key={x.id}>
          <span><Icon name="send" /><span>{t.rich("newLead", { name: x.name, b: (c) => <b>{c}</b> })}</span></span>
          <NewLeadClock left={x.minutesLeft} />
          <button className="btn sm" onClick={() => setRouting(x)}>{t("decide")}</button>
        </div>
      ))}
      {open && <DuplicateReview row={open} onClose={() => setOpen(null)} />}
      {reviewing && <BulkReviewModal bulk={reviewing} onClose={() => setReview(null)} />}
      {routing && <NewLeadDecision row={routing} onClose={() => setRouting(null)} />}
    </Card>
  );
}

/** Demo newLeadClock: «باقي X د» (info, warn in the last 10 minutes), «اتأخر X د» once late. */
function NewLeadClock({ left }: { left: number }) {
  const t = useTranslations("leads.queue");
  return <Chip tone={left < 0 ? "bad" : left <= 10 ? "warn" : "info"} plain>{left < 0 ? t("late", { min: -left }) : t("left", { min: left })}</Chip>;
}

/** Demo «New Lead من Telesales · …»: the normal rotation, or a salesperson Operations picks (their next turn is used up). */
function NewLeadDecision({ row, onClose }: { row: NewLeadRequestRow; onClose: () => void }) {
  const t = useTranslations("leads.queue");
  const run = useAction();
  const route = useRouteNewLead();
  const people = useLeadOptions().data?.assignable ?? [];
  const [pick, setPick] = useState("");
  const chosen = pick || people[0]?.id || "";
  const go = (to: string, name: string) => run(async () => { await route(row.id, to); onClose(); }, t("wentTo", { name }));
  return (
    <Modal title={t("newLeadTitle", { name: row.name })} onClose={onClose}>
      <Note>{t("newLeadNote")}</Note>
      <div className="choice">
        <button className="choice-card" onClick={() => void go(ROTATION, t("nextInLine"))}><Icon name="route" /><b>{t("normalRotation")}</b><small>{t("byAreaAndOrder")}</small></button>
        <div className="choice-card">
          <Icon name="users" /><b>{t("specificSales")}</b>
          <select value={chosen} onChange={(e) => setPick(e.target.value)} aria-label={t("sales")}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn sm" disabled={!chosen} onClick={() => void go(chosen, people.find((p) => p.id === chosen)?.name ?? "")}>{t("send")}</button>
        </div>
      </div>
    </Modal>
  );
}

const shown = (v: string | number | null) => (v === null || v === "" ? "—" : String(v));
const channelOf = (s: LeadSide) => `${s.channel} · ${s.campaign?.name ?? "—"}`;

/** Demo «عميل مكرر · L-…»: for each field the existing value is checked; Operations picks «الجديد» where it should win. */
function DuplicateReview({ row, onClose }: { row: DuplicateRow; onClose: () => void }) {
  const t = useTranslations("leads.queue");
  const run = useAction();
  const decide = useDecideDuplicate();
  // M-09: a hidden field has no row; one the person may not change keeps the lead's value (the API does the same)
  const fields = useFields("leads");
  const pick = (name: string, side: "old" | "new", text: string) => (
    <label className="tog"><input type="radio" name={name} value={side} defaultChecked={side === "old"} disabled={side === "new" && (!fields.edits(name) || (name === "channel" && !fields.edits("campaign")))} /> {text}</label>
  );
  const rows = [
    ...DUPLICATE_FIELDS.filter(([k]) => fields.shows(k)).map(([k, label]) => [<b key="l">{serverText(label)}</b>, pick(k, "old", shown(row.lead[k])), pick(k, "new", shown(row.entry[k]))]),
    ...(fields.shows("channel") ? [[<b key="l">Channel · Campaign</b>, pick("channel", "old", channelOf(row.lead)), pick("channel", "new", channelOf(row.entry))]] : []),
  ];
  const save = (f: FormData) => run(async () => {
    const side = (k: string) => (f.get(k) === "new" ? "new" : "old");
    const decision: DuplicateDecision = { name: side("name"), area: side("area"), type: side("type"), space: side("space"), budget: side("budget"), channel: side("channel") };
    await decide(row.id, decision);
    onClose();
  }, t("saved"));

  return (
    <Modal title={t("duplicateTitle", { code: row.lead.code })} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        {/* full width: side by side in the form's grid the table got squeezed and «الجديد» was cut off */}
        <div className="wide"><Note>{t("duplicateNote")}</Note></div>
        <div className="wide"><Table head={[t("field"), t("existing"), t("new")]} rows={rows} /></div>
        <div className="row end wide">
          <span className="hint spacer">{t("staysWith", { name: row.lead.assignedTo?.name ?? "—" })}</span>
          <button className="btn"><Icon name="check" />{t("save")}</button>
        </div>
      </form>
    </Modal>
  );
}
