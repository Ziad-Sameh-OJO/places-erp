"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MarketingUnit } from "@places/contracts";
import { Chip, Empty, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";

export const useNewUnits = () => useQuery({ queryKey: ["marketing-units"], queryFn: () => api.get<MarketingUnit[]>("/marketing/new-units") });

/**
 * The demo's «وحدات جديدة» tab (M-03 6.2 · 7.1): every new unit shows here right away; «الإعلان خلص · Done» takes it
 * off, and a Done pressed by mistake has its Undo.
 */
export function NewUnits() {
  const t = useTranslations("marketing.newUnits");
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const units = useNewUnits();
  const [last, setLast] = useState<MarketingUnit | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["marketing-units"] });
  const done = (u: MarketingUnit) => void run(async () => { await api.post(`/marketing/new-units/${u.id}/done`); setLast(u); await refresh(); }, t("gone", { code: u.code }));
  const undo = (u: MarketingUnit) => void run(async () => { await api.del(`/marketing/new-units/${u.id}/done`); setLast(null); await refresh(); }, t("back", { code: u.code }));
  const list = units.data ?? [];
  return (
    <>
      <Note>{t("note")}</Note>
      {last && (
        <div className="row"><span className="hint spacer">{t("gone", { code: last.code })}</span><button className="btn ghost sm" onClick={() => undo(last)}><Icon name="undo" />Undo</button></div>
      )}
      {units.error && <Note kind="warn">{units.error.message}</Note>}
      <div className="drive">
        {list.length ? list.map((u) => (
          <article key={u.id} className="ucard">
            <div className={`u-img u-${u.type}`}><Icon name="image" /><span className="mono">{u.code}</span><Chip tone="bad">{t("new")}</Chip></div>
            <div className="u-body">
              <b>{u.project}</b>
              <small>{t("meta", { area: serverText(u.area), space: num(u.space), type: u.type })}{u.pdfStatus === "draft" ? t("pdfDraft") : ""}</small>
              <div className="row">
                {can("marketing", "edit") && <button className="btn sm" onClick={() => done(u)}>{t("done")}</button>}
              </div>
            </div>
          </article>
        )) : <Empty text={t("empty")} icon="building" />}
      </div>
    </>
  );
}
