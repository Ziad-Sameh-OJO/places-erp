"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { KEEP, ROTATION, TELESALES, type DraftKind, type DraftRow, type LeadSummary } from "@places/contracts";
import { Card, Chip, Note, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, day } from "@/lib/format";
import { type LeadsT, StageChip, Who } from "./lead-bits";
import { useLeadOptions, useLeadSummary } from "./use-leads";
import { useFields } from "@/lib/me";

const key = (kind: DraftKind) => ["lead-drafts", kind];
/** Cairo's «today» as the API's day() prints it, to mark what came in today (demo «النهارده»). */
const cairoDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/**
 * Demo «Draft» (1.26) and «Draft Admin» (1.27), 4 Nov meeting: leads the system took from their salesperson — a week
 * without any action (two on Hold), or marked Not Interested / Cancellation — only for the people «قواعد الليدز» names.
 * Each row: who had it, when, and the decision with its clock.
 */
export function DraftView({ kind, onOpen }: { kind: DraftKind; onOpen: (id: string) => void }) {
  const t = useTranslations("leads");
  const drafts = useQuery({ queryKey: key(kind), queryFn: () => api.get<DraftRow[]>(`/leads/drafts?kind=${kind}`), refetchInterval: 60_000 });
  const s = useLeadSummary("client").data;
  // the Draft Admin: the ones waiting for a decision first (demo)
  const rows = [...(drafts.data ?? [])].sort((a, b) => (kind === "admin" ? Number(a.kept) - Number(b.kept) : 0));
  const today = cairoDay(new Date().toISOString());
  const waiting = rows.filter((r) => !r.kept).length;
  const company = useFields("leads").shows("company"); // M-09
  const lead = (d: DraftRow) => (
    <span key="l"><button className="link" onClick={() => onOpen(d.lead.id)}><b>{d.lead.name}</b></button>{d.lead.kind === "broker" && <> <Chip tone="info">Broker</Chip></>}
      <span className="sub">{company && <>{d.lead.company ?? t("drafts.noCompany")} · </>}{d.lead.code}</span></span>
  );
  if (kind === "admin") {
    return (
      <Card title="Draft Admin" icon="layers" extra={waiting ? <Chip tone="warn">{t("drafts.waiting", { count: waiting })}</Chip> : <Chip tone="ok">{t("drafts.allReviewed")}</Chip>}
        sub={t("drafts.adminSub")}>
        <Table head={[t("drafts.lead"), t("drafts.became"), t("drafts.markedBy"), t("drafts.cameIn"), t("drafts.yourDecision")]} empty={t("drafts.adminEmpty")}
          rows={rows.map((d) => [lead(d), <StageChip key="s" stage={d.lead.stage} />, <Who key="w" person={d.from} />,
            <span key="a">{day(d.at)}{cairoDay(d.at) === today && <> <Chip tone="warn">{t("drafts.today")}</Chip></>}</span>,
            <Decide key="d" kind={kind} row={d} />])} />
      </Card>
    );
  }
  return (
    <Card title="Draft" icon="layers" extra={<Chip tone="warn">{rows.length}</Chip>} {...(s ? { sub: draftNote(s, t) } : {})}>
      <Table head={[t("drafts.lead"), t("drafts.stage"), t("drafts.was"), t("drafts.pulled"), t("drafts.lastAction"), t("drafts.sendTo")]} empty={t("drafts.empty")}
        rows={rows.map((d) => [lead(d), <StageChip key="s" stage={d.lead.stage} />, <Who key="w" person={d.from} />,
          <span key="a">{day(d.at)}{d.days != null && <span className="sub">{t("drafts.afterDays", { count: d.days })}</span>}</span>,
          <span key="t">{ago(d.lastAction)}</span>, <Decide key="d" kind={kind} row={d} />])} />
    </Card>
  );
}

const draftNote = (s: LeadSummary, t: LeadsT) => t("drafts.note", { days: s.draftRules.days, holdDays: s.draftRules.holdDays });

/** Demo draftClock: «باقي X س» (warn in the last 3 hours), «اتأخر X س» once late. */
function DraftClock({ left }: { left: number }) {
  const t = useTranslations("leads.drafts");
  return <Chip plain tone={left < 0 ? "bad" : left <= 180 ? "warn" : "info"}>{left < 0 ? t("late", { h: Math.ceil(-left / 60) }) : t("left", { h: Math.floor(left / 60) })}</Chip>;
}

/**
 * «وزّعه على» / «قرارك»: يفضل هنا · الروتيشن · (Draft Admin) Telesales · a salesperson · (Draft) the one it came from
 * («رجّعه»).
 */
function Decide({ kind, row }: { kind: DraftKind; row: DraftRow }) {
  const t = useTranslations("leads.drafts");
  const run = useAction();
  const qc = useQueryClient();
  const all = useLeadOptions().data?.assignable ?? [];
  const people = kind === "draft" ? all.filter((p) => p.id !== row.from?.id) : all;
  const name = (to: string) => (to === ROTATION ? t("nextInLine") : to === TELESALES ? "Telesales" : [...all, ...(row.from ? [row.from] : [])].find((p) => p.id === to)?.name ?? "");
  const pick = (to: string) => {
    if (!to) return;
    void run(async () => {
      await api.post(`/leads/drafts/${row.id}/decide`, { to });
      await Promise.all([qc.invalidateQueries({ queryKey: key(kind) }), qc.invalidateQueries({ queryKey: ["leads-summary"] }), qc.invalidateQueries({ queryKey: ["leads"] })]);
    }, to === KEEP ? t("keptIn", { tab: t(`tab.${kind}`) }) : t("wentTo", { name: name(to) }));
  };
  return (
    <span className="row">
      {row.kept ? <span className="hint">{t("reviewedKept")}</span> : <DraftClock left={row.minutesLeft} />}
      <select value="" onChange={(e) => pick(e.target.value)} aria-label={kind === "admin" ? t("decisionFor", { name: row.lead.name }) : t("sendLead", { name: row.lead.name })}>
        <option value="">{row.kept ? t("sendToSomeone") : t("pick")}</option>
        {!row.kept && <option value={KEEP}>{t("stayIn", { tab: t(`tab.${kind}`) })}</option>}
        <option value={ROTATION}>{t("rotationByArea")}</option>
        {kind === "admin" && <option value={TELESALES}>Telesales</option>}
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        {kind === "draft" && row.from && <option value={row.from.id}>{t("giveBack", { name: row.from.name })}</option>}
      </select>
    </span>
  );
}

/** Demo home Alarm (1.27), on the leads page until each role's home is built (1.22): what waits in the Draft Admin. */
export function DraftAdminAlarm({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("leads.drafts");
  const s = useLeadSummary("client").data;
  const a = s?.draftAdmin;
  if (!a?.waiting) return null;
  return (
    <Note kind="warn">
      <span className="row"><span className="spacer">{t("alarm", { count: a.waiting })}{a.today ? t("alarmToday", { count: a.today }) : ""}</span>
        <button className="btn sm" onClick={onOpen}>{t("review")}</button></span>
    </Note>
  );
}
