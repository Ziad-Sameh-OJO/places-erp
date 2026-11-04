"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeadDetail, LeadLogRow } from "@places/contracts";
import { LEAD_STAGES, type LeadStage, isQualifiedAfter } from "@places/domain";
import { Drawer, Stepper } from "@/components/blocks";
import { Chip, Empty, Icon, Tabs, useAction, useToast } from "@/components/ui";
import type { Settings } from "@places/contracts";
import { useMe } from "@/lib/me";
import { ago, day, dayTime, money, num } from "@/lib/format";
import { api } from "@/lib/api";
import { StageChip, Who, slaText, slaTone } from "./lead-bits";
import { useAddComment, useLead, useLogCall, useRefreshLead } from "./use-lead";
import { useLeadOptions } from "./use-leads";

/** The pipeline the stepper shows (demo PIPE); the side stages (No Answer, Hold…) hide it. */
const PIPE: readonly LeadStage[] = ["Fresh", "Interested", "Follow up to Visit", "Visit", "Follow up after Visit", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal"];

/**
 * The demo's lead drawer: «نظرة عامة» (stepper, details, change the stage) and «Activity» (comment + timeline).
 * Prev / next walk the list the drawer was opened from. Units (2.12) and visits (1.9) come with their tasks.
 */
export function LeadDrawer({ ids, id, onGo, onClose }: { ids: string[]; id: string; onGo: (id: string) => void; onClose: () => void }) {
  const lead = useLead(id);
  const [tab, setTab] = useState<"overview" | "activity" | "logs">("overview");
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
        {l.kind === "broker" && <Chip tone="info">Broker</Chip>}
        <StageChip stage={l.stage} />
        {l.qualified && <Chip tone="ok">Qualified</Chip>}
        {l.sla && <Chip tone={slaTone(l.sla)}>{slaText(l.sla)}</Chip>}
        {l.ownedByTelesales && <Chip tone="info">مع Telesales</Chip>}
        {l.noAnswerCount > 0 && <Chip tone="warn">No Answer ×{l.noAnswerCount} · روتيشن {l.rotation}</Chip>}
      </>}>
      <Tabs value={tab} onChange={setTab} items={[
        ["overview", "نظرة عامة"], ["activity", "Activity", comments(l).length],
        ...(l.canSeeLogs ? [["logs", "Logs", l.logCount ?? undefined] as ["logs", string, number | undefined]] : []),
      ]} />
      {tab === "overview" ? <Overview l={l} /> : tab === "logs" && l.canSeeLogs ? <Logs id={l.id} /> : <Activity l={l} />}
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
    ["Sales", <Who key="w" person={l.assignedTo} />], ["دخل", `${day(l.createdAt)} · ${ago(l.createdAt)}`],
  ];
  return (
    <>
      {onPipe && <Stepper stages={PIPE} current={l.stage} />}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {l.note && <div className="quote">{l.note}</div>}
      {can("leads", "edit") && <CallButton id={l.id} />}
      {can("leads", "approve") && <Reassign key={l.id} l={l} />}
    </>
  );
}

/**
 * Demo «اسحب الليد وحوّله» (1.14, M-01 4.1): Operations, the Sales Director and the admin hand the lead to another
 * salesperson; that salesperson's next turn in the rotation is used up (Q2).
 */
function Reassign({ l }: { l: LeadDetail }) {
  const run = useAction();
  const refresh = useRefreshLead();
  const people = useLeadOptions().data?.assignable ?? [];
  const [to, setTo] = useState(l.assignedTo?.id ?? "");
  const name = people.find((p) => p.id === to)?.name ?? "";
  return (
    <form className="card flat" onSubmit={(e) => { e.preventDefault(); if (to && to !== l.assignedTo?.id) void run(async () => { await api.post(`/leads/${l.id}/assign`, { to }); await refresh(l.id); }, `اتحوّل لـ ${name}`); }}>
      <div className="card-head"><h3><span className="ico"><Icon name="swap" /></span><span>اسحب الليد وحوّله<small>مدير المبيعات والإدارة</small></span></h3></div>
      <div className="row">
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="حوّل لـ">
          {!l.assignedTo && <option value="">اختار السيلز</option>}
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn ghost" disabled={!to || to === l.assignedTo?.id}><Icon name="swap" />حوّل</button>
      </div>
    </form>
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
    // refreshed even when refused (e.g. the lead was taken away meanwhile): the drawer then shows why
    void run(async () => { try { await api.patch(`/leads/${l.id}/stage`, { stage }); } finally { await refresh(l.id); } },
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
/** People's comments only; what the system records goes to «Logs» (client meeting, 4 Nov · 1.25). */
const comments = (l: LeadDetail) => l.activities.filter((a) => a.kind === "comment");

function Activity({ l }: { l: LeadDetail }) {
  const { can } = useMe();
  const run = useAction();
  const add = useAddComment();
  const [text, setText] = useState("");
  const mine = comments(l);
  return (
    <>
      {can("leads", "edit") && <StageCard l={l} />}
      {can("leads", "edit") && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) void run(async () => { await add(l.id, t); setText(""); }); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب كومنت أو نتيجة مكالمة" required maxLength={2000} aria-label="كومنت" />
          <button className="btn ghost">إضافة</button>
        </form>
      )}
      {mine.length
        ? <div className="timeline">{mine.map((a) => <div key={a.id}>{a.text}<small>{a.by?.name ?? "السيستم"} · {dayTime(a.at)}</small></div>)}</div>
        : <Empty text="مفيش كومنتات لسه" icon="clock" />}
    </>
  );
}

const SOURCE: Record<LeadLogRow["source"], [string, "" | "info" | "warn"]> = { auto: ["تلقائي", ""], comment: ["كومنت", "info"], audit: ["Audit", "warn"] };

/** «Logs» (1.25): everything recorded on the lead, newest first, each line tagged تلقائي / كومنت / Audit. */
function Logs({ id }: { id: string }) {
  const { can } = useMe();
  const logs = useQuery({ queryKey: ["lead", id, "logs"], queryFn: () => api.get<LeadLogRow[]>(`/leads/${id}/logs`) });
  return (
    <>
      {can("access", "edit") && <LogRoles />}
      {logs.error ? <Empty text={logs.error.message} />
        : !logs.data ? <p className="hint">بيحمّل…</p>
        : !logs.data.length ? <Empty text="مفيش Logs لسه" icon="clock" />
        : (
          <div className="timeline">
            {logs.data.map((x) => (
              <div key={x.id}>
                <Chip tone={SOURCE[x.source][1]}>{SOURCE[x.source][0]}</Chip> {x.text}
                <small>{x.by?.name ?? "السيستم"} · {dayTime(x.at)}</small>
              </div>
            ))}
          </div>
        )}
    </>
  );
}

/**
 * Demo «مين يشوف الـ Logs», in the Logs tab for whoever manages access: every role but the admin (who always sees
 * them), for all leads. The ticks live here and one save goes out half a second after the last click, with the
 * whole list — saving on every click from the server's last answer lost clicks made before it came back.
 */
function LogRoles() {
  const qc = useQueryClient();
  const run = useAction();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<{ key: string; label: string }[]>("/access/roles") });
  const chosen = settings.data?.leadLogRoles;
  const [picked, setPicked] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const now = picked ?? chosen ?? [];
  const toggle = (key: string, on: boolean) => {
    const next = on ? [...now.filter((k) => k !== key), key] : now.filter((k) => k !== key);
    setPicked(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(async () => {
      await api.put("/leads/log-roles", { roles: next });
      await qc.invalidateQueries({ queryKey: ["settings"] });
      setPicked(null);
    }, "اتحفظ"), 500);
  };
  return (
    <section className="card flat">
      <div className="card-head"><h3><span className="ico"><Icon name="lock" /></span><span>مين يشوف الـ Logs<small>الأدمن بيشوفها دايماً · بيتطبّق على كل الليدز</small></span></h3></div>
      {roles.data && chosen ? (
        <div className="row">
          {roles.data.filter((r) => r.key !== "admin").map((r) => (
            <label key={r.key} className="tog"><input type="checkbox" checked={now.includes(r.key)} onChange={(e) => toggle(r.key, e.target.checked)} /><span>{r.label}</span></label>
          ))}
        </div>
      ) : <p className="hint">بيحمّل…</p>}
    </section>
  );
}
