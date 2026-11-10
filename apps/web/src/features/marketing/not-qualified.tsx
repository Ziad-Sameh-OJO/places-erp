"use client";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { NOT_QUALIFIED_ROWS, type NotQualifiedView } from "@places/contracts";
import { Card, Chip, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { dayTime, num } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useTranslations } from "next-intl";

/** The reasons' chip tones (demo marketing.js NQ); their words are in marketing.dashboard.notQualified.reasons. */
const TONE: Record<string, "warn" | "bad" | "info" | ""> = { "No Answer": "warn", "Not Interested": "bad", Fresh: "info", Cancellation: "bad", Hold: "" };
const KEY: Record<string, "noAnswer" | "notInterested" | "fresh" | "cancellation" | "hold"> = { "No Answer": "noAnswer", "Not Interested": "notInterested", Fresh: "fresh", Cancellation: "cancellation", Hold: "hold" };

/**
 * 4.18 · the demo's «الليدز اللي ماكانتش Qualified» (marketing.js `notQualified`): follows the dashboard's filter; the
 * reason is the lead's stage (what the salesperson did) + his latest comment and who wrote it.
 */
export function NotQualified({ filter }: { filter: Record<string, string> }) {
  const t = useTranslations("marketing.dashboard.notQualified");
  const [reason, setReason] = useState("");
  const qs = new URLSearchParams({ ...filter, ...(reason ? { reason } : {}) }).toString();
  const q = useQuery({ queryKey: ["marketing-not-qualified", qs], queryFn: () => api.get<NotQualifiedView>(`/marketing/campaigns/not-qualified?${qs}`), placeholderData: keepPreviousData });
  const d = q.data;
  const label = (r: string) => { const k = KEY[r]; return k ? t(`reasons.${k}`) : r; };
  return (
    <Card title={t("title")} icon="users" sub={t("sub")} extra={d && <Chip tone={d.notQualified ? "bad" : "ok"}>{t("of", { n: d.notQualified, total: d.total })}</Chip>}>
      {!d ? null : d.notQualified ? (
        <>
          <div className="row">
            <div className="seg" role="group" aria-label={t("reason")}>
              <button aria-pressed={!reason} onClick={() => setReason("")}>{t("all", { n: d.notQualified })}</button>
              {d.byReason.map((r) => <button key={r.reason} aria-pressed={reason === r.reason} onClick={() => setReason(r.reason)}>{`${label(r.reason)} (${r.count})`}</button>)}
            </div>
          </div>
          <Bars rows={d.byReason.map((r) => ({ label: label(r.reason), sub: t("share", { pct: Math.round((r.count / d.notQualified) * 100) }), value: r.count }))} />
          <Table
            head={[t("head.lead"), t("head.source"), t("head.reason"), t("head.comment"), t("head.by"), t("head.when")]}
            rows={d.rows.map((l) => [
              <span key="l"><b>{l.name}</b><span className="sub mono">{l.code}</span></span>,
              <span key="s">{serverText(l.channel) || "—"}{l.campaign && <span className="sub">{l.campaign}</span>}</span>,
              <Chip key="r" tone={TONE[l.reason] ?? ""}>{label(l.reason)}</Chip>,
              <span key="c" className="wrap">{l.comment ? l.comment.text : <span className="hint">{t("noComment")}</span>}</span>,
              l.comment?.by || "—",
              l.comment ? dayTime(l.comment.at) : "—",
            ])}
          />
          {d.matching > NOT_QUALIFIED_ROWS && <p className="hint">{t("more", { n: NOT_QUALIFIED_ROWS, total: d.matching })}</p>}
        </>
      ) : <p className="hint">{t("allQualified")}</p>}
    </Card>
  );
}

/** demo ui.js `U.hbars` with each row's note under its label */
function Bars({ rows }: { rows: { label: string; sub: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => <div key={r.label} className="hb"><span className="hb-l">{r.label}<small>{r.sub}</small></span><div className="bar"><i style={{ width: `${(r.value / max) * 100}%` }} /></div><span className="hb-v">{num(r.value)}</span></div>)}
    </div>
  );
}
