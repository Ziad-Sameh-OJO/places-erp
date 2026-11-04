"use client";
import { Empty, Modal, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { useLedger } from "./use-finance";

/** A leaf's ledger (demo «رصيده جه منين»): every line with the running balance. */
export function LedgerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useLedger(id);
  const a = q.data?.account;
  return (
    <Modal title={a ? `${a.code} · ${a.name}` : "الحساب"} onClose={onClose}>
      {!q.data ? <Empty text="بيحمّل…" icon="clock" /> : (
        <>
          <p className="hint">{q.data.account.path.join(" ← ")} · الرصيد <b className="num">{money(q.data.balance)}</b></p>
          <Table head={["القيد", "التاريخ", "البيان", "مدين", "دائن", "الرصيد"]} empty="مفيش حركات على الحساب ده"
            rows={q.data.lines.map((l) => [l.no, l.date.slice(0, 10), `${l.nature}${l.memo ? ` · ${l.memo}` : ""}`, Number(l.debit) ? money(l.debit) : "", Number(l.credit) ? money(l.credit) : "", money(l.balance)])} />
        </>
      )}
    </Modal>
  );
}
