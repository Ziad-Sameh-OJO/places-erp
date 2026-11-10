"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HandInCard } from "@places/contracts";
import { Card, Chip, Icon, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
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
    </Card>
  );
}
