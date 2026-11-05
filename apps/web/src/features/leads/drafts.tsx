"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEEP, ROTATION, TELESALES, type DraftKind, type DraftRow, type LeadSummary } from "@places/contracts";
import { Card, Chip, Note, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, day } from "@/lib/format";
import { StageChip, Who } from "./lead-bits";
import { useLeadOptions, useLeadSummary } from "./use-leads";

const key = (kind: DraftKind) => ["lead-drafts", kind];
const TAB: Record<DraftKind, string> = { draft: "الـ Draft", admin: "الـ Draft Admin" };
/** Cairo's «today» as the API's day() prints it, to mark what came in today (demo «النهارده»). */
const cairoDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/**
 * Demo «Draft» (1.26) and «Draft Admin» (1.27), 4 Nov meeting: leads the system took from their salesperson — a week
 * without any action (two on Hold), or marked Not Interested / Cancellation — only for the people «قواعد الليدز» names.
 * Each row: who had it, when, and the decision with its clock.
 */
export function DraftView({ kind, onOpen }: { kind: DraftKind; onOpen: (id: string) => void }) {
  const drafts = useQuery({ queryKey: key(kind), queryFn: () => api.get<DraftRow[]>(`/leads/drafts?kind=${kind}`), refetchInterval: 60_000 });
  const s = useLeadSummary("client").data;
  // the Draft Admin: the ones waiting for a decision first (demo)
  const rows = [...(drafts.data ?? [])].sort((a, b) => (kind === "admin" ? Number(a.kept) - Number(b.kept) : 0));
  const today = cairoDay(new Date().toISOString());
  const waiting = rows.filter((r) => !r.kept).length;
  const lead = (d: DraftRow) => (
    <span key="l"><button className="link" onClick={() => onOpen(d.lead.id)}><b>{d.lead.name}</b></button>{d.lead.kind === "broker" && <> <Chip tone="info">Broker</Chip></>}
      <span className="sub">{d.lead.company ?? "من غير شركة"} · {d.lead.code}</span></span>
  );
  if (kind === "admin") {
    return (
      <Card title="Draft Admin" icon="layers" extra={waiting ? <Chip tone="warn">{waiting} مستنيين قرارك</Chip> : <Chip tone="ok">كله اتراجع</Chip>}
        sub="كل Not Interested وCancellation بيتشال أوتوماتيك من عند اللي علّمه وييجي هنا · ظاهر ليكي بس">
        <Table head={["الليد", "بقى", "علّمه", "دخل", "قرارك"]} empty="مفيش ليدز في الـ Draft Admin"
          rows={rows.map((d) => [lead(d), <StageChip key="s" stage={d.lead.stage} />, <Who key="w" person={d.from} />,
            <span key="a">{day(d.at)}{cairoDay(d.at) === today && <> <Chip tone="warn">النهارده</Chip></>}</span>,
            <Decide key="d" kind={kind} row={d} />])} />
      </Card>
    );
  }
  return (
    <Card title="Draft" icon="layers" extra={<Chip tone="warn">{rows.length}</Chip>} {...(s ? { sub: draftNote(s) } : {})}>
      <Table head={["الليد", "المرحلة", "كان عند", "اتسحب", "آخر أكشن", "وزّعه على"]} empty="مفيش ليدز في الـ Draft"
        rows={rows.map((d) => [lead(d), <StageChip key="s" stage={d.lead.stage} />, <Who key="w" person={d.from} />,
          <span key="a">{day(d.at)}{d.days != null && <span className="sub">بعد {d.days} يوم</span>}</span>,
          <span key="t">{ago(d.lastAction)}</span>, <Decide key="d" kind={kind} row={d} />])} />
    </Card>
  );
}

const draftNote = (s: LeadSummary) => `ليدز اتسحبت أوتوماتيك: ${s.draftRules.days} يوم من غير أي أكشن أو كومنت، والـ Hold بعد ${s.draftRules.holdDays} يوم · ظاهرة ليكي بس`;

/** Demo draftClock: «باقي X س» (warn in the last 3 hours), «اتأخر X س» once late. */
const DraftClock = ({ left }: { left: number }) => (
  <Chip plain tone={left < 0 ? "bad" : left <= 180 ? "warn" : "info"}>{left < 0 ? `اتأخر ${Math.ceil(-left / 60)} س` : `باقي ${Math.floor(left / 60)} س`}</Chip>
);

/**
 * «وزّعه على» / «قرارك»: يفضل هنا · الروتيشن · (Draft Admin) Telesales · a salesperson · (Draft) the one it came from
 * («رجّعه»).
 */
function Decide({ kind, row }: { kind: DraftKind; row: DraftRow }) {
  const run = useAction();
  const qc = useQueryClient();
  const all = useLeadOptions().data?.assignable ?? [];
  const people = kind === "draft" ? all.filter((p) => p.id !== row.from?.id) : all;
  const name = (to: string) => (to === ROTATION ? "اللي عليه الدور" : to === TELESALES ? "Telesales" : [...all, ...(row.from ? [row.from] : [])].find((p) => p.id === to)?.name ?? "");
  const pick = (to: string) => {
    if (!to) return;
    void run(async () => {
      await api.post(`/leads/drafts/${row.id}/decide`, { to });
      await Promise.all([qc.invalidateQueries({ queryKey: key(kind) }), qc.invalidateQueries({ queryKey: ["leads-summary"] }), qc.invalidateQueries({ queryKey: ["leads"] })]);
    }, to === KEEP ? `فاضل في ${TAB[kind]}` : `راح لـ ${name(to)}`);
  };
  return (
    <span className="row">
      {row.kept ? <span className="hint">اتراجع · فاضل هنا</span> : <DraftClock left={row.minutesLeft} />}
      <select value="" onChange={(e) => pick(e.target.value)} aria-label={kind === "admin" ? `قرار ${row.lead.name}` : `وزّع ${row.lead.name}`}>
        <option value="">{row.kept ? "ابعته لحد…" : "اختار…"}</option>
        {!row.kept && <option value={KEEP}>يفضل في {TAB[kind]}</option>}
        <option value={ROTATION}>الروتيشن (حسب الـ area)</option>
        {kind === "admin" && <option value={TELESALES}>Telesales</option>}
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        {kind === "draft" && row.from && <option value={row.from.id}>{row.from.name} (رجّعه)</option>}
      </select>
    </span>
  );
}

/** Demo home Alarm (1.27), on the leads page until each role's home is built (1.22): what waits in the Draft Admin. */
export function DraftAdminAlarm({ onOpen }: { onOpen: () => void }) {
  const s = useLeadSummary("client").data;
  const a = s?.draftAdmin;
  if (!a?.waiting) return null;
  return (
    <Note kind="warn">
      <span className="row"><span className="spacer">Alarm: {a.waiting} Not Interested / Cancellation مستنيين قرارك{a.today ? ` · ${a.today} النهارده` : ""}</span>
        <button className="btn sm" onClick={onOpen}>راجعي</button></span>
    </Note>
  );
}
