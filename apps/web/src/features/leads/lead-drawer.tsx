"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { LeadDetail, LeadLogRow } from "@places/contracts";
import { LEAD_PIPELINE, LEAD_STAGES, type LeadStage, isQualifiedAfter } from "@places/domain";
import { Drawer, Stepper } from "@/components/blocks";
import { Chip, Empty, Icon, Tabs, useAction, useToast } from "@/components/ui";
import type { Settings } from "@places/contracts";
import { useFields, useMe } from "@/lib/me";
import { ago, day, dayTime, money, num } from "@/lib/format";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import { StageChip, Who, slaText, slaTone } from "./lead-bits";
import { useAddComment, useLead, useLogCall, useRefreshLead } from "./use-lead";
import { useSendNewLead } from "./use-new-leads";
import { WhatsAppQuestion } from "./whatsapp-question";
import { useLeadOptions } from "./use-leads";
import { Visits } from "./visits";
import { RecommendedUnits, useRecommendations } from "./recommendations";
import { EditLead } from "./edit-lead";
import { DealForm } from "../deals/deal-form";
import { useRecent } from "@/lib/quick";

/** The pipeline the stepper shows (demo PIPE); the side stages (No Answer, Hold…) hide it. */
const PIPE = LEAD_PIPELINE;

/**
 * The demo's lead drawer: «نظرة عامة» (stepper, details, change the stage) and «Activity» (comment + timeline).
 * «الوحدات» (2.12), «الزيارات» (1.9). Prev / next walk the list the drawer was opened from.
 */
/** `visit`: opened by a drop on the Kanban's Visit / Meeting lane (1.32) — straight on «الزيارات» with that kind. */
export function LeadDrawer({ ids, id, onGo, onClose, visit }: { ids: string[]; id: string; onGo: (id: string) => void; onClose: () => void; visit?: "Visit" | "Meeting" | undefined }) {
  const t = useTranslations("leads");
  const lead = useLead(id);
  const [tab, setTab] = useState<"overview" | "units" | "visits" | "activity" | "logs">(visit ? "visits" : "overview");
  const recs = useRecommendations(id);
  const [visitKind, setVisitKind] = useState<"Visit" | "Meeting">(visit ?? "Visit");
  const [dealFor, setDealFor] = useState<string | null>(null); // «سجّل الصفقة» open on this lead
  const qc = useQueryClient();
  const refresh = useRefreshLead();
  // the form's lead list changes with the lead's stage: read it again when the form opens from here
  const openDeal = (leadId: string) => { void qc.invalidateQueries({ queryKey: ["deals", "form"] }); setDealFor(leadId); };
  const at = ids.indexOf(id);
  const prev = at > 0 ? ids[at - 1] : undefined, next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : undefined;
  const l = lead.data;
  useRecent("lead", id, l?.name); // 0.14
  if (lead.error) return <Drawer title={t("drawer.notFound")} onClose={onClose}><Empty text={lead.error.message} /></Drawer>;
  if (!l) return <Drawer title="…" onClose={onClose}><p className="hint">{t("drawer.loading")}</p></Drawer>;
  return (
    <Drawer title={l.name} sub={l.channel ? `${l.code} · ${l.channel}` : l.code} onClose={onClose}
      {...(prev ? { onPrev: () => onGo(prev) } : {})} {...(next ? { onNext: () => onGo(next) } : {})}
      {...(ids.length > 1 && at >= 0 ? { position: `${at + 1}/${ids.length}` } : {})}
      chips={<>
        {l.kind === "broker" && <Chip tone="info">Broker</Chip>}
        <StageChip stage={l.stage} />
        {l.qualified && <Chip tone="ok">Qualified</Chip>}
        {l.sla && <Chip tone={slaTone(l.sla)}>{slaText(l.sla, t)}</Chip>}
        {l.ownedByTelesales && <Chip tone="info">{t("drawer.withTelesales")}</Chip>}
        {l.noAnswerCount > 0 && <Chip tone="warn">{t("drawer.noAnswer", { count: l.noAnswerCount, rotation: l.rotation })}</Chip>}
      </>}>
      <Tabs value={tab} onChange={setTab} items={[
        ["overview", t("drawer.overview")], ["units", t("drawer.units"), recs.data?.items.length], ["visits", t("drawer.visits"), l.visits.length], ["activity", "Activity", comments(l).length],
        ...(l.canSeeLogs ? [["logs", "Logs", l.logCount ?? undefined] as ["logs", string, number | undefined]] : []),
      ]} />
      {dealFor && <DealForm leadId={dealFor} onClose={() => setDealFor(null)} onSaved={() => { setDealFor(null); void refresh(dealFor); }} />}
      {tab === "overview" ? <Overview l={l} onDeal={openDeal} onArchived={onClose} /> : tab === "units" ? <RecommendedUnits id={l.id} name={l.name} /> : tab === "visits" ? <Visits l={l} kind={visitKind} />
        : tab === "logs" && l.canSeeLogs ? <Logs id={l.id} /> : <Activity key={l.id} l={l} onDeal={openDeal} onVisit={(k) => { setVisitKind(k); setTab("visits"); }} />}
    </Drawer>
  );
}

function Overview({ l, onDeal, onArchived }: { l: LeadDetail; onDeal: (id: string) => void; onArchived: () => void }) {
  const t = useTranslations("leads.drawer");
  const { can } = useMe();
  const onPipe = PIPE.includes(l.stage as LeadStage);
  const fields = useFields("leads"); // M-09: a hidden field has no row (the API blanks it too)
  const kv: [string, React.ReactNode, string?][] = [
    [t("company"), l.company ?? "—", "company"],
    [t("mobile"), <>{l.phones.map((p) => <span key={p} className="mono">{p}<br /></span>)}</>, "phones"],
    ["Area", l.area ? serverText(l.area) : "—", "area"], ["Type", l.type || "—", "type"], ["Space", l.space != null ? t("sqm", { n: num(l.space) }) : "—", "space"],
    ["Condition", l.condition ? serverText(l.condition) : "—", "condition"],
    ["Budget", money(l.budget), "budget"], ["Channel", l.channel || "—", "channel"], ["Campaign", l.campaign?.name ?? "—", "campaign"], [t("post"), l.post ?? "—", "post"],
    ["Sales", <Who key="w" person={l.assignedTo} />], [t("cameIn"), `${day(l.createdAt)} · ${ago(l.createdAt)}`],
  ];
  return (
    <>
      {onPipe && <Stepper stages={PIPE} current={l.stage} />}
      <dl className="kv">{kv.filter(([, , f]) => !f || fields.shows(f)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {l.note && <div className="quote">{l.note}</div>}
      <LeadActions l={l} onDeal={onDeal} onArchived={onArchived} />
      <NewLeadAction l={l} />
      {can("leads", "approve") && <Reassign key={l.id} l={l} />}
    </>
  );
}

/**
 * Demo «اسحب الليد وحوّله» (1.14, M-01 4.1): Operations, the Sales Director and the admin hand the lead to another
 * salesperson; that salesperson's next turn in the rotation is used up (Q2).
 */
function Reassign({ l }: { l: LeadDetail }) {
  const t = useTranslations("leads.drawer");
  const run = useAction();
  const refresh = useRefreshLead();
  const people = useLeadOptions().data?.assignable ?? [];
  const [to, setTo] = useState(l.assignedTo?.id ?? "");
  const name = people.find((p) => p.id === to)?.name ?? "";
  return (
    <form className="card flat" onSubmit={(e) => { e.preventDefault(); if (to && to !== l.assignedTo?.id) void run(async () => { await api.post(`/leads/${l.id}/assign`, { to }); await refresh(l.id); }, t("reassigned", { name })); }}>
      <div className="card-head"><h3><span className="ico"><Icon name="swap" /></span><span>{t("reassignTitle")}<small>{t("reassignSub")}</small></span></h3></div>
      <div className="row">
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("moveTo")}>
          {!l.assignedTo && <option value="">{t("pickSales")}</option>}
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn ghost" disabled={!to || to === l.assignedTo?.id}><Icon name="swap" />{t("move")}</button>
      </div>
    </form>
  );
}

/** Demo «غيّر المرحلة». Visit / Meeting need a time and units first (1.9): they open «الزيارات» with that kind. */
function StageCard({ l, onVisit, onDeal }: { l: LeadDetail; onVisit: (k: "Visit" | "Meeting") => void; onDeal: (id: string) => void }) {
  const t = useTranslations("leads.drawer");
  const { can } = useMe();
  const run = useAction();
  const toast = useToast();
  const refresh = useRefreshLead();
  const [ask, setAsk] = useState(false); // «بعتله واتساب؟» right after No Answer (1.18)
  const pick = (stage: LeadStage) => {
    if (stage === l.stage) return;
    if (stage === "Visit" || stage === "Meeting") { onVisit(stage); toast(t("setVisit", { kind: stage })); return; }
    const qualifies = !l.qualified && isQualifiedAfter(false, stage);
    // refreshed even when refused (e.g. the lead was taken away meanwhile): the drawer then shows why
    void run(async () => {
      try {
        await api.patch(`/leads/${l.id}/stage`, { stage });
        if (stage === "No Answer") setAsk(true);
        if (stage === "Done Deal" && !l.hasDeal && can("deals", "create")) onDeal(l.id); // demo: Done Deal opens «سجّل صفقة»
      } finally { await refresh(l.id); }
    }, qualifies ? t("stageQualified", { stage: serverText(stage) }) : t("stageNow", { stage: serverText(stage) }));
  };
  return (
    <section className="card flat">
      {ask && <WhatsAppQuestion lead={l} onClose={() => setAsk(false)} />}
      <div className="card-head"><h3><span className="ico"><Icon name="layers" /></span><span>{t("changeStage")}</span></h3></div>
      <div className="stage-grid">
        {LEAD_STAGES.map((s) => <button key={s} className={`stage-btn ${s === l.stage ? "on" : ""}`} onClick={() => pick(s)}>{serverText(s)}</button>)}
      </div>
      <p className="hint">{t("stageHint")}</p>
    </section>
  );
}

/**
 * The overview's buttons (demo leads.js leadDrawer): «سجّل مكالمة» (1.10) · «تعديل البيانات» («leads: edit»; Telesales
 * only on a lead she holds) · «أرشفة» («leads: delete») · «سجّل الصفقة» on a Done Deal with no deal yet.
 */
function LeadActions({ l, onDeal, onArchived }: { l: LeadDetail; onDeal: (id: string) => void; onArchived: () => void }) {
  const t = useTranslations("leads.drawer");
  const { me, can } = useMe();
  const run = useAction();
  const logCall = useLogCall();
  const refresh = useRefreshLead();
  const [editing, setEditing] = useState(false);
  const telesales = !!me?.roles.includes("telesales");
  const qc = useQueryClient();
  // gone from every list: the leads, the tiles and Operations' second calls
  const archive = () => void run(async () => {
    await api.post(`/leads/${l.id}/archive`);
    onArchived();
    await Promise.all([refresh(l.id), qc.invalidateQueries({ queryKey: ["lead-second-calls"] })]);
  }, t("archived", { name: l.name }));
  return (
    <div className="row">
      {editing && <EditLead l={l} onClose={() => setEditing(false)} />}
      {can("leads", "edit") && <button className="btn ghost" onClick={() => void run(() => logCall(l.id), t("callLogged"))}><Icon name="phone" />{t("logCall")}</button>}
      {can("leads", "edit") && (!telesales || l.ownedByTelesales) && <button className="btn ghost" onClick={() => setEditing(true)}>{t("edit")}</button>}
      {can("leads", "delete") && <button className="btn ghost" onClick={archive}><Icon name="x" />{t("archive")}</button>}
      {l.stage === "Done Deal" && !l.hasDeal && can("deals", "create") && <button className="btn" onClick={() => onDeal(l.id)}><Icon name="handshake" />{t("logDeal")}</button>}
    </div>
  );
}

/**
 * Demo «ابعته كـ New Lead» (1.17, M-01 2.3): a lead Telesales holds after the third No Answer rotation that became
 * Interested goes to Operations; until they decide, «مستني قرار الأوبريشن».
 */
function NewLeadAction({ l }: { l: LeadDetail }) {
  const t = useTranslations("leads.drawer");
  const { can } = useMe();
  const run = useAction();
  const send = useSendNewLead();
  if (l.newLeadPending) return <div className="row"><Chip tone="warn">{t("waitingOps")}</Chip></div>;
  if (!l.ownedByTelesales || l.stage !== "Interested" || !can("leads", "edit")) return null;
  return (
    <div className="row">
      <button className="btn" onClick={() => void run(() => send(l.id), t("sentToOps"))}><Icon name="send" />{t("sendNewLead")}</button>
    </div>
  );
}

/** Demo «Activity»: a comment (or a call's result) on top, then the timeline, newest first. */
/** People's comments only; what the system records goes to «Logs» (client meeting, 4 Nov · 1.25). */
const comments = (l: LeadDetail) => l.activities.filter((a) => a.kind === "comment");

function Activity({ l, onVisit, onDeal }: { l: LeadDetail; onVisit: (k: "Visit" | "Meeting") => void; onDeal: (id: string) => void }) {
  const t = useTranslations("leads.drawer");
  const { can } = useMe();
  const run = useAction();
  const add = useAddComment();
  const [text, setText] = useState("");
  const mine = comments(l);
  return (
    <>
      {can("leads", "edit") && <StageCard l={l} onVisit={onVisit} onDeal={onDeal} />}
      {can("leads", "edit") && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); const body = text.trim(); if (body) void run(async () => { await add(l.id, body); setText(""); }); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("commentPlaceholder")} required maxLength={2000} aria-label={t("comment")} />
          <button className="btn ghost">{t("add")}</button>
        </form>
      )}
      {mine.length
        ? <div className="timeline">{mine.map((a) => <div key={a.id}>{serverText(a.text)}<small>{a.by?.name ?? t("system")} · {dayTime(a.at)}</small></div>)}</div>
        : <Empty text={t("noComments")} icon="clock" />}
    </>
  );
}

const SOURCE_TONE: Record<LeadLogRow["source"], "" | "info" | "warn"> = { auto: "", comment: "info", audit: "warn" };

/** «Logs» (1.25): everything recorded on the lead, newest first, each line tagged تلقائي / كومنت / Audit. */
function Logs({ id }: { id: string }) {
  const t = useTranslations("leads.drawer");
  const { can } = useMe();
  const logs = useQuery({ queryKey: ["lead", id, "logs"], queryFn: () => api.get<LeadLogRow[]>(`/leads/${id}/logs`) });
  return (
    <>
      {can("access", "edit") && <LogRoles />}
      {logs.error ? <Empty text={logs.error.message} />
        : !logs.data ? <p className="hint">{t("loading")}</p>
        : !logs.data.length ? <Empty text={t("noLogs")} icon="clock" />
        : (
          <div className="timeline">
            {logs.data.map((x) => (
              <div key={x.id}>
                <Chip tone={SOURCE_TONE[x.source]}>{t(`source.${x.source}`)}</Chip> {serverText(x.text)}
                <small>{x.by?.name ?? t("system")} · {dayTime(x.at)}</small>
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
  const t = useTranslations("leads.drawer");
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
    }, t("saved")), 500);
  };
  return (
    <section className="card flat">
      <div className="card-head"><h3><span className="ico"><Icon name="lock" /></span><span>{t("logRoles")}<small>{t("logRolesSub")}</small></span></h3></div>
      {roles.data && chosen ? (
        <div className="row">
          {roles.data.filter((r) => r.key !== "admin").map((r) => (
            <label key={r.key} className="tog"><input type="checkbox" checked={now.includes(r.key)} onChange={(e) => toggle(r.key, e.target.checked)} /><span>{serverText(r.label)}</span></label>
          ))}
        </div>
      ) : <p className="hint">{t("loading")}</p>}
    </section>
  );
}
