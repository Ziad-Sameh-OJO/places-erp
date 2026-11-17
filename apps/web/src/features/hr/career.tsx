"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { CareerRowView, CareerTrackView, CareerView } from "@places/contracts";
import { DateInput, Card, Chip, Empty, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const TONE = { due: "ok", near: "warn", notYet: "", noLevel: "", top: "" } as const;
const STATUSES = ["due", "near", "notYet", "noLevel", "top"] as const;
const mark = (ok: boolean | null) => (ok === null ? "—" : ok ? "✓" : "✗");

/** M-05 · «المسار الوظيفي» (HR, 15 Nov): everyone's level → the next, each condition quarter by quarter, and the tracks. */
export function CareerPath() {
  const t = useTranslations("hr.career");
  const q = useQuery({ queryKey: ["hr", "career"], queryFn: () => api.get<CareerView>("/hr/career") });
  const [track, setTrack] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  if (!q.data) return <Empty text={t("loading")} icon="clock" />;
  const d = q.data;
  const rows = d.rows.filter((r) => (!track || r.trackId === track) && (!status || r.status === status));
  const row = d.rows.find((r) => r.employeeId === open);
  const cond = (r: CareerRowView) => !r.check ? "—" : (
    <span key="c" className="row">
      <Chip tone={r.check.kpi ? "ok" : "bad"}>KPIs {mark(r.check.kpi)}</Chip>
      {r.check.target === null ? <Chip>{t("noTarget")}</Chip> : <Chip tone={r.check.target ? "ok" : "bad"}>{t("target")} {mark(r.check.target)}</Chip>}
      {r.check.months !== null && <Chip tone={r.check.months ? "ok" : "bad"}>{t("monthsShort", { n: r.monthsInLevel ?? 0 })} {mark(r.check.months)}</Chip>}
    </span>
  );
  return (
    <>
      <Card title={t("title")} icon="star" sub={t("sub", { quarter: d.lastClosed ?? "—" })}
        extra={<span className="row">
          <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label={t("track")}><option value="">{t("allTracks")}</option>{d.tracks.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("status")}><option value="">{t("allStatuses")}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`statuses.${s}`)}</option>)}</select>
        </span>}>
        <Table head={[t("employee"), t("level"), t("next"), t("conditions"), t("status"), ""]} empty={t("empty")}
          rows={rows.map((r) => [
            <span key="n"><b>{r.name}</b><span className="sub">{r.jobTitle}</span></span>,
            r.level ? <span key="l">{r.level.name}<span className="sub">{t("since", { day: r.level.since })}</span></span> : "—",
            r.next?.name ?? "—", cond(r),
            <Chip key="s" tone={TONE[r.status]}>{t(`statuses.${r.status}`)}</Chip>,
            <button key="b" className="btn ghost sm" onClick={() => setOpen(r.employeeId)}>{t("details")}</button>,
          ])} />
        {!d.lastClosed && <Note>{t("noClosed")}</Note>}
      </Card>
      <Tracks tracks={d.tracks} canEdit={d.canEdit} />
      {row && <Person row={row} tracks={d.tracks} canEdit={d.canEdit} onClose={() => setOpen(null)} />}
    </>
  );
}

/** One person: the conditions quarter by quarter, the history, and HR recording the level or a promotion. */
function Person({ row, tracks, canEdit, onClose }: { row: CareerRowView; tracks: CareerTrackView[]; canEdit: boolean; onClose: () => void }) {
  const t = useTranslations("hr.career");
  const qc = useQueryClient();
  const run = useAction();
  const [kind, setKind] = useState<"promotion" | "set">(row.next ? "promotion" : "set");
  const save = onFormSubmit((f) => run(async () => {
    await api.post("/hr/career/moves", { employeeId: row.employeeId, levelId: f.get("levelId"), day: f.get("day"), kind, note: String(f.get("note") ?? "") || undefined });
    await qc.invalidateQueries({ queryKey: ["hr"] });
    onClose();
  }, t("recorded")));
  const r = row.rule;
  return (
    <Modal title={row.name} onClose={onClose}>
      <p>{row.level ? <><b>{row.level.name}</b> {t("arrow")} <b>{row.next?.name ?? "—"}</b></> : t("statuses.noLevel")} <Chip tone={TONE[row.status]}>{t(`statuses.${row.status}`)}</Chip></p>
      {r && row.check && <>
        <Note>{t("rule", { quarters: r.quarters, kpi: r.minKpi, target: r.minTarget })}{r.minMonths !== null ? ` · ${t("ruleMonths", { n: r.minMonths, have: row.monthsInLevel ?? 0 })}` : ""}</Note>
        <Table head={[t("quarter"), "KPIs", t("target")]} empty={t("noClosed")}
          rows={row.check.quarters.map((x) => [x.quarter,
            <span key="k">{x.kpi === null ? t("noCard") : `${x.kpi}%`} {mark(x.kpiOk)}</span>,
            x.target === null ? t("noTarget") : <span key="t">{x.target}% {mark(x.targetOk)}</span>])} />
      </>}
      {row.history.length > 0 && <>
        <h4 className="mini-h">{t("history")}</h4>
        {row.history.map((h) => <div key={h.id} className="line-item"><span><b>{h.track} · {h.level}</b> <Chip tone={h.kind === "promotion" ? "ok" : ""}>{t(`kinds.${h.kind}`)}</Chip><span className="sub">{h.day} · {h.by}{h.note ? ` · ${h.note}` : ""}</span></span></div>)}
      </>}
      {canEdit && (
        <form className="grid" onSubmit={save}>
          <Field label={t("kind")}><select value={kind} onChange={(e) => setKind(e.target.value as "promotion" | "set")}><option value="promotion">{t("kinds.promotion")}</option><option value="set">{t("kinds.set")}</option></select></Field>
          <Field label={t("newLevel")} req><select name="levelId" required defaultValue={row.next?.id ?? ""}><option value="" disabled>{t("choose")}</option>
            {tracks.map((x) => <optgroup key={x.id} label={x.name}>{x.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}</select></Field>
          <Field label={t("day")} req><DateInput name="day" defaultValue={today()} required /></Field>
          <Field label={t("note")} wide><input name="note" maxLength={500} /></Field>
          <div className="row end wide"><button className="btn"><Icon name="check" />{t("record")}</button></div>
        </form>
      )}
    </Modal>
  );
}

/** The tracks HR defines: each level in order with the rule to reach it. */
function Tracks({ tracks, canEdit }: { tracks: CareerTrackView[]; canEdit: boolean }) {
  const t = useTranslations("hr.career");
  const [edit, setEdit] = useState<CareerTrackView | "new" | null>(null);
  return (
    <Card title={t("tracksTitle")} icon="list" sub={t("tracksSub")}
      extra={canEdit && <button className="btn ghost sm" onClick={() => setEdit("new")}><Icon name="plus" />{t("newTrack")}</button>}>
      {!tracks.length ? <p className="hint">{t("noTracks")}</p> : tracks.map((x) => (
        <div key={x.id} className="line-item">
          <span><b>{x.name}</b> {x.sample && <Chip tone="warn">{t("sample")}</Chip>}
            <span className="sub">{x.levels.map((l) => l.rule ? `${t("arrow")} ${l.name} (${t("ruleShort", { quarters: l.rule.quarters, kpi: l.rule.minKpi, target: l.rule.minTarget })}${l.rule.minMonths !== null ? ` · ${t("monthsShort", { n: l.rule.minMonths })}` : ""})` : l.name).join(" ")}</span></span>
          {canEdit && <button className="btn ghost sm" onClick={() => setEdit(x)}>{t("edit")}</button>}
        </div>
      ))}
      {edit && <TrackForm track={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

type LevelDraft = { id?: string; name: string; quarters: number; minKpi: number; minTarget: number; minMonths: number | null };

function TrackForm({ track, onClose }: { track: CareerTrackView | null; onClose: () => void }) {
  const t = useTranslations("hr.career");
  const qc = useQueryClient();
  const run = useAction();
  const [name, setName] = useState(track?.name ?? "");
  const [levels, setLevels] = useState<LevelDraft[]>(track?.levels.map((l) => ({ id: l.id, name: l.name, quarters: l.rule?.quarters ?? 2, minKpi: l.rule?.minKpi ?? 85, minTarget: l.rule?.minTarget ?? 100, minMonths: l.rule?.minMonths ?? null }))
    ?? [{ name: "", quarters: 2, minKpi: 85, minTarget: 100, minMonths: null }, { name: "", quarters: 2, minKpi: 85, minTarget: 100, minMonths: null }]);
  const set = (i: number, patch: Partial<LevelDraft>) => setLevels(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const done = async () => { await qc.invalidateQueries({ queryKey: ["hr"] }); onClose(); };
  const save = onFormSubmit(() => run(async () => {
    const body = { name, levels };
    await (track ? api.put(`/hr/career/tracks/${track.id}`, body) : api.post("/hr/career/tracks", body));
    await done();
  }, t("saved")));
  const remove = () => run(async () => { await api.del(`/hr/career/tracks/${track!.id}`); await done(); }, t("deleted"));
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));
  return (
    <Modal title={track ? track.name : t("newTrack")} onClose={onClose}>
      <form onSubmit={save}>
        <Field label={t("trackName")} req><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} /></Field>
        {levels.map((l, i) => (
          <div key={l.id ?? `new-${i}`} className="grid">
            <Field label={t("levelN", { n: i + 1 })} req><input value={l.name} onChange={(e) => set(i, { name: e.target.value })} required maxLength={60} /></Field>
            {i > 0 && <>
              <Field label={t("quarters")}><input type="number" min={1} max={8} value={l.quarters} onChange={(e) => set(i, { quarters: num(e.target.value) })} /></Field>
              <Field label={t("minKpi")}><input type="number" min={0} max={1000} value={l.minKpi} onChange={(e) => set(i, { minKpi: num(e.target.value) })} /></Field>
              <Field label={t("minTarget")}><input type="number" min={0} max={1000} value={l.minTarget} onChange={(e) => set(i, { minTarget: num(e.target.value) })} /></Field>
              <Field label={t("minMonths")}><input type="number" min={1} max={120} value={l.minMonths ?? ""} placeholder={t("optional")} onChange={(e) => set(i, { minMonths: e.target.value ? num(e.target.value) : null })} /></Field>
            </>}
            {levels.length > 2 && <div className="row end"><button type="button" className="btn ghost sm" onClick={() => setLevels(levels.filter((_, j) => j !== i))} aria-label={t("removeLevel")}><Icon name="x" /></button></div>}
          </div>
        ))}
        <div className="row end">
          {track && <button type="button" className="btn ghost" onClick={() => void remove()}>{t("deleteTrack")}</button>}
          <button type="button" className="btn ghost" onClick={() => setLevels([...levels, { name: "", quarters: 2, minKpi: 85, minTarget: 100, minMonths: null }])}><Icon name="plus" />{t("addLevel")}</button>
          <button className="btn">{t("save")}</button>
        </div>
      </form>
    </Modal>
  );
}
