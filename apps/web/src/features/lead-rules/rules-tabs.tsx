"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { LeadRulesOptions } from "@places/contracts";
import { OWNER, OWNER_TL, type LeadRules, type RuleWho } from "@places/domain";
import { Holidays } from "@/components/holidays";
import { Card, Chip, Field, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import { useDuration } from "../leads/lead-bits";

type Channel = RuleWho["ch"][number];
const CH: Channel[] = ["app", "push", "email"];
/** Sunday first, as JavaScript counts the days (work.off holds these indexes). */
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export const useLeadRules = () => useQuery({ queryKey: ["lead-rules"], queryFn: () => api.get<LeadRules>("/leads/rules") });
const useOptions = () => useQuery({ queryKey: ["lead-rules-options"], queryFn: () => api.get<LeadRulesOptions>("/leads/rules/options"), staleTime: 60_000 });

/**
 * One change saves the whole rules (the API checks the combination and audits). A refused change shows why and the
 * page goes back to what's saved, like the demo's ruleSave.
 */
function useSave() {
  const t = useTranslations("leadRules");
  const qc = useQueryClient();
  const run = useAction();
  return (next: LeadRules) => run(async () => {
    // shown at once (a tick or a number changes as it's clicked); a refusal puts back what's saved
    qc.setQueryData(["lead-rules"], next);
    try {
      qc.setQueryData(["lead-rules"], await api.put<LeadRules>("/leads/rules", next));
      await qc.invalidateQueries({ queryKey: ["leads-summary"] });
    } catch (e) {
      await qc.invalidateQueries({ queryKey: ["lead-rules"] });
      throw e;
    }
  }, t("saved"));
}

/** The sentence over each rule: what will happen with the values as they are now (demo `says`). */
const Says = ({ children }: { children: ReactNode }) => <p className="rule-says"><Icon name="bolt" /><span>{children}</span></p>;

/** A number typed in hours or days; saved when the field is left or Enter is pressed. `minutes`: stored in minutes, typed in hours. */
function NumIn({ label, unit, value, minutes, editable, onSave }: { label: string; unit: string; value: number; minutes?: boolean; editable: boolean; onSave: (v: number) => void }) {
  const shown = minutes ? value / 60 : value;
  const [text, setText] = useState(String(shown));
  useEffect(() => setText(String(shown)), [shown]);
  const commit = () => {
    const x = Number(text);
    if (String(shown) === text) return;
    if (!(x > 0)) { setText(String(shown)); return; }
    onSave(minutes ? Math.round(x * 60) : Math.round(x));
  };
  return (
    <Field label={label}>
      <div className="row">
        <input type="number" min={minutes ? 0.25 : 1} step={minutes ? 0.25 : 1} value={text} disabled={!editable} aria-label={label} style={{ maxWidth: 110 }}
          onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
        <span className="hint">{unit}</span>
      </div>
    </Field>
  );
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function TimeIn({ label, value, editable, onSave }: { label: string; value: number; editable: boolean; onSave: (v: number) => void }) {
  return (
    <Field label={label}>
      <input type="time" defaultValue={hhmm(value)} key={value} disabled={!editable} aria-label={label} style={{ maxWidth: 140 }}
        onBlur={(e) => { const [h, m] = e.target.value.split(":").map(Number); if (e.target.value && h! * 60 + m! !== value) onSave(h! * 60 + m!); }} />
    </Field>
  );
}

/** Demo whoBox: the people / roles told or responsible, «+ ضيف دور أو شخص», and their channels. */
function WhoBox({ label, who, editable, noChannels, onSave }: { label: string; who: RuleWho; editable: boolean; noChannels?: boolean; onSave: (w: RuleWho) => void }) {
  const t = useTranslations("leadRules.who");
  const o = useOptions().data;
  const name = useWhoName();
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row">
        {who.to.map((x) => editable
          ? <button key={x} type="button" className="btn ghost sm" aria-label={t("remove", { name: name(x) })} onClick={() => onSave({ ...who, to: who.to.filter((y) => y !== x) })}>{name(x)} <Icon name="x" /></button>
          : <Chip key={x} tone="info">{name(x)}</Chip>)}
        {!who.to.length && <span className="hint">{t("nobody")}</span>}
        {editable && o && (
          <select value="" aria-label={t("addTo", { label })} style={{ maxWidth: 200 }} onChange={(e) => e.target.value && onSave({ ...who, to: [...who.to, e.target.value] })}>
            <option value="">{t("add")}</option>
            {!who.to.includes(OWNER) && <option value={OWNER}>{t("owner")}</option>}
            {!who.to.includes(OWNER_TL) && <option value={OWNER_TL}>{t("ownerTl")}</option>}
            <optgroup label={t("roles")}>{o.roles.filter((r) => !who.to.includes(r.key)).map((r) => <option key={r.key} value={r.key}>{serverText(r.label)}</option>)}</optgroup>
            <optgroup label={t("people")}>{o.people.filter((p) => !who.to.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          </select>
        )}
      </div>
      {!noChannels && (
        <div className="row">
          {CH.map((c) => (
            <label key={c} className="tog">
              <input type="checkbox" checked={who.ch.includes(c)} disabled={!editable} onChange={(e) => onSave({ ...who, ch: e.target.checked ? [...who.ch, c] : who.ch.filter((x) => x !== c) })} />
              <span>{t(`ch.${c}`)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function useWhoName() {
  const t = useTranslations("leadRules.who");
  const o = useOptions().data;
  const role = (x: string) => o?.roles.find((r) => r.key === x)?.label;
  return (x: string) => x === OWNER ? t("owner") : x === OWNER_TL ? t("ownerTl")
    : (role(x) != null ? serverText(role(x)!) : undefined) ?? o?.people.find((p) => p.id === x)?.name ?? x;
}
function useNames() {
  const t = useTranslations("leadRules.who");
  const name = useWhoName();
  return (w: RuleWho) => w.to.map(name).join(t("sep")) || t("nobody");
}

function OnToggle({ on, editable, onSave }: { on: boolean; editable: boolean; onSave: (v: boolean) => void }) {
  const t = useTranslations("leadRules");
  return <label className="tog"><input type="checkbox" checked={on} disabled={!editable} onChange={(e) => onSave(e.target.checked)} /><span>{t("on")}</span></label>;
}

export type RulesTab = "sla" | "na" | "draft" | "visit" | "close";

/** Demo «قواعد الليدز والتوزيع»: the tabs after «التوزيع» (1.29). Each rule says in Arabic what happens with its current values. */
export function RulesTabs({ tab, editable }: { tab: RulesTab; editable: boolean }) {
  const t = useTranslations("leadRules");
  const duration = useDuration();
  const q = useLeadRules();
  const o = useOptions().data;
  const save = useSave();
  const names = useNames();
  if (q.error) return <Note kind="warn">{q.error.message}</Note>;
  const r = q.data;
  if (!r) return <p className="hint">{t("loading")}</p>;
  const ed = editable;
  const set = (next: LeadRules) => void save(next);

  if (tab === "sla") return (
    <div className="cols">
      <Card title={t("sla.hoursTitle")} icon="clock" sub={t("sla.hoursSub")}>
        <div className="grid">
          <TimeIn label={t("sla.from")} value={r.work.from} editable={ed} onSave={(v) => set({ ...r, work: { ...r.work, from: v } })} />
          <TimeIn label={t("sla.to")} value={r.work.to} editable={ed} onSave={(v) => set({ ...r, work: { ...r.work, to: v } })} />
        </div>
        <div className="field">
          <span>{t("sla.weekOff")}</span>
          <div className="row">
            {DAYS.map((d, i) => (
              <label key={d} className="tog">
                <input type="checkbox" checked={r.work.off.includes(i)} disabled={!ed} onChange={(e) => set({ ...r, work: { ...r.work, off: e.target.checked ? [...r.work.off, i] : r.work.off.filter((x) => x !== i) } })} />
                <span>{t(`days.${d}`)}</span>
              </label>
            ))}
          </div>
        </div>
      </Card>
      <Card title={t("sla.title")} icon="alert" extra={<OnToggle on={r.sla.on} editable={ed} onSave={(on) => set({ ...r, sla: { ...r.sla, on } })} />}>
        <Says>{t.rich("sla.says", { warn: duration(r.sla.warnMin), warnTo: names(r.sla.warn), pull: duration(r.sla.pullMin), pullTo: names(r.sla.pull), holWarn: duration(r.sla.holWarnMin), holPull: duration(r.sla.holPullMin), b: (c) => <b>{c}</b> })}</Says>
        <div className="grid">
          <NumIn label={t("sla.warnAfter")} unit={t("hour")} minutes value={r.sla.warnMin} editable={ed} onSave={(v) => set({ ...r, sla: { ...r.sla, warnMin: v } })} />
          <NumIn label={t("sla.pullAfter")} unit={t("hour")} minutes value={r.sla.pullMin} editable={ed} onSave={(v) => set({ ...r, sla: { ...r.sla, pullMin: v } })} />
          <NumIn label={t("sla.holWarn")} unit={t("hour")} minutes value={r.sla.holWarnMin} editable={ed} onSave={(v) => set({ ...r, sla: { ...r.sla, holWarnMin: v } })} />
          <NumIn label={t("sla.holPull")} unit={t("hour")} minutes value={r.sla.holPullMin} editable={ed} onSave={(v) => set({ ...r, sla: { ...r.sla, holPullMin: v } })} />
        </div>
        <WhoBox label={t("sla.warnTo")} who={r.sla.warn} editable={ed} onSave={(w) => set({ ...r, sla: { ...r.sla, warn: w } })} />
        <WhoBox label={t("sla.pullTo")} who={r.sla.pull} editable={ed} onSave={(w) => set({ ...r, sla: { ...r.sla, pull: w } })} />
      </Card>
      <Card title={t("sla.holidays")} icon="calendar" sub={t("sla.holidaysSub")}>
        <Holidays path="/leads/rules/holidays" editable={ed} upcoming />
        <p className="hint">{t("sla.holidaysHint")}</p>
      </Card>
      <Card title={t("sla.newLead")} icon="users">
        <Says>{t.rich("sla.newLeadSays", { to: names(r.newLead), b: (c) => <b>{c}</b> })}</Says>
        <WhoBox label={t("notifyTo")} who={r.newLead} editable={ed} onSave={(w) => set({ ...r, newLead: w })} />
      </Card>
    </div>
  );

  if (tab === "na") {
    const tele = o?.telesales.find((x) => x.id === r.noAnswer.telesales)?.name ?? t("na.theTelesales");
    return (
      <Card title="No Answer" icon="phone">
        <Says>{t.rich("na.says", { stay: duration(r.noAnswer.hours * 60), every: r.noAnswer.remindH, at: r.noAnswer.toTelesalesAt, tele, to: names(r.noAnswer.notify), b: (c) => <b>{c}</b> })}</Says>
        <div className="grid">
          <NumIn label={t("na.stays")} unit={t("na.staysUnit")} value={r.noAnswer.hours} editable={ed} onSave={(v) => set({ ...r, noAnswer: { ...r.noAnswer, hours: v } })} />
          <NumIn label={t("na.remind")} unit={t("hours")} value={r.noAnswer.remindH} editable={ed} onSave={(v) => set({ ...r, noAnswer: { ...r.noAnswer, remindH: v } })} />
          <NumIn label={t("na.toTelesalesAt")} unit="" value={r.noAnswer.toTelesalesAt} editable={ed} onSave={(v) => set({ ...r, noAnswer: { ...r.noAnswer, toTelesalesAt: v } })} />
          <Field label={t("na.receiver")}>
            <select value={r.noAnswer.telesales ?? ""} disabled={!ed} onChange={(e) => set({ ...r, noAnswer: { ...r.noAnswer, telesales: e.target.value || null } })}>
              <option value="">{t("na.anyTelesales")}</option>
              {o?.telesales.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
        </div>
        <WhoBox label={t("na.notifyTo")} who={r.noAnswer.notify} editable={ed} onSave={(w) => set({ ...r, noAnswer: { ...r.noAnswer, notify: w } })} />
      </Card>
    );
  }

  if (tab === "draft") return (
    <>
      <Card title={t("draft.title")} icon="layers" extra={<OnToggle on={r.draft.on} editable={ed} onSave={(on) => set({ ...r, draft: { ...r.draft, on } })} />}>
        <Says>{t.rich("draft.says", { days: r.draft.days, holdDays: r.draft.holdDays, to: names(r.draft.notify), see: names(r.draft.see), b: (c) => <b>{c}</b> })}</Says>
        <div className="grid">
          <NumIn label={t("draft.pullAfter")} unit={t("draft.pullUnit")} value={r.draft.days} editable={ed} onSave={(v) => set({ ...r, draft: { ...r.draft, days: v } })} />
          <NumIn label={t("draft.holdAfter")} unit={t("day")} value={r.draft.holdDays} editable={ed} onSave={(v) => set({ ...r, draft: { ...r.draft, holdDays: v } })} />
        </div>
        <WhoBox label={t("draft.see")} who={r.draft.see} editable={ed} noChannels onSave={(w) => set({ ...r, draft: { ...r.draft, see: w } })} />
        <WhoBox label={t("draft.notifyTo")} who={r.draft.notify} editable={ed} onSave={(w) => set({ ...r, draft: { ...r.draft, notify: w } })} />
      </Card>
      <Card title="Draft Admin" icon="layers" extra={<OnToggle on={r.draftAdmin.on} editable={ed} onSave={(on) => set({ ...r, draftAdmin: { ...r.draftAdmin, on } })} />}>
        <Says>{t.rich("draft.adminSays", { see: names(r.draftAdmin.see), b: (c) => <b>{c}</b> })}</Says>
        <WhoBox label={t("draft.adminSee")} who={r.draftAdmin.see} editable={ed} noChannels onSave={(w) => set({ ...r, draftAdmin: { ...r.draftAdmin, see: w } })} />
        <WhoBox label={t("draft.adminNotifyTo")} who={r.draftAdmin.notify} editable={ed} onSave={(w) => set({ ...r, draftAdmin: { ...r.draftAdmin, notify: w } })} />
      </Card>
    </>
  );

  if (tab === "visit") return (
    <div className="cols">
      <Card title={t("visit.postponeTitle")} icon="pin">
        <Says>{t.rich("visit.postponeSays", { to: names(r.visit.postpone), info: names(r.visit.postponeInfo), b: (c) => <b>{c}</b> })}</Says>
        <WhoBox label={t("visit.approver")} who={r.visit.postpone} editable={ed} onSave={(w) => set({ ...r, visit: { ...r.visit, postpone: w } })} />
        <WhoBox label={t("visit.informed")} who={r.visit.postponeInfo} editable={ed} onSave={(w) => set({ ...r, visit: { ...r.visit, postponeInfo: w } })} />
      </Card>
      <Card title={t("visit.notDoneTitle")} icon="alert">
        <Says>{t.rich("visit.notDoneSays", { to: names(r.visit.notDone), b: (c) => <b>{c}</b> })}</Says>
        <WhoBox label={t("notifyTo")} who={r.visit.notDone} editable={ed} onSave={(w) => set({ ...r, visit: { ...r.visit, notDone: w } })} />
      </Card>
    </div>
  );

  return (
    <Card title={t("close.title")} icon="handshake">
      <Says>{t.rich("close.says", { within: duration(r.close.alarmH * 60), to: names(r.close.notify), b: (c) => <b>{c}</b> })}</Says>
      <div className="grid"><NumIn label={t("close.alarm")} unit={t("hour")} value={r.close.alarmH} editable={ed} onSave={(v) => set({ ...r, close: { ...r.close, alarmH: v } })} /></div>
      <WhoBox label={t("notifyTo")} who={r.close.notify} editable={ed} onSave={(w) => set({ ...r, close: { ...r.close, notify: w } })} />
    </Card>
  );
}
