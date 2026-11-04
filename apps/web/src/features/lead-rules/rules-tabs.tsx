"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadRulesOptions } from "@places/contracts";
import { OWNER, OWNER_TL, durationText, type LeadRules, type RuleWho } from "@places/domain";
import { Holidays } from "@/components/holidays";
import { Card, Chip, Field, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";

type Channel = RuleWho["ch"][number];
const CH: [Channel, string][] = [["app", "جوه السيستم"], ["push", "Push"], ["email", "إيميل"]];
const DAYS = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];

export const useLeadRules = () => useQuery({ queryKey: ["lead-rules"], queryFn: () => api.get<LeadRules>("/leads/rules") });
const useOptions = () => useQuery({ queryKey: ["lead-rules-options"], queryFn: () => api.get<LeadRulesOptions>("/leads/rules/options"), staleTime: 60_000 });

/**
 * One change saves the whole rules (the API checks the combination and audits). A refused change shows why and the
 * page goes back to what's saved, like the demo's ruleSave.
 */
function useSave() {
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
  }, "اتحفظ · بيتطبّق على طول");
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
  const o = useOptions().data;
  const name = useWhoName();
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row">
        {who.to.map((x) => editable
          ? <button key={x} type="button" className="btn ghost sm" aria-label={`شيل ${name(x)}`} onClick={() => onSave({ ...who, to: who.to.filter((y) => y !== x) })}>{name(x)} <Icon name="x" /></button>
          : <Chip key={x} tone="info">{name(x)}</Chip>)}
        {!who.to.length && <span className="hint">محدش</span>}
        {editable && o && (
          <select value="" aria-label={`ضيف لـ ${label}`} style={{ maxWidth: 200 }} onChange={(e) => e.target.value && onSave({ ...who, to: [...who.to, e.target.value] })}>
            <option value="">+ ضيف دور أو شخص</option>
            {!who.to.includes(OWNER) && <option value={OWNER}>السيلز المسؤول عن الليد</option>}
            {!who.to.includes(OWNER_TL) && <option value={OWNER_TL}>الـ Team Leader بتاع السيلز</option>}
            <optgroup label="أدوار">{o.roles.filter((r) => !who.to.includes(r.key)).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</optgroup>
            <optgroup label="أشخاص">{o.people.filter((p) => !who.to.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          </select>
        )}
      </div>
      {!noChannels && (
        <div className="row">
          {CH.map(([c, l]) => (
            <label key={c} className="tog">
              <input type="checkbox" checked={who.ch.includes(c)} disabled={!editable} onChange={(e) => onSave({ ...who, ch: e.target.checked ? [...who.ch, c] : who.ch.filter((x) => x !== c) })} />
              <span>{l}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function useWhoName() {
  const o = useOptions().data;
  return (x: string) => x === OWNER ? "السيلز المسؤول عن الليد" : x === OWNER_TL ? "الـ Team Leader بتاع السيلز"
    : o?.roles.find((r) => r.key === x)?.label ?? o?.people.find((p) => p.id === x)?.name ?? x;
}
function useNames() {
  const name = useWhoName();
  return (w: RuleWho) => w.to.map(name).join("، ") || "محدش";
}

const OnToggle = ({ on, editable, onSave }: { on: boolean; editable: boolean; onSave: (v: boolean) => void }) => (
  <label className="tog"><input type="checkbox" checked={on} disabled={!editable} onChange={(e) => onSave(e.target.checked)} /><span>شغالة</span></label>
);

export type RulesTab = "sla" | "na" | "draft" | "visit" | "close";

/** Demo «قواعد الليدز والتوزيع»: the tabs after «التوزيع» (1.29). Each rule says in Arabic what happens with its current values. */
export function RulesTabs({ tab, editable }: { tab: RulesTab; editable: boolean }) {
  const q = useLeadRules();
  const o = useOptions().data;
  const save = useSave();
  const names = useNames();
  if (q.error) return <Note kind="warn">{q.error.message}</Note>;
  const r = q.data;
  if (!r) return <p className="hint">بيحمّل…</p>;
  const ed = editable;
  const set = (next: LeadRules) => void save(next);

  if (tab === "sla") return (
    <div className="cols">
      <Card title="ساعات حساب الـ SLA" icon="clock" sub="الـ SLA بيعدّ في الساعات دي بس، والإجازات الرسمية مابتتحسبش">
        <div className="grid">
          <TimeIn label="من" value={r.work.from} editable={ed} onSave={(v) => set({ ...r, work: { ...r.work, from: v } })} />
          <TimeIn label="لحد" value={r.work.to} editable={ed} onSave={(v) => set({ ...r, work: { ...r.work, to: v } })} />
        </div>
        <div className="field">
          <span>أيام الأجازة الأسبوعية</span>
          <div className="row">
            {DAYS.map((d, i) => (
              <label key={d} className="tog">
                <input type="checkbox" checked={r.work.off.includes(i)} disabled={!ed} onChange={(e) => set({ ...r, work: { ...r.work, off: e.target.checked ? [...r.work.off, i] : r.work.off.filter((x) => x !== i) } })} />
                <span>{d}</span>
              </label>
            ))}
          </div>
        </div>
      </Card>
      <Card title="الليد الجديد من غير أكشن (SLA)" icon="alert" extra={<OnToggle on={r.sla.on} editable={ed} onSave={(on) => set({ ...r, sla: { ...r.sla, on } })} />}>
        <Says>ليد Fresh فضل <b>{durationText(r.sla.warnMin)}</b> من غير أكشن ← تنبيه لـ <b>{names(r.sla.warn)}</b>. لو كمّل <b>{durationText(r.sla.pullMin)}</b> ← يتسحب للي عليه الدور ويتبعت لـ <b>{names(r.sla.pull)}</b>. يوم الإجازة: تنبيه بعد {durationText(r.sla.holWarnMin)} وسحب بعد {durationText(r.sla.holPullMin)}.</Says>
        <div className="grid">
          <NumIn label="التنبيه بعد" unit="ساعة" minutes value={r.sla.warnMin} editable={ed} onSave={(v) => set({ ...r, sla: { ...r.sla, warnMin: v } })} />
          <NumIn label="السحب بعد" unit="ساعة" minutes value={r.sla.pullMin} editable={ed} onSave={(v) => set({ ...r, sla: { ...r.sla, pullMin: v } })} />
          <NumIn label="التنبيه يوم الإجازة" unit="ساعة" minutes value={r.sla.holWarnMin} editable={ed} onSave={(v) => set({ ...r, sla: { ...r.sla, holWarnMin: v } })} />
          <NumIn label="السحب يوم الإجازة" unit="ساعة" minutes value={r.sla.holPullMin} editable={ed} onSave={(v) => set({ ...r, sla: { ...r.sla, holPullMin: v } })} />
        </div>
        <WhoBox label="التنبيه بيروح لـ" who={r.sla.warn} editable={ed} onSave={(w) => set({ ...r, sla: { ...r.sla, warn: w } })} />
        <WhoBox label="السحب بيتبعت لـ" who={r.sla.pull} editable={ed} onSave={(w) => set({ ...r, sla: { ...r.sla, pull: w } })} />
      </Card>
      <Card title="الإجازات الرسمية" icon="calendar" sub="من يوم لـ يوم (زي العيد) · في أيامها الـ SLA بيمشي بمواعيد يوم الإجازة">
        <Holidays path="/leads/rules/holidays" editable={ed} upcoming />
        <p className="hint">ده اللي جاي بس · الكالندر كامل في الإعدادات ← الإجازات الرسمية</p>
      </Card>
      <Card title="ليد جديد اتوزع" icon="users">
        <Says>أول ما ليد يتوزع، بيتبعت إشعار لـ <b>{names(r.newLead)}</b>.</Says>
        <WhoBox label="الإشعار بيروح لـ" who={r.newLead} editable={ed} onSave={(w) => set({ ...r, newLead: w })} />
      </Card>
    </div>
  );

  if (tab === "na") {
    const tele = o?.telesales.find((t) => t.id === r.noAnswer.telesales)?.name ?? "الـ Telesales";
    return (
      <Card title="No Answer" icon="phone">
        <Says>لما السيلز يعلّم No Answer، الليد بيفضل عنده <b>{durationText(r.noAnswer.hours * 60)}</b>، وكل <b>{r.noAnswer.remindH} ساعات</b> بيجيله تنبيه يكلّمه. بعدها بيروح للسيلز اللي عليه الدور ويرجع Fresh، وبيتنقل تاني بس لو السيلز ده كمان علّمه No Answer. في الروتيشن رقم <b>{r.noAnswer.toTelesalesAt}</b> بيروح لـ <b>{tele}</b> (Telesales)، والإشعار لـ <b>{names(r.noAnswer.notify)}</b>.</Says>
        <div className="grid">
          <NumIn label="يفضل عند كل سيلز" unit="ساعة بعد ما يعلّمه No Answer" value={r.noAnswer.hours} editable={ed} onSave={(v) => set({ ...r, noAnswer: { ...r.noAnswer, hours: v } })} />
          <NumIn label="تنبيه المكالمة كل" unit="ساعات" value={r.noAnswer.remindH} editable={ed} onSave={(v) => set({ ...r, noAnswer: { ...r.noAnswer, remindH: v } })} />
          <NumIn label="يروح لـ Telesales في الروتيشن رقم" unit="" value={r.noAnswer.toTelesalesAt} editable={ed} onSave={(v) => set({ ...r, noAnswer: { ...r.noAnswer, toTelesalesAt: v } })} />
          <Field label="الـ Telesales اللي بيستلم">
            <select value={r.noAnswer.telesales ?? ""} disabled={!ed} onChange={(e) => set({ ...r, noAnswer: { ...r.noAnswer, telesales: e.target.value || null } })}>
              <option value="">الـ Telesales (أي حد)</option>
              {o?.telesales.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <WhoBox label="لما يروح لـ Telesales الإشعار بيروح لـ" who={r.noAnswer.notify} editable={ed} onSave={(w) => set({ ...r, noAnswer: { ...r.noAnswer, notify: w } })} />
      </Card>
    );
  }

  if (tab === "draft") return (
    <>
      <Card title="السحب للـ Draft" icon="layers" extra={<OnToggle on={r.draft.on} editable={ed} onSave={(on) => set({ ...r, draft: { ...r.draft, on } })} />}>
        <Says>ليد عدّى عليه <b>{r.draft.days} يوم</b> من غير أي أكشن أو كومنت (أو <b>{r.draft.holdDays} يوم</b> وهو على Hold) ← بيتسحب من السيلز ويروح Draft، والإشعار لـ <b>{names(r.draft.notify)}</b>. الـ Draft ظاهر لـ <b>{names(r.draft.see)}</b> بس. مابيتسحبش لو Done Deal أو Cancellation أو Not Interested أو No Answer (ليه روتيشن خاص بيه).</Says>
        <div className="grid">
          <NumIn label="يتسحب بعد" unit="يوم من غير أكشن" value={r.draft.days} editable={ed} onSave={(v) => set({ ...r, draft: { ...r.draft, days: v } })} />
          <NumIn label="الـ Hold يتسحب بعد" unit="يوم" value={r.draft.holdDays} editable={ed} onSave={(v) => set({ ...r, draft: { ...r.draft, holdDays: v } })} />
        </div>
        <WhoBox label="مين يشوف الـ Draft ويوزّع منه" who={r.draft.see} editable={ed} noChannels onSave={(w) => set({ ...r, draft: { ...r.draft, see: w } })} />
        <WhoBox label="الإشعار لما ليد يتسحب بيروح لـ" who={r.draft.notify} editable={ed} onSave={(w) => set({ ...r, draft: { ...r.draft, notify: w } })} />
      </Card>
      <Card title="Draft Admin" icon="layers" extra={<OnToggle on={r.draftAdmin.on} editable={ed} onSave={(on) => set({ ...r, draftAdmin: { ...r.draftAdmin, on } })} />}>
        <Says>أي ليد يتعلّم <b>Not Interested</b> أو <b>Cancellation</b> (من السيلز أو Telesales) بيتشال أوتوماتيك من عنده ويروح الـ Draft Admin. ظاهر لـ <b>{names(r.draftAdmin.see)}</b> بس، وكل يوم بيظهرلهم Alarm في الرئيسية باللي دخل عشان يقرروا.</Says>
        <WhoBox label="مين يشوف الـ Draft Admin ويقرر" who={r.draftAdmin.see} editable={ed} noChannels onSave={(w) => set({ ...r, draftAdmin: { ...r.draftAdmin, see: w } })} />
        <WhoBox label="الإشعار لما ليد يدخل بيروح لـ" who={r.draftAdmin.notify} editable={ed} onSave={(w) => set({ ...r, draftAdmin: { ...r.draftAdmin, notify: w } })} />
      </Card>
    </>
  );

  if (tab === "visit") return (
    <div className="cols">
      <Card title="تأجيل الـ Visit / Meeting" icon="pin">
        <Says>لما السيلز يدوس «اتأجلت» لازم يكتب السبب، والطلب بيروح لـ <b>{names(r.visit.postpone)}</b> يوافق أو يرفض. لو وافق، اليوم ده من غير خصم. وفي الحالتين بيتبلّغ <b>{names(r.visit.postponeInfo)}</b> باللي حصل.</Says>
        <WhoBox label="اللي بيوافق على التأجيل" who={r.visit.postpone} editable={ed} onSave={(w) => set({ ...r, visit: { ...r.visit, postpone: w } })} />
        <WhoBox label="بيتبلّغ باللي حصل" who={r.visit.postponeInfo} editable={ed} onSave={(w) => set({ ...r, visit: { ...r.visit, postponeInfo: w } })} />
      </Card>
      <Card title="Visit / Meeting معملهاش" icon="alert">
        <Says>لما تتعلّم «معملتهاش»، بيرجع للبصمة بخصمها، والإشعار بيروح لـ <b>{names(r.visit.notDone)}</b>.</Says>
        <WhoBox label="الإشعار بيروح لـ" who={r.visit.notDone} editable={ed} onSave={(w) => set({ ...r, visit: { ...r.visit, notDone: w } })} />
      </Card>
    </div>
  );

  return (
    <Card title="الإقفال (Done Deal)" icon="handshake">
      <Says>لو الصفقة اتقفلت في خلال <b>{durationText(r.close.alarmH * 60)}</b> من ما الليد اتعمل، بيطلع Alarm إنها اتسجّلت وقت القفل بس، ومابتدخلش التارجت. الإشعار بيروح لـ <b>{names(r.close.notify)}</b>.</Says>
      <div className="grid"><NumIn label="الـ Alarm لو اتقفلت في خلال" unit="ساعة" value={r.close.alarmH} editable={ed} onSave={(v) => set({ ...r, close: { ...r.close, alarmH: v } })} /></div>
      <WhoBox label="الإشعار بيروح لـ" who={r.close.notify} editable={ed} onSave={(w) => set({ ...r, close: { ...r.close, notify: w } })} />
    </Card>
  );
}
