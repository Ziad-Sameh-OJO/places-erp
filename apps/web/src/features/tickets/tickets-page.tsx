"use client";
import { useEffect, useState } from "react";
import type { TicketView } from "@places/contracts";
import { Fab, KpiTile } from "@/components/blocks";
import { Avatar, Card, Empty, Field, Icon, Modal, Note, Tabs, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, num } from "@/lib/format";
import { useMe } from "@/lib/me";
import { TicketChips } from "./ticket-bits";
import { TicketDrawer } from "./ticket-drawer";
import { useRefreshTickets, useSlaReport, useTicketOptions, useTicketSummary, useTickets } from "./use-tickets";

const PAGE = 50;

/**
 * M-06 · التذاكر (demo tickets.js): the four tiles, the tabs, the ticket list (late first in colour), the SLA note,
 * the response rate per department, a new ticket, and a ticket's drawer. Who sees which ticket is the API's.
 */
export function TicketsPage() {
  const { can } = useMe();
  const [view, setView] = useState<TicketView>("mine");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
  const tabs: [TicketView, string, number?][] = [["mine", "طلباتي"], ...(dept ? [["assigned", `مسندة لقسم ${dept}`] as [TicketView, string]] : []), ["late", "متأخرة"], ["closed", "اتقفلت"], ["all", "الكل"]];

  return (
    <>
      <div className="kpis">
        <KpiTile label="مفتوحة" value={s ? num(s.open) : "…"} sub="Open · In Progress" icon="ticket" />
        <KpiTile label="متأخرة" value={s ? num(s.late) : "…"} sub="اتصعّدت لمدير القسم" icon="alert" tone="bad" onClick={() => go("late")} />
        <KpiTile label="متوسط وقت الرد" value={s?.avgReplyMinutes != null ? `${num(s.avgReplyMinutes)} د` : "—"} sub={dept ? `قسم ${dept} · الشهر ده` : ""} icon="clock" tone="warn" />
        <KpiTile label="اتقفلت" value={s ? num(s.closed) : "…"} sub="القسم اللي نفّذ بيقفلها" icon="check" tone="ok" />
      </div>
      <div className="row">
        <Tabs value={view} onChange={go} items={tabs} />
        <span className="spacer" />
        {can("tickets", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />تذكرة جديدة</button>}
      </div>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder="دوّر برقم التذكرة أو الطلب" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="بحث في التذاكر" /></label>
      </div>
      {list.error && <Note kind="warn">{list.error.message}</Note>}
      <div className="tk-list">
        {items.length ? items.map((t) => (
          <article key={t.id} className={`tk ${t.late ? "late" : ""}`} onClick={() => setOpen(t.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(t.id)} tabIndex={0} role="button">
            <div className="tk-side"><Avatar id={t.from.id} name={t.from.name} /></div>
            <div className="tk-main">
              <div className="row"><b className="spacer">{t.title}</b><TicketChips t={t} /></div>
              <small>{t.code} · من {t.from.name} → {t.department} · {ago(t.createdAt)} · {num(t.events)} حركة{t.late && <> · <b className="bad-t">اتأخرت · اتصعّدت</b></>}</small>
            </div>
          </article>
        )) : <Empty text="مفيش تذاكر هنا" icon="ticket" />}
      </div>
      {pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
      <Note>الرد خلال 24 ساعة عمل (4 ساعات لو الأولوية عالية)، ولو اتأخرت بتتصعّد لمدير القسم. كل تذكرة ليها سجل زمني رسمي (Audit Trail) ومعدل استجابة لكل قسم.</Note>
      {can("reports") && <ResponseRate />}
      {can("tickets", "create") && <Fab onClick={() => setCreating(true)} label="تذكرة جديدة" />}
      {creating && <NewTicket onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
      {open && <TicketDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** M-06 6.1 · per department: the share closed in its SLA (the KPI line) and the average first reply. */
function ResponseRate() {
  const [month, setMonth] = useState("");
  const r = useSlaReport(month, true).data;
  const rows = r?.rows ?? [];
  return (
    <Card title="معدل الاستجابة لكل قسم" icon="chart" sub="اللي اتقفل في الـ SLA ÷ كل التذاكر · متوسط وقت الرد"
      extra={<input type="month" value={month || r?.month || ""} onChange={(e) => setMonth(e.target.value)} aria-label="الشهر" style={{ width: "auto" }} />}>
      <div className="hbars">
        {rows.map((d) => (
          <div className="hb" key={d.department}>
            <span className="hb-l">{d.department}<small>{num(d.total)} تذكرة · {num(d.closedInSla)} في الـ SLA</small></span>
            <div className={`bar ${d.percent != null && d.percent < 90 ? "bad" : ""}`}><i style={{ width: `${d.percent ?? 0}%` }} /></div>
            <span className="hb-v">{d.percent != null ? `${d.percent}%` : "—"} · {d.avgReplyMinutes != null ? `${num(d.avgReplyMinutes)} د` : "—"}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Demo «تذكرة جديدة»: a type with its own department (HR Letter, نزاع…) fixes the department (M-06 2.2). */
function NewTicket({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const run = useAction();
  const refresh = useRefreshTickets();
  const options = useTicketOptions().data;
  const [type, setType] = useState("request");
  const fixed = options?.types.find((t) => t.key === type)?.department ?? null;
  return (
    <Modal title="تذكرة جديدة" onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const body = { type, priority: f.get("priority"), title: f.get("title"), ...(fixed ? {} : { department: f.get("department") }) };
        const t = await api.post<{ id: string; code: string }>("/tickets", body);
        await refresh();
        onCreated(t.id);
      }, "التذكرة اتبعتت"))}>
        <Field label="النوع" wide>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {options?.types.map((t) => <option key={t.key} value={t.key}>{t.department ? `${t.label} (${t.department} · ${t.slaHours} ساعة)` : t.label}</option>)}
          </select>
        </Field>
        <Field label="للقسم" req>
          {fixed
            ? <select disabled value={fixed}><option>{fixed}</option></select>
            : <select name="department" required>{options?.departments.map((d) => <option key={d} value={d}>{d}</option>)}</select>}
        </Field>
        <Field label="الأولوية">
          <select name="priority" defaultValue="normal"><option value="normal">عادية</option><option value="high">عالية</option></select>
        </Field>
        <Field label="الطلب" req wide><textarea name="title" required minLength={3} /></Field>
        <div className="row end wide">
          <span className="hint spacer">الرد خلال 24 ساعة عمل (4 ساعات لو الأولوية عالية).</span>
          <button className="btn"><Icon name="send" />ابعت</button>
        </div>
      </form>
    </Modal>
  );
}
