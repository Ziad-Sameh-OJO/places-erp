"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { HISTORICAL_KINDS, type HistoricalFigures } from "@places/contracts";
import { periodChoices, quarterLabel } from "@places/domain";
import { Card, Empty, Icon, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { PeriodPicker, periodParams } from "@/components/period-picker";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

const useHistory = (period: string, enabled = true) =>
  useQuery({ queryKey: ["kpis", "history", period], queryFn: () => api.get<HistoricalFigures>(`/kpis/history?${periodParams(period)}`), enabled: enabled && !!period, retry: false });

/** 14.12 · a past quarter's figures typed by hand: the table, and (`edit`) the form and «امسح». */
export function HistoryFigures({ period, edit = false }: { period: string; edit?: boolean }) {
  const t = useTranslations("kpis.history");
  const q = useHistory(period);
  const run = useAction(), qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["kpis", "history", period] });
  if (!q.data) return null;
  const v = q.data;
  // a read-only view under the board shows nothing when the quarter has no typed figures
  if (!edit && !v.rows.length) return null;
  const save = (d: FormData) => void run(async () => {
    await api.post("/kpis/history", {
      year: Number(period.slice(0, 4)), quarter: Number(period.slice(-1)), employeeId: String(d.get("employeeId") ?? ""),
      kind: String(d.get("kind") ?? ""), value: String(d.get("value") ?? ""), note: String(d.get("note") ?? "") || undefined,
    });
    await refresh();
  }, t("saved"));
  const del = (id: string) => void run(async () => { await api.del(`/kpis/history/${id}`); await refresh(); }, t("removed"));
  return (
    <Card title={t("title", { period: quarterLabel(period) })} icon="clock">
      <Table head={[t("person"), t("kind"), t("value"), t("note2"), t("by"), ...(edit ? [""] : [])]} empty={t("empty")}
        rows={v.rows.map((r) => [
          <b key="n">{r.name}</b>, t(`kinds.${r.kind}`), <span key="v" className="num">{r.kind === "score" ? `${Number(r.value)}%` : money(r.value)}</span>, r.note ?? "", r.by,
          ...(edit ? [<button key="x" className="btn ghost sm" onClick={() => del(r.id)} aria-label={t("remove")}><Icon name="x" /></button>] : []),
        ])} />
      {edit && (
        <form className="row" onSubmit={onFormSubmit(save)}>
          <select name="employeeId" required defaultValue="" aria-label={t("person")}>
            <option value="" disabled>{t("pickPerson")}</option>
            {v.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="kind" required defaultValue="score" aria-label={t("kind")}>
            {HISTORICAL_KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
          </select>
          <input name="value" type="number" step="0.01" min="0" required placeholder={t("value")} aria-label={t("value")} style={{ maxWidth: 140 }} />
          <input name="note" maxLength={300} placeholder={t("note2")} aria-label={t("note2")} />
          <button className="btn ghost sm"><Icon name="plus" />{t("add")}</button>
        </form>
      )}
    </Card>
  );
}

/** «أرباع فاتت»: the admins and HR type a quarter's figures before the system (Q4 2025). */
export function HistoryTab() {
  const t = useTranslations("kpis.history");
  const [period, setPeriod] = useState(() => periodChoices(new Date(), -1)[0]?.id ?? "");
  if (!period) return <Empty text={t("empty")} />;
  return (
    <>
      <Note>{t("note")}</Note>
      <div className="toolbar"><PeriodPicker value={period} onChange={setPeriod} past /></div>
      <HistoryFigures period={period} edit />
    </>
  );
}
