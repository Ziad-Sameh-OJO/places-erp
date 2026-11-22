"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Icon, Note } from "@/components/ui";

/** The value once typing stopped for `ms`: one request per pause, not per key. */
export function useSettled(value: string, ms = 400) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const id = setTimeout(() => setSettled(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return settled;
}

/**
 * «تقصد: …؟» under the leads' search (client, 22 Nov): the company may have been typed another way when the lead was
 * entered. The closest company names on the leads this person sees (the API's); one click searches for it.
 */
export function DidYouMean({ q, onPick }: { q: string; onPick: (name: string) => void }) {
  const t = useTranslations("leads.companyNames");
  const typed = useSettled(q.trim());
  const names = useQuery({
    queryKey: ["company-suggestions", typed], enabled: typed.length >= 3,
    queryFn: () => api.get<string[]>(`/leads/company-suggestions?q=${encodeURIComponent(typed)}`),
  }).data ?? [];
  if (!names.length || typed !== q.trim()) return null;
  return (
    <div className="views-bar did-you-mean" role="group" aria-label={t("didYouMeanLabel")}>
      <span className="lbl">{t("didYouMean")}</span>
      {names.map((n) => <button key={n} type="button" className="vchip" onClick={() => onPick(n)}><Icon name="search" />{n}</button>)}
    </div>
  );
}

/**
 * Typing a company that isn't in the sheet (client, 22 Nov): the sheet's names close to it, «هي دي؟» — so the same
 * company isn't added twice spelled two ways. Picking one puts its name in the box. Only for who may read the sheet's
 * names (the API checks it too).
 */
export function CloseCompanies({ name, onPick }: { name: string; onPick: (name: string) => void }) {
  const t = useTranslations("leads.companyNames");
  const { can } = useMe();
  const typed = useSettled(name.trim());
  const names = useQuery({
    queryKey: ["company-similar", typed], enabled: typed.length >= 3 && can("leads", "create"),
    queryFn: () => api.get<string[]>(`/companies/similar?q=${encodeURIComponent(typed)}`),
  }).data ?? [];
  if (!names.length || typed !== name.trim()) return null;
  return (
    <div className="wide close-companies" role="status">
      <Note kind="warn">
        {t("close", { name: typed })}
        <span className="row">{names.map((n) => <button key={n} type="button" className="btn ghost sm" onClick={() => onPick(n)}><Icon name="check" />{t("useIt", { name: n })}</button>)}</span>
      </Note>
    </div>
  );
}
