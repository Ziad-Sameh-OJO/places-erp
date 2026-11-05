"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MarketingUnit } from "@places/contracts";
import { Chip, Empty, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { useMe } from "@/lib/me";

export const useNewUnits = () => useQuery({ queryKey: ["marketing-units"], queryFn: () => api.get<MarketingUnit[]>("/marketing/new-units") });

/**
 * The demo's «وحدات جديدة» tab (M-03 6.2 · 7.1): every new unit shows here right away; «الإعلان خلص · Done» takes it
 * off, and a Done pressed by mistake has its Undo.
 */
export function NewUnits() {
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const units = useNewUnits();
  const [last, setLast] = useState<MarketingUnit | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["marketing-units"] });
  const done = (u: MarketingUnit) => void run(async () => { await api.post(`/marketing/new-units/${u.id}/done`); setLast(u); await refresh(); }, `${u.code} اختفت من لوحة التسويق`);
  const undo = (u: MarketingUnit) => void run(async () => { await api.del(`/marketing/new-units/${u.id}/done`); setLast(null); await refresh(); }, `${u.code} رجعت للوحة`);
  const list = units.data ?? [];
  return (
    <>
      <Note>Live Alerts: أي وحدة جديدة بتتضاف للانفنتوري بتظهر هنا فوراً عشان تجهّزوا موادها. لما الإعلان يخلص دوس Done فتختفي، ولو اتداس بالغلط فيه Undo.</Note>
      {last && (
        <div className="row"><span className="hint spacer">{last.code} اختفت من لوحة التسويق</span><button className="btn ghost sm" onClick={() => undo(last)}><Icon name="undo" />Undo</button></div>
      )}
      {units.error && <Note kind="warn">{units.error.message}</Note>}
      <div className="drive">
        {list.length ? list.map((u) => (
          <article key={u.id} className="ucard">
            <div className={`u-img u-${u.type}`}><Icon name="image" /><span className="mono">{u.code}</span><Chip tone="bad">جديدة</Chip></div>
            <div className="u-body">
              <b>{u.project}</b>
              <small>{u.area} · {num(u.space)} م · {u.type}{u.pdfStatus === "draft" ? " · الـ PDF مستني تأكيد منار" : ""}</small>
              <div className="row">
                {can("marketing", "edit") && <button className="btn sm" onClick={() => done(u)}>الإعلان خلص · Done</button>}
              </div>
            </div>
          </article>
        )) : <Empty text="مفيش وحدات جديدة مستنية حملات" icon="building" />}
      </div>
    </>
  );
}
