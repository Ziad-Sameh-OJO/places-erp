"use client";
import { useState, type ReactNode } from "react";
import type { TicketDetail } from "@places/contracts";
import { TICKET_STATUSES } from "@places/domain";
import { Drawer, Stepper } from "@/components/blocks";
import { Avatar, Empty, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { usePriority, TicketChips } from "./ticket-bits";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { useRefreshTickets, useTicket, useTicketOptions } from "./use-tickets";
import { useRecent } from "@/lib/quick";

/** Demo «KIND»: what each line of the Audit Trail is (keys of tickets.drawer.kind). */
const KIND = ["open", "reply", "transfer", "status", "close", "escalate"] as const;
const isKind = (k: string): k is (typeof KIND)[number] => (KIND as readonly string[]).includes(k);

/** Demo «tkDrawer»: the stages, the facts, the Audit Trail, then what the caller may do (the API checks again). */
export function TicketDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const tr = useTranslations("tickets.drawer");
  const priority = usePriority();
  const q = useTicket(id);
  useRecent("ticket", id, q.data?.title); // 0.14
  if (q.error) return <Drawer title={tr("notFound")} onClose={onClose}><Empty text={q.error.message} /></Drawer>;
  const t = q.data;
  if (!t) return <Drawer title="…" onClose={onClose}><p className="hint">{tr("loading")}</p></Drawer>;
  const replyAfter = t.firstReplyAt ? Math.round((Date.parse(t.firstReplyAt) - Date.parse(t.createdAt)) / 60000) : null;
  const kv: [string, ReactNode][] = [
    [tr("kv.from"), t.from.name], [tr("kv.department"), serverText(t.department)], [tr("kv.type"), serverText(t.typeLabel)], [tr("kv.priority"), priority(t.priority)],
    [tr("kv.opened"), dayTime(t.createdAt)], [tr("kv.firstReply"), replyAfter === null ? tr("kv.notYet") : tr("kv.after", { minutes: replyAfter })],
  ];
  return (
    <Drawer title={t.title} sub={`${t.code} · ${serverText(t.department)}`} chips={<TicketChips t={t} />} onClose={onClose}>
      {t.late && <Note kind="warn"><b>{tr("late.label")}</b> {tr(t.type === "dispute" ? "late.dispute" : "late.other", { hours: Math.floor((Date.now() - Date.parse(t.createdAt)) / 3_600_000), department: serverText(t.department) })}</Note>}
      <Stepper stages={TICKET_STATUSES} current={t.status} done={t.status === "Closed"} />
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h4 className="mini-h">Audit Trail</h4>
      <div className="thread">
        {t.events.map((e, i) => (
          <div key={i} className={`msg ${e.by?.id === t.from.id ? "me" : ""} k-${e.kind}`}>
            <Avatar id={e.by?.id ?? "system"} name={e.by?.name ?? tr("systemInitial")} sm />
            <div><small>{e.by?.name ?? tr("system")} · {isKind(e.kind) ? tr(`kind.${e.kind}`) : e.kind} · {dayTime(e.at)}</small><p>{serverText(e.text)}</p></div>
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
  const tr = useTranslations("tickets.drawer.reply");
  const run = useAction();
  const refresh = useRefreshTickets();
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  return (
    <form className="card flat" onSubmit={(e) => {
      e.preventDefault();
      void run(async () => { await api.post(`/tickets/${t.id}/replies`, { text, ...(status ? { status } : {}) }); setText(""); setStatus(""); await refresh(); }, tr("sent"));
    }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} required placeholder={tr("placeholder")} aria-label={tr("label")} />
      <div className="row end">
        {t.can.handle && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tr("status")}>
            <option value="">{tr("keepStatus")}</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">{tr("resolved")}</option>
          </select>
        )}
        <button className="btn" disabled={!text.trim()}><Icon name="send" />{tr("send")}</button>
      </div>
    </form>
  );
}

/** M-06 2.3: sent to the wrong department → moved, not closed; the history stays. */
function TransferForm({ t }: { t: TicketDetail }) {
  const tr = useTranslations("tickets.drawer.transfer");
  const run = useAction();
  const refresh = useRefreshTickets();
  const others = (useTicketOptions().data?.departments ?? []).filter((d) => d !== t.department);
  const [to, setTo] = useState("");
  const dept = to || others[0] || "";
  if (!others.length) return null;
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.post(`/tickets/${t.id}/transfer`, { department: dept }); await refresh(); }, tr("done", { department: serverText(dept) })); }}>
      <span className="hint">{tr("wrongDept")}</span>
      <select value={dept} onChange={(e) => setTo(e.target.value)} aria-label={tr("label")}>{others.map((d) => <option key={d} value={d}>{serverText(d)}</option>)}</select>
      <button className="btn ghost sm"><Icon name="swap" />{tr("button")}</button>
    </form>
  );
}

/** M-06 7.2 (35): the department that did the work closes it. */
function CloseButton({ t }: { t: TicketDetail }) {
  const tr = useTranslations("tickets.drawer.close");
  const run = useAction();
  const refresh = useRefreshTickets();
  return (
    <div className="row end">
      <button className="btn" onClick={() => void run(async () => { await api.post(`/tickets/${t.id}/close`); await refresh(); }, tr("done"))}><Icon name="check" />{tr("button")}</button>
    </div>
  );
}
