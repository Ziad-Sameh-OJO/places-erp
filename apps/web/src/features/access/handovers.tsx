"use client";
import { useQuery } from "@tanstack/react-query";
import type { HandoverRow } from "@places/contracts";
import { Card, Chip, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/** M-09 2.2 · 7.1 on the home page: a leaver's work waits for their direct manager's yes before it moves. */
export function HandoversCard() {
  const run = useAction();
  const q = useQuery({ queryKey: ["handovers", "mine"], queryFn: () => api.get<HandoverRow[]>("/access/handovers/mine") });
  if (!q.data?.length) return null;
  const decide = (h: HandoverRow, approve: boolean) => run(async () => { await api.post(`/access/handovers/${h.id}/decision`, { approve }); await q.refetch(); },
    approve ? `شغل ${h.from} اتنقل لـ ${h.to}` : "الطلب اترفض");
  return (
    <Card title="نقل شغل مستني موافقتك" icon="users" sub="موظف مشي · ليدزه ومهامه المفتوحة تتنقل بموافقتك">
      {q.data.map((h) => (
        <div className="line-item" key={h.id}>
          <span><b>{h.from}</b> ← {h.to}<small className="hint">طلب {h.by}</small></span>
          <span className="row"><Chip plain>{h.leads} ليد</Chip><Chip plain>{h.tasks} مهمة</Chip>
            <button className="btn sm" onClick={() => decide(h, true)}>وافق</button>
            <button className="btn ghost sm" onClick={() => decide(h, false)}>ارفض</button></span>
        </div>
      ))}
    </Card>
  );
}
