"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { FunDayPlan, FunDayView } from "@places/contracts";
import { DateInput, Card, Chip, Empty, Field, Icon, Modal, Note, Tick, onFormSubmit, useAction } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import { api } from "@/lib/api";
import { dateLocale } from "@/lib/format";
import { useMe } from "@/lib/me";

const KEY = ["fun-days"];
const cairoYear = () => Number(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).slice(0, 4));
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => at(iso).toLocaleDateString(dateLocale(), { timeZone: "UTC", ...o });

/** M-05 · fun days (HR, 15 Nov): one event as the demo's visit line — the date block, what, when and where, who it's for. */
function FunDayLine({ e, children }: { e: FunDayView; children?: ReactNode }) {
  const t = useTranslations("hr.funDays");
  return (
    <div className="visit" id={`fd-${e.id}`} style={e.cancelled ? { opacity: 0.6 } : undefined}>
      <span className="v-date"><b>{fmt(e.date, { day: "numeric" })}</b><small>{fmt(e.date, { month: "short" })}</small></span>
      <div className="v-main">
        <b>{e.title}</b>
        <small>
          <Icon name="calendar" />{fmt(e.date, { weekday: "long" })}{e.time && ` · ${e.time}`}
          {e.place && <> · <Icon name="pin" />{e.place}</>}
        </small>
        <span>{e.description}</span>
        <span className="row">
          {e.departments.length ? e.departments.map((d) => <Chip key={d} plain>{d}</Chip>) : <Chip tone="info">{t("everyone")}</Chip>}
          {e.cancelled && <Chip tone="bad">{t("cancelled")}</Chip>}
        </span>
      </div>
      {e.image && <img src={e.image} alt={e.title} style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 10 }} />}
      {children}
    </div>
  );
}

/** «جاي قريب» on «مهامي النهارده»: the next few fun days for this person; nothing planned = no card. */
export function UpcomingFunDays() {
  const t = useTranslations("hr.funDays");
  const list = useQuery({ queryKey: [...KEY, "upcoming"], queryFn: () => api.get<FunDayView[]>("/hr/fun-days/upcoming") }).data ?? [];
  if (!list.length) return null;
  return (
    <Card title={t("upcoming")} icon="gift" sub={t("upcomingSub")} extra={<Link className="btn ghost sm" href="/events">{t("all")}</Link>}>
      <div style={{ display: "grid", gap: 8 }}>{list.map((e) => <FunDayLine key={e.id} e={e} />)}</div>
    </Card>
  );
}

type Draft = Partial<FunDayView> & { title: string; date: string };

/** The events page: everyone reads the year's fun days that are for them; HR («hr: edit») plans, edits and cancels. */
export function FunDaysPage() {
  const t = useTranslations("hr.funDays");
  const { can } = useMe();
  const edit = can("hr", "edit");
  const run = useAction();
  const qc = useQueryClient();
  const [year, setYear] = useState(cairoYear);
  const [draft, setDraft] = useState<Draft | null>(null);
  const plan = useQuery({ queryKey: [...KEY, "plan", year], queryFn: () => api.get<FunDayPlan>(`/hr/fun-days/plan?year=${year}`), enabled: edit });
  const mine = useQuery({ queryKey: [...KEY, "mine", year], queryFn: () => api.get<FunDayView[]>(`/hr/fun-days?year=${year}`), enabled: !edit });
  const events = (edit ? plan.data?.events : mine.data) ?? [];
  const loading = edit ? plan.isLoading : mine.isLoading;
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  // a notification's link «/events?open=<id>»: bring that event into view
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("open");
    if (id && events.length) document.getElementById(`fd-${id}`)?.scrollIntoView({ block: "center" });
  }, [events.length]);

  const cancel = (e: FunDayView) => {
    if (!window.confirm(t("cancelConfirm", { title: e.title }))) return;
    void run(async () => { await api.post(`/hr/fun-days/${e.id}/cancel`); await refresh(); }, t("cancelledToast"));
  };

  return (
    <>
      {edit && plan.data && <Starters plan={plan.data} onPick={setDraft} />}
      <Card title={t("title", { year })} icon="gift" sub={t("sub")}
        extra={<span className="row">
          <button type="button" className="btn ghost sm" aria-label={t("prevYear")} onClick={() => setYear(year - 1)}>›</button>
          <button type="button" className="btn ghost sm" aria-label={t("nextYear")} onClick={() => setYear(year + 1)}>‹</button>
          {edit && <button type="button" className="btn sm" onClick={() => setDraft({ title: "", date: "" })}><Icon name="plus" />{t("new")}</button>}
        </span>}>
        {loading ? <p className="hint">{t("loading")}</p> : !events.length ? <Empty text={t("empty")} icon="gift" /> : (
          <div style={{ display: "grid", gap: 8 }}>
            {events.map((e) => (
              <FunDayLine key={e.id} e={e}>
                {edit && !e.cancelled && <span className="row">
                  <button type="button" className="btn ghost sm" onClick={() => setDraft(e)}>{t("edit")}</button>
                  <button type="button" className="btn ghost sm" onClick={() => cancel(e)}>{t("cancel")}</button>
                </span>}
              </FunDayLine>
            ))}
          </div>
        )}
      </Card>
      {draft && plan.data && <FunDayForm draft={draft} departments={plan.data.departments} onClose={() => setDraft(null)} onSaved={refresh} />}
    </>
  );
}

/** HR's one-click starters for the year's occasions, next to the official holidays already in the calendar. */
function Starters({ plan, onPick }: { plan: FunDayPlan; onPick: (d: Draft) => void }) {
  const t = useTranslations("hr.funDays");
  const planned = new Set(plan.events.filter((e) => !e.cancelled).map((e) => e.title));
  return (
    <Card title={t("starters")} icon="play" sub={t("startersSub")}>
      <div className="row">
        {plan.starters.map((s) => (
          <button key={s.key} type="button" className="btn ghost sm" onClick={() => onPick({ title: s.title, date: s.date ?? "" })}>
            {planned.has(s.title) ? <Icon name="check" /> : <Icon name="plus" />}{s.title}
            <small className="hint">{s.date ? fmt(s.date, { day: "numeric", month: "short" }) : t("pickDate")}</small>
          </button>
        ))}
      </div>
      {plan.holidays.length > 0 && <p className="hint">{t("holidays")}: {plan.holidays.map((h) => `${h.label} (${fmt(h.from, { day: "numeric", month: "short" })})`).join(" · ")}</p>}
    </Card>
  );
}

/** «احتفال جديد» / «تعديل»: no department ticked = everyone. */
function FunDayForm({ draft, departments, onClose, onSaved }: { draft: Draft; departments: string[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const t = useTranslations("hr.funDays");
  const run = useAction();
  const [deps, setDeps] = useState<string[]>(draft.departments ?? []);
  const [image, setImage] = useState<string | null>(draft.imageFileId ?? null);
  const toggle = (d: string, on: boolean) => setDeps(on ? [...deps, d] : deps.filter((x) => x !== d));
  const save = (f: FormData) => void run(async () => {
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const body = { title: s("title"), date: s("date"), time: s("time") || null, place: s("place") || null, description: s("description"), imageFileId: image, departments: deps };
    if (draft.id) await api.put(`/hr/fun-days/${draft.id}`, body);
    else await api.post("/hr/fun-days", body);
    await onSaved();
    onClose();
  }, draft.id ? t("saved") : t("published"));

  return (
    <Modal title={draft.id ? t("editTitle") : t("new")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label={t("name")} req wide><input name="title" defaultValue={draft.title} required minLength={2} maxLength={120} /></Field>
        <Field label={t("date")} req><DateInput name="date" defaultValue={draft.date} required /></Field>
        <Field label={t("time")}><input name="time" type="time" defaultValue={draft.time ?? ""} /></Field>
        <Field label={t("place")} wide><input name="place" defaultValue={draft.place ?? ""} maxLength={120} placeholder={t("placePh")} /></Field>
        <Field label={t("description")} req wide><textarea name="description" defaultValue={draft.description ?? ""} required minLength={2} maxLength={2000} rows={3} placeholder={t("descriptionPh")} /></Field>
        <div className="wide">
          <FileUpload kind="image" label={t("image")} onUploaded={(f) => setImage(f.id)} />
          {draft.image && image === draft.imageFileId && <span className="row"><img src={draft.image} alt="" style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 8 }} /><button type="button" className="btn ghost sm" onClick={() => setImage(null)}>{t("removeImage")}</button></span>}
        </div>
        <div className="wide">
          <b>{t("forWho")}</b>
          <div className="row" style={{ marginTop: 6 }}>
            {departments.map((d) => <span key={d} className="row" style={{ gap: 4 }}><Tick checked={deps.includes(d)} onChange={(on) => toggle(d, on)} label={d} /><span>{d}</span></span>)}
          </div>
          <Note>{deps.length ? t("forSome", { n: deps.length }) : t("forAll")}</Note>
        </div>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("close")}</button><button className="btn"><Icon name="send" />{draft.id ? t("save") : t("publish")}</button></div>
      </form>
    </Modal>
  );
}
