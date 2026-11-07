"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HolidayView } from "@places/contracts";
import { Chip, Icon, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { dateLocale, num } from "@/lib/format";

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "long" });
const cairoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/**
 * The demo's U.holidays: the official holidays as ranges «من … لحد …» (1.29: an Eid is several days), shared by the
 * settings page (M-13, `/settings/holidays`) and the lead rules' SLA tab (`/leads/rules/holidays`, upcoming only).
 * «لحد» left empty = one day.
 */
export function Holidays({ path, editable, upcoming = false }: { path: string; editable: boolean; upcoming?: boolean }) {
  const t = useTranslations("ui.holidays");
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: ["holidays"], queryFn: () => api.get<HolidayView[]>(path) });
  const today = cairoToday();
  const rows = (q.data ?? []).filter((h) => !upcoming || h.to >= today);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["holidays"] }), qc.invalidateQueries({ queryKey: ["leads-summary"] })]);
  const add = (d: FormData, form: HTMLFormElement) => {
    const from = String(d.get("from") ?? ""), to = String(d.get("to") ?? "") || from;
    void run(async () => { await api.post(path, { from, to, label: String(d.get("label") ?? "").trim() }); form.reset(); await refresh(); }, t("added"));
  };
  return (
    <>
      <Table head={[t("holiday"), t("from"), t("to"), t("days"), ""]} empty={upcoming ? t("emptyUpcoming") : t("emptyAll")} rows={rows.map((h) => [
        <span key="l"><b>{h.label}</b>{h.from <= today && today <= h.to && <> <Chip tone="warn">{t("today")}</Chip></>}</span>,
        fmt(h.from), fmt(h.to),
        <span key="n" className="num">{num((Date.parse(h.to) - Date.parse(h.from)) / 86_400_000 + 1)}</span>,
        editable ? <button key="x" className="btn ghost sm" aria-label={t("remove", { label: h.label })} onClick={() => void run(async () => { await api.del(`${path}/${h.id}`); await refresh(); }, t("removed"))}><Icon name="x" /></button> : "",
      ])} />
      {editable && (
        <form className="row" onSubmit={(e) => { const form = e.currentTarget; onFormSubmit((d) => add(d, form))(e); }}>
          <input name="label" placeholder={t("namePlaceholder")} aria-label={t("name")} required minLength={2} maxLength={80} />
          <label className="field inline"><span>{t("from")}</span><input type="date" name="from" required /></label>
          <label className="field inline"><span>{t("to")}</span><input type="date" name="to" aria-label={t("toLabel")} /></label>
          <button className="btn ghost"><Icon name="plus" />{t("add")}</button>
        </form>
      )}
    </>
  );
}
