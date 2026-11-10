"use client";
import { useNewParam } from "@/lib/new-param";
import { useEffect, useState } from "react";
import type { TicketView } from "@places/contracts";
import { Fab, KpiTile } from "@/components/blocks";
import { Avatar, Card, Empty, Field, Icon, Modal, Note, Tabs, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, num } from "@/lib/format";
import { useMe } from "@/lib/me";
import { TicketChips } from "./ticket-bits";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { TicketDrawer } from "./ticket-drawer";
import { useRefreshTickets, useSlaReport, useTicketOptions, useTicketSummary, useTickets } from "./use-tickets";

const PAGE = 50;

/**
 * M-06 · التذاكر (demo tickets.js): the four tiles, the tabs, the ticket list (late first in colour), the SLA note,
 * the response rate per department, a new ticket, and a ticket's drawer. Who sees which ticket is the API's.
 */
export function TicketsPage() {
  const t = useTranslations("tickets.page");
  const { can } = useMe();
  const [view, setView] = useState<TicketView>("mine");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useNewParam("1", () => setCreating(true), can("tickets", "create")); // «جديد ← تذكرة لقسم تاني» (0.16)
  const list = useTickets(view, q, page, PAGE);
  const s = useTicketSummary().data;
  const options = useTicketOptions().data;
  // a notification links to /tickets?id=…
  useEffect(() => { const id = new URLSearchParams(window.location.search).get("id"); if (id) setOpen(id); }, []);
  const dept = s?.department && options?.departments.includes(s.department) ? s.department : null;
  const items = list.error ? [] : list.data?.items ?? [];
  const total = list.error ? 0 : list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const go = (v: TicketView) => { setView(v); setPage(1); };
  const tabs: [TicketView, string, number?][] = [["mine", t("tabs.mine")], ...(dept ? [["assigned", t("tabs.assigned", { department: serverText(dept) })] as [TicketView, string]] : []), ["late", t("tabs.late")], ["closed", t("tabs.closed")], ["all", t("tabs.all")]];

  return (
    <>
      <div className="kpis">
        <KpiTile label={t("kpi.open")} value={s ? num(s.open) : "…"} sub="Open · In Progress" icon="ticket" />
        <KpiTile label={t("kpi.late")} value={s ? num(s.late) : "…"} sub={t("kpi.lateSub")} icon="alert" tone="bad" onClick={() => go("late")} />
        <KpiTile label={t("kpi.avgReply")} value={s?.avgReplyMinutes != null ? t("minutes", { n: num(s.avgReplyMinutes) }) : "—"} sub={dept ? t("kpi.avgReplySub", { department: serverText(dept) }) : ""} icon="clock" tone="warn" />
        <KpiTile label={t("kpi.closed")} value={s ? num(s.closed) : "…"} sub={t("kpi.closedSub")} icon="check" tone="ok" />
      </div>
      <div className="row">
        <Tabs value={view} onChange={go} items={tabs} />
        <span className="spacer" />
        {can("tickets", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />{t("newTicket")}</button>}
      </div>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder={t("searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label={t("searchLabel")} /></label>
      </div>
      {list.error && <Note kind="warn">{list.error.message}</Note>}
      <div className="tk-list">
        {items.length ? items.map((tk) => (
          <article key={tk.id} className={`tk ${tk.late ? "late" : ""}`} onClick={() => setOpen(tk.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(tk.id)} tabIndex={0} role="button">
            <div className="tk-side"><Avatar id={tk.from.id} name={tk.from.name} /></div>
            <div className="tk-main">
              <div className="row"><b className="spacer">{tk.title}</b><TicketChips t={tk} /></div>
              <small>{t("rowMeta", { code: tk.code, from: tk.from.name, department: serverText(tk.department), ago: ago(tk.createdAt), events: num(tk.events) })}{tk.late && <> · <b className="bad-t">{t("lateEscalated")}</b></>}</small>
            </div>
          </article>
        )) : <Empty text={t("empty")} icon="ticket" />}
      </div>
      {pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</button>
        </div>
      )}
      <Note>{t("slaNote")}</Note>
      {can("reports") && <ResponseRate />}
      {can("tickets", "create") && <Fab onClick={() => setCreating(true)} label={t("newTicket")} />}
      {creating && <NewTicket onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
      {open && <TicketDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** M-06 6.1 · per department: the share closed in its SLA (the KPI line) and the average first reply. */
function ResponseRate() {
  const t = useTranslations("tickets.page");
  const tr = useTranslations("tickets.rate");
  const [month, setMonth] = useState("");
  const r = useSlaReport(month, true).data;
  const rows = r?.rows ?? [];
  return (
    <Card title={tr("title")} icon="chart" sub={tr("sub")}
      extra={<input type="month" value={month || r?.month || ""} onChange={(e) => setMonth(e.target.value)} aria-label={tr("month")} style={{ width: "auto" }} />}>
      <div className="hbars">
        {rows.map((d) => (
          <div className="hb" key={d.department}>
            <span className="hb-l">{serverText(d.department)}<small>{tr("counts", { total: num(d.total), inSla: num(d.closedInSla) })}</small></span>
            <div className={`bar ${d.percent != null && d.percent < 90 ? "bad" : ""}`}><i style={{ width: `${d.percent ?? 0}%` }} /></div>
            <span className="hb-v">{d.percent != null ? `${d.percent}%` : "—"} · {d.avgReplyMinutes != null ? t("minutes", { n: num(d.avgReplyMinutes) }) : "—"}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Demo «تذكرة جديدة»: a type with its own department (HR Letter, نزاع…) fixes the department (M-06 2.2). */
function NewTicket({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const tr = useTranslations("tickets.new");
  const run = useAction();
  const refresh = useRefreshTickets();
  const options = useTicketOptions().data;
  const [type, setType] = useState("request");
  const fixed = options?.types.find((t) => t.key === type)?.department ?? null;
  return (
    <Modal title={tr("title")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const body = { type, priority: f.get("priority"), title: f.get("title"), ...(fixed ? {} : { department: f.get("department") }) };
        const t = await api.post<{ id: string; code: string }>("/tickets", body);
        await refresh();
        onCreated(t.id);
      }, tr("sent")))}>
        <Field label={tr("type")} wide>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {options?.types.map((t) => <option key={t.key} value={t.key}>{t.department ? tr("typeWithDept", { label: serverText(t.label), department: serverText(t.department), hours: t.slaHours }) : serverText(t.label)}</option>)}
          </select>
        </Field>
        <Field label={tr("department")} req>
          {fixed
            ? <select disabled value={fixed}><option>{serverText(fixed)}</option></select>
            : <select name="department" required>{options?.departments.map((d) => <option key={d} value={d}>{serverText(d)}</option>)}</select>}
        </Field>
        <Field label={tr("priority")}>
          <select name="priority" defaultValue="normal"><option value="normal">{tr("normal")}</option><option value="high">{tr("high")}</option></select>
        </Field>
        <Field label={tr("request")} req wide><textarea name="title" required minLength={3} /></Field>
        <div className="row end wide">
          <span className="hint spacer">{tr("slaHint")}</span>
          <button className="btn"><Icon name="send" />{tr("send")}</button>
        </div>
      </form>
    </Modal>
  );
}
