"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const qc = useQueryClient();
  const run = useAction();
  const d = today();
  const q = useQuery({ queryKey: ["inventory-report", d], queryFn: () => api.get<InventoryReportView>(`/inventory/daily-report?day=${d}`), retry: false });
  const r = q.data;
  const approve = () => void run(async () => {
    await api.post(`/inventory/daily-report/${d}/approve`);
    await qc.invalidateQueries({ queryKey: ["inventory-report"] });
  }, "التقرير اتبعت");
  return (
    <Modal title={`التقرير اليومي · ${day(d)}`} onClose={onClose}>
      {q.error ? <Note kind="warn">{q.error.message}</Note> : !r ? <p className="hint">بيحمّل…</p> : <>
        <div className="kpis sm">
          <KpiTile label="جديد" value={num(r.newUnits)} sub="النهارده" icon="building" />
          <KpiTile label="متحدّث" value={num(r.updated)} sub="النهارده" icon="building" />
          <KpiTile label="اتأجر / اتباع" value={num(r.closed)} sub="النهارده" icon="building" />
          <KpiTile label="مش مؤكد" value={num(r.unconfirmed)} sub="النهارده" icon="building" />
        </div>
        {r.approvedAt
          ? <Note>اتبعت {dayTime(r.approvedAt)} من {r.approvedBy?.name}.</Note>
          : <div className="row end"><button className="btn" onClick={approve}><Icon name="send" />اعتمد وابعت للإدارة</button></div>}
      </>}
    </Modal>
  );
}
