"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { InventoryReportView } from "@places/contracts";
import { KpiTile } from "@/components/blocks";
import { Icon, Modal, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day, dayTime, num } from "@/lib/format";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/**
 * 2.18 · «التقرير اليومي» (demo invwork.js invReport): the four numbers the system counted at the end of the day, and
 * Manar's «اعتمد وابعت للإدارة» — or who sent it and when.
 */
export function DailyReportModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("inventory.dailyReport");
  const tc = useTranslations("inventory.common");
  const qc = useQueryClient();
  const run = useAction();
  const d = today();
  const q = useQuery({ queryKey: ["inventory-report", d], queryFn: () => api.get<InventoryReportView>(`/inventory/daily-report?day=${d}`), retry: false });
  const r = q.data;
  const approve = () => void run(async () => {
    await api.post(`/inventory/daily-report/${d}/approve`);
    await qc.invalidateQueries({ queryKey: ["inventory-report"] });
  }, t("sent"));
  return (
    <Modal title={t("title", { day: day(d) })} onClose={onClose}>
      {q.error ? <Note kind="warn">{q.error.message}</Note> : !r ? <p className="hint">{tc("loading")}</p> : <>
        <div className="kpis sm">
          <KpiTile label={t("new")} value={num(r.newUnits)} sub={t("today")} icon="building" />
          <KpiTile label={t("updated")} value={num(r.updated)} sub={t("today")} icon="building" />
          <KpiTile label={t("closed")} value={num(r.closed)} sub={t("today")} icon="building" />
          <KpiTile label={t("unconfirmed")} value={num(r.unconfirmed)} sub={t("today")} icon="building" />
        </div>
        {r.approvedAt
          ? <Note>{t("sentBy", { at: dayTime(r.approvedAt), name: r.approvedBy?.name ?? "" })}</Note>
          : <div className="row end"><button className="btn" onClick={approve}><Icon name="send" />{t("approve")}</button></div>}
      </>}
    </Modal>
  );
}
