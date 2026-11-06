"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { LeadBatchResult } from "@places/contracts";
import { LEAD_STAGES } from "@places/domain";
import { Icon, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useLeadOptions } from "./use-leads";

/** Visit / Meeting need a time and units (1.9): from the lead's drawer, not in bulk (demo leaves Visit out). */
const STAGES = LEAD_STAGES.filter((s) => s !== "Visit" && s !== "Meeting");

/**
 * The demo's bulk bar (shell.js renderBulk): «n ليد متحدد · حوّل لسيلز… · غيّر المرحلة… · طبّق · أرشفة · إلغاء التحديد».
 * Each lead goes through the API's single-lead rules (scope, hand assignment uses up a turn, audit); the toast says
 * how many went through and why any didn't.
 */
export function BulkBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const { can } = useMe();
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const people = useLeadOptions().data?.assignable ?? [];
  const [to, setTo] = useState("");
  const [stage, setStage] = useState("");
  // the toasts move up while the bar is on screen (app.css .has-bulk)
  useEffect(() => { document.body.classList.add("has-bulk"); return () => document.body.classList.remove("has-bulk"); }, []);
  const after = async (r: LeadBatchResult, what: string) => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["leads"] }), qc.invalidateQueries({ queryKey: ["leads-summary"] }), qc.invalidateQueries({ queryKey: ["lead"] }), qc.invalidateQueries({ queryKey: ["lead-second-calls"] })]);
    onDone();
    toast(r.failed.length ? `${what} ${r.done} ليد · ${r.failed.length} متطبقش: ${r.failed[0]!.error}` : `${what} ${r.done} ليد`, r.failed.length ? "bad" : undefined);
  };
  const apply = () => {
    if (!to && !stage) { toast("اختار سيلز أو مرحلة"); return; }
    void run(async () => after(await api.post<LeadBatchResult>("/leads/batch", { ids, ...(to ? { to } : {}), ...(stage ? { stage } : {}) }), "اتطبّق على"));
  };
  const archive = () => void run(async () => after(await api.post<LeadBatchResult>("/leads/batch/archive", { ids }), "اتأرشف"));
  // on <body>, like the Modal: the page's entrance animation makes a fixed bar inside it scroll with the page
  return createPortal(
    <div className="bulk" role="toolbar" aria-label="الليدز المتحددة">
      <b className="num">{ids.length}</b><span>ليد متحدد</span>
      {can("leads", "approve") && (
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="حوّل لـ">
          <option value="">حوّل لسيلز…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {can("leads", "edit") && (
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="غيّر المرحلة">
          <option value="">غيّر المرحلة…</option>{STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
      )}
      <button className="btn sm" onClick={apply}>طبّق</button>
      {can("leads", "delete") && <button className="btn ghost sm" onClick={archive}><Icon name="x" />أرشفة</button>}
      <button className="btn ghost sm" onClick={onDone}>إلغاء التحديد</button>
    </div>,
    document.body,
  );
}
