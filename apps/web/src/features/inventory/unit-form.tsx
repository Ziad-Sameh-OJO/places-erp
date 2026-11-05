"use client";
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { activeValues, type AreaTabView, type CreatedUnit, type UnitDetail, type UnitOptions } from "@places/contracts";
import { areaTabLabel, fromDecimal, incomeFigures, toDecimal, unitAreaTab, unitFiguresFit, unitTotal } from "@places/domain";
import { Field, Icon, Modal, Note, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { moneyExact } from "@/lib/format";
import type { UnitTypeName } from "./unit-bits";

type Key =
  | "type" | "project" | "area" | "space" | "condition" | "floor" | "building" | "parking" | "agentId" | "areaTabId" | "location"
  | "receivedAt" | "lastOwnerUpdateAt" | "divisible" | "minSplit" | "splitNote" | "ownerName" | "ownerPhone" | "pricePerSqm"
  | "leasePerSqm" | "maintenance" | "commission" | "paymentMethod" | "delivery" | "link" | "contractDuration" | "startsOn"
  | "endsOn" | "escalationPct" | "serviceChargeUsd" | "tenant" | "note";
type Form = Record<Key, string>;

/** [field, label, input type, required]: the demo's TYPE_FIELDS, with the requirements' names (M-03 3.1). */
type TypeField = readonly [Key, string, "text" | "tel" | "money" | "number" | "date", boolean];
const TYPE_FIELDS: Record<UnitTypeName, readonly TypeField[]> = {
  Rent: [["ownerName", "Contact", "text", true], ["ownerPhone", "Number", "tel", true], ["pricePerSqm", "Price per sqm", "money", true], ["maintenance", "Maintenance", "text", false], ["commission", "Commission", "text", false]],
  Resale: [["ownerName", "اسم الأونر", "text", true], ["ownerPhone", "الرقم", "tel", true], ["pricePerSqm", "السعر للمتر", "money", true], ["paymentMethod", "طريقة الدفع", "text", false], ["delivery", "Delivery date", "date", false], ["maintenance", "صيانة", "text", false], ["commission", "Commission", "text", false]],
  Income: [["ownerName", "الاسم", "text", true], ["ownerPhone", "الرقم", "tel", false], ["link", "اللينك", "text", false], ["pricePerSqm", "Sale price per meter", "money", true], ["leasePerSqm", "Lease price per meter", "money", true], ["contractDuration", "Contract duration", "text", false], ["startsOn", "Start date", "date", false], ["endsOn", "End date", "date", false], ["escalationPct", "Escalation rate %", "number", false], ["paymentMethod", "Payment method", "text", false], ["serviceChargeUsd", "Service charge / m (USD)", "money", false], ["tenant", "Tenant name", "text", false], ["commission", "Commission", "text", false], ["note", "Note", "text", false]],
  // Primary's own columns weren't sent yet (needs-client): the common ones, price optional
  Primary: [["ownerName", "الاسم", "text", false], ["ownerPhone", "الرقم", "tel", false], ["pricePerSqm", "السعر للمتر", "money", false], ["paymentMethod", "طريقة الدفع", "text", false]],
};
const NUMBERS: Key[] = ["space", "parking", "minSplit", "escalationPct"];
const DETAIL_KEYS: Key[] = ["delivery", "link", "contractDuration", "startsOn", "endsOn", "escalationPct", "serviceChargeUsd", "tenant", "note"];

const cairoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
/** «2026-11-04T21:05» for a datetime-local field, in the browser's time (Cairo for the team). */
const localStamp = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const TEXT_KEYS: Key[] = ["project", "area", "space", "floor", "building", "agentId", "areaTabId", "location", "minSplit", "splitNote", "ownerName", "ownerPhone",
  "pricePerSqm", "leasePerSqm", "maintenance", "commission", "paymentMethod", ...DETAIL_KEYS];

/** A new unit: today's «last update», received now (the demo's defaults). */
function empty(type: UnitTypeName): Form {
  const blank = Object.fromEntries(TEXT_KEYS.map((k) => [k, ""])) as Record<Key, string>;
  return { ...blank, type, condition: "", parking: "0", divisible: "no", receivedAt: localStamp(new Date()), lastOwnerUpdateAt: cairoDay(new Date()) };
}

/** An existing unit as the form's text fields (edit). */
function fromUnit(u: UnitDetail): Form {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const f = empty(u.type);
  return {
    ...f, project: u.project, area: u.area, space: s(u.space), condition: u.condition, floor: s(u.floor), building: s(u.building),
    parking: s(u.parking), agentId: u.agent?.id ?? "", areaTabId: s(u.areaTabId), location: s(u.location),
    receivedAt: u.receivedAt ? localStamp(new Date(u.receivedAt)) : "", lastOwnerUpdateAt: cairoDay(new Date(u.lastOwnerUpdateAt)),
    divisible: u.divisible ? "yes" : "no", minSplit: s(u.minSplit), splitNote: s(u.splitNote), ownerName: s(u.ownerName), ownerPhone: s(u.ownerPhone),
    pricePerSqm: s(u.pricePerSqm), leasePerSqm: s(u.leasePerSqm), maintenance: s(u.maintenance), commission: s(u.commission),
    paymentMethod: s(u.paymentMethod), ...Object.fromEntries(DETAIL_KEYS.map((k) => [k, s(u.details[k])])),
  };
}

/** The form's text → the API's sheet: numbers as numbers, empty = not filled. The API checks it all again. */
function toBody(f: Form, sendReceived: boolean) {
  const body: Record<string, unknown> = { type: f.type, divisible: f.divisible === "yes" };
  const keys: Key[] = ["project", "area", "space", "condition", "floor", "building", "parking", "agentId", "areaTabId", "location", "lastOwnerUpdateAt", "maintenance", "commission",
    ...TYPE_FIELDS[f.type as UnitTypeName].map(([k]) => k), ...(f.divisible === "yes" ? (["minSplit", "splitNote"] as Key[]) : [])];
  for (const k of new Set(keys)) {
    const v = f[k].trim();
    if (!v) continue;
    body[k] = NUMBERS.includes(k) ? Number(v) : v;
  }
  if (sendReceived && f.receivedAt) body.receivedAt = new Date(f.receivedAt).toISOString();
  return body;
}

/** The live figures while typing (2.3): Total = price × area, or Income's rent and yield. Nothing until both are numbers. */
function Figures({ f }: { f: Form }) {
  const area = Number(f.space);
  if (!Number.isInteger(area) || area <= 0) return null;
  try {
    // the same ceiling the API checks: a few extra zeros typed by mistake
    const price = f.pricePerSqm ? fromDecimal(f.pricePerSqm) : null, lease = f.type === "Income" && f.leasePerSqm ? fromDecimal(f.leasePerSqm) : null;
    if (!unitFiguresFit({ pricePerSqm: price, leasePerSqm: lease, area })) return <Note kind="warn">الإجمالي كبير أوي · راجع السعر والمساحة</Note>;
    if (f.type === "Income") {
      if (!f.pricePerSqm || !f.leasePerSqm) return null;
      const x = incomeFigures({ salePerSqm: fromDecimal(f.pricePerSqm), leasePerSqm: fromDecimal(f.leasePerSqm), area });
      return <Note>Sale total = {moneyExact(toDecimal(x.saleTotal))} · Monthly = Lease/m × Area = {moneyExact(toDecimal(x.monthlyRent))} · Annual = ×12 = {moneyExact(toDecimal(x.annualRent))} · Yield = <b>{x.yieldPct != null ? `${x.yieldPct.toFixed(2)}%` : "—"}</b></Note>;
    }
    if (!f.pricePerSqm) return null;
    return <Note>Total price = السعر للمتر × المساحة = <b>{moneyExact(toDecimal(unitTotal(fromDecimal(f.pricePerSqm), area)))}</b>{f.type === "Rent" ? " في الشهر" : ""}</Note>;
  } catch {
    return null; // a half-typed price («12.») isn't a number yet
  }
}

/**
 * «وحدة جديدة» / «تعديل» (2.7): the demo's form — the common columns on top, then the chosen type's own (M-03 3.1),
 * with the total / Income figures worked out while typing. Required fields can't be left empty (and the API refuses).
 */
/**
 * A unit entered from a Not Active row (2.15, M-03 1.1 «Done»): the owner's number from the sheet, saved through
 * that row so it's marked Done with it.
 */
export interface FromSheet { title: string; ownerPhone: string; save: (body: Record<string, unknown>) => Promise<CreatedUnit> }

export function UnitForm({ unit, options, tabs, onClose, onSaved, fromSheet }: {
  unit?: UnitDetail | undefined; options: UnitOptions | undefined; tabs: AreaTabView[]; onClose: () => void; onSaved: (id: string) => void;
  fromSheet?: FromSheet | undefined;
}) {
  const qc = useQueryClient();
  const run = useAction();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => (unit ? fromUnit(unit) : { ...empty("Rent"), ownerPhone: fromSheet?.ownerPhone ?? "" }));
  // a new unit starts on the first active finishing, like the demo's select (the list comes from the settings, 12.7)
  useEffect(() => {
    const first = activeValues(options?.conditions ?? [])[0];
    if (!unit && first) setF((x) => (x.condition ? x : { ...x, condition: first }));
  }, [options, unit]);
  const [busy, setBusy] = useState(false);
  const original = unit ? fromUnit(unit).receivedAt : null;
  const set = (k: Key) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const type = f.type as UnitTypeName;
  // a form offers the active values of a list (12.7), plus the one the unit already has (it may have been switched off since)
  const choices = (items: { value: string; active: boolean }[] | undefined, current: string) => [...new Set([...activeValues(items ?? []), ...(current ? [current] : [])])];
  const auto = Number(f.space) > 0 ? unitAreaTab({ space: Number(f.space), areaTabId: null }, tabs) : null;
  // the agent who brought the unit stays on it after leaving; they're no longer in the list of people working here
  const agents = [...(options?.agents ?? []), ...(unit?.agent && !options?.agents.some((a) => a.id === unit.agent!.id) ? [{ ...unit.agent, name: `${unit.agent.name} (مش في الشركة دلوقتي)` }] : [])];

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    // the time it came in is sent only when it was set or changed: the field has no seconds, so resending it would look like an edit
    const body = toBody(f, !unit || f.receivedAt !== original);
    void run(async () => {
      try {
        if (unit) {
          const saved = await api.put<UnitDetail>(`/inventory/units/${unit.id}`, body);
          toast(saved.updatedAt !== unit.updatedAt ? "اتحفظ · الـ PDF مستني Confirm تاني" : "مفيش تغيير");
          onSaved(unit.id);
        } else {
          const made = fromSheet ? await fromSheet.save(body) : await api.post<CreatedUnit>("/inventory/units", body);
          toast(`${made.code} اتسجّلت · مستنية Confirm من منار قبل ما تظهر للسيلز`);
          onSaved(made.id);
        }
        await Promise.all([qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["area-tabs"] }), qc.invalidateQueries({ queryKey: ["unit"] })]);
      } finally { setBusy(false); }
    });
  };

  const input = ([k, label, kind, req]: TypeField): ReactNode => (
    <Field key={k} label={label} req={req} wide={k === "note"}>
      {k === "paymentMethod"
        ? <select name={k} required={req} value={f[k]} onChange={set(k)}><option value="">—</option>{choices(options?.paymentMethods, f[k]).map((p) => <option key={p}>{p}</option>)}</select>
        : kind === "money"
        ? <input name={k} inputMode="decimal" pattern="\d+(\.\d{1,2})?" title="رقم بالجنيه، ولحد قرشين بعد العلامة" required={req} value={f[k]} onChange={set(k)} />
        : k === "note"
          ? <textarea name={k} value={f[k]} onChange={set(k)} maxLength={2000} />
          : <input name={k} type={kind} required={req} value={f[k]} onChange={set(k)} {...(kind === "number" ? { min: 0, max: 100, step: "any" } : {})} {...(kind === "tel" ? { dir: "ltr", inputMode: "tel" as const } : {})} />}
    </Field>
  );

  return (
    <Modal title={unit ? `تعديل ${unit.code}` : fromSheet?.title ?? "وحدة جديدة"} onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Field label="Type" req>
          <select name="type" value={f.type} onChange={set("type")}>{(["Rent", "Resale", "Income", "Primary"] as const).map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Project / اسم المبنى" req><input name="project" required maxLength={160} value={f.project} onChange={set("project")} /></Field>
        <Field label="Area" req>
          <select name="area" required value={f.area} onChange={set("area")}>
            <option value="">اختار</option>
            {choices(options?.areas, f.area).map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Gross area (م)" req><input name="space" type="number" min={1} step={1} required value={f.space} onChange={set("space")} /></Field>
        <Field label="Condition / التشطيب" req>
          <select name="condition" required value={f.condition} onChange={set("condition")}><option value="">اختار</option>{choices(options?.conditions, f.condition).map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Floor"><input name="floor" maxLength={40} value={f.floor} onChange={set("floor")} /></Field>
        <Field label="Build num" req><input name="building" required maxLength={40} value={f.building} onChange={set("building")} /></Field>
        <Field label="Parking slots"><input name="parking" type="number" min={0} step={1} value={f.parking} onChange={set("parking")} /></Field>
        <Field label="Agent (السيلز اللي جاب الوحدة)" req>
          <select name="agentId" required value={f.agentId} onChange={set("agentId")}>
            <option value="">اختار</option>{agents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="تاب المساحة">
          <select name="areaTabId" value={f.areaTabId} onChange={set("areaTabId")}>
            <option value="">أوتوماتيك من المساحة{auto ? ` (${areaTabLabel(auto)})` : ""}</option>
            {tabs.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Location (من الخريطة)">
          <div className="row">
            <input name="location" dir="ltr" placeholder="30.02, 31.48" value={f.location} onChange={set("location")} />
            <a className="btn ghost sm" href={`https://maps.google.com/${f.location ? `?q=${encodeURIComponent(f.location)}` : ""}`} target="_blank" rel="noopener noreferrer"><Icon name="pin" />اختار</a>
          </div>
        </Field>
        <Field label="Last update (ابديت مع المالك)" req><input name="lastOwnerUpdateAt" type="date" required value={f.lastOwnerUpdateAt} onChange={set("lastOwnerUpdateAt")} /></Field>
        {TYPE_FIELDS[type].map(input)}
        <Field label="اتستلمت إمتى (من المالك / الواتساب)"><input name="receivedAt" type="datetime-local" value={f.receivedAt} onChange={set("receivedAt")} /></Field>
        <Field label="تنفع تتقسم؟">
          <select name="divisible" value={f.divisible} onChange={set("divisible")}><option value="no">لا</option><option value="yes">اه</option></select>
        </Field>
        {f.divisible === "yes" && <>
          <Field label="أقل مساحة ممكن تتقسم لها"><input name="minSplit" type="number" min={1} step={1} value={f.minSplit} onChange={set("minSplit")} /></Field>
          <Field label="التقسيم عبارة عن إيه" wide><textarea name="splitNote" maxLength={500} value={f.splitNote} onChange={set("splitNote")} placeholder="مثلاً: كل دور لوحده" /></Field>
        </>}
        {type === "Primary" && <div className="wide"><Note kind="warn">خانات الـ Primary لسه مستنية الكلاينت يبعتها · دلوقتي الخانات المشتركة بس.</Note></div>}
        <div className="wide"><Figures f={f} /></div>
        <div className="row end wide">
          <span className="hint spacer">{unit ? "التعديل بيتسجّل في الـ Audit Log، والـ PDF بيستنى Confirm منار تاني." : "الكود التسلسلي والـ total price بيتعملوا أوتوماتيك."}</span>
          <button className="btn" disabled={busy}>{busy ? "بيحفظ…" : unit ? "حفظ" : "حفظ الوحدة"}</button>
        </div>
      </form>
    </Modal>
  );
}
