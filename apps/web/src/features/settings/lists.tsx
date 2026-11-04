"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LIST_GROUPS, LOCKED_VALUES, type ListItem, type ListKey, type Settings } from "@places/contracts";
import { UNIT_TYPES } from "@places/domain";
import { Card, Chip, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * «الإعدادات ← القوايم» (12.7, demo admin.js): every dropdown list, grouped like the demo. Adding shows at once in the
 * forms; ✕ switches a value off («موقوف»): gone from new records, kept on old ones and in filters (M-13 2.1 · 3.3).
 * Switched-off values are listed under each list with «رجّع» (the requirements' «موقوف» state; the demo only removes).
 */
export function ListsTab({ settings, editable }: { settings: Settings; editable: boolean }) {
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
            {g.lists.map(([key, label]) => <ListCard key={key} listKey={key} label={label} items={settings[key]} editable={editable} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function ListCard({ listKey, label, items, editable }: { listKey: ListKey; label: string; items: ListItem[]; editable: boolean }) {
  const qc = useQueryClient();
  const run = useAction();
  const [showOff, setShowOff] = useState(false);
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
    // a switched-off value typed again comes back instead of being added twice
    void save(had ? items.map((i) => (i.value === value ? { ...i, active: true } : i)) : [...items, { value, active: true }], had ? `«${value}» رجعت · ظاهرة في الفورمز تاني` : "اتضاف · ظاهر في كل الشاشات")
      .then(() => form.reset());
  };
  return (
    <Card title={label} icon="list" extra={<Chip plain>{active.length}</Chip>}>
      <div className="chips-edit">
        {active.map((i) => (
          <span className="chip-e" key={i.value}>{i.value}
            {locked.has(i.value) ? <span title="السيستم بيحسب عليها"><Icon name="lock" /></span>
              : editable && <button aria-label={`وقّف ${i.value}`} onClick={() => void toggle(i.value, false)}><Icon name="x" /></button>}
          </span>
        ))}
        {!active.length && <span className="hint">مفيش قيم</span>}
      </div>
      {editable && (
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
                  {editable && <button className="btn ghost sm" style={{ padding: "0 6px" }} onClick={() => void toggle(i.value, true)}>رجّع</button>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
