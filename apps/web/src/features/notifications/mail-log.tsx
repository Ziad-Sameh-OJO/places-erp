"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MailLogRow, Paged } from "@places/contracts";
import { MAIL_STATUS_LABEL } from "@places/domain";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { Card, Chip, Table, Tabs } from "@/components/ui";

type Filter = "all" | MailLogRow["status"];
const TONE = { queued: "info", sent: "", read: "ok", failed: "bad" } as const;

/** M-14 3.1 · 3.3 · 6.1: every email the system sent, whether it was read, and the ones that failed (and why). */
export function MailLog() {
  const [f, setF] = useState<Filter>("all");
  const q = useQuery({
    queryKey: ["mail-log", f],
    queryFn: () => api.get<Paged<MailLogRow>>(`/notifications/mail-log?pageSize=50${f === "all" ? "" : `&status=${f}`}`),
  });
  return (
    <Card title="سجل الإيميلات" icon="send" sub="اتبعت إمتى واتقري إمتى · والإيميلات اللي فشلت بتوصل تنبيه للـ Super Admin">
      <div className="row">
        <Tabs value={f} onChange={setF} items={[["all", "الكل"], ["sent", MAIL_STATUS_LABEL.sent], ["read", MAIL_STATUS_LABEL.read], ["failed", MAIL_STATUS_LABEL.failed], ["queued", MAIL_STATUS_LABEL.queued]]} />
      </div>
      <Table head={["الوقت", "لمين", "الموضوع", "الحالة", "ملاحظة"]} empty="مفيش إيميلات"
        rows={(q.data?.items ?? []).map((m) => [
          dayTime(m.createdAt), <span key="to" dir="ltr">{m.to}</span>, m.subject,
          <Chip key="s" tone={TONE[m.status]}>{MAIL_STATUS_LABEL[m.status]}</Chip>,
          m.status === "read" && m.readAt ? `اتقرا ${dayTime(m.readAt)}` : m.error ?? "",
        ])} />
      {q.data && q.data.total > q.data.items.length && <p className="hint">آخر {q.data.items.length} من {q.data.total}</p>}
    </Card>
  );
}
