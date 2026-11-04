"use client";
import { useRef } from "react";
import type { MoveEffect, MoveView } from "@places/contracts";
import { Empty, Icon, Modal } from "@/components/ui";
import { money } from "@/lib/format";
import { printBlock } from "./print";
import { useEntry, useMove } from "./use-finance";

/** The voucher (demo `voucher()`): its fields, its journal entry, «الأثر على شجرة الحسابات» after saving, signatures and «اطبع السند». */
export function Voucher({ move, effect, onClose }: { move: MoveView; effect?: MoveEffect[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const entry = useEntry(move.entry.id).data;
  const kv: [string, string][] = [
    ["التاريخ", move.date], ["المبلغ", money(move.amount)], ["قيد اليومية", `${move.entry.no} · ${move.label}`],
    ...(move.ref ? [["رقم الفاتورة / المرجع", move.ref] as [string, string]] : []),
    ...(move.from ? [["من", `${move.from.code} · ${move.from.name}`] as [string, string]] : []),
    ...(move.to ? [["لـ", `${move.to.code} · ${move.to.name}`] as [string, string]] : []),
    ["الطرف", move.party], ...(move.account ? [["الحساب", `${move.account.code} · ${move.account.name}`] as [string, string]] : []),
    ...(move.kind === "settle" ? [["اتصرف", money(move.spent ?? "0")], ["رجع للخزنة", money(move.returned ?? "0")]] as [string, string][] : []),
    ["البيان", move.memo], ["سجّله", move.by],
  ];
  return (
    <Modal title={`${move.label} · ${move.no}`} onClose={onClose}>
      <div ref={ref}>
        <div className="pdf">
          <div className="pdf-head"><b>Places · {move.label}</b><span className="mono">{move.no}</span></div>
          <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <h4 className="mini-h">قيد اليومية {move.entry.no}</h4>
          {!entry ? <Empty text="بيحمّل…" icon="clock" /> : (
            <table className="je">
              <thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead>
              <tbody>{entry.lines.map((l, i) => <tr key={i}><td><span className="mono">{l.code}</span> {l.name}</td><td className="num">{Number(l.debit) ? money(l.debit) : ""}</td><td className="num">{Number(l.credit) ? money(l.credit) : ""}</td></tr>)}</tbody>
            </table>
          )}
          {effect && <>
            <h4 className="mini-h">الأثر على شجرة الحسابات</h4>
            <table className="je"><thead><tr><th>الحساب</th><th>قبل</th><th>بعد</th></tr></thead>
              <tbody>{effect.map((e) => <tr key={e.code}><td><span className="mono">{e.code}</span> {e.name}</td><td className="num">{money(e.before)}</td><td className="num"><b>{money(e.after)}</b></td></tr>)}</tbody></table>
          </>}
          <div className="row" style={{ marginTop: 28 }}><span className="spacer">توقيع المستلم: ____________</span><span>توقيع المحاسب: ____________</span></div>
        </div>
      </div>
      <div className="row end no-print"><button className="btn ghost sm" onClick={() => printBlock(ref.current)}><Icon name="file" />اطبع السند</button></div>
    </Modal>
  );
}

/** A voucher opened from the list. */
export function VoucherById({ id, onClose }: { id: string; onClose: () => void }) {
  const m = useMove(id).data;
  return m ? <Voucher move={m} onClose={onClose} /> : null;
}
