"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { UnitImportDone, UnitImportPreview, UnitImportReviewRow } from "@places/contracts";
import { UNIT_DUP_COLUMNS, UNIT_DUP_DEFAULT, type ImportDecision, type UnitDupColumn } from "@places/domain";
import { Chip, Icon, Modal, Note, Table, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import { num } from "@/lib/format";

/** The demo's IM_COLS labels: the client's own sheet words («Area» is the m², «Contact» the owner's name). */
const LABEL: Record<UnitDupColumn, string> = { project: "Project", space: "Area", floor: "Floor", building: "Building Number", ownerName: "Contact", ownerPhone: "Number" };
const PATH = "/imports/units";

/**
 * 13.1 · 2.38 · the inventory's «استيراد Excel» (demo inventory.js importNew / importReview): the uploader picks the
 * column(s) a repeat is told by, the preview marks each repeat («مكرر مع U-xxx» / «مكرر مع صف N في الملف»), and each
 * one gets a call: leave it out · merge into the unit · «ضيفها برضه». The API decides; the screen shows its answer.
 */
export function UnitImport() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const t = useTranslations("imports");
  return <>
    <button className="btn ghost" onClick={() => setOpen(true)}><Icon name="upload" />{t("units.button")}</button>
    {open && <Dialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); void qc.invalidateQueries(); }} />}
  </>;
}

function Dialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("imports");
  const ti = useTranslations("ui.import");
  const run = useAction();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [cols, setCols] = useState<UnitDupColumn[]>([...UNIT_DUP_DEFAULT]);
  const [p, setP] = useState<UnitImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ImportDecision>>({});
  const [busy, setBusy] = useState(false);
  const step = async (fn: () => Promise<void>) => { setBusy(true); await run(fn); setBusy(false); };
  const latest = useRef(0); // the columns change faster than the API answers: only the last check's answer is shown
  const check = (f: File | null, by: UnitDupColumn[]) => {
    setP(null); setDecisions({});
    const n = ++latest.current;
    if (f) void step(async () => { const r = await api.upload<UnitImportPreview>(`${PATH}/preview`, f, { dupBy: by.join(",") }); if (n === latest.current) setP(r); });
  };
  const toggle = (k: UnitDupColumn, on: boolean) => {
    const next = UNIT_DUP_COLUMNS.filter((c) => (c === k ? on : cols.includes(c)));
    if (!next.length) return toast(serverText("لازم خانة واحدة على الأقل"), "bad");
    setCols(next);
    check(file, next);
  };
  const confirm = () => step(async () => {
    const r = await api.upload<UnitImportDone>(PATH, file!, { dupBy: cols.join(","), decisions: JSON.stringify(decisions) });
    toast(t("units.dup.done", { added: r.imported, merged: r.merged, skipped: (p?.total ?? 0) - r.imported - r.merged }));
    onDone();
  });
  const by = cols.map((c) => LABEL[c]).join(" + ");
  const dupChip = (r: UnitImportReviewRow) => !r.dupOf ? <Chip tone="ok">{t("units.dup.new")}</Chip>
    : "unit" in r.dupOf ? <Chip tone="warn">{t("units.dup.withUnit", { code: r.dupOf.unit })}</Chip>
    : <Chip tone="warn">{t("units.dup.withRow", { line: r.dupOf.line })}</Chip>;
  const decide = (r: UnitImportReviewRow) => {
    if (!r.dupOf) return t("units.dup.willAdd");
    const v = decisions[r.line] ?? "skip";
    return <select aria-label={t("units.dup.decision")} value={v} onChange={(e) => setDecisions({ ...decisions, [r.line]: e.target.value as ImportDecision })}>
      <option value="skip">{t("units.dup.skip")}</option>
      {"unit" in r.dupOf && <option value="merge">{t("units.dup.merge")}</option>}
      <option value="add">{t("units.dup.add")}</option>
    </select>;
  };
  const adding = p ? p.review.filter((r) => !r.dupOf || (decisions[r.line] ?? "skip") !== "skip").length : 0;

  return (
    <Modal title={t("units.title")} onClose={onClose}>
      <Note>{t("units.dup.intro")}</Note>
      <div className="row">
        <label className="btn ghost">
          <Icon name="upload" />{file ? file.name : ti("pick")}
          <input type="file" hidden accept=".xlsx,.csv" aria-label={ti("fileLabel")} onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; setFile(f); check(f, cols); }} />
        </label>
        <button type="button" className="btn ghost sm" onClick={() => run(() => api.download(`${PATH}/template`, t("units.template")))}><Icon name="file" />{ti("template")}</button>
      </div>
      <div className="na-cols"><span className="hint">{t("units.dup.by")}</span>
        {UNIT_DUP_COLUMNS.map((k) => <label key={k} className="tog"><input type="checkbox" checked={cols.includes(k)} onChange={(e) => toggle(k, e.target.checked)} /><span>{LABEL[k]}</span></label>)}
      </div>
      <p className="hint">{t("units.dup.rule", { count: cols.length })}</p>
      {busy && !p && <p className="hint">{ti("reading")}</p>}
      {p && <>
        <div className="row"><Chip plain>{ti("rows", { count: p.total })}</Chip><Chip tone="ok">{ti("new", { count: p.valid })}</Chip><Chip tone="warn">{ti("duplicates", { count: p.duplicates ?? 0 })}</Chip>{p.errors.length > 0 && <Chip tone="bad">{ti("errors", { count: p.errors.length })}</Chip>}</div>
        {p.errors.length > 0 && <>
          <Note kind="warn">{ti("skipNote")}</Note>
          <Table head={[ti("place"), ti("column"), ti("problem")]} rows={p.errors.slice(0, 100).map((e) => [ti("line", { line: e.line }), e.column || "—", serverText(e.message)])} />
        </>}
        {!!p.duplicates && <Note>{t.rich("units.dup.review", { by, b: (s) => <b>{s}</b> })}</Note>}
        {p.review.length > 0 && <Table head={[t("units.dup.cols.project"), t("units.dup.cols.space"), t("units.dup.cols.floor"), t("units.dup.cols.building"), t("units.dup.cols.owner"), t("units.dup.cols.dup"), t("units.dup.cols.decision")]}
          rows={p.review.slice(0, 500).map((r) => [r.project, <span key="s" className="num">{num(r.space)}</span>, r.floor ?? "—", r.building ?? "—", r.ownerName ?? "—", dupChip(r), decide(r)])} />}
      </>}
      <div className="row end">
        <button type="button" className="btn ghost" onClick={onClose}>{ti("cancel")}</button>
        <button type="button" className="btn" disabled={!p || busy || adding === 0} onClick={confirm}>{busy && p ? ti("saving") : adding ? ti("confirmRows", { count: adding }) : ti("confirm")}</button>
      </div>
    </Modal>
  );
}
