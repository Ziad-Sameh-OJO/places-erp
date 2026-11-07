"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExcuseView } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, Table, onFormSubmit, useAction } from "@/components/ui";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const TONE: Record<ExcuseView["status"], "warn" | "info" | "ok" | "bad"> = { pending_tl: "warn", approved_tl: "info", confirmed: "ok", rejected: "bad", refused: "bad" };
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["hr"] }); };

/** «Excuse» on the profile (7.4): a ticket to the Team Leader then HR; 1–2 free, 3–4 half a day, the 5th refused. */
export function MyExcusesCard() {
  const t = useTranslations("hr");
  const q = useQuery({ queryKey: ["hr", "excuses", "mine"], queryFn: () => api.get<ExcuseView[]>("/hr/excuses/mine"), retry: false });
  const [ask, setAsk] = useState(false);
  const run = useAction();
  const refresh = useRefresh();
  if (!q.data) return null;
  const month = q.data.filter((x) => x.day.startsWith(today().slice(0, 7)) && x.status !== "rejected").length;
  return (
    <Card title="Excuse" icon="ticket" sub={t("excuses.mineSub", { month })} extra={<button className="btn sm" onClick={() => setAsk(true)}><Icon name="plus" />{t("excuses.ask")}</button>}>
      <Table head={[t("common.day"), "#", t("common.status"), t("excuses.ticket")]} empty={t("common.none")} rows={q.data.map((x) => [x.day, x.number, <span key="s"><Chip tone={TONE[x.status]}>{serverText(x.statusLabel)}</Chip>{x.rejectReason && <span className="sub">{x.rejectReason}</span>}</span>, x.ticket ?? "—"])} />
      {ask && (
        <Modal title={t("excuses.ask")} onClose={() => setAsk(false)}>
          <form className="grid" onSubmit={onFormSubmit(async (f) => run(async () => { await api.post("/hr/excuses", { day: f.get("day"), reason: f.get("reason") }); await refresh(); setAsk(false); }, t("excuses.sentToTl")))}>
            <Field label={t("common.day")} req><input name="day" type="date" defaultValue={today()} min={today()} required /></Field>
            <Field label={t("common.reason")} req wide><input name="reason" required minLength={2} maxLength={300} /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setAsk(false)}>{t("common.cancel")}</button><button className="btn">{t("excuses.send")}</button></div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

/** HR / the Team Leader: the Excuses in scope, the ones waiting for me first (inside «الإجازات»). */
export function ExcusesCard() {
  const t = useTranslations("hr");
  const q = useQuery({ queryKey: ["hr", "excuses", "list"], queryFn: () => api.get<ExcuseView[]>("/hr/excuses") });
  const [reject, setReject] = useState<ExcuseView | null>(null);
  const run = useAction();
  const refresh = useRefresh();
  if (!q.data) return null;
  const rows = [...q.data].sort((a, b) => Number(!!b.canDecide) - Number(!!a.canDecide));
  const approve = (x: ExcuseView) => run(async () => { await api.post(`/hr/excuses/${x.id}/approve`); await refresh(); }, x.canDecide === "tl" ? t("common.approvedToHr") : t("excuses.confirmedOk"));
  return (
    <Card title={t("excuses.title")} icon="ticket" sub={t("excuses.sub")} extra={rows.some((x) => x.canDecide) ? <Chip tone="warn">{rows.filter((x) => x.canDecide).length}</Chip> : undefined}>
      <Table head={[t("common.employee"), t("common.day"), "#", t("excuses.cost"), t("common.reason"), t("common.status"), ""]} empty={t("common.none")} rows={rows.map((x) => [<b key="n">{x.name}</b>, x.day, x.number, serverText(x.cost), x.reason,
        <Chip key="s" tone={TONE[x.status]}>{serverText(x.statusLabel)}</Chip>,
        x.canDecide ? <span key="a" className="row"><button className="btn sm" onClick={() => void approve(x)}>{x.canDecide === "tl" ? t("common.approve") : t("excuses.confirm")}</button><button className="btn ghost sm" onClick={() => setReject(x)}>{t("common.reject")}</button></span> : ""])} />
      {reject && (
        <Modal title={t("excuses.rejectTitle")} onClose={() => setReject(null)}>
          <form className="grid" onSubmit={onFormSubmit(async (f) => run(async () => { await api.post(`/hr/excuses/${reject.id}/reject`, { reason: f.get("reason") }); await refresh(); setReject(null); }, t("common.rejected")))}>
            <Field label={t("common.reason")} req wide><input name="reason" required minLength={2} /></Field>
            <div className="row end wide"><button className="btn danger">{t("common.reject")}</button></div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
