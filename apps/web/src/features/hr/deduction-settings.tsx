"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { HrSettings } from "@places/contracts";
import { Card, Field, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";

/** The company's deduction rules and the penalty types (HR, 15 Nov); whoever sees HR reads them. */
export const useHrSettings = () => useQuery({ queryKey: ["hr", "settings"], queryFn: () => api.get<HrSettings>("/hr/settings") });

const RULES = ["graceMinutes", "quarterFrom", "halfFrom", "dayFrom", "absenceDays", "excuseHalfFrom", "excuseRefusedFrom"] as const;

/** «شرايح وأنواع الخصم» (HR, 15 Nov): the tiers and absence / Excuse costs for everyone without their own tiers, and the penalty types. HR edits (hr: edit). */
export function DeductionSettings() {
  const t = useTranslations("hr.settings");
  const { can } = useMe();
  const s = useHrSettings().data;
  const qc = useQueryClient();
  const run = useAction();
  const [renaming, setRenaming] = useState<number | null>(null);
  if (!s) return null;
  const edit = can("hr", "edit");
  const save = (next: HrSettings) => run(async () => { await api.put("/hr/settings", next); await qc.invalidateQueries({ queryKey: ["hr"] }); setRenaming(null); }, t("saved"));
  const saveRules = onFormSubmit(async (f) => save({ ...s, rules: Object.fromEntries(RULES.map((k) => [k, Number(f.get(k))])) as HrSettings["rules"] }));
  const types = s.penaltyTypes;
  return (
    <Card title={t("title")} icon="list" sub={t("sub")}>
      <form className="grid" onSubmit={saveRules}>
        {RULES.map((k) => <Field key={k} label={t(`rules.${k}`)}><input name={k} type="number" min={k === "graceMinutes" ? 0 : k === "absenceDays" ? 0.25 : 1} step={k === "absenceDays" ? 0.25 : 1} defaultValue={s.rules[k]} disabled={!edit} required /></Field>)}
        {edit && <div className="row end wide"><button className="btn">{t("saveRules")}</button></div>}
      </form>
      <h4 className="mini-h">{t("typesTitle")}</h4>
      {types.map((x, i) => (
        <div key={x} className="line-item">
          {renaming === i
            ? <form className="row" onSubmit={onFormSubmit(async (f) => save({ ...s, penaltyTypes: types.map((y, j) => (j === i ? String(f.get("name") ?? "").trim() : y)) }))}>
                <input name="name" defaultValue={x} required minLength={2} maxLength={60} aria-label={t("rename")} /><button className="btn sm">{t("saveRules")}</button>
              </form>
            : <span>{serverText(x)}</span>}
          {edit && renaming !== i && <span className="row">
            <button className="btn ghost sm" onClick={() => setRenaming(i)}>{t("rename")}</button>
            {types.length > 1 && <button className="icon-btn sm" aria-label={t("remove")} onClick={() => void save({ ...s, penaltyTypes: types.filter((_, j) => j !== i) })}><Icon name="x" /></button>}
          </span>}
        </div>
      ))}
      {edit && (
        <form className="row" onSubmit={onFormSubmit(async (f) => { const v = String(f.get("type") ?? "").trim(); if (v.length >= 2) await save({ ...s, penaltyTypes: [...types, v] }); })}>
          <input name="type" placeholder={t("newType")} required minLength={2} maxLength={60} aria-label={t("newType")} /><button className="btn ghost"><Icon name="plus" />{t("add")}</button>
        </form>
      )}
      <Note>{t("note")}</Note>
    </Card>
  );
}
