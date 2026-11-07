"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MailLogRow, Paged } from "@places/contracts";
import { MAIL_STATUS_LABEL } from "@places/domain";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { Card, Chip, Table, Tabs } from "@/components/ui";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";

type Filter = "all" | MailLogRow["status"];
const TONE = { queued: "info", sent: "", read: "ok", failed: "bad" } as const;

/** M-14 3.1 · 3.3 · 6.1: every email the system sent, whether it was read, and the ones that failed (and why). */
export function MailLog() {
  const t = useTranslations("notifications.mailLog");
  const [f, setF] = useState<Filter>("all");
  const q = useQuery({
    queryKey: ["mail-log", f],
    queryFn: () => api.get<Paged<MailLogRow>>(`/notifications/mail-log?pageSize=50${f === "all" ? "" : `&status=${f}`}`),
  });
  return (
    <Card title={t("title")} icon="send" sub={t("sub")}>
      <div className="row">
        <Tabs value={f} onChange={setF} items={[["all", t("all")], ["sent", serverText(MAIL_STATUS_LABEL.sent)], ["read", serverText(MAIL_STATUS_LABEL.read)], ["failed", serverText(MAIL_STATUS_LABEL.failed)], ["queued", serverText(MAIL_STATUS_LABEL.queued)]]} />
      </div>
      <Table head={[t("head.time"), t("head.to"), t("head.subject"), t("head.status"), t("head.note")]} empty={t("empty")}
        rows={(q.data?.items ?? []).map((m) => [
          dayTime(m.createdAt), <span key="to" dir="ltr">{m.to}</span>, serverText(m.subject),
          <Chip key="s" tone={TONE[m.status]}>{serverText(MAIL_STATUS_LABEL[m.status])}</Chip>,
          m.status === "read" && m.readAt ? t("readAt", { at: dayTime(m.readAt) }) : m.error ? serverText(m.error) : "",
        ])} />
      {q.data && q.data.total > q.data.items.length && <p className="hint">{t("lastOf", { shown: q.data.items.length, total: q.data.total })}</p>}
    </Card>
  );
}
