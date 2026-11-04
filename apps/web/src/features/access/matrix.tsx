"use client";
import { ACTIONS, ACTION_LABEL, MODULES, normalizeActions, type Action, type ModuleKey } from "@places/domain";
import { MODULE_LABEL } from "@/lib/nav";
import { Tick } from "@/components/ui";

export type MatrixValue = Partial<Record<ModuleKey, Action[]>>;

/**
 * One permission matrix (modules × actions), for a role or for one person. With `base`, the cells where the
 * person differs from their roles are highlighted (a personal exception). Changes go out one module at a time.
 */
export function Matrix({ value, base, editable, onChange }: {
  value: MatrixValue; base?: MatrixValue; editable: boolean; onChange: (changes: MatrixValue) => void;
}) {
  const get = (m: ModuleKey) => value[m] ?? [];
  const set = (m: ModuleKey, a: Action, on: boolean) => {
    // unticking «view» closes the module
    const next = a === "view" && !on ? [] : on ? [...get(m), a] : get(m).filter((x) => x !== a);
    onChange({ [m]: normalizeActions(next) });
  };
  const row = (m: ModuleKey) => onChange({ [m]: get(m).length === ACTIONS.length ? [] : [...ACTIONS] });
  const col = (a: Action) => {
    const on = !MODULES.every((m) => get(m).includes(a));
    onChange(Object.fromEntries(MODULES.map((m) => [m, normalizeActions(on ? [...get(m), a] : a === "view" ? [] : get(m).filter((x) => x !== a))])));
  };
  return (
    <div className="tbl-wrap">
      <table className="perm">
        <thead>
          <tr>
            <th>الموديول</th>
            {ACTIONS.map((a) => <th key={a} className="c">{editable ? <button className="link" onClick={() => col(a)} title="للكل">{ACTION_LABEL[a]}</button> : ACTION_LABEL[a]}</th>)}
            {editable && <th className="c">الصف</th>}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((m) => (
            <tr key={m}>
              <td><span className="who"><b>{MODULE_LABEL[m]}</b><small className="mono">{m}</small></span></td>
              {ACTIONS.map((a) => {
                const on = get(m).includes(a);
                const differs = base ? on !== (base[m] ?? []).includes(a) : false;
                return <td key={a} className={`c${differs ? " ov" : ""}`}><Tick checked={on} disabled={!editable} label={`${MODULE_LABEL[m]} ${ACTION_LABEL[a]}`} onChange={(v) => set(m, a, v)} /></td>;
              })}
              {editable && <td className="c"><button className="btn ghost sm" onClick={() => row(m)}>{get(m).length === ACTIONS.length ? "شيل الكل" : "الكل"}</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
