"use client";
import { useState } from "react";
import type { AccountNode } from "@places/contracts";
import { Empty, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money, short } from "@/lib/format";
import { SYSTEM_CODES, useChart, useRefreshFinance } from "./use-finance";
import { AccountForm } from "./account-form";
import { LedgerModal } from "./ledger-modal";
import { OpeningForm } from "./opening-form";

/**
 * M-07 · شجرة الحسابات (demo finance.js «tree»): every account with its code, nature and live balance, a parent = the
 * sum of its children, «+ حساب فرعي» inside every account, and a leaf opens its ledger.
 */
export function ChartTree() {
  const { can } = useMe();
  const chart = useChart();
  const [adding, setAdding] = useState<string | null | undefined>(undefined); // undefined = closed, null = no parent picked
  const [ledger, setLedger] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const run = useAction();
  const refresh = useRefreshFinance();
  const canAdd = can("finance", "create"), canEdit = can("finance", "edit");
  if (chart.isPending) return <Empty text="بيحمّل…" icon="clock" />;
  if (!chart.data) return <Empty text="ماقدرناش نجيب الشجرة" />;
  const { roots, check } = chart.data;

  const remove = (n: AccountNode) => run(async () => { await api.del(`/finance/accounts/${n.id}`); await refresh(); }, `اتمسح الحساب ${n.code}`);
  const node = (n: AccountNode, depth: number) => n.children.length ? (
    <details key={n.id} open={depth < 2}>
      <summary><b className="mono">{n.code}</b> <b>{n.name}</b><span className="spacer" /><span className="hint">{n.nature === "dr" ? "مدين" : "دائن"}</span><b className="num">{money(n.balance)}</b></summary>
      <div className="kids">
        {n.children.map((k) => node(k, depth + 1))}
        {canAdd && !SYSTEM_CODES.has(n.code) && <button className="btn ghost sm add-sub" onClick={() => setAdding(n.id)}><Icon name="plus" />حساب فرعي تحت {n.name}</button>}
      </div>
    </details>
  ) : (
    <div key={n.id} className="kid click" onClick={() => setLedger(n.id)}>
      <span className="mono">{n.code}</span><span className="spacer">{n.name}{!n.fixed && <span className="hint"> · حساب جديد</span>}</span><b className="num">{money(n.balance)}</b>
      {n.removable && canEdit && <button className="icon-btn sm" aria-label="امسح الحساب" onClick={(e) => { e.stopPropagation(); void remove(n); }}><Icon name="x" /></button>}
    </div>
  );

  return (
    <>
      {(canAdd || canEdit) && (
        <div className="row">
          {canAdd && <button className="btn" onClick={() => setAdding(null)}><Icon name="plus" />حساب جديد في الشجرة</button>}
          <span className="spacer" />
          {canAdd && <button className="btn ghost" onClick={() => setOpening(true)}><Icon name="layers" />الأرصدة الافتتاحية</button>}
        </div>
      )}
      <Note kind={check.balanced ? "ok" : "warn"}>
        الحسابات الرئيسية الخمسة ثابتة، وتحت أي حساب تقدر تضيف حساب فرعي، ولو ليه رصيد افتتاحي بيتعمله قيد. أي إذن أو قيد بيتسمّع هنا على طول.
        {" "}الأصول {short(check.assets)} = الخصوم {short(check.liabilities)} + حقوق الملكية {short(check.equity)} {check.balanced ? "✓" : "· فيه فرق"}
      </Note>
      <div className="tree coa">{roots.map((r) => node(r, 0))}</div>
      {adding !== undefined && <AccountForm roots={roots} parentId={adding} onClose={() => setAdding(undefined)} />}
      {ledger && <LedgerModal id={ledger} onClose={() => setLedger(null)} />}
      {opening && <OpeningForm roots={roots} onClose={() => setOpening(false)} />}
    </>
  );
}
