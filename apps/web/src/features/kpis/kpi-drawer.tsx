"use client";
import { useState } from "react";
import type { KpiCardView, KpiItemInput, KpiItemView } from "@places/contracts";
import { METRICS, METRIC_PARAMS, type MetricParam } from "@places/domain";
import { Chip, Field, Icon, Note, useAction } from "@/components/ui";
import { Drawer } from "@/components/blocks";
import { api } from "@/lib/api";
import { day, money } from "@/lib/format";
import { useBoard, useKpiCard, useRefreshKpis } from "./use-kpis";
import { Bar } from "./kpis-page";

const HOW = { system: ["info", "أوتوماتيك"], report: ["warn", "تسليم"], manual: ["", "يدوي"] } as const;
const PAYL = { salary: "المرتب", bonus: "بونص الكوارتر", month: "شهري", quarter: "كل ربع" } as const;

/** One card in the drawer (demo kpis.js `drawer`). `edit` opens it straight in «عدّل البنود» (a card just made). */
export function KpiDrawer({ id, onClose, edit }: { id: string; onClose: () => void; edit?: boolean }) {
  const q = useKpiCard(id);
  const c = q.data;
  return (
    <Drawer title={c?.employee.name ?? "…"} sub={c ? `KPIs · ${c.quarter.label} · يتابعه: ${c.follower.name}` : ""} onClose={onClose}
      chips={c && <><Chip tone="info">{c.employee.title}</Chip>{c.approved && <Chip tone="ok">اتعتمد</Chip>}</>}>
      <KpiCardBody id={id} startEditing={edit} />
    </Drawer>
  );
}

export function KpiCardBody({ id, startEditing }: { id: string; startEditing?: boolean | undefined }) {
  const q = useKpiCard(id);
  const [editing, setEditing] = useState(!!startEditing);
  const run = useAction(), refresh = useRefreshKpis();
  const c = q.data;
  if (!c) return <p className="hint">بيحمّل…</p>;
  const approve = () => void run(async () => { await api.post(`/kpis/cards/${id}/approve`); await refresh(); }, "النتيجة اتعتمدت");
  const sumW = c.items.reduce((s, it) => s + it.weight, 0);
  return (
    <>
      <div className="row"><b className={`num kc-score big ${c.tone}`}>{Math.round(c.score)}%</b><span className="hint">نتيجة الكارت لحد النهارده · {c.tier}</span></div>
      <Bar pct={c.score} tone={c.tone} />
      {c.pay && <PayBox c={c} />}
      {!c.pay && c.can.plan && c.tone === "bad" && <Plan c={c} />}
      {editing && c.can.admin && <CardAdmin c={c} />}
      {editing && c.can.manage ? <Editor c={c} onDone={() => setEditing(false)} /> : <Items c={c} sumW={sumW} />}
      <Note>كل بند بيتحسب بالنسبة، ولو عدّى 100% بيتسجّل زي ما هو. البند اللي «صفر» أو «لا يزيد عن» لو زاد بيقل بالنسبة.</Note>
      <div className="row end">
        {c.can.manage && !editing && <button className="btn ghost" onClick={() => setEditing(true)}>عدّل البنود</button>}
        {c.can.approve && <button className="btn" onClick={approve}><Icon name="check" />اعتمد النتيجة</button>}
        {c.approved && <Chip tone="ok">اتعتمد من {c.approved.by}</Chip>}
        {c.can.sheet && <a className="btn ghost" href={`/api/v1/kpis/cards/${id}/sheet`} target="_blank" rel="noreferrer"><Icon name="file" />ورقة الربع PDF</a>}
      </div>
    </>
  );
}

function Items({ c, sumW }: { c: KpiCardView; sumW: number }) {
  return (
    <div className="tbl-wrap">
      <table className="kpi-items">
        <thead><tr><th>البند</th><th className="c">الوزن</th><th>المستهدف</th><th>القياس</th><th className="c">الفعلي</th><th className="c">التحقيق</th><th className="c">في الكارت</th></tr></thead>
        <tbody>{c.items.map((it) => <ItemRow key={it.id} c={c} it={it} />)}</tbody>
        <tfoot><tr><td><b>الإجمالي</b></td><td className="c">{sumW}%</td><td colSpan={4} /><td className="c num"><b>{c.score.toFixed(1)}%</b></td></tr></tfoot>
      </table>
    </div>
  );
}

const actual = (it: KpiItemView) => it.method === "report" ? `${it.delivered} من ${it.required ?? 0}` : it.value == null ? "لسه" : String(it.value);

function ItemRow({ c, it }: { c: KpiCardView; it: KpiItemView }) {
  const run = useAction(), refresh = useRefreshKpis();
  const [link, setLink] = useState<string | null>(null);
  const setValue = (v: string) => v !== "" && void run(async () => { await api.patch(`/kpis/cards/${c.id}/items/${it.id}/value`, { value: Number(v) }); await refresh(); }, "اتحفظ · النتيجة اتحدّثت");
  const deliver = () => void run(async () => { await api.post(`/kpis/cards/${c.id}/items/${it.id}/deliveries`, { link }); setLink(null); await refresh(); }, "اتسجّل التسليم");
  const tone = it.achievement < 100 ? "warn" : "";
  return (
    <tr className={it.achievement < 100 ? "under" : ""}>
      <td><b>{it.title}</b><span className="sub">بيتحسب: {it.calc}</span>
        {it.detail && <span className="sub"><b>{it.detail}</b></span>}
        {it.deliveries.length > 0 && <span className="sub">اتسلّم: {it.deliveries.map((d) => day(d.at)).join("، ")}</span>}</td>
      <td className="c">{it.weight}%</td>
      <td>{it.targetText}</td>
      <td><Chip tone={HOW[it.method][0]} plain>{HOW[it.method][1]}</Chip>{it.module && <small className="mono hint"> {it.module}</small>}</td>
      <td className="c">
        {it.canEnter ? <input type="number" step="any" defaultValue={it.value ?? ""} style={{ width: 72 }} aria-label="القيمة" onBlur={(e) => setValue(e.target.value)} /> : actual(it)}
        {it.canDeliver && (link == null
          ? <button className="btn ghost sm" onClick={() => setLink("")}><Icon name="upload" />سلّمت</button>
          : <span className="row"><input type="url" placeholder="لينك الملف" value={link} onChange={(e) => setLink(e.target.value)} aria-label="لينك التسليم" style={{ width: 140 }} /><button className="btn sm" onClick={deliver}>سلّم</button></span>)}
      </td>
      <td className="c"><div className="cell-bar"><b className="num">{Math.round(it.achievement)}%</b><Bar pct={it.achievement} tone={tone} /></div></td>
      <td className="c num"><b>{it.contribution.toFixed(1)}%</b></td>
    </tr>
  );
}

function PayBox({ c }: { c: KpiCardView }) {
  const p = c.pay!;
  const run = useAction(), refresh = useRefreshKpis();
  const save = (patch: Partial<typeof p>) => void run(async () => { const n = { ...p, ...patch }; await api.patch(`/kpis/cards/${c.id}/pay`, { base: n.base, period: n.period, amount: n.amount }); await refresh(); }, "اتحفظ");
  const d = Number(p.delta);
  return (
    <section className="card flat">
      <div className="card-head"><h3><span>النتيجة والفلوس</span></h3><Chip tone={c.tone}>{c.tier}</Chip></div>
      <div className="row">
        <select value={p.base} disabled={!c.can.pay} aria-label="الحسبة على" onChange={(e) => save({ base: e.target.value as "salary" | "bonus" })}>
          <option value="bonus">{PAYL.bonus}</option><option value="salary">{PAYL.salary}</option></select>
        <select value={p.period} disabled={!c.can.pay} aria-label="كل قد إيه" onChange={(e) => save({ period: e.target.value as "month" | "quarter" })}>
          <option value="quarter">{PAYL.quarter}</option><option value="month">{PAYL.month}</option></select>
        {p.base === "bonus"
          ? <label className="row hint">البونص <input type="number" min="0" defaultValue={p.amount ?? ""} placeholder={`مرتب شهر · ${money(p.salary)}`} disabled={!c.can.pay} style={{ width: 130 }} aria-label="البونص"
            onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (p.amount ? String(Number(p.amount)) : null)) save({ amount: v ? Number(v).toFixed(2) : null }); }} /></label>
          : <span className="hint">المرتب {money(p.salary)}</span>}
      </div>
      <p>{d > 0 ? <>مكافأة <b className="num">{money(p.delta)}</b> على {PAYL[p.base]}</> : d < 0 ? <>خصم <b className="num">{money(p.delta.replace("-", ""))}</b> من {PAYL[p.base]}</> : `${PAYL[p.base]} كامل`} · {PAYL[p.period]}</p>
      {c.tone === "bad" && <Plan c={c} />}
      <small className="hint">100%+ مكافأة 15% · 96%+ بونص كامل · 70–95% جزئي (النقص بيزيد بالتساوي لحد 15%) · أقل من 70% خصم 15% + خطة تحسين · أقل من 50% البونص بيتلغي + خصم 15% من المرتب + إنذار</small>
    </section>
  );
}

function Plan({ c }: { c: KpiCardView }) {
  const run = useAction(), refresh = useRefreshKpis();
  const save = (plan: string) => plan !== (c.plan ?? "") && void run(async () => { await api.patch(`/kpis/cards/${c.id}/plan`, { plan }); await refresh(); }, "خطة التحسين اتحفظت");
  return (
    <label className="field"><span>خطة التحسين</span>
      <textarea rows={2} defaultValue={c.plan ?? ""} disabled={!c.can.plan} placeholder="المتابع بيكتب الخطة والمواعيد" onBlur={(e) => save(e.target.value)} /></label>
  );
}

/** «إعدادات الكارت»: the follower, and copying the items to someone else (11.4 · meeting 4 Nov). */
function CardAdmin({ c }: { c: KpiCardView }) {
  const run = useAction(), refresh = useRefreshKpis();
  const people = c.options?.people ?? [];
  const all = useBoard("all");
  const has = new Set(all.data?.cards.map((x) => x.employeeId));
  const follower = (v: string) => void run(async () => { await api.patch(`/kpis/cards/${c.id}/follower`, { followerId: v || null }); await refresh(); }, "اتحفظ");
  const copy = (to: string) => {
    const p = people.find((x) => x.id === to);
    if (!p || (has.has(to) && !confirm(`${p.name} عنده كارت. تبدّل بنوده ببنود ${c.employee.name}؟`))) return;
    void run(async () => { await api.post(`/kpis/cards/${c.id}/copy`, { toEmployeeId: to }); await refresh(); }, `اتنسخت لـ ${p.name}`);
  };
  return (
    <section className="card flat">
      <div className="card-head"><h3><span>إعدادات الكارت</span></h3></div>
      <div className="grid">
        <Field label="مين بيتابعه ويعتمد نتيجته">
          <select value={c.follower.id ?? ""} onChange={(e) => follower(e.target.value)}>
            <option value="">الملاك</option>
            {people.filter((p) => p.id !== c.employee.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="انسخ البنود والأوزان دي لـ">
          <select value="" onChange={(e) => copy(e.target.value)}>
            <option value="">اختار موظف…</option>
            {people.filter((p) => p.id !== c.employee.id).map((p) => <option key={p.id} value={p.id}>{p.name}{has.has(p.id) ? " (عنده كارت · هيتبدل)" : ""}</option>)}
          </select>
        </Field>
      </div>
    </section>
  );
}

type Draft = KpiItemInput & { calc?: string | undefined };
const toDraft = (it: KpiItemView): Draft => ({
  id: it.id, title: it.title, weight: it.weight, targetText: it.targetText, source: it.source, method: it.method, module: it.module,
  direction: it.direction, goal: it.goal, metric: it.metric, params: it.params, enteredBy: it.enteredBy, required: it.required, calc: it.calc,
});
const GROUPS = [...new Set(Object.values(METRICS).map((m) => m.group))];

/** «عدّل البنود» (11.3 · 11.11): every field of every item, then one save (the weights must add up to 100%). */
function Editor({ c, onDone }: { c: KpiCardView; onDone: () => void }) {
  const [items, setItems] = useState<Draft[]>(() => c.items.map(toDraft));
  const run = useAction(), refresh = useRefreshKpis();
  const set = (i: number, patch: Partial<Draft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch, calc: undefined } : x)));
  const sumW = items.reduce((s, it) => s + (Number(it.weight) || 0), 0);
  const save = () => void run(async () => {
    await api.put(`/kpis/cards/${c.id}/items`, { items: items.map((it) => ({ ...it, calc: undefined })) });
    await refresh();
    onDone();
  }, "البنود اتحفظت");
  return (
    <>
      {sumW !== 100 && <Note kind="warn">مجموع الأوزان دلوقتي <b>{sumW}%</b> · لازم يبقى 100%.</Note>}
      {items.map((it, i) => <EditBlock key={it.id ?? `new-${i}`} c={c} it={it} set={(p) => set(i, p)} remove={() => confirm(`تمسح «${it.title}» من الكارت؟`) && setItems((xs) => xs.filter((_, j) => j !== i))} />)}
      <div className="row">
        <button className="btn ghost" onClick={() => setItems((xs) => [...xs, { title: "بند جديد", weight: 0, targetText: "", source: "", method: "manual", module: null, direction: "at-least", goal: 100, metric: null, params: {}, enteredBy: ["follower"], required: null }])}><Icon name="plus" />بند جديد</button>
        <span className="spacer" />
        <button className="btn ghost" onClick={onDone}>إلغاء</button>
        <button className="btn" onClick={save}><Icon name="check" />احفظ البنود</button>
      </div>
    </>
  );
}

function EditBlock({ c, it, set, remove }: { c: KpiCardView; it: Draft; set: (p: Partial<Draft>) => void; remove: () => void }) {
  const m = it.metric ? METRICS[it.metric] : undefined;
  const people = c.options?.people ?? [], roles = c.options?.roles ?? [];
  const nameOf = (x: string) => x === "follower" ? "المتابع بتاع الكارت" : people.find((p) => p.userId === x)?.name ?? roles.find((r) => r.key === x)?.label ?? x;
  const param = (k: MetricParam) => {
    const d = METRIC_PARAMS[k], v = it.params[k] ?? "";
    const put = (val: string | number) => set({ params: { ...it.params, [k]: val } });
    return (
      <Field key={k} label={d.label}>
        {Array.isArray(d.options)
          ? <select value={String(v || (k === "per" ? "quarter" : ""))} onChange={(e) => put(e.target.value)}>{d.options.map(([x, l]) => <option key={x} value={x}>{l}</option>)}</select>
          : d.options === "text" ? <input value={String(v)} onChange={(e) => put(e.target.value)} />
          : <input type="number" min={1} value={String(v)} style={{ maxWidth: 100 }} onChange={(e) => put(Number(e.target.value))} />}
      </Field>
    );
  };
  const goal = (
    <Field label="المستهدف بالرقم">
      <div className="row">
        <select value={it.direction} aria-label="الاتجاه" onChange={(e) => set({ direction: e.target.value as Draft["direction"] })}><option value="at-least">لا يقل عن</option><option value="at-most">لا يزيد عن</option></select>
        <input type="number" step="any" value={it.goal} style={{ maxWidth: 100 }} aria-label="المستهدف بالرقم" onChange={(e) => set({ goal: Number(e.target.value) })} />
        {m?.unit === "%" && <span className="hint">%</span>}
      </div>
    </Field>
  );
  return (
    <section className="card flat kpi-edit">
      <div className="card-head"><h3><span>{it.title || "بند"}</span></h3><button className="btn ghost sm" onClick={remove} aria-label="امسح البند"><Icon name="x" />امسح</button></div>
      {it.calc && <p className="rule-says"><Icon name="bolt" /><span><b>بيتحسب:</b> {it.calc}</span></p>}
      <div className="grid">
        <Field label="اسم البند"><input value={it.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="الوزن %"><input type="number" min={0} max={100} value={it.weight} style={{ maxWidth: 100 }} onChange={(e) => set({ weight: Number(e.target.value) })} /></Field>
        <Field label="المستهدف زي ما بيتكتب"><input value={it.targetText} onChange={(e) => set({ targetText: e.target.value })} /></Field>
        <Field label="بيتحسب إزاي">
          <select value={it.method} onChange={(e) => {
            const method = e.target.value as Draft["method"];
            set(method === "report" ? { method, required: it.required ?? 4, goal: 100, direction: "at-least" } : { method, ...(method === "manual" ? { metric: null, params: {} } : {}) });
          }}>
            <option value="system">السيستم بيحسبه</option><option value="report">من تسليم تقرير</option><option value="manual">حد بيدخّله بإيده</option>
          </select>
        </Field>
        {it.method === "system" && <>
          <Field label="بيتحسب من">
            <select value={it.metric ?? ""} onChange={(e) => { const k = e.target.value || null; set({ metric: k, params: {}, ...(k && METRICS[k]?.unit === "%" ? { goal: 100 } : {}) }); }}>
              <option value="">اختار بيتحسب من إيه…</option>
              {GROUPS.map((g) => <optgroup key={g} label={g}>{Object.entries(METRICS).filter(([, x]) => x.group === g).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}</optgroup>)}
            </select>
          </Field>
          {m?.params?.map(param)}
          {goal}
        </>}
        {it.method === "report" && <Field label="مطلوب كام مرة في الربع"><input type="number" min={1} value={it.required ?? ""} style={{ maxWidth: 100 }} onChange={(e) => set({ required: Number(e.target.value) || null })} /></Field>}
        {it.method === "manual" && <>{goal}<Field label="بيدخّله من فين (ملاحظة)"><input value={it.source} placeholder="مثلاً: مراجعة نانسي الأسبوعية" onChange={(e) => set({ source: e.target.value })} /></Field></>}
      </div>
      {it.method === "manual" && (
        <div className="field"><span>مين بيدخّل الرقم</span>
          <div className="row">
            {it.enteredBy.map((x) => <button key={x} className="btn ghost sm" onClick={() => set({ enteredBy: it.enteredBy.filter((y) => y !== x) })} aria-label={`شيل ${nameOf(x)}`}>{nameOf(x)} <Icon name="x" /></button>)}
            <select value="" aria-label="ضيف" onChange={(e) => e.target.value && set({ enteredBy: [...it.enteredBy, e.target.value] })}>
              <option value="">ضيف…</option>
              {!it.enteredBy.includes("follower") && <option value="follower">المتابع بتاع الكارت</option>}
              <optgroup label="الأدوار">{roles.filter((r) => !it.enteredBy.includes(r.key)).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</optgroup>
              <optgroup label="الأشخاص">{people.filter((p) => !it.enteredBy.includes(p.userId)).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</optgroup>
            </select>
          </div>
        </div>
      )}
    </section>
  );
}
