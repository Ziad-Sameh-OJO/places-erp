"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ListRequestRow, ListRequests, UnitRow } from "@places/contracts";
import { Chip, Empty, Field, Icon, Modal, Note, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, num } from "@/lib/format";
import { useUnits } from "./use-units";

const KEY = ["list-requests"];
const HOUR = 3_600_000;
/** The List's SLA (domain TICKET_TYPES «list»: 24 hours on the clock). */
const SLA_HOURS = 24;

/** The requests the person sees and what they may do (the API decides both). */
export function useListRequests(enabled = true) {
  return useQuery({ queryKey: KEY, queryFn: () => api.get<ListRequests>("/inventory/list-requests"), enabled });
}

/**
 * 2.32 · «طلبات الـ Lists» (demo invwork.js listReqs): a Team Leader asks for a List in words; the inventory team
 * sees every request and «جهّز وابعت». Each request shows its age against the 24 hours and its unconfirmed units.
 */
export function ListRequestsModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("inventory.lists");
  const qc = useQueryClient();
  const run = useAction();
  const data = useListRequests().data;
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<ListRequestRow | null>(null);
  const ask = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, text = String(new FormData(form).get("text") ?? "");
    setBusy(true);
    void run(async () => {
      try {
        await api.post("/inventory/list-requests", { text });
        form.reset();
        await qc.invalidateQueries({ queryKey: KEY });
      } finally { setBusy(false); }
    }, t("asked"));
  };
  if (sending) return <SendListModal request={sending} onClose={() => setSending(null)} />;
  const rows = (data?.items ?? []).map((x) => [
    <span key="t">{x.text}{x.units.length > 0 && <span className="sub mono">{x.units.join(" · ")}</span>}</span>,
    x.by.name,
    ago(x.createdAt),
    <Status key="s" x={x} />,
    !x.doneAt && data?.canSend ? <button key="b" className="btn sm" onClick={() => setSending(x)}>{t("prepare")}</button> : null,
  ]);
  return (
    <Modal title={t("title")} onClose={onClose}>
      {data?.canAsk && (
        <form className="row" onSubmit={ask}>
          <input name="text" required minLength={3} maxLength={500} placeholder={t("placeholder")} aria-label={t("placeholder")} style={{ flex: 1 }} />
          <button className="btn sm" disabled={busy}><Icon name="send" />{t("ask")}</button>
        </form>
      )}
      {data && (data.items.length ? <Table head={[t("request"), t("who"), t("asked_at"), t("status"), ""]} rows={rows} /> : <Empty text={t("none")} icon="list" />)}
      <Note>{t("note")}</Note>
    </Modal>
  );
}

function Status({ x }: { x: ListRequestRow }) {
  const t = useTranslations("inventory.lists");
  const hours = ((x.doneAt ? new Date(x.doneAt).getTime() : Date.now()) - new Date(x.createdAt).getTime()) / HOUR;
  return (
    <>
      {x.doneAt
        ? hours <= SLA_HOURS ? <Chip tone="ok">{t("sentInTime")}</Chip> : <Chip tone="warn">{t("sentAfter", { hours: Math.round(hours) })}</Chip>
        : hours > SLA_HOURS ? <Chip tone="bad">{t("late")}</Chip> : <Chip tone="warn">{t("waiting")}</Chip>}
      {x.unconfirmed > 0 && <Chip tone="bad">{t("unconfirmed", { count: x.unconfirmed })}</Chip>}
    </>
  );
}

/**
 * «جهّز وابعت» (demo invwork.js listDo): the open, confirmed units, searched by code, project or space and picked across
 * searches; a unit a month without an update says «مش مؤكدة», and sending it asks first (it counts against Marwa's quality).
 */
function SendListModal({ request, onClose }: { request: ListRequestRow; onClose: () => void }) {
  const t = useTranslations("inventory.lists");
  const qc = useQueryClient();
  const run = useAction();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<UnitRow[]>([]);
  const [busy, setBusy] = useState(false);
  // the API sends a salesperson's view (confirmed only) to Marwa; the inventory managers also see drafts, left out here
  const found = (useUnits(q ? { q } : {}, 1, 50).data?.items ?? []).filter((u) => u.pdfStatus === "confirmed");
  const label = (u: UnitRow) => `${u.code} · ${u.project} · ${t("meters", { space: num(u.space) })}${u.stale ? ` · ${t("notConfirmed")}` : ""}`;
  const toggle = (u: UnitRow) => setPicked(picked.some((p) => p.id === u.id) ? picked.filter((p) => p.id !== u.id) : [...picked, u]);
  const send = () => {
    const bad = picked.filter((u) => u.stale).map((u) => u.code);
    if (bad.length && !window.confirm(t("confirmUnconfirmed", { codes: bad.join("، ") }))) return;
    setBusy(true);
    void run(async () => {
      try {
        await api.post(`/inventory/list-requests/${request.id}/send`, { unitIds: picked.map((u) => u.id), sendAnyway: bad.length > 0 });
        await qc.invalidateQueries({ queryKey: KEY });
        onClose();
      } finally { setBusy(false); }
    }, t("sent"));
  };
  return (
    <Modal title={`List · ${request.text}`} onClose={onClose}>
      <div className="grid">
        <Field label={t("search")} wide>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchHint")} />
        </Field>
        <Field label={t("units")} req wide>
          <div role="group" aria-label={t("units")} style={{ maxHeight: 280, overflowY: "auto" }}>
            {[...picked, ...found.filter((u) => !picked.some((p) => p.id === u.id))].map((u) => (
              <label key={u.id} className="line-item" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={picked.some((p) => p.id === u.id)} onChange={() => toggle(u)} />
                <span>{label(u)}</span>
              </label>
            ))}
            {!found.length && !picked.length && <p className="hint">{t("noUnits")}</p>}
          </div>
        </Field>
        {picked.length > 0 && <div className="row wide">{picked.map((u) => <Chip key={u.id} tone={u.stale ? "bad" : "ok"}>{u.code}</Chip>)}</div>}
        <div className="row end wide"><button className="btn" disabled={busy || !picked.length} onClick={send}><Icon name="send" />{t("send")}</button></div>
      </div>
    </Modal>
  );
}
