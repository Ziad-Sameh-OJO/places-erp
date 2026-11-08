"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { FIELDS, FIELD_MODES, MODULE_LABEL, type FieldMode, type FieldRules, type ModuleKey } from "@places/domain";
import { Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import type { RoleRow } from "./types";

const MODULES_WITH_FIELDS = Object.keys(FIELDS) as ModuleKey[];

/**
 * M-09 field permissions: for the picked role, each field of a module is «ظاهر», «قراية بس» or «مخفي» — gone from the
 * tables, details, forms, filters, exports and documents of everyone whose roles all hide it. Saved at once, audited;
 * the unit's identity (code, type, project) always stays.
 */
export function RoleFields({ role, editable }: { role: RoleRow; editable: boolean }) {
  const t = useTranslations("access.fields");
  const qc = useQueryClient();
  const run = useAction();
  const [module, setModule] = useState<ModuleKey>(MODULES_WITH_FIELDS[0]!);
  const q = useQuery({ queryKey: ["role-fields", role.key], queryFn: () => api.get<FieldRules>(`/access/roles/${role.key}/fields`) });
  const rules = q.data?.[module] ?? {};
  const set = (key: string, mode: FieldMode) => run(async () => {
    const next = Object.fromEntries(Object.entries({ ...rules, [key]: mode }).filter(([, m]) => m !== "show"));
    await api.put(`/access/roles/${role.key}/fields`, { module, rules: next });
    await Promise.all([qc.invalidateQueries({ queryKey: ["role-fields", role.key] }), qc.invalidateQueries({ queryKey: ["me"] })]);
  }, t("saved"));
  const hiddenCount = Object.values(rules).filter((m) => m === "hide").length, readCount = Object.values(rules).filter((m) => m === "read").length;
  return (
    <section className="role-fields">
      <div className="matrix-tools">
        <h4>{t("title")}</h4>
        <select value={module} onChange={(e) => setModule(e.target.value as ModuleKey)} aria-label={t("module")}>
          {MODULES_WITH_FIELDS.map((m) => <option key={m} value={m}>{serverText(MODULE_LABEL[m] ?? m)}</option>)}
        </select>
        <span className="hint">{t("count", { hidden: String(hiddenCount), read: String(readCount) })}</span>
      </div>
      <Note>{t("hint")}</Note>
      {q.isPending ? <p className="hint">{t("loading")}</p> : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>{t("field")}</th><th>{t("shows")}</th></tr></thead>
            <tbody>
              {FIELDS[module]!.map((f) => {
                const mode = f.locked ? "show" : rules[f.key] ?? "show";
                return (
                  <tr key={f.key}>
                    <td>{serverText(f.label)}{f.locked && <small className="hint"> · {t("locked")}</small>}</td>
                    <td>
                      <div className="seg" role="group" aria-label={t("modeOf", { field: f.label })}>
                        {FIELD_MODES.map((m) => (
                          <button key={m} type="button" aria-pressed={mode === m} disabled={!editable || !!f.locked} onClick={() => mode !== m && set(f.key, m)}>{t(`mode.${m}`)}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
