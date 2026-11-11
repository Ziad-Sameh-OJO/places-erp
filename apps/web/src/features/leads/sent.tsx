"use client";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { SentLeads } from "@places/contracts";
import { Chip, Note, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, day } from "@/lib/format";

type View = "today" | "all" | "noAnswer";
const PAGE = 50;
const fetchSent = (view: View, page: number) =>
  api.get<SentLeads>(`/leads/sent?range=${view === "today" ? "today" : "all"}${view === "noAnswer" ? "&noAnswer=1" : ""}&page=${page}&pageSize=${PAGE}`);

/** The tab's count: the leads in No Answer now (what she'd act on). */
export const useSentCounts = (enabled: boolean) =>
  useQuery({ queryKey: ["leads-sent", "today", 1], queryFn: () => fetchSent("today", 1), enabled, staleTime: 30_000 }).data?.counts;

/**
 * M-01 · Telesales' «اللي بعتيها» (client, 11 Nov): the leads she entered that went to sales — to whom and when, never
 * what the salesperson did; «No Answer» = in No Answer now, gone from there the moment it gets another action.
 */
export function SentView() {
  const t = useTranslations("leads.sent");
  const [view, setView] = useState<View>("today");
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["leads-sent", view, page], queryFn: () => fetchSent(view, page), placeholderData: keepPreviousData });
  const d = q.data;
  const pages = Math.max(1, Math.ceil((d?.total ?? 0) / PAGE));
  const go = (v: View) => { setView(v); setPage(1); };
  return (
    <>
      <Note>{t("note")}</Note>
      <div className="row">
        <div className="seg" role="group" aria-label={t("filter")}>
          <button aria-pressed={view === "today"} onClick={() => go("today")}>{t("today")} <span className="num">{d?.counts.today ?? 0}</span></button>
          <button aria-pressed={view === "all"} onClick={() => go("all")}>{t("all")} <span className="num">{d?.counts.all ?? 0}</span></button>
          <button aria-pressed={view === "noAnswer"} onClick={() => go("noAnswer")}>No Answer <span className="num">{d?.counts.noAnswer ?? 0}</span></button>
        </div>
        {view === "noAnswer" && <span className="hint">{t("noAnswerHint")}</span>}
      </div>
      <Table head={[t("head.lead"), t("head.phone"), "Area · Type", t("head.to"), t("head.sent"), ""]}
        empty={view === "noAnswer" ? t("emptyNoAnswer") : view === "today" ? t("emptyToday") : t("empty")}
        rows={(d?.items ?? []).map((l) => [
          <span key="n" className="wrap"><b>{l.name}</b><span className="sub mono">{l.code}</span></span>,
          <span key="p" className="mono" dir="ltr">{l.phones.join(" · ")}</span>,
          `${l.area} · ${l.type}`,
          l.to ?? <span key="o" className="hint">{t("operations")}</span>,
          <span key="s" title={day(l.sentAt)}>{ago(l.sentAt)}</span>,
          l.noAnswer ? <Chip key="c" tone="warn">No Answer</Chip> : "",
        ])} />
      {pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</button>
        </div>
      )}
    </>
  );
}
