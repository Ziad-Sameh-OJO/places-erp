"use client";
import { useQuery } from "@tanstack/react-query";
import type { HandoverRow } from "@places/contracts";
import { Card, Chip, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";

/** M-09 2.2 · 7.1 on the home page: a leaver's work waits for their direct manager's yes before it moves. */
export function HandoversCard() {
  const t = useTranslations("access.handovers");
  const run = useAction();
  const q = useQuery({ queryKey: ["handovers", "mine"], queryFn: () => api.get<HandoverRow[]>("/access/handovers/mine") });
  if (!q.data?.length) return null;
  const decide = (h: HandoverRow, approve: boolean) => run(async () => { await api.post(`/access/handovers/${h.id}/decision`, { approve }); await q.refetch(); },
    approve ? t("moved", { from: h.from, to: h.to }) : t("refused"));
  return (
    <Card title={t("title")} icon="users" sub={t("sub")}>
      {q.data.map((h) => (
        <div className="line-item" key={h.id}>
          <span><b>{h.from}</b> {t("arrow")} {h.to}<small className="hint">{t("by", { name: h.by })}</small></span>
          <span className="row"><Chip plain>{t("leads", { count: h.leads })}</Chip><Chip plain>{t("tasks", { count: h.tasks })}</Chip>
            <button className="btn sm" onClick={() => decide(h, true)}>{t("approve")}</button>
            <button className="btn ghost sm" onClick={() => decide(h, false)}>{t("refuse")}</button></span>
        </div>
      ))}
    </Card>
  );
}
