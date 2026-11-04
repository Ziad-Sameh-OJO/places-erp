"use client";
import { useState, type ReactNode } from "react";
import type { TicketDetail } from "@places/contracts";
import { TICKET_STATUSES } from "@places/domain";
import { Drawer, Stepper } from "@/components/blocks";
import { Avatar, Empty, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { PRIORITY, TicketChips } from "./ticket-bits";
import { useRefreshTickets, useTicket, useTicketOptions } from "./use-tickets";

/** Demo «KIND»: what each line of the Audit Trail is. */
const KIND: Record<string, string> = { open: "فتح", reply: "رد", transfer: "تحويل", status: "حالة", close: "قفل", escalate: "تصعيد" };

/** Demo «tkDrawer»: the stages, the facts, the Audit Trail, then what the caller may do (the API checks again). */
export function TicketDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useTicket(id);
  if (q.error) return <Drawer title="التذكرة مش موجودة" onClose={onClose}><Empty text={q.error.message} /></Drawer>;
  const t = q.data;
  if (!t) return <Drawer title="…" onClose={onClose}><p className="hint">بيحمّل…</p></Drawer>;
  const replyAfter = t.firstReplyAt ? Math.round((Date.parse(t.firstReplyAt) - Date.parse(t.createdAt)) / 60000) : null;
  const kv: [string, ReactNode][] = [
    ["من", t.from.name], ["القسم", t.department], ["النوع", t.typeLabel], ["الأولوية", PRIORITY[t.priority] ?? t.priority],
    ["اتفتحت", dayTime(t.createdAt)], ["أول رد", replyAfter === null ? "لسه" : `بعد ${replyAfter} د`],
  ];
  return (
    <Drawer title={t.title} sub={`${t.code} · ${t.department}`} chips={<TicketChips t={t} />} onClose={onClose}>
      {t.late && <Note kind="warn"><b>اتأخرت:</b> عدّى {Math.floor((Date.now() - Date.parse(t.createdAt)) / 3_600_000)} ساعة من غير {t.type === "dispute" ? "ما يتحسم" : "رد"} · اتصعّدت{t.type === "dispute" ? " للـ Office Manager" : ` لمدير قسم ${t.department}`}.</Note>}
      <Stepper stages={TICKET_STATUSES} current={t.status} done={t.status === "Closed"} />
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h4 className="mini-h">Audit Trail</h4>
      <div className="thread">
        {t.events.map((e, i) => (
          <div key={i} className={`msg ${e.by?.id === t.from.id ? "me" : ""} k-${e.kind}`}>
            <Avatar id={e.by?.id ?? "system"} name={e.by?.name ?? "س"} sm />
            <div><small>{e.by?.name ?? "السيستم"} · {KIND[e.kind] ?? e.kind} · {dayTime(e.at)}</small><p>{e.text}</p></div>
          </div>
        ))}
      </div>
      {t.can.reply && <ReplyForm t={t} />}
      {t.can.transfer && <TransferForm t={t} />}
      {t.can.close && <CloseButton t={t} />}
    </Drawer>
  );
}

function ReplyForm({ t }: { t: TicketDetail }) {
  const run = useAction();
  const refresh = useRefreshTickets();
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  return (
    <form className="card flat" onSubmit={(e) => {
      e.preventDefault();
      void run(async () => { await api.post(`/tickets/${t.id}/replies`, { text, ...(status ? { status } : {}) }); setText(""); setStatus(""); await refresh(); }, "الرد اتبعت");
    }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} required placeholder="اكتب رد" aria-label="الرد" />
      <div className="row end">
        {t.can.handle && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
            <option value="">من غير تغيير الحالة</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved · خلّصت</option>
          </select>
        )}
        <button className="btn" disabled={!text.trim()}><Icon name="send" />ابعت</button>
      </div>
    </form>
  );
}

/** M-06 2.3: sent to the wrong department → moved, not closed; the history stays. */
function TransferForm({ t }: { t: TicketDetail }) {
  const run = useAction();
  const refresh = useRefreshTickets();
  const others = (useTicketOptions().data?.departments ?? []).filter((d) => d !== t.department);
  const [to, setTo] = useState("");
  const dept = to || others[0] || "";
  if (!others.length) return null;
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.post(`/tickets/${t.id}/transfer`, { department: dept }); await refresh(); }, `اتحوّلت لـ ${dept} · السجل محفوظ`); }}>
      <span className="hint">اتبعتت للقسم الغلط؟</span>
      <select value={dept} onChange={(e) => setTo(e.target.value)} aria-label="حوّلها لقسم">{others.map((d) => <option key={d} value={d}>{d}</option>)}</select>
      <button className="btn ghost sm"><Icon name="swap" />حوّلها</button>
    </form>
  );
}

/** M-06 7.2 (35): the department that did the work closes it. */
function CloseButton({ t }: { t: TicketDetail }) {
  const run = useAction();
  const refresh = useRefreshTickets();
  return (
    <div className="row end">
      <button className="btn" onClick={() => void run(async () => { await api.post(`/tickets/${t.id}/close`); await refresh(); }, "التذكرة اتقفلت")}><Icon name="check" />الطلب اتنفّذ · اقفلها</button>
    </div>
  );
}
