"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { LeadBatchResult } from "@places/contracts";
import { PICKABLE_STAGES } from "@places/domain";
import { Icon, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { useLeadOptions } from "./use-leads";

/** Visit / Meeting need a time and units (1.9): from the lead's drawer, not in bulk (demo leaves Visit out). */
const STAGES = PICKABLE_STAGES.filter((s) => s !== "Visit" && s !== "Meeting"); // the stages picked by hand (client, 11 Nov)

/**
 * The demo's bulk bar (shell.js renderBulk): «n ليد متحدد · حوّل لسيلز… · غيّر المرحلة… · طبّق · أرشفة · إلغاء التحديد».
 * Each lead goes through the API's single-lead rules (scope, hand assignment uses up a turn, audit); the toast says
 * how many went through and why any didn't.
 */
export function BulkBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const t = useTranslations("leads.bulkBar");
  const { can } = useMe();
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const people = useLeadOptions().data?.assignable ?? [];
  const [to, setTo] = useState("");
  const [stage, setStage] = useState("");
  // the toasts move up while the bar is on screen (app.css .has-bulk)
  useEffect(() => { document.body.classList.add("has-bulk"); return () => document.body.classList.remove("has-bulk"); }, []);
  const after = async (r: LeadBatchResult, what: "applied" | "archived") => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["leads"] }), qc.invalidateQueries({ queryKey: ["leads-summary"] }), qc.invalidateQueries({ queryKey: ["lead"] }), qc.invalidateQueries({ queryKey: ["lead-second-calls"] })]);
    onDone();
    toast(r.failed.length ? t("someFailed", { what: t(what, { count: r.done }), failed: r.failed.length, error: serverText(r.failed[0]!.error) }) : t(what, { count: r.done }), r.failed.length ? "bad" : undefined);
  };
  const apply = () => {
    if (!to && !stage) { toast(t("pickOne")); return; }
    void run(async () => after(await api.post<LeadBatchResult>("/leads/batch", { ids, ...(to ? { to } : {}), ...(stage ? { stage } : {}) }), "applied"));
  };
  const archive = () => void run(async () => after(await api.post<LeadBatchResult>("/leads/batch/archive", { ids }), "archived"));
  // on <body>, like the Modal: the page's entrance animation makes a fixed bar inside it scroll with the page
  return createPortal(
    <div className="bulk" role="toolbar" aria-label={t("label")}>
      <b className="num">{ids.length}</b><span>{t("selected")}</span>
      {can("leads", "approve") && (
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("moveTo")}>
          <option value="">{t("moveToSales")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {can("leads", "edit") && (
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label={t("changeStage")}>
          <option value="">{t("changeStageAll")}</option>{STAGES.map((s) => <option key={s} value={s}>{serverText(s)}</option>)}
        </select>
      )}
      <button className="btn sm" onClick={apply}>{t("apply")}</button>
      {can("leads", "delete") && <button className="btn ghost sm" onClick={archive}><Icon name="x" />{t("archive")}</button>}
      <button className="btn ghost sm" onClick={onDone}>{t("clear")}</button>
    </div>,
    document.body,
  );
}
