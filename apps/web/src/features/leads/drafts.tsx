"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KEEP, ROTATION, type DraftRow } from "@places/contracts";
import { Card, Chip, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, day } from "@/lib/format";
import { StageChip, Who } from "./lead-bits";
import { useLeadOptions, useLeadSummary } from "./use-leads";

const KEY = ["lead-drafts", "draft"];

/**
 * Demo «Draft» (1.26, 4 Nov meeting): leads pulled after a week without any action (two on Hold), only for the people
 * «قواعد الليدز» names. Each row: who had it, when it was pulled, the last action, and the decision with its clock.
 */
export function DraftView({ onOpen }: { onOpen: (id: string) => void }) {
  const drafts = useQuery({ queryKey: KEY, queryFn: () => api.get<DraftRow[]>("/leads/drafts?kind=draft"), refetchInterval: 60_000 });
  const rules = useLeadSummary("client").data;
  const rows = drafts.data ?? [];
  return (
    <Card title="Draft" icon="layers" extra={<Chip tone="warn">{rows.length}</Chip>}
      {...(rules ? { sub: `ليدز اتسحبت أوتوماتيك: ${rules.draftRules.days} يوم من غير أي أكشن أو كومنت، والـ Hold بعد ${rules.draftRules.holdDays} يوم · ظاهرة ليكي بس` } : {})}>
      <Table head={["الليد", "المرحلة", "كان عند", "اتسحب", "آخر أكشن", "وزّعه على"]} empty="مفيش ليدز في الـ Draft"
        rows={rows.map((d) => [
          <span key="l"><button className="link" onClick={() => onOpen(d.lead.id)}><b>{d.lead.name}</b></button><span className="sub">{d.lead.company ?? "من غير شركة"} · {d.lead.code}</span></span>,
          <StageChip key="s" stage={d.lead.stage} />,
          <Who key="w" person={d.from} />,
          <span key="a">{day(d.at)}{d.days != null && <span className="sub">بعد {d.days} يوم</span>}</span>,
          <span key="t">{ago(d.lastAction)}</span>,
          <Decide key="d" row={d} />,
        ])} />
    </Card>
  );
}

/** Demo draftClock: «باقي X س» (warn in the last 3 hours), «اتأخر X س» once late. */
const DraftClock = ({ left }: { left: number }) => (
  <Chip plain tone={left < 0 ? "bad" : left <= 180 ? "warn" : "info"}>{left < 0 ? `اتأخر ${Math.ceil(-left / 60)} س` : `باقي ${Math.floor(left / 60)} س`}</Chip>
);

/** «وزّعه على»: يفضل في الـ Draft · الروتيشن · a salesperson · the one it came from («رجّعه»). */
function Decide({ row }: { row: DraftRow }) {
  const run = useAction();
  const qc = useQueryClient();
  const people = (useLeadOptions().data?.assignable ?? []).filter((p) => p.id !== row.from?.id);
  const name = (to: string) => (to === ROTATION ? "اللي عليه الدور" : to === row.from?.id ? row.from.name : people.find((p) => p.id === to)?.name ?? "");
  const pick = (to: string) => {
    if (!to) return;
    void run(async () => {
      await api.post(`/leads/drafts/${row.id}/decide`, { to });
      await Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ["leads-summary"] }), qc.invalidateQueries({ queryKey: ["leads"] })]);
    }, to === KEEP ? "فاضل في الـ Draft" : `راح لـ ${name(to)}`);
  };
  return (
    <span className="row">
      {row.kept ? <span className="hint">اتراجع · فاضل هنا</span> : <DraftClock left={row.minutesLeft} />}
      <select value="" onChange={(e) => pick(e.target.value)} aria-label={`وزّع ${row.lead.name}`}>
        <option value="">{row.kept ? "ابعته لحد…" : "اختار…"}</option>
        {!row.kept && <option value={KEEP}>يفضل في الـ Draft</option>}
        <option value={ROTATION}>الروتيشن (حسب الـ area)</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        {row.from && <option value={row.from.id}>{row.from.name} (رجّعه)</option>}
      </select>
    </span>
  );
}
