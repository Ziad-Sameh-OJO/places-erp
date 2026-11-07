"use client";
import { useState } from "react";
import type { KpiCardView, KpiItemInput, KpiItemView } from "@places/contracts";
import { METRICS, METRIC_PARAMS, type MetricParam } from "@places/domain";
import { Chip, Field, Icon, Note, useAction } from "@/components/ui";
import { Drawer } from "@/components/blocks";
import { api } from "@/lib/api";
import { day, money } from "@/lib/format";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { useBoard, useKpiCard, useRefreshKpis } from "./use-kpis";
import { Bar } from "./kpis-page";

// How an item is measured: its chip tone (the words are kpis.how.<method>)
const HOW = { system: "info", report: "warn", manual: "" } as const;

/** One card in the drawer (demo kpis.js `drawer`). `edit` opens it straight in «عدّل البنود» (a card just made). */
export function KpiDrawer({ id, onClose, edit }: { id: string; onClose: () => void; edit?: boolean }) {
  const t = useTranslations("kpis");
  const q = useKpiCard(id);
  const c = q.data;
  return (
    <Drawer title={c?.employee.name ?? "…"} sub={c ? `KPIs · ${serverText(c.quarter.label)} · ${t("followedBy", { name: c.follower.name })}` : ""} onClose={onClose}
      chips={c && <><Chip tone="info">{serverText(c.employee.title)}</Chip>{c.approved && <Chip tone="ok">{t("common.approved")}</Chip>}</>}>
      <KpiCardBody id={id} startEditing={edit} />
    </Drawer>
  );
}

export function KpiCardBody({ id, startEditing }: { id: string; startEditing?: boolean | undefined }) {
  const t = useTranslations("kpis");
  const q = useKpiCard(id);
  const [editing, setEditing] = useState(!!startEditing);
  const run = useAction(), refresh = useRefreshKpis();
  const c = q.data;
  if (!c) return <p className="hint">{t("common.loading")}</p>;
  const approve = () => void run(async () => { await api.post(`/kpis/cards/${id}/approve`); await refresh(); }, t("card.approvedOk"));
  const sumW = c.items.reduce((s, it) => s + it.weight, 0);
  return (
    <>
      <div className="row"><b className={`num kc-score big ${c.tone}`}>{Math.round(c.score)}%</b><span className="hint">{t("card.scoreToday", { tier: serverText(c.tier) })}</span></div>
      <Bar pct={c.score} tone={c.tone} />
      {c.pay && <PayBox c={c} />}
      {!c.pay && c.can.plan && c.tone === "bad" && <Plan c={c} />}
      {editing && c.can.admin && <CardAdmin c={c} />}
      {editing && c.can.manage ? <Editor c={c} onDone={() => setEditing(false)} /> : <Items c={c} sumW={sumW} />}
      <Note>{t("card.note")}</Note>
      <div className="row end">
        {c.can.manage && !editing && <button className="btn ghost" onClick={() => setEditing(true)}>{t("card.editItems")}</button>}
        {c.can.approve && <button className="btn" onClick={approve}><Icon name="check" />{t("card.approve")}</button>}
        {c.approved && <Chip tone="ok">{t("card.approvedBy", { by: c.approved.by })}</Chip>}
        {c.can.sheet && <a className="btn ghost" href={`/api/v1/kpis/cards/${id}/sheet`} target="_blank" rel="noreferrer"><Icon name="file" />{t("card.sheet")}</a>}
      </div>
    </>
  );
}

function Items({ c, sumW }: { c: KpiCardView; sumW: number }) {
  const t = useTranslations("kpis");
  return (
    <div className="tbl-wrap">
      <table className="kpi-items">
        <thead><tr><th>{t("items.item")}</th><th className="c">{t("items.weight")}</th><th>{t("items.target")}</th><th>{t("items.measure")}</th><th className="c">{t("items.actual")}</th><th className="c">{t("items.achievement")}</th><th className="c">{t("items.inCard")}</th></tr></thead>
        <tbody>{c.items.map((it) => <ItemRow key={it.id} c={c} it={it} />)}</tbody>
        <tfoot><tr><td><b>{t("items.total")}</b></td><td className="c">{sumW}%</td><td colSpan={4} /><td className="c num"><b>{c.score.toFixed(1)}%</b></td></tr></tfoot>
      </table>
    </div>
  );
}

function ItemRow({ c, it }: { c: KpiCardView; it: KpiItemView }) {
  const t = useTranslations("kpis");
  const actual = it.method === "report" ? t("items.deliveredOf", { n: it.delivered, total: it.required ?? 0 }) : it.value == null ? t("items.notYet") : String(it.value);
  const run = useAction(), refresh = useRefreshKpis();
  const [link, setLink] = useState<string | null>(null);
  const setValue = (v: string) => v !== "" && void run(async () => { await api.patch(`/kpis/cards/${c.id}/items/${it.id}/value`, { value: Number(v) }); await refresh(); }, t("items.valueSavedOk"));
  const deliver = () => void run(async () => { await api.post(`/kpis/cards/${c.id}/items/${it.id}/deliveries`, { link }); setLink(null); await refresh(); }, t("items.deliveredOk"));
  const tone = it.achievement < 100 ? "warn" : "";
  return (
    <tr className={it.achievement < 100 ? "under" : ""}>
      <td><b>{serverText(it.title)}</b><span className="sub">{t("items.calc", { calc: serverText(it.calc) })}</span>
        {it.detail && <span className="sub"><b>{serverText(it.detail)}</b></span>}
        {it.deliveries.length > 0 && <span className="sub">{t("items.deliveredOn", { days: it.deliveries.map((d) => day(d.at)).join(t("items.listSep")) })}</span>}</td>
      <td className="c">{it.weight}%</td>
      <td>{serverText(it.targetText)}</td>
      <td><Chip tone={HOW[it.method]} plain>{t(`how.${it.method}`)}</Chip>{it.module && <small className="mono hint"> {it.module}</small>}</td>
      <td className="c">
        {it.canEnter ? <input type="number" step="any" defaultValue={it.value ?? ""} style={{ width: 72 }} aria-label={t("items.value")} onBlur={(e) => setValue(e.target.value)} /> : actual}
        {it.canDeliver && (link == null
          ? <button className="btn ghost sm" onClick={() => setLink("")}><Icon name="upload" />{t("items.delivered")}</button>
          : <span className="row"><input type="url" placeholder={t("items.fileLink")} value={link} onChange={(e) => setLink(e.target.value)} aria-label={t("items.deliveryLink")} style={{ width: 140 }} /><button className="btn sm" onClick={deliver}>{t("items.deliver")}</button></span>)}
      </td>
      <td className="c"><div className="cell-bar"><b className="num">{Math.round(it.achievement)}%</b><Bar pct={it.achievement} tone={tone} /></div></td>
      <td className="c num"><b>{it.contribution.toFixed(1)}%</b></td>
    </tr>
  );
}

function PayBox({ c }: { c: KpiCardView }) {
  const t = useTranslations("kpis");
  const p = c.pay!;
  const run = useAction(), refresh = useRefreshKpis();
  const save = (patch: Partial<typeof p>) => void run(async () => { const n = { ...p, ...patch }; await api.patch(`/kpis/cards/${c.id}/pay`, { base: n.base, period: n.period, amount: n.amount }); await refresh(); }, t("common.saved"));
  const d = Number(p.delta);
  const base = t(`pay.${p.base}`);
  return (
    <section className="card flat">
      <div className="card-head"><h3><span>{t("pay.title")}</span></h3><Chip tone={c.tone}>{serverText(c.tier)}</Chip></div>
      <div className="row">
        <select value={p.base} disabled={!c.can.pay} aria-label={t("pay.baseAria")} onChange={(e) => save({ base: e.target.value as "salary" | "bonus" })}>
          <option value="bonus">{t("pay.bonus")}</option><option value="salary">{t("pay.salary")}</option></select>
        <select value={p.period} disabled={!c.can.pay} aria-label={t("pay.periodAria")} onChange={(e) => save({ period: e.target.value as "month" | "quarter" })}>
          <option value="quarter">{t("pay.quarter")}</option><option value="month">{t("pay.month")}</option></select>
        {p.base === "bonus"
          ? <label className="row hint">{t("pay.bonusLabel")} <input type="number" min="0" defaultValue={p.amount ?? ""} placeholder={t("pay.bonusPh", { salary: money(p.salary) })} disabled={!c.can.pay} style={{ width: 130 }} aria-label={t("pay.bonusLabel")}
            onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (p.amount ? String(Number(p.amount)) : null)) save({ amount: v ? Number(v).toFixed(2) : null }); }} /></label>
          : <span className="hint">{t("pay.salaryIs", { salary: money(p.salary) })}</span>}
      </div>
      <p>{d > 0 ? t.rich("pay.reward", { amount: money(p.delta), base, b: (x) => <b className="num">{x}</b> }) : d < 0 ? t.rich("pay.cut", { amount: money(p.delta.replace("-", "")), base, b: (x) => <b className="num">{x}</b> }) : t("pay.fullBase", { base })} · {t(`pay.${p.period}`)}</p>
      {c.tone === "bad" && <Plan c={c} />}
      <small className="hint">{t("pay.rules")}</small>
    </section>
  );
}

function Plan({ c }: { c: KpiCardView }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const save = (plan: string) => plan !== (c.plan ?? "") && void run(async () => { await api.patch(`/kpis/cards/${c.id}/plan`, { plan }); await refresh(); }, t("plan.savedOk"));
  return (
    <label className="field"><span>{t("plan.title")}</span>
      <textarea rows={2} defaultValue={c.plan ?? ""} disabled={!c.can.plan} placeholder={t("plan.ph")} onBlur={(e) => save(e.target.value)} /></label>
  );
}

/** «إعدادات الكارت»: the follower, and copying the items to someone else (11.4 · meeting 4 Nov). */
function CardAdmin({ c }: { c: KpiCardView }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const people = c.options?.people ?? [];
  const all = useBoard("all");
  const has = new Set(all.data?.cards.map((x) => x.employeeId));
  const follower = (v: string) => void run(async () => { await api.patch(`/kpis/cards/${c.id}/follower`, { followerId: v || null }); await refresh(); }, t("common.saved"));
  const copy = (to: string) => {
    const p = people.find((x) => x.id === to);
    if (!p || (has.has(to) && !confirm(t("admin.replaceConfirm", { name: p.name, from: c.employee.name })))) return;
    void run(async () => { await api.post(`/kpis/cards/${c.id}/copy`, { toEmployeeId: to }); await refresh(); }, t("admin.copiedOk", { name: p.name }));
  };
  return (
    <section className="card flat">
      <div className="card-head"><h3><span>{t("admin.title")}</span></h3></div>
      <div className="grid">
        <Field label={t("admin.follower")}>
          <select value={c.follower.id ?? ""} onChange={(e) => follower(e.target.value)}>
            <option value="">{t("admin.owners")}</option>
            {people.filter((p) => p.id !== c.employee.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t("admin.copyTo")}>
          <select value="" onChange={(e) => copy(e.target.value)}>
            <option value="">{t("admin.pickEmployee")}</option>
            {people.filter((p) => p.id !== c.employee.id).map((p) => <option key={p.id} value={p.id}>{p.name}{has.has(p.id) ? ` ${t("admin.hasCard")}` : ""}</option>)}
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
  const t = useTranslations("kpis");
  const [items, setItems] = useState<Draft[]>(() => c.items.map(toDraft));
  const run = useAction(), refresh = useRefreshKpis();
  const set = (i: number, patch: Partial<Draft>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch, calc: undefined } : x)));
  const sumW = items.reduce((s, it) => s + (Number(it.weight) || 0), 0);
  const save = () => void run(async () => {
    await api.put(`/kpis/cards/${c.id}/items`, { items: items.map((it) => ({ ...it, calc: undefined })) });
    await refresh();
    onDone();
  }, t("editor.savedOk"));
  return (
    <>
      {sumW !== 100 && <Note kind="warn">{t.rich("editor.weightsSum", { sum: sumW, b: (x) => <b>{x}</b> })}</Note>}
      {items.map((it, i) => <EditBlock key={it.id ?? `new-${i}`} c={c} it={it} set={(p) => set(i, p)} remove={() => confirm(t("editor.removeConfirm", { title: it.title })) && setItems((xs) => xs.filter((_, j) => j !== i))} />)}
      <div className="row">
        <button className="btn ghost" onClick={() => setItems((xs) => [...xs, { title: t("editor.newItem"), weight: 0, targetText: "", source: "", method: "manual", module: null, direction: "at-least", goal: 100, metric: null, params: {}, enteredBy: ["follower"], required: null }])}><Icon name="plus" />{t("editor.newItem")}</button>
        <span className="spacer" />
        <button className="btn ghost" onClick={onDone}>{t("common.cancel")}</button>
        <button className="btn" onClick={save}><Icon name="check" />{t("editor.save")}</button>
      </div>
    </>
  );
}

function EditBlock({ c, it, set, remove }: { c: KpiCardView; it: Draft; set: (p: Partial<Draft>) => void; remove: () => void }) {
  const t = useTranslations("kpis");
  const m = it.metric ? METRICS[it.metric] : undefined;
  const people = c.options?.people ?? [], roles = c.options?.roles ?? [];
  const role = (x: string) => roles.find((r) => r.key === x)?.label;
  const nameOf = (x: string) => x === "follower" ? t("editor.cardFollower") : people.find((p) => p.userId === x)?.name ?? serverText(role(x) ?? x);
  const param = (k: MetricParam) => {
    const d = METRIC_PARAMS[k], v = it.params[k] ?? "";
    const put = (val: string | number) => set({ params: { ...it.params, [k]: val } });
    return (
      <Field key={k} label={serverText(d.label)}>
        {Array.isArray(d.options)
          ? <select value={String(v || (k === "per" ? "quarter" : ""))} onChange={(e) => put(e.target.value)}>{d.options.map(([x, l]) => <option key={x} value={x}>{serverText(l)}</option>)}</select>
          : d.options === "text" ? <input value={String(v)} onChange={(e) => put(e.target.value)} />
          : <input type="number" min={1} value={String(v)} style={{ maxWidth: 100 }} onChange={(e) => put(Number(e.target.value))} />}
      </Field>
    );
  };
  const goal = (
    <Field label={t("editor.goal")}>
      <div className="row">
        <select value={it.direction} aria-label={t("editor.direction")} onChange={(e) => set({ direction: e.target.value as Draft["direction"] })}><option value="at-least">{t("editor.atLeast")}</option><option value="at-most">{t("editor.atMost")}</option></select>
        <input type="number" step="any" value={it.goal} style={{ maxWidth: 100 }} aria-label={t("editor.goal")} onChange={(e) => set({ goal: Number(e.target.value) })} />
        {m?.unit === "%" && <span className="hint">%</span>}
      </div>
    </Field>
  );
  return (
    <section className="card flat kpi-edit">
      <div className="card-head"><h3><span>{it.title || t("editor.item")}</span></h3><button className="btn ghost sm" onClick={remove} aria-label={t("editor.removeItem")}><Icon name="x" />{t("editor.remove")}</button></div>
      {it.calc && <p className="rule-says"><Icon name="bolt" /><span><b>{t("editor.calcLabel")}</b> {serverText(it.calc)}</span></p>}
      <div className="grid">
        <Field label={t("editor.title")}><input value={it.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label={t("editor.weight")}><input type="number" min={0} max={100} value={it.weight} style={{ maxWidth: 100 }} onChange={(e) => set({ weight: Number(e.target.value) })} /></Field>
        <Field label={t("editor.targetText")}><input value={it.targetText} onChange={(e) => set({ targetText: e.target.value })} /></Field>
        <Field label={t("editor.method")}>
          <select value={it.method} onChange={(e) => {
            const method = e.target.value as Draft["method"];
            set(method === "report" ? { method, required: it.required ?? 4, goal: 100, direction: "at-least" } : { method, ...(method === "manual" ? { metric: null, params: {} } : {}) });
          }}>
            <option value="system">{t("editor.methodSystem")}</option><option value="report">{t("editor.methodReport")}</option><option value="manual">{t("editor.methodManual")}</option>
          </select>
        </Field>
        {it.method === "system" && <>
          <Field label={t("editor.metric")}>
            <select value={it.metric ?? ""} onChange={(e) => { const k = e.target.value || null; set({ metric: k, params: {}, ...(k && METRICS[k]?.unit === "%" ? { goal: 100 } : {}) }); }}>
              <option value="">{t("editor.pickMetric")}</option>
              {GROUPS.map((g) => <optgroup key={g} label={serverText(g)}>{Object.entries(METRICS).filter(([, x]) => x.group === g).map(([k, x]) => <option key={k} value={k}>{serverText(x.label)}</option>)}</optgroup>)}
            </select>
          </Field>
          {m?.params?.map(param)}
          {goal}
        </>}
        {it.method === "report" && <Field label={t("editor.required")}><input type="number" min={1} value={it.required ?? ""} style={{ maxWidth: 100 }} onChange={(e) => set({ required: Number(e.target.value) || null })} /></Field>}
        {it.method === "manual" && <>{goal}<Field label={t("editor.source")}><input value={it.source} placeholder={t("editor.sourcePh")} onChange={(e) => set({ source: e.target.value })} /></Field></>}
      </div>
      {it.method === "manual" && (
        <div className="field"><span>{t("editor.enteredBy")}</span>
          <div className="row">
            {it.enteredBy.map((x) => <button key={x} className="btn ghost sm" onClick={() => set({ enteredBy: it.enteredBy.filter((y) => y !== x) })} aria-label={t("common.remove", { name: nameOf(x) })}>{nameOf(x)} <Icon name="x" /></button>)}
            <select value="" aria-label={t("common.add")} onChange={(e) => e.target.value && set({ enteredBy: [...it.enteredBy, e.target.value] })}>
              <option value="">{t("common.addMenu")}</option>
              {!it.enteredBy.includes("follower") && <option value="follower">{t("editor.cardFollower")}</option>}
              <optgroup label={t("editor.roles")}>{roles.filter((r) => !it.enteredBy.includes(r.key)).map((r) => <option key={r.key} value={r.key}>{serverText(r.label)}</option>)}</optgroup>
              <optgroup label={t("editor.people")}>{people.filter((p) => !it.enteredBy.includes(p.userId)).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</optgroup>
            </select>
          </div>
        </div>
      )}
    </section>
  );
}
