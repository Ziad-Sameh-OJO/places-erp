"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { RecommendAnswers, RecommendedUnit, Recommendations } from "@places/contracts";
import { Chip, Empty, Icon, Modal, Note, useAction, useToast } from "@/components/ui";
import { useFields, useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { dateLocale, money, num } from "@/lib/format";
import { useRefreshLead } from "./use-lead";
import { serverText } from "@/lib/server-text";

const key = (id: string) => ["lead", id, "recommendations"];

/**
 * M-09: the units follow the inventory's field rules — a hidden unit field is left out of the card, the PDF preview and
 * the questions (the API blanks it and doesn't apply a question on it).
 */
function useUnitFields() {
  const f = useFields("inventory");
  const parts = (...p: [string, string][]) => p.filter(([k]) => f.shows(k)).map(([, text]) => text).join(" · ");
  return { shows: f.shows, parts };
}

/** The units that suit the lead's client (2.12); the drawer's tab shows how many. */
export const useRecommendations = (id: string) =>
  useQuery({ queryKey: key(id), queryFn: () => api.get<Recommendations>(`/leads/${id}/recommendations`) });

/**
 * Demo «الوحدات» (M-03 3.2 · 7.1): the units near the client's space and budget (± the tolerance in the settings), with
 * their finishing and type, the big divisible ones too; the narrowing questions cut the list, and their answers are
 * saved on the lead. The ticked units go to the client as a PDF list, recorded as a comment on the lead (2.13).
 */
export function RecommendedUnits({ id, name }: { id: string; name: string }) {
  const t = useTranslations("leads.units");
  const { can } = useMe();
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const recs = useRecommendations(id);
  const unit = useUnitFields();
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const r = recs.data;
  if (recs.error) return <Empty text={recs.error.message} />;
  if (!r) return <p className="hint">{t("loading")}</p>;
  const c = r.client;
  const save = (answers: RecommendAnswers) => void run(async () => { qc.setQueryData(key(id), await api.put<Recommendations>(`/leads/${id}/answers`, answers)); });
  const ask = (k: keyof RecommendAnswers, v: string) => save({ ...r.answers, [k]: v || undefined });
  const edit = can("leads", "edit");
  // a narrowing answer can drop a ticked unit from the list: only the ones still shown are sent
  const chosen = r.items.filter((u) => picked.includes(u.id));
  const tick = (u: RecommendedUnit, on: boolean) => setPicked((p) => (on ? [...p, u.id] : p.filter((x) => x !== u.id)));
  return (
    <>
      <Note>{t.rich("match", { client: `${c.type} · ${c.space != null ? t("sqm", { n: num(c.space) }) : t("anySpace")} · ${c.condition ? serverText(c.condition) : t("anyCondition")} · ${money(c.budget)} · ${c.area || "—"}`, pct: r.tolerancePct, b: (c) => <b>{c}</b> })}</Note>
      {edit && <Questions r={r} onAsk={ask} onReset={() => save({})} />}
      <div className="rec-list">
        {r.items.length ? r.items.map((u) => (
          <label key={u.id} className="rec">
            {edit && <input type="checkbox" checked={picked.includes(u.id)} onChange={(e) => tick(u, e.target.checked)} aria-label={t("pickUnit", { code: u.code })} />}
            <span className="rec-match num">{u.match}%</span>
            <div className="rec-main"><b>{u.code} · {u.project}</b><small>{unit.parts(["area", serverText(u.area)], ["floor", t("floor", { floor: u.floor || "—" })], ["space", t("sqm", { n: num(u.space) })], ["condition", u.condition], ["parking", `Parking ${u.parking}`])}</small></div>
            {unit.shows("pricePerSqm") && <div className="rec-price"><b className="num">{money(u.price)}</b><small>{u.monthly ? t("monthly") : t("total")}</small></div>}
            {u.split ? <Chip tone="info">{t("splits", { n: num(u.minSplit ?? c.space ?? 0) })}</Chip> : u.sameArea ? <Chip tone="ok">{t("sameArea")}</Chip> : null}
          </label>
        )) : <Empty text={t("empty")} icon="building" />}
      </div>
      {edit && r.items.length > 0 && <div className="row end">
        <button className="btn" onClick={() => (chosen.length ? setPreview(true) : toast(t("pickOne")))}><Icon name="file" />{t("makePdf")}</button>
      </div>}
      {preview && <ListPreview id={id} name={name} units={chosen} clientSpace={c.space} onClose={() => setPreview(false)} onSent={() => { setPreview(false); setPicked([]); }} />}
    </>
  );
}

/** «جاوب عشان الـ Recommendations تقل» — the requirements' proposed questions (the client hasn't sent his list yet). */
function Questions({ r, onAsk, onReset }: { r: Recommendations; onAsk: (k: keyof RecommendAnswers, v: string) => void; onReset: () => void }) {
  const t = useTranslations("leads.units.questions");
  const a = r.answers;
  const sale = r.client.type !== "Rent";
  const { shows } = useUnitFields();
  return (
    <div className="qs">
      <span className="qs-t"><Icon name="filter" />{t("title")}</span>
      {shows("floor") && <select value={a.floor ?? ""} onChange={(e) => onAsk("floor", e.target.value)} aria-label={t("floor")}>
        <option value="">{t("anyFloor")}</option><option value="ground">{t("groundOnly")}</option>
      </select>}
      {shows("parking") && <select value={a.parking ?? ""} onChange={(e) => onAsk("parking", e.target.value)} aria-label={t("parking")}>
        <option value="">{t("anyParking")}</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Parking {n}+</option>)}
      </select>}
      <select value={a.project ?? ""} onChange={(e) => onAsk("project", e.target.value)} aria-label={t("project")}>
        <option value="">{t("anyProject")}</option>
        {[...new Set([...r.projects, ...(a.project ? [a.project] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {shows("area") && <select value={a.area ?? ""} onChange={(e) => onAsk("area", e.target.value)} aria-label={t("area")}>
        <option value="">{t("anyArea")}</option><option value="same">{t("sameArea")}</option>
      </select>}
      {shows("divisible") && <select value={a.split ?? ""} onChange={(e) => onAsk("split", e.target.value)} aria-label={t("split")}>
        <option value="">{t("splitOk")}</option><option value="no">{t("noSplit")}</option>
      </select>}
      {sale && shows("paymentMethod") && <select value={a.payment ?? ""} onChange={(e) => onAsk("payment", e.target.value)} aria-label={t("payment")}>
        <option value="">{t("anyPayment")}</option>
        {[...new Set([...r.paymentMethods, ...(a.payment ? [a.payment] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
      </select>}
      {sale && shows("delivery") && <label className="qs-t">{t("deliveryBy")}<input type="date" value={a.deliveryBy ?? ""} onChange={(e) => onAsk("deliveryBy", e.target.value)} aria-label={t("deliveryBy")} /></label>}
      {Object.values(a).some((v) => v != null && v !== "") && <button className="btn ghost sm" onClick={onReset}>{t("reset")}</button>}
    </div>
  );
}

/**
 * Demo «List of options · PDF»: what the client gets, then «ابعت للعميل وسجّل كومنت» — the API makes the PDF (it
 * downloads, to be sent to the client) and writes the comment with each unit's project and space on the lead.
 */
function ListPreview({ id, name, units, clientSpace, onClose, onSent }: { id: string; name: string; units: RecommendedUnit[]; clientSpace: number | null; onClose: () => void; onSent: () => void }) {
  const run = useAction();
  const refresh = useRefreshLead();
  const t = useTranslations("leads.units.pdf");
  const unit = useUnitFields();
  const [busy, setBusy] = useState(false);
  const send = () => {
    setBusy(true);
    void run(async () => {
      try {
        await api.download(`/leads/${id}/unit-list`, `List of options · ${name}.pdf`, { unitIds: units.map((u) => u.id) });
        await refresh(id);
        onSent();
      } finally { setBusy(false); }
    }, t("sent"));
  };
  return (
    <Modal title="List of options · PDF" onClose={onClose}>
      <div className="pdf">
        <div className="pdf-head"><span className="brand-mark sm"><Icon name="building" /></span><div><b>Places · List of options</b><small>{t("for", { name, date: new Date().toLocaleDateString(dateLocale(), { timeZone: "Africa/Cairo" }) })}</small></div></div>
        {units.map((u) => (
          <div key={u.id} className="pdf-row">
            <div className="pdf-img"><Icon name="image" /></div>
            <div><b>{u.project} · {u.code}</b><small>{unit.parts(["area", serverText(u.area)], ["floor", t("floor", { floor: u.floor || "—" })],
              ["space", u.split && clientSpace ? t("part", { n: num(clientSpace), of: num(u.space) }) : t("sqm", { n: num(u.space) })], ["condition", u.condition])}</small></div>
            {unit.shows("pricePerSqm") && <b className="num">{money(u.price)}{u.monthly && u.price ? <small>{t("perMonth")}</small> : null}</b>}
          </div>
        ))}
        <p className="hint">{t("auto")}</p>
      </div>
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>{t("back")}</button>
        <button className="btn" disabled={busy} onClick={send}><Icon name="send" />{t("send")}</button>
      </div>
    </Modal>
  );
}
