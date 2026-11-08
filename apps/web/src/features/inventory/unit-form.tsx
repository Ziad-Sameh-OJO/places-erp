"use client";
import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { activeValues, type AreaTabView, type CreatedUnit, type UnitDetail, type UnitOptions } from "@places/contracts";
import { areaTabLabel, fromDecimal, incomeFigures, toDecimal, unitAreaTab, unitFiguresFit, unitTotal } from "@places/domain";
import { Field, Icon, Modal, Note, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { moneyExact } from "@/lib/format";
import { type ColWord, type UnitTypeName, w } from "./unit-bits";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";

type Key =
  | "type" | "project" | "area" | "space" | "condition" | "floor" | "building" | "parking" | "agentId" | "areaTabId" | "location"
  | "receivedAt" | "lastOwnerUpdateAt" | "divisible" | "minSplit" | "splitNote" | "ownerName" | "ownerPhone" | "pricePerSqm"
  | "leasePerSqm" | "maintenance" | "commission" | "paymentMethod" | "delivery" | "link" | "contractDuration" | "startsOn"
  | "endsOn" | "escalationPct" | "serviceChargeUsd" | "tenant" | "note" | "alsoType" | "layout" | "comment" | "upfront" | "security" | "payment" | "term" | "grace";
type Form = Record<Key, string>;

/** [field, label, input type, required]: the demo's TYPE_FIELDS, with the requirements' names (M-03 3.1). Nothing is required (2.21). */
type TypeField = readonly [Key, string | { w: ColWord }, "text" | "tel" | "money" | "number" | "date", boolean];
const TYPE_FIELDS: Record<UnitTypeName, readonly TypeField[]> = {
  Rent: [["ownerName", "Contact", "text", false], ["ownerPhone", "Number", "tel", false], ["pricePerSqm", "Price per sqm", "money", false], ["maintenance", "Maintenance", "text", false], ["commission", "Commission", "text", false],
    ["comment", "Comment", "text", false], ["delivery", "Delivery date", "text", false], ["upfront", "Upfront rent", "text", false], ["security", "Security deposit", "text", false], ["payment", "Payment", "text", false],
    ["term", "Term", "text", false], ["grace", "Grace period", "text", false], ["escalationPct", "Annual increase %", "number", false]],
  Resale: [["ownerName", w("ownerName"), "text", false], ["ownerPhone", w("number"), "tel", false], ["pricePerSqm", w("pricePerSqm"), "money", false], ["paymentMethod", w("paymentMethod"), "text", false], ["delivery", "Delivery date", "date", false], ["maintenance", w("maintenance"), "text", false], ["commission", "Commission", "text", false]],
  Income: [["ownerName", w("name"), "text", false], ["ownerPhone", w("number"), "tel", false], ["link", w("link"), "text", false], ["pricePerSqm", "Sale price per meter", "money", false], ["leasePerSqm", "Lease price per meter", "money", false], ["contractDuration", "Contract duration", "text", false], ["startsOn", "Start date", "date", false], ["endsOn", "End date", "date", false], ["escalationPct", "Escalation rate %", "number", false], ["paymentMethod", "Payment method", "text", false], ["serviceChargeUsd", "Service charge / m (USD)", "money", false], ["tenant", "Tenant name", "text", false], ["commission", "Commission", "text", false], ["note", "Note", "text", false]],
  // Primary's own columns weren't sent yet (needs-client): the common ones, price optional
  Primary: [["ownerName", w("name"), "text", false], ["ownerPhone", w("number"), "tel", false], ["pricePerSqm", w("pricePerSqm"), "money", false], ["paymentMethod", w("paymentMethod"), "text", false]],
};
const NUMBERS: Key[] = ["space", "parking", "minSplit", "escalationPct"];
const DETAIL_KEYS: Key[] = ["delivery", "upfront", "security", "payment", "term", "grace", "link", "contractDuration", "startsOn", "endsOn", "escalationPct", "serviceChargeUsd", "tenant", "note"];

const cairoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
/** «2026-11-04T21:05» for a datetime-local field, in the browser's time (Cairo for the team). */
const localStamp = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

const TEXT_KEYS: Key[] = ["project", "area", "space", "floor", "building", "agentId", "areaTabId", "location", "minSplit", "splitNote", "ownerName", "ownerPhone",
  "pricePerSqm", "leasePerSqm", "maintenance", "commission", "paymentMethod", "comment", ...DETAIL_KEYS];

/** A new unit: today's «last update», received now (the demo's defaults). */
function empty(type: UnitTypeName): Form {
  const blank = Object.fromEntries(TEXT_KEYS.map((k) => [k, ""])) as Record<Key, string>;
  return { ...blank, type, alsoType: "", condition: "", parking: "0", divisible: "no", layout: "no", receivedAt: localStamp(new Date()), lastOwnerUpdateAt: cairoDay(new Date()) };
}

/** An existing unit as the form's text fields (edit). */
function fromUnit(u: UnitDetail): Form {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const f = empty(u.type);
  return {
    ...f, alsoType: u.alsoType ?? "", project: u.project, area: u.area, space: s(u.space), condition: u.condition, floor: s(u.floor), building: s(u.building),
    parking: s(u.parking), agentId: u.agent?.id ?? "", areaTabId: s(u.areaTabId), location: s(u.location),
    receivedAt: u.receivedAt ? localStamp(new Date(u.receivedAt)) : "", lastOwnerUpdateAt: cairoDay(new Date(u.lastOwnerUpdateAt)),
    divisible: u.divisible ? "yes" : "no", minSplit: s(u.minSplit), splitNote: s(u.splitNote), ownerName: s(u.ownerName), ownerPhone: s(u.ownerPhone),
    pricePerSqm: s(u.pricePerSqm), leasePerSqm: s(u.leasePerSqm), maintenance: s(u.maintenance), commission: s(u.commission),
    paymentMethod: s(u.paymentMethod), layout: u.layout ? "yes" : "no", comment: s(u.comment), ...Object.fromEntries(DETAIL_KEYS.map((k) => [k, s(u.details[k])])),
  };
}

/** The form's text → the API's sheet: numbers as numbers, empty = not filled. The API checks it all again. */
function toBody(f: Form, sendReceived: boolean) {
  const body: Record<string, unknown> = { type: f.type, divisible: f.divisible === "yes", layout: f.layout === "yes" };
  const keys: Key[] = ["alsoType", "project", "area", "space", "condition", "floor", "building", "parking", "agentId", "areaTabId", "location", "lastOwnerUpdateAt", "maintenance", "commission",
    ...TYPE_FIELDS[f.type as UnitTypeName].map(([k]) => k), ...(f.divisible === "yes" ? (["minSplit", "splitNote"] as Key[]) : [])];
  for (const k of new Set(keys)) {
    const v = f[k].trim();
    if (!v || (k === "alsoType" && v === f.type)) continue;
    body[k] = NUMBERS.includes(k) ? Number(v) : v;
  }
  if (sendReceived && f.receivedAt) body.receivedAt = new Date(f.receivedAt).toISOString();
  return body;
}

/** The live figures while typing (2.3): Total = price × area, or Income's rent and yield. Nothing until both are numbers. */
function Figures({ f }: { f: Form }) {
  const t = useTranslations("inventory.form");
  const area = Number(f.space);
  if (!Number.isInteger(area) || area <= 0) return null;
  try {
    // the same ceiling the API checks: a few extra zeros typed by mistake
    const price = f.pricePerSqm ? fromDecimal(f.pricePerSqm) : null, lease = f.type === "Income" && f.leasePerSqm ? fromDecimal(f.leasePerSqm) : null;
    if (!unitFiguresFit({ pricePerSqm: price, leasePerSqm: lease, area })) return <Note kind="warn">{t("tooBig")}</Note>;
    if (f.type === "Income") {
      if (!f.pricePerSqm || !f.leasePerSqm) return null;
      const x = incomeFigures({ salePerSqm: fromDecimal(f.pricePerSqm), leasePerSqm: fromDecimal(f.leasePerSqm), area });
      return <Note>Sale total = {moneyExact(toDecimal(x.saleTotal))} · Monthly = Lease/m × Area = {moneyExact(toDecimal(x.monthlyRent))} · Annual = ×12 = {moneyExact(toDecimal(x.annualRent))} · Yield = <b>{x.yieldPct != null ? `${x.yieldPct.toFixed(2)}%` : "—"}</b></Note>;
    }
    if (!f.pricePerSqm) return null;
    return <Note>{t("total")}<b>{moneyExact(toDecimal(unitTotal(fromDecimal(f.pricePerSqm), area)))}</b>{f.type === "Rent" ? t("perMonth") : ""}</Note>;
  } catch {
    return null; // a half-typed price («12.») isn't a number yet
  }
}

/**
 * «وحدة جديدة» / «تعديل» (2.7): the demo's form — the common columns on top, then the chosen type's own (M-03 3.1),
 * with the total / Income figures worked out while typing. Nothing is required (2.21): what's left empty shows as «ناقص» (2.20).
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
  const t = useTranslations("inventory");
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
  const agents = [...(options?.agents ?? []), ...(unit?.agent && !options?.agents.some((a) => a.id === unit.agent!.id) ? [{ ...unit.agent, name: t("form.leftCompany", { name: unit.agent.name }) }] : [])];

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
          toast(saved.updatedAt !== unit.updatedAt ? t("form.saved") : t("form.noChange"));
          onSaved(unit.id);
        } else {
          const made = fromSheet ? await fromSheet.save(body) : await api.post<CreatedUnit>("/inventory/units", body);
          toast(t("form.created", { code: made.code }));
          onSaved(made.id);
        }
        await Promise.all([qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["area-tabs"] }), qc.invalidateQueries({ queryKey: ["unit"] })]);
      } finally { setBusy(false); }
    });
  };

  // M-09 field permissions: a hidden field has no input; a read-only one is shown locked (the API keeps it either way)
  const fields = useFields("inventory");
  const only = (key: string, node: ReactNode): ReactNode =>
    !fields.shows(key) ? null : fields.edits(key) ? node : <fieldset key={key} className="field-lock" disabled>{node}</fieldset>;

  const input = ([k, label, kind, req]: TypeField): ReactNode => only(k,
    <Field key={k} label={typeof label === "string" ? label : t(`cols.${label.w}`)} req={req} wide={k === "note" || k === "comment"}>
      {k === "paymentMethod"
        ? <select name={k} required={req} value={f[k]} onChange={set(k)}><option value="">—</option>{choices(options?.paymentMethods, f[k]).map((p) => <option key={p}>{p}</option>)}</select>
        : kind === "money"
        ? <input name={k} inputMode="decimal" pattern="\d+(\.\d{1,2})?" title={t("form.moneyTitle")} required={req} value={f[k]} onChange={set(k)} />
        : k === "note" || k === "comment"
          ? <textarea name={k} value={f[k]} onChange={set(k)} maxLength={2000} />
          : <input name={k} type={kind} required={req} value={f[k]} onChange={set(k)} {...(kind === "number" ? { min: 0, max: 100, step: "any" } : {})} {...(kind === "tel" ? { dir: "ltr", inputMode: "tel" as const } : {})} />}
    </Field>
  );

  return (
    <Modal title={unit ? t("form.editTitle", { code: unit.code }) : fromSheet?.title ?? t("list.newUnit")} onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Field label="Type" req>
          <select name="type" value={f.type} onChange={set("type")}>{(["Rent", "Resale", "Income", "Primary"] as const).map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label={t("form.alsoAs")}>
          <select name="alsoType" value={f.alsoType === f.type ? "" : f.alsoType} onChange={set("alsoType")}>
            <option value="">{t("form.noOther")}</option>{(["Rent", "Resale"] as const).filter((x) => x !== f.type).map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label={t("form.project")}><input name="project" maxLength={160} value={f.project} onChange={set("project")} /></Field>
        {only("area", <Field label="Area">
          <select name="area" value={f.area} onChange={set("area")}>
            <option value="">{t("form.pick")}</option>
            {choices(options?.areas, f.area).map((a) => <option key={a} value={a}>{serverText(a)}</option>)}
          </select>
        </Field>)}
        {only("space", <Field label={t("form.grossArea")}><input name="space" type="number" min={1} step={1} value={f.space} onChange={set("space")} /></Field>)}
        {only("condition", <Field label={t("form.condition")}>
          <select name="condition" value={f.condition} onChange={set("condition")}><option value="">{t("form.pick")}</option>{choices(options?.conditions, f.condition).map((c) => <option key={c} value={c}>{serverText(c)}</option>)}</select>
        </Field>)}
        {only("floor", <Field label="Floor"><input name="floor" maxLength={40} value={f.floor} onChange={set("floor")} /></Field>)}
        {only("building", <Field label="Build num"><input name="building" maxLength={40} value={f.building} onChange={set("building")} /></Field>)}
        {only("parking", <Field label="Parking slots"><input name="parking" type="number" min={0} step={1} value={f.parking} onChange={set("parking")} /></Field>)}
        {only("agent", <Field label={t("form.agent")}>
          <select name="agentId" value={f.agentId} onChange={set("agentId")}>
            <option value="">{t("form.pick")}</option>{agents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>)}
        {only("areaTabId", <Field label={t("form.areaTab")}>
          <select name="areaTabId" value={f.areaTabId} onChange={set("areaTabId")}>
            <option value="">{t("form.auto")}{auto ? ` (${areaTabLabel(auto)})` : ""}</option>
            {tabs.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>)}
        {only("location", <Field label={t("form.location")}>
          <div className="row">
            <input name="location" dir="ltr" placeholder="30.02, 31.48" value={f.location} onChange={set("location")} />
            <a className="btn ghost sm" href={`https://maps.google.com/${f.location ? `?q=${encodeURIComponent(f.location)}` : ""}`} target="_blank" rel="noopener noreferrer"><Icon name="pin" />{t("form.pick")}</a>
          </div>
        </Field>)}
        {only("lastOwnerUpdateAt", <Field label={t("form.lastUpdate")}><input name="lastOwnerUpdateAt" type="date" value={f.lastOwnerUpdateAt} onChange={set("lastOwnerUpdateAt")} /></Field>)}
        {TYPE_FIELDS[type].map(input)}
        {only("layout", <Field label="Layout">
          <select name="layout" value={f.layout} onChange={set("layout")}><option value="no">No</option><option value="yes">Yes</option></select>
        </Field>)}
        <Field label={t("form.receivedAt")}><input name="receivedAt" type="datetime-local" value={f.receivedAt} onChange={set("receivedAt")} /></Field>
        {only("divisible", <Field label={t("form.divisibleQ")}>
          <select name="divisible" value={f.divisible} onChange={set("divisible")}><option value="no">{t("form.no")}</option><option value="yes">{t("cell.yes")}</option></select>
        </Field>)}
        {f.divisible === "yes" && fields.shows("divisible") && <>
          <Field label={t("form.minSplit")}><input name="minSplit" type="number" min={1} step={1} value={f.minSplit} onChange={set("minSplit")} /></Field>
          <Field label={t("form.splitNote")} wide><textarea name="splitNote" maxLength={500} value={f.splitNote} onChange={set("splitNote")} placeholder={t("form.splitExample")} /></Field>
        </>}
        {type === "Primary" && <div className="wide"><Note kind="warn">{t("form.primaryNote")}</Note></div>}
        {fields.shows("totalPrice") && fields.shows("income") && <div className="wide"><Figures f={f} /></div>}
        <div className="row end wide">
          <span className="hint spacer">{unit ? t("form.editHint") : t("form.newHint")}</span>
          <button className="btn" disabled={busy}>{busy ? t("common.saving") : unit ? t("form.save") : t("form.saveUnit")}</button>
        </div>
      </form>
    </Modal>
  );
}
