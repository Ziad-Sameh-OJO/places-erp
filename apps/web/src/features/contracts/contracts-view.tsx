"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ContractCalendar, ContractSummary } from "@places/contracts";
import { Card, Chip, Icon, Table, Tabs } from "@/components/ui";
import { Fab, KpiTile } from "@/components/blocks";
import { useFields, useMe } from "@/lib/me";
import { day, money, num } from "@/lib/format";
import { useCalendar, useCollections, useContracts, useSummary, statusChip } from "./use-contracts";
import { ContractDrawer } from "./contract-drawer";
import { ContractForm } from "./contract-form";

type Tab = "list" | "calendar" | "collections";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** M-11 · the demo's contracts screen (clients.js V.contracts): tiles, renewals coming up, the contracts and the Aging, plus the calendar (5.3). */
export function ContractsView() {
  const t = useTranslations("contracts");
  const { can } = useMe();
  const s = useSummary();
  const [tab, setTab] = useState<Tab>("list");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const fields = useFields("contracts");
  // M-09: a contract can't be uploaded without its value, table and PDF, so a role that may not set them doesn't get the form
  const uploader = can("contracts", "create") && ["value", "installments", "file"].every((k) => fields.edits(k));
  return (
    <>
      {s.data && <Kpis s={s.data} />}
      {s.data && s.data.renewals.length > 0 && <Renewals s={s.data} onOpen={setOpen} />}
      <div className="row">
        <Tabs items={[["list", t("tabs.list")], ["calendar", t("tabs.calendar")], ["collections", t("tabs.collections")]]} value={tab} onChange={setTab} />
        <span className="spacer" />
        {uploader && <button className="btn" onClick={() => setForm(true)}><Icon name="plus" />{t("newContract")}</button>}
      </div>
      {tab === "list" ? <List aging={s.data?.aging} onOpen={setOpen} /> : tab === "calendar" ? <Calendar onOpen={setOpen} /> : <Collections onOpen={setOpen} />}
      {uploader && <Fab onClick={() => setForm(true)} label={t("newContract")} />}
      {open && <ContractDrawer id={open} onClose={() => setOpen(null)} />}
      {form && <ContractForm onClose={() => setForm(false)} onCreated={(id) => { setForm(false); setOpen(id); }} />}
    </>
  );
}

function Kpis({ s }: { s: ContractSummary }) {
  const t = useTranslations("contracts.kpis");
  const fields = useFields("contracts"); // M-09: a tile made of a hidden field is gone
  return (
    <div className="kpis">
      <KpiTile label={t("active")} value={num(s.active)} sub={t("activeSub")} icon="file" />
      <KpiTile label={t("endingSoon")} value={num(s.endingSoon)} sub={t("endingSoonSub")} icon="clock" tone="warn" />
      {fields.shows("late") && <KpiTile label={t("late")} value={num(s.late.count)} sub={money(s.late.amount)} icon="alert" tone="bad" />}
      {fields.shows("paid") && <KpiTile label={t("paid")} value={money(s.paid)} sub={t("paidSub")} icon="wallet" tone="ok" />}
    </div>
  );
}

function Renewals({ s, onOpen }: { s: ContractSummary; onOpen: (id: string) => void }) {
  const t = useTranslations("contracts.renewals");
  return (
    <Card title={t("title")} icon="bell" className="attn">
      {s.renewals.map((c) => (
        <div className="line-item" key={c.id}>
          <span><b>{c.client}</b> · <span className="mono">{c.unitCode}</span> · {t("ends", { date: day(c.endsOn) })}</span>
          <Chip tone={c.daysLeft <= 30 ? "bad" : c.daysLeft <= 60 ? "warn" : "info"}>{t("left", { days: String(c.daysLeft), count: c.daysLeft })}</Chip>
          <button className="btn ghost sm" onClick={() => onOpen(c.id)}>{t("open")}</button>
        </div>
      ))}
    </Card>
  );
}

function List({ aging, onOpen }: { aging: ContractSummary["aging"] | undefined; onOpen: (id: string) => void }) {
  const t = useTranslations("contracts");
  const [q, setQ] = useState("");
  const [ending, setEnding] = useState(false);
  const [page, setPage] = useState(1);
  const list = useContracts(q.trim(), ending, page);
  const items = list.data?.items ?? [];
  const fields = useFields("contracts"); // M-09: a hidden field's column is gone
  const shown = (k: string) => fields.shows(k);
  return (
    <>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder={t("list.search")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
        <label className="tog"><input type="checkbox" checked={ending} onChange={(e) => { setEnding(e.target.checked); setPage(1); }} /><span>{t("list.endingOnly")}</span></label>
      </div>
      <div className="cols wide">
        <div>
          <Table head={[t("list.contract"), t("fields.client"), t("fields.unit"), t("list.period"), ...(shown("value") ? [t("fields.value")] : []), ...(shown("paid") && shown("value") ? [t("list.collected")] : []), t("fields.status")]} empty={list.isPending ? t("loading") : t("list.empty")} onRow={(i) => onOpen(items[i]!.id)}
            rows={items.map((c) => {
              const pct = Number(c.value) ? Math.round((Number(c.paid) / Number(c.value)) * 100) : 0;
              const [tone, label] = statusChip(c, t("endingSoon"));
              return [
                <span key="c" className="mono">{c.code}</span>, c.client, <span key="u" className="mono">{c.unitCode}</span>,
                `${day(c.startsOn)} → ${day(c.endsOn)}`, ...(shown("value") ? [<span key="v" className="n">{money(c.value)}</span>] : []),
                // the collected % needs both the payments and the value
                ...(shown("paid") && shown("value") ? [<div key="p" className="cell-bar"><span className="num">{pct}%</span><div className="bar"><i style={{ width: `${pct}%` }} /></div></div>] : []),
                <Chip key="s" tone={tone}>{label}</Chip>,
              ];
            })} />
          {list.data && list.data.total > list.data.pageSize && (
            <div className="row"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("list.prev")}</button><span className="hint">{t("list.pageOf", { page: String(page), pages: String(Math.ceil(list.data.total / list.data.pageSize)) })}</span><button className="btn ghost sm" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>{t("list.next")}</button></div>
          )}
        </div>
        {aging && shown("aging") && <Aging aging={aging} />}
      </div>
    </>
  );
}

/** «أعمار المديونيات (Aging)»: what's owed on late installments, 0–30 / 31–60 / 61–90 / +90 days (M-11 6.1). */
function Aging({ aging }: { aging: ContractSummary["aging"] }) {
  const t = useTranslations("contracts.aging");
  const max = Math.max(1, ...aging.map(Number));
  const rows: [string, string, string][] = [[t("d30"), aging[0], ""], [t("d60"), aging[1], "warn"], [t("d90"), aging[2], "bad"], [t("over90"), aging[3], "bad"]];
  return (
    <Card title={t("title")} icon="chart">
      <div className="hbars">
        {rows.map(([label, v, tone]) => (
          <div className="hb" key={label}>
            <span className="hb-l">{label}</span>
            <div className={`bar ${tone}`}><i style={{ width: `${(Number(v) / max) * 100}%` }} /></div>
            <span className="hb-v">{money(v)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** M-11 5.3: «Calendar للأقساط والتجديدات» — the month's installments (by state) and contract ends. */
function Calendar({ onOpen }: { onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const t = useTranslations("contracts.calendar");
  const cal = useCalendar(month);
  return (
    <Card title={t("title")} icon="calendar" sub={t("sub")}
      extra={<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t("month")} style={{ width: "auto" }} />}>
      <MonthGrid month={month} byDay={cal.data?.byDay ?? {}} onOpen={onOpen} />
    </Card>
  );
}

/** «تقرير التحصيل» (M-11 6.1): the month's due vs collected, each payment with its receipt (6.7), and the Aging. */
function Collections({ onOpen }: { onOpen: (id: string) => void }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const t = useTranslations("contracts");
  const r = useCollections(month);
  const items = r.data?.items ?? [];
  const fields = useFields("contracts"); // M-09: the API leaves out what's hidden; its totals and the Aging go too
  return (
    <div className="cols wide">
      <Card title={t("collections.title")} icon="wallet" sub={r.data && fields.shows("installments") && fields.shows("paid") ? t("collections.sub", { due: money(r.data.due), collected: money(r.data.collected) }) : ""}
        extra={<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={t("month")} style={{ width: "auto" }} />}>
        <Table head={[t("collections.paidOn"), t("list.contract"), t("fields.client"), t("fields.unit"), t("collections.dueOn"), t("fields.amount"), ""]} empty={r.isPending ? t("loading") : t("collections.empty")} onRow={(i) => onOpen(items[i]!.contractId)}
          rows={items.map((x) => [
            day(x.paidOn), <span key="c" className="mono">{x.code}</span>, x.client, <span key="u" className="mono">{x.unitCode}</span>, day(x.dueOn),
            <span key="a" className="n">{money(x.amount)}</span>,
            <a key="r" className="btn ghost sm" href={`/api/v1/contracts/payments/${x.paymentId}/receipt`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="file" />{t("receipt", { no: x.receiptNo })}</a>,
          ])} />
      </Card>
      {r.data && fields.shows("aging") && <Aging aging={r.data.aging} />}
    </div>
  );
}

const TONE = { paid: "ok", partial: "warn", late: "warn", due: "" } as const;

/** The demo's U.calendar: weeks start Saturday. */
function MonthGrid({ month, byDay, onOpen }: { month: string; byDay: ContractCalendar["byDay"]; onOpen: (id: string) => void }) {
  const tc = useTranslations("contracts.calendar");
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(), lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 1) % 7, t = today();
  return (
    <div className="cal">
      <div className="cal-head">{[tc("sat"), tc("sun"), tc("mon"), tc("tue"), tc("wed"), tc("thu"), tc("fri")].map((x) => <span key={x}>{x}</span>)}</div>
      <div className="cal-grid">
        {Array.from({ length: lead }, (_, i) => <div key={`o${i}`} className="cal-cell off" />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, "0")}`, items = byDay[iso] ?? [];
          return (
            <div key={iso} className={`cal-cell ${iso === t ? "today" : ""}`}>
              <span className="cal-d">{i + 1}</span>
              {items.slice(0, 3).map((x, j) => (
                <button key={j} type="button" className={`cal-item ${x.kind === "end" ? "warn" : TONE[x.state!]}`} onClick={() => onOpen(x.contractId)}
                  title={x.kind === "end" ? tc("endTitle", { code: x.code, client: x.client }) : tc("installmentTitle", { code: x.code, client: x.client, amount: money(x.amount) })}>
                  {x.kind === "end" ? tc("end", { code: x.code }) : `${x.client.split(" ")[0]} · ${money(x.amount)}`}
                </button>
              ))}
              {items.length > 3 && <small>+{items.length - 3}</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
