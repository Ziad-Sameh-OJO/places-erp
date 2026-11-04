"use client";
import { useState } from "react";
import type { LeadDetail } from "@places/contracts";
import { LEAD_STAGES, type LeadStage, isQualifiedAfter } from "@places/domain";
import { Drawer, Stepper } from "@/components/blocks";
import { Chip, Empty, Icon, Tabs, useAction, useToast } from "@/components/ui";
import { useMe } from "@/lib/me";
import { ago, money, num } from "@/lib/format";
import { api } from "@/lib/api";
import { StageChip, Who, slaText, slaTone } from "./lead-bits";
import { useAddComment, useLead, useLogCall, useRefreshLead } from "./use-lead";

/** The pipeline the stepper shows (demo PIPE); the side stages (No Answer, Hold…) hide it. */
const PIPE: readonly LeadStage[] = ["Fresh", "Interested", "Follow up to Visit", "Visit", "Follow up after Visit", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal"];
const fmt = (iso: string) => new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });

/**
 * The demo's lead drawer: «نظرة عامة» (stepper, details, change the stage) and «Activity» (comment + timeline).
 * Prev / next walk the list the drawer was opened from. Units (2.12) and visits (1.9) come with their tasks.
 */
export function LeadDrawer({ ids, id, onGo, onClose }: { ids: string[]; id: string; onGo: (id: string) => void; onClose: () => void }) {
  const lead = useLead(id);
  const [tab, setTab] = useState<"overview" | "activity">("overview");
  const at = ids.indexOf(id);
  const prev = at > 0 ? ids[at - 1] : undefined, next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : undefined;
  const l = lead.data;
  if (lead.error) return <Drawer title="الليد مش موجود" onClose={onClose}><Empty text={lead.error.message} /></Drawer>;
  if (!l) return <Drawer title="…" onClose={onClose}><p className="hint">بيحمّل…</p></Drawer>;
  return (
    <Drawer title={l.name} sub={`${l.code} · ${l.channel}`} onClose={onClose}
      {...(prev ? { onPrev: () => onGo(prev) } : {})} {...(next ? { onNext: () => onGo(next) } : {})}
      {...(ids.length > 1 && at >= 0 ? { position: `${at + 1}/${ids.length}` } : {})}
      chips={<>
        <StageChip stage={l.stage} />
        {l.qualified && <Chip tone="ok">Qualified</Chip>}
        {l.sla && <Chip tone={slaTone(l.sla)}>{slaText(l.sla)}</Chip>}
        {l.ownedByTelesales && <Chip tone="info">مع Telesales</Chip>}
        {l.noAnswerCount > 0 && <Chip tone="warn">No Answer ×{l.noAnswerCount} · روتيشن {l.rotation}</Chip>}
      </>}>
      <Tabs value={tab} onChange={setTab} items={[["overview", "نظرة عامة"], ["activity", "Activity", l.activities.length]]} />
      {tab === "overview" ? <Overview l={l} /> : <Activity l={l} />}
    </Drawer>
  );
}

function Overview({ l }: { l: LeadDetail }) {
  const { can } = useMe();
  const onPipe = PIPE.includes(l.stage as LeadStage);
  const kv: [string, React.ReactNode][] = [
    ["الشركة", l.company ?? "—"],
    ["الموبايل", <>{l.phones.map((p) => <span key={p} className="mono">{p}<br /></span>)}</>],
    ["Area", l.area || "—"], ["Type", l.type], ["Space", l.space != null ? `${num(l.space)} م` : "—"], ["Condition", l.condition ?? "—"],
    ["Budget", money(l.budget)], ["Channel", l.channel], ["Campaign", l.campaign?.name ?? "—"], ["البوست اللي جابه", l.post ?? "—"],
    ["Sales", <Who key="w" person={l.assignedTo} />], ["دخل", `${fmt(l.createdAt)} · ${ago(l.createdAt)}`],
  ];
  return (
    <>
      {onPipe && <Stepper stages={PIPE} current={l.stage} />}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {l.note && <div className="quote">{l.note}</div>}
      {can("leads", "edit") && <StageCard l={l} />}
      {can("leads", "edit") && <CallButton id={l.id} />}
    </>
  );
}

/** Demo «غيّر المرحلة». Visit needs a date and units first (1.9), so it only says so. */
function StageCard({ l }: { l: LeadDetail }) {
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshLead();
  const pick = (stage: LeadStage) => {
    if (stage === l.stage) return;
    if (stage === "Visit") { toast("حدد ميعاد الـ Visit والوحدات"); return; }
    const qualifies = !l.qualified && isQualifiedAfter(false, stage);
    void run(async () => { await api.patch(`/leads/${l.id}/stage`, { stage }); await refresh(l.id); },
      qualifies ? `${stage} · واتعلّم Qualified في الكامبين والـ channel` : `المرحلة بقت ${stage}`);
  };
  return (
    <section className="card flat">
      <div className="card-head"><h3><span className="ico"><Icon name="layers" /></span><span>غيّر المرحلة</span></h3></div>
      <div className="stage-grid">
        {LEAD_STAGES.map((s) => <button key={s} className={`stage-btn ${s === l.stage ? "on" : ""}`} onClick={() => pick(s)}>{s}</button>)}
      </div>
      <p className="hint">أول ما الليد يوصل Interested أو أي مرحلة بعدها بيتعلّم Qualified أوتوماتيك، ويفضل محسوب في الكامبين والـ channel. Visit بتفتح تاب الزيارات عشان تحدد الميعاد والوحدات.</p>
    </section>
  );
}

/** Demo «سجّل مكالمة» (1.10). */
function CallButton({ id }: { id: string }) {
  const run = useAction();
  const logCall = useLogCall();
  return (
    <div className="row">
      <button className="btn ghost" onClick={() => void run(() => logCall(id), "المكالمة اتسجّلت · الـ SLA وقف")}><Icon name="phone" />سجّل مكالمة</button>
    </div>
  );
}

/** Demo «Activity»: a comment (or a call's result) on top, then the timeline, newest first. */
function Activity({ l }: { l: LeadDetail }) {
  const { can } = useMe();
  const run = useAction();
  const add = useAddComment();
  const [text, setText] = useState("");
  return (
    <>
      {can("leads", "edit") && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) void run(async () => { await add(l.id, t); setText(""); }); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب كومنت أو نتيجة مكالمة" required aria-label="كومنت" />
          <button className="btn ghost">إضافة</button>
        </form>
      )}
      {l.activities.length
        ? <div className="timeline">{l.activities.map((a) => <div key={a.id}>{a.text}<small>{a.by?.name ?? "السيستم"} · {fmt(a.at)}</small></div>)}</div>
        : <Empty text="مفيش Activity لسه" />}
    </>
  );
}
