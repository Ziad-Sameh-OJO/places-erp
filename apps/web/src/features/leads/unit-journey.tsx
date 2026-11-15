"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { UnitJourney as Journey, VisitUnit } from "@places/contracts";
import { Card, Chip, Empty, Field, Icon, useAction } from "@/components/ui";
import { useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { day, num } from "@/lib/format";
import { RecommendedUnits } from "./recommendations";

const key = (id: string) => ["lead", id, "journey"];

/** The drawer's «الوحدات» tab: the units log (14.8), the recommendations (2.12 · 14.11) and the manual pick (14.11). */
export function LeadUnitsTab({ id, name }: { id: string; name: string }) {
  const { can } = useMe();
  return (
    <>
      <UnitJourney id={id} />
      <RecommendedUnits id={id} name={name} />
      {can("leads", "edit") && <ManualPick id={id} />}
    </>
  );
}

/**
 * 14.8 · «سجل الوحدات»: List of options → Visits → Short list → Meeting, each step with its date and units; a unit
 * opens its page in the inventory (for whoever sees it). The PDF isn't kept: it is made again when asked for.
 */
function UnitJourney({ id }: { id: string }) {
  const t = useTranslations("leads.journey");
  const { can } = useMe();
  const q = useQuery({ queryKey: key(id), queryFn: () => api.get<Journey>(`/leads/${id}/unit-journey`) });
  if (q.error) return <Empty text={q.error.message} />;
  if (!q.data) return <p className="hint">{t("loading")}</p>;
  const link = can("inventory", "view");
  return (
    <Card title={t("title")} icon="layers" sub={t("sub")}>
      <div className="timeline">
        {q.data.stages.map((s) => (
          <div key={s.stage}>
            <b>{t(`stage.${s.stage}`)}</b>
            {s.steps.length ? s.steps.map((x) => (
              <div key={x.id} className="uj-step">
                <small>{day(x.at)}{x.by ? ` · ${x.by}` : ""}</small>
                {x.outcome === "done" ? <Chip tone="ok">{t("done")}</Chip> : x.outcome === "not_done" ? <Chip tone="bad">{t("notDone")}</Chip> : null}
                {x.units.map((u) => link
                  ? <Link key={u.id} className="chip info" href={`/inventory?unit=${u.id}`} title={u.project}>{u.code}</Link>
                  : <Chip key={u.id} tone="info">{u.code}</Chip>)}
                {x.extra && <small>{t("extra", { extra: x.extra })}</small>}
              </div>
            )) : <small>{t("none")}</small>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * 14.11 · «ترشيح يدوي»: units from the inventory by code, company (project) or building number, in a space range
 * («من 50 لـ 100 م»); the ticked ones are saved on the lead as its Short list.
 */
function ManualPick({ id }: { id: string }) {
  const t = useTranslations("leads.journey.pick");
  const run = useAction();
  const qc = useQueryClient();
  const [q, setQ] = useState(""), [min, setMin] = useState(""), [max, setMax] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<VisitUnit[]>([]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (min) p.set("spaceMin", min);
    if (max) p.set("spaceMax", max);
    const h = setTimeout(() => setSearch(p.toString()), 300);
    return () => clearTimeout(h);
  }, [q, min, max]);
  const found = useQuery({ queryKey: ["visit-units", search], queryFn: () => api.get<VisitUnit[]>(`/leads/visit-units${search ? `?${search}` : ""}`), enabled: !!search });
  const options = [...picked, ...(found.data ?? []).filter((u) => !picked.some((p) => p.id === u.id))];
  const tick = (u: VisitUnit, on: boolean) => setPicked((p) => (on ? [...p, u] : p.filter((x) => x.id !== u.id)));
  const save = () => void run(async () => {
    qc.setQueryData(key(id), await api.post<Journey>(`/leads/${id}/shortlist`, { unitIds: picked.map((u) => u.id) }));
    setPicked([]);
    await qc.invalidateQueries({ queryKey: ["lead", id] });
  }, t("saved"));
  return (
    <Card title={t("title")} icon="search" sub={t("sub")}>
      <div className="grid">
        <Field label={t("search")} wide>
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("search")} /></div>
        </Field>
        <Field label={t("from")}><input type="number" inputMode="numeric" min={0} value={min} onChange={(e) => setMin(e.target.value)} placeholder="50" /></Field>
        <Field label={t("to")}><input type="number" inputMode="numeric" min={0} value={max} onChange={(e) => setMax(e.target.value)} placeholder="100" /></Field>
      </div>
      <div className="rec-list">
        {options.length ? options.map((u) => (
          <label key={u.id} className="rec">
            <input type="checkbox" checked={picked.some((p) => p.id === u.id)} onChange={(e) => tick(u, e.target.checked)} aria-label={t("pickUnit", { code: u.code })} />
            <div className="rec-main"><b>{u.code} · {u.project}</b><small>{t("sqm", { n: num(u.space) })}</small></div>
          </label>
        )) : search ? <Empty text={t("empty")} icon="building" /> : <p className="hint">{t("hint")}</p>}
      </div>
      <div className="row end">
        <button className="btn" disabled={!picked.length} onClick={save}><Icon name="check" />{t("save", { n: picked.length })}</button>
      </div>
    </Card>
  );
}
