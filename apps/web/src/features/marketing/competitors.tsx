"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { CompetitorRow, HandInCard } from "@places/contracts";
import { Card, Chip, Icon, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";

const TONE = { done: "ok", waiting: "warn", late: "bad" } as const;
const cairoDayOfMonth = (iso: string) => Number(new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(8));

/**
 * The demo's «تقرير المنافسين الشهري» card on the marketing dashboard (marketing.js `compDue` · `compNew`): handed in
 * this month or not, the last three, and «سلّم تقرير الشهر ده» for the one the scheduled report names (11.10).
 */
export function CompetitorsReport() {
  const t = useTranslations("marketing.dashboard.competitors");
  const run = useAction();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["marketing-competitors"], queryFn: () => api.get<{ card: HandInCard | null }>("/marketing/competitors-report") });
  const c = q.data?.card;
  if (!c) return null;
  const dueDay = cairoDayOfMonth(c.due);
  const handIn = onFormSubmit((f) => run(async () => {
    await api.post(`/reports/scheduled/${c.id}/hand-in`, { note: String(f.get("name") ?? "") });
    await qc.invalidateQueries({ queryKey: ["marketing-competitors"] });
  }, t("handed")));
  return (
    <Card title={t("title")} icon="file" sub={t("sub", { day: dueDay })} extra={<Chip tone={TONE[c.state]}>{c.state === "done" ? t("done") : t("waiting", { day: dueDay })}</Chip>}>
      {c.recent.length ? c.recent.map((h) => (
        <div key={h.period} className="line-item"><span><b>{h.period.slice(0, 7)}</b>{h.note ? ` · ${h.note}` : ""}</span><small className="hint">{day(h.at)}</small></div>
      )) : <p className="hint">{t("none")}</p>}
      {c.canHandIn && c.state !== "done" && (
        <form className="row" onSubmit={handIn}>
          <input name="name" required maxLength={500} placeholder={t("name")} aria-label={t("name")} />
          <button className="btn ghost sm"><Icon name="upload" />{t("submit")}</button>
        </form>
      )}
      <Competitors />
    </Card>
  );
}

const cairoMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 7);

/** 14.14 · the report's competitors for a month: what they put out, and the marketing manager's «قوي / مش قوي». */
function Competitors() {
  const t = useTranslations("marketing.dashboard.competitors.rows");
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const [month, setMonth] = useState(cairoMonth);
  const key = ["marketing-competitor-rows", month];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<CompetitorRow[]>(`/marketing/competitors-report/rows?month=${month}`), enabled: /^\d{4}-\d{2}$/.test(month) });
  const done = (fn: () => Promise<unknown>, ok: string) => run(async () => { await fn(); await qc.invalidateQueries({ queryKey: key }); }, ok);
  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    void done(async () => {
      await api.post("/marketing/competitors-report/rows", { month, name: String(f.get("name") ?? ""), note: String(f.get("note") ?? "") || undefined });
      form.reset(); // only once it's saved: a refused one keeps what was typed
    }, t("added"));
  };
  const rate = (id: string, v: string) => done(() => api.patch(`/marketing/competitors-report/rows/${id}`, { strong: v === "" ? null : v === "1" }), t("rated"));
  const strength = (c: CompetitorRow) => can("marketing", "approve")
    ? <select value={c.strong === null ? "" : c.strong ? "1" : "0"} onChange={(e) => rate(c.id, e.target.value)} aria-label={t("strength")}><option value="">{t("unrated")}</option><option value="1">{t("strong")}</option><option value="0">{t("weak")}</option></select>
    : c.strong === null ? <span className="hint">{t("unrated")}</span> : <Chip tone={c.strong ? "bad" : "ok"}>{c.strong ? t("strong") : t("weak")}</Chip>;
  return (
    <>
      <div className="row">
        <h4 className="mini-h">{t("title")}</h4>
        <label className="date-f"><span>{t("month")}</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      </div>
      <Table head={[t("name"), t("note"), t("strength"), ""]} empty={t("empty")} rows={(q.data ?? []).map((c) => [
        <b key="n">{c.name}</b>, c.note ?? "—", strength(c),
        can("marketing", "delete") ? <button key="d" className="btn ghost sm" aria-label={t("remove")} onClick={() => done(() => api.del(`/marketing/competitors-report/rows/${c.id}`), t("removed"))}><Icon name="x" /></button> : null,
      ])} />
      {can("marketing", "create") && (
        <form className="row" onSubmit={add}>
          <input name="name" required maxLength={120} placeholder={t("name")} aria-label={t("name")} />
          <input name="note" maxLength={1000} placeholder={t("note")} aria-label={t("note")} />
          <button className="btn ghost sm"><Icon name="plus" />{t("add")}</button>
        </form>
      )}
    </>
  );
}
