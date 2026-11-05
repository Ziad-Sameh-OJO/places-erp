"use client";
import { useState } from "react";
import { ROTATION, type DuplicateDecision, type DuplicateRow, type LeadSide, type NewLeadRequestRow } from "@places/contracts";
import { DUPLICATE_FIELDS } from "@places/domain";
import { useMe } from "@/lib/me";
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
    <Card className="attn" title="طلبات مستنية الأوبريشن" icon="alert" extra={<Chip tone="warn">{items.length + pendBulk.length + fresh.length}</Chip>}>
      {pendBulk.map((b) => (
        <div className="line-item" key={b.id}>
          <span><Icon name="upload" /><span>إدخال جماعي من {b.by.name}: <b className="num">{b.total}</b> رقم · {b.channel} / {b.campaign?.name ?? "—"}</span></span>
          <button className="btn sm" onClick={() => setReview(b.id)}>راجع التوزيع</button>
        </div>
      ))}
      {items.map((x) => (
        <div className="line-item" key={x.id}>
          {/* the text in one inner span: .line-item > span is a flex row, and on phones each piece became its own column */}
          <span><Icon name="users" /><span>عميل مكرر: <b>{x.entry.name}</b> دخّله {x.by.name} · موجود في {x.lead.code}</span></span>
          <button className="btn sm" onClick={() => setOpen(x)}>قرّري</button>
        </div>
      ))}
      {fresh.map((x) => (
        <div className="line-item" key={x.id}>
          <span><Icon name="send" /><span>Telesales بعتت <b>{x.name}</b> كـ New Lead (بقى Interested)</span></span>
          <NewLeadClock left={x.minutesLeft} />
          <button className="btn sm" onClick={() => setRouting(x)}>قرّر</button>
        </div>
      ))}
      {open && <DuplicateReview row={open} onClose={() => setOpen(null)} />}
      {reviewing && <BulkReviewModal bulk={reviewing} onClose={() => setReview(null)} />}
      {routing && <NewLeadDecision row={routing} onClose={() => setRouting(null)} />}
    </Card>
  );
}

/** Demo newLeadClock: «باقي X د» (info, warn in the last 10 minutes), «اتأخر X د» once late. */
const NewLeadClock = ({ left }: { left: number }) => (
  <Chip tone={left < 0 ? "bad" : left <= 10 ? "warn" : "info"} plain>{left < 0 ? `اتأخر ${-left} د` : `باقي ${left} د`}</Chip>
);

/** Demo «New Lead من Telesales · …»: the normal rotation, or a salesperson Operations picks (their next turn is used up). */
function NewLeadDecision({ row, onClose }: { row: NewLeadRequestRow; onClose: () => void }) {
  const run = useAction();
  const route = useRouteNewLead();
  const people = useLeadOptions().data?.assignable ?? [];
  const [pick, setPick] = useState("");
  const chosen = pick || people[0]?.id || "";
  const go = (to: string, name: string) => run(async () => { await route(row.id, to); onClose(); }, `راح لـ ${name}`);
  return (
    <Modal title={`New Lead من Telesales · ${row.name}`} onClose={onClose}>
      <Note>الليد بقى Interested عند Telesales بعد الروتيشن التالت. يروح فين؟</Note>
      <div className="choice">
        <button className="choice-card" onClick={() => void go(ROTATION, "اللي عليه الدور")}><Icon name="route" /><b>الروتيشن العادي</b><small>حسب الـ area وترتيب اليوم</small></button>
        <div className="choice-card">
          <Icon name="users" /><b>سيلز معيّن</b>
          <select value={chosen} onChange={(e) => setPick(e.target.value)} aria-label="السيلز">
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn sm" disabled={!chosen} onClick={() => void go(chosen, people.find((p) => p.id === chosen)?.name ?? "")}>ابعته</button>
        </div>
      </div>
    </Modal>
  );
}

const shown = (v: string | number | null) => (v === null || v === "" ? "—" : String(v));
const channelOf = (s: LeadSide) => `${s.channel} · ${s.campaign?.name ?? "—"}`;

/** Demo «عميل مكرر · L-…»: for each field the existing value is checked; Operations picks «الجديد» where it should win. */
function DuplicateReview({ row, onClose }: { row: DuplicateRow; onClose: () => void }) {
  const run = useAction();
  const decide = useDecideDuplicate();
  const pick = (name: string, side: "old" | "new", text: string) => (
    <label className="tog"><input type="radio" name={name} value={side} defaultChecked={side === "old"} /> {text}</label>
  );
  const rows = [
    ...DUPLICATE_FIELDS.map(([k, label]) => [<b key="l">{label}</b>, pick(k, "old", shown(row.lead[k])), pick(k, "new", shown(row.entry[k]))]),
    [<b key="l">Channel · Campaign</b>, pick("channel", "old", channelOf(row.lead)), pick("channel", "new", channelOf(row.entry))],
  ];
  const save = (f: FormData) => run(async () => {
    const side = (k: string) => (f.get(k) === "new" ? "new" : "old");
    const decision: DuplicateDecision = { name: side("name"), area: side("area"), type: side("type"), space: side("space"), budget: side("budget"), channel: side("channel") };
    await decide(row.id, decision);
    onClose();
  }, "اتحفظ القرار");

  return (
    <Modal title={`عميل مكرر · ${row.lead.code}`} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        {/* full width: side by side in the form's grid the table got squeezed and «الجديد» was cut off */}
        <div className="wide"><Note>اختاري لكل خانة البيانات اللي تفضل، والليد يتحسب على أنهي channel. الأرقام بتتجمّع من الاتنين.</Note></div>
        <div className="wide"><Table head={["الخانة", "الموجود", "الجديد"]} rows={rows} /></div>
        <div className="row end wide">
          <span className="hint spacer">الليد يفضل عند {row.lead.assignedTo?.name ?? "—"}.</span>
          <button className="btn"><Icon name="check" />احفظ القرار</button>
        </div>
      </form>
    </Modal>
  );
}
