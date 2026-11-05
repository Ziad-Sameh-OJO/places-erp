"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LIST_GROUPS, LOCKED_VALUES, type ListEditors, type ListItem, type ListKey, type Settings } from "@places/contracts";
import { UNIT_TYPES, canChangeList, type ListAction, type ListEditorsOf } from "@places/domain";
import { Card, Chip, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";

interface EditorOptions { roles: { key: string; label: string }[]; people: { id: string; name: string }[]; masterEdit: string[] }

/**
 * «الإعدادات ← القوايم» (12.7, demo admin.js): every dropdown list, grouped like the demo. Adding shows at once in the
 * forms; ✕ switches a value off («موقوف»): gone from new records, kept on old ones and in filters (M-13 2.1 · 3.3).
 * Switched-off values are listed under each list with «رجّع» (the requirements' «موقوف» state; the demo only removes).
 */
export function ListsTab({ settings }: { settings: Settings }) {
  const { me, can } = useMe();
  // who may add / switch off in each list (#186); the API checks the same rule on every save
  const may = (key: ListKey, a: ListAction) => !!me && canChangeList(settings.listEditors[key], a, { id: me.id, roles: me.roles, masterEdit: can("master", "edit") });
  return (
    <>
      <Note>أي قايمة بتظهر في الشاشات بتتعدّل من هنا: اللي بتضيفه بيظهر في الفورمز على طول، واللي بتشيله بيختفي من الجديد بس والبيانات القديمة زي ما هي. البنود اللي عليها قفل السيستم بيحسب عليها فمابتتشالش.</Note>
      {LIST_GROUPS.map((g) => (
        <section key={g.title}>
          <h3 className="mini-h">{g.title}</h3>
          <div className="cols">
            {/* the unit's type stays fixed in the code (each type has its own columns, 2.1): shown, locked */}
            {g.title === "الانفنتوري والعملاء" && (
              <Card title="الغرض من الوحدة" icon="list" sub="لكل نوع خاناته · بيتغير من البرمجة" extra={<Chip plain>{UNIT_TYPES.length}</Chip>}>
                <div className="chips-edit">{UNIT_TYPES.map((t) => <span className="chip-e" key={t}>{t} <Icon name="lock" /></span>)}</div>
              </Card>
            )}
            {/* the receive sources are accounts of the chart, not a list (accountant's chart, 4 Nov · 9.1) */}
            {g.title === "المالية والمشتريات" && (
              <Card title="مصادر التوريد للخزنة" icon="list" sub="عمولة من عميل + حسابات «ايرادات اخري» (42) في الشجرة">
                <Note>المصادر هي حسابات الإيرادات الأخرى في شجرة الحسابات، فأي إيراد جديد يتضاف كحساب فرعي تحت 42.</Note>
              </Card>
            )}
            {g.lists.map(([key, label]) => <ListCard key={key} listKey={key} label={label} items={settings[key]} canAdd={may(key, "add")} canOff={may(key, "off")}
              editors={can("access", "edit") ? settings.listEditors : undefined} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function ListCard({ listKey, label, items, canAdd, canOff, editors }: { listKey: ListKey; label: string; items: ListItem[]; canAdd: boolean; canOff: boolean; editors: ListEditors | undefined }) {
  const qc = useQueryClient();
  const run = useAction();
  const [showOff, setShowOff] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const locked = new Set(LOCKED_VALUES[listKey] ?? []);
  const active = items.filter((i) => i.active), off = items.filter((i) => !i.active);
  const save = (next: ListItem[], ok: string) => run(async () => {
    await api.put(`/settings/${listKey}`, { value: next });
    await qc.invalidateQueries({ queryKey: ["settings"] });
  }, ok);
  const toggle = (value: string, on: boolean) =>
    save(items.map((i) => (i.value === value ? { ...i, active: on } : i)), on ? `«${value}» رجعت · ظاهرة في الفورمز تاني` : `«${value}» اتوقفت · مش هتظهر في الجديد، والبيانات القديمة زي ما هي`);
  const add = (form: HTMLFormElement, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const had = items.find((i) => i.value === value);
    if (had?.active) { void run(async () => { throw new Error("القيمة دي موجودة"); }); return; }
    if (had && !canOff) { void run(async () => { throw new Error(`«${value}» موقوفة · ترجيعها لحد تاني`); }); return; }
    // a switched-off value typed again comes back instead of being added twice
    void save(had ? items.map((i) => (i.value === value ? { ...i, active: true } : i)) : [...items, { value, active: true }], had ? `«${value}» رجعت · ظاهرة في الفورمز تاني` : "اتضاف · ظاهر في كل الشاشات")
      .then(() => form.reset());
  };
  return (
    <Card title={label} icon="list" extra={<>
      {editors && <button type="button" className="btn ghost sm" aria-expanded={showWho} onClick={() => setShowWho(!showWho)}><Icon name="users" />مين يعدّل</button>}
      <Chip plain>{active.length}</Chip>
    </>}>
      {editors && showWho && <WhoEdits listKey={listKey} editors={editors} />}
      <div className="chips-edit">
        {active.map((i) => (
          <span className="chip-e" key={i.value}>{i.value}
            {locked.has(i.value) ? <span title="السيستم بيحسب عليها"><Icon name="lock" /></span>
              : canOff && <button aria-label={`وقّف ${i.value}`} onClick={() => void toggle(i.value, false)}><Icon name="x" /></button>}
          </span>
        ))}
        {!active.length && <span className="hint">مفيش قيم</span>}
      </div>
      {canAdd && (
        <form className="row" onSubmit={onFormSubmit((d) => add(document.getElementById(`ls-${listKey}`) as HTMLFormElement, String(d.get("v") ?? "")))} id={`ls-${listKey}`}>
          <input name="v" placeholder="إضافة…" required maxLength={80} aria-label={`إضافة لـ ${label}`} /><button className="btn ghost sm"><Icon name="plus" />إضافة</button>
        </form>
      )}
      {off.length > 0 && (
        <div className="off-list">
          <button type="button" className="link hint" onClick={() => setShowOff(!showOff)} aria-expanded={showOff}>الموقوفة ({off.length})</button>
          {showOff && (
            <div className="chips-edit">
              {off.map((i) => (
                <span className="chip-e" key={i.value} style={{ opacity: 0.65 }}>{i.value}
                  {canOff && <button className="btn ghost sm" style={{ padding: "0 6px" }} onClick={() => void toggle(i.value, true)}>رجّع</button>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * «مين يعدّل» (#186, for whoever has «access: edit»): the roles / people who add to this list and the ones who switch
 * its values off or back on. A list not set up yet starts from the roles with «master: edit» (who has it today).
 */
function WhoEdits({ listKey, editors }: { listKey: ListKey; editors: ListEditors }) {
  const qc = useQueryClient();
  const run = useAction();
  const o = useQuery({ queryKey: ["list-editors-options"], queryFn: () => api.get<EditorOptions>("/settings/list-editors/options"), staleTime: 60_000 }).data;
  if (!o) return <p className="hint">بيحمّل…</p>;
  const rule: ListEditorsOf = editors[listKey] ?? { add: o.masterEdit, off: o.masterEdit };
  const name = (x: string) => o.roles.find((r) => r.key === x)?.label ?? o.people.find((p) => p.id === x)?.name ?? x;
  const save = (a: ListAction, to: string[]) => run(async () => {
    await api.put("/settings/listEditors", { value: { ...editors, [listKey]: { ...rule, [a]: to } } });
    await qc.invalidateQueries({ queryKey: ["settings"] });
  }, "اتحفظ · بيتطبّق على طول");
  const row = (a: ListAction, label: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="row">
        {rule[a].map((x) => <button key={x} type="button" className="btn ghost sm" aria-label={`شيل ${name(x)}`} onClick={() => void save(a, rule[a].filter((y) => y !== x))}>{name(x)} <Icon name="x" /></button>)}
        {!rule[a].length && <span className="hint">محدش</span>}
        <select value="" aria-label={`ضيف لـ ${label}`} style={{ maxWidth: 200 }} onChange={(e) => e.target.value && void save(a, [...rule[a], e.target.value])}>
          <option value="">+ ضيف دور أو شخص</option>
          <optgroup label="أدوار">{o.roles.filter((r) => !rule[a].includes(r.key)).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</optgroup>
          <optgroup label="أشخاص">{o.people.filter((p) => !rule[a].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </select>
      </div>
    </div>
  );
  return (
    <div style={{ marginBottom: 12 }}>
      {!editors[listKey] && <Note>لسه متظبطتش · دلوقتي كل اللي عندهم تعديل الإعدادات. أول تغيير هنا بيخليها للي مختارين بس.</Note>}
      {row("add", "يضيف")}
      {row("off", "يوقّف / يرجّع")}
    </div>
  );
}
