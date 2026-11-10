"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { LeadRow } from "@places/contracts";
import { Chip, Empty, SortTh } from "@/components/ui";
import { nextSort, type SortDir } from "@places/domain";
import { ago, money, num } from "@/lib/format";
import { SlaBar, StageChip, Who } from "./lead-bits";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";

/**
 * The demo's list (leads.js listView): one row per lead, on phones a card per lead. With `picked`, a checkbox per row
 * and «حدد الكل» for the bulk bar (demo: whoever may edit or hand out leads).
 */
export function LeadsTable({ leads, onOpen, picked, onPick, sort, onSort }: {
  leads: LeadRow[]; onOpen: (id: string) => void; picked?: string[]; onPick?: (ids: string[]) => void;
  sort?: { sort?: string | undefined; dir?: SortDir | undefined }; onSort?: (by: string, dir: SortDir) => void;
}) {
  const t = useTranslations("leads.table");
  const fields = useFields("leads"); // M-09: a hidden field has no column / no line (the API blanks it too)
  const budget = fields.shows("budget");
  const HEAD = [t("lead"), "Area · Type", ...(budget ? ["Budget"] : []), "Channel · Campaign", "Sales", "Stage", "SLA"];
  // 0.15: what each column sorts by in the API (LEAD_SORTS); Sales has none
  const KEYS = ["name", "area", ...(budget ? ["budget"] : []), "channel", null, "stage", "createdAt"];
  const dirOf = (j: number) => (!onSort || !KEYS[j] ? false : sort?.sort === KEYS[j] ? sort.dir ?? "asc" : null);
  const sortBy = (j: number) => { const n = nextSort(sort?.sort ? { col: sort.sort, dir: sort.dir ?? "asc" } : null, KEYS[j]!); onSort?.(n.col, n.dir); };
  const pick = !!picked && !!onPick;
  const all = pick && leads.length > 0 && leads.every((l) => picked.includes(l.id));
  const toggle = (id: string, on: boolean) => onPick?.(on ? [...picked!.filter((x) => x !== id), id] : picked!.filter((x) => x !== id));
  const cells = (l: LeadRow): ReactNode[] => [
    <span key="l"><b>{l.name}</b><span className="sub">{l.company && <>{l.company} · </>}<span className="mono">{l.code}</span></span>{fields.shows("phones") && <span className="sub mono">{l.phones.join(" · ")}</span>}</span>,
    <span key="a">{l.area ? serverText(l.area) : "—"}<span className="sub">{l.type}{l.space != null && <> · {t.rich("sqm", { n: num(l.space), s: (c) => <span className="num">{c}</span> })}</>}</span></span>,
    ...(budget ? [<span key="b" className="n">{money(l.budget)}</span>] : []),
    <span key="c">{l.channel || "—"}{fields.shows("campaign") && <span className="sub">{l.campaign?.name ?? "—"}</span>}</span>,
    <span key="s"><Who person={l.assignedTo} />{l.ownedByTelesales && <span className="sub">{t("withTelesales")}</span>}</span>,
    <div key="st" className="row"><StageChip stage={l.stage} />{l.qualified && <Chip tone="ok">Qualified</Chip>}</div>,
    l.sla ? <SlaBar key="sla" sla={l.sla} /> : <span key="sla" className="hint">{ago(l.createdAt)}</span>,
  ];
  return (
    <div className="tbl-wrap">
      <table className="cardable">
        <thead>
          <tr>
            {pick && <th className="pick"><input type="checkbox" checked={all} aria-label={t("selectAll")} onChange={(e) => onPick(e.target.checked ? leads.map((l) => l.id) : [])} /></th>}
            {HEAD.map((h, j) => <SortTh key={h} label={h} dir={dirOf(j)} onSort={() => sortBy(j)} />)}
          </tr>
        </thead>
        <tbody>
          {leads.length ? leads.map((l) => {
            const on = pick && picked.includes(l.id);
            return (
              <tr key={l.id} className={`click ${on ? "selected" : ""}`} onClick={() => onOpen(l.id)}>
                {pick && (
                  <td className="pick" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={on} aria-label={t("select", { name: l.name })} onChange={(e) => toggle(l.id, e.target.checked)} />
                  </td>
                )}
                {cells(l).map((c, j) => <td key={j} data-label={HEAD[j]}>{c}</td>)}
              </tr>
            );
          }) : <tr><td colSpan={HEAD.length + (pick ? 1 : 0)}><Empty text={t("empty")} /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
