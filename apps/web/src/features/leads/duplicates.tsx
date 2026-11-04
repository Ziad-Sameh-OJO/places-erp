"use client";
import { useState } from "react";
import type { DuplicateDecision, DuplicateRow, LeadSide } from "@places/contracts";
import { DUPLICATE_FIELDS } from "@places/domain";
import { useMe } from "@/lib/me";
import { Card, Chip, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { useDecideDuplicate, useDuplicates } from "./use-duplicates";

/** Demo «طلبات مستنية الأوبريشن»: each duplicate with «قرّري». Shown only to people who may decide (M-01 Q7). */
export function OperationsQueue() {
  const { can } = useMe();
  const dupes = useDuplicates(can("leads", "approve"));
  const [open, setOpen] = useState<DuplicateRow | null>(null);
  const items = dupes.data ?? [];
  if (!items.length) return null;
  return (
    <Card className="attn" title="طلبات مستنية الأوبريشن" icon="alert" extra={<Chip tone="warn">{items.length}</Chip>}>
      {items.map((x) => (
        <div className="line-item" key={x.id}>
          {/* the text in one inner span: .line-item > span is a flex row, and on phones each piece became its own column */}
          <span><Icon name="users" /><span>عميل مكرر: <b>{x.entry.name}</b> دخّله {x.by.name} · موجود في {x.lead.code}</span></span>
          <button className="btn sm" onClick={() => setOpen(x)}>قرّري</button>
        </div>
      ))}
      {open && <DuplicateReview row={open} onClose={() => setOpen(null)} />}
    </Card>
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
