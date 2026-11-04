"use client";
import { useRef } from "react";
import { Empty, Icon, Modal, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { printBlock } from "./print";
import { useLedger } from "./use-finance";

/** An account's statement (demo «كشف حساب» / «رصيده جه منين»): every line with the running balance, printable. */
export function LedgerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useLedger(id);
  const ref = useRef<HTMLDivElement>(null);
  const a = q.data?.account;
  return (
    <Modal title={a ? `كشف حساب · ${a.code} · ${a.name}` : "كشف حساب"} onClose={onClose}>
      {!q.data ? <Empty text="بيحمّل…" icon="clock" /> : (
        <>
          <div ref={ref}>
            <p className="hint">{q.data.account.path.join(" ← ")} · الرصيد دلوقتي <b className="num">{money(q.data.balance)}</b></p>
            <Table head={["القيد", "التاريخ", "البيان", "مدين", "دائن", "الرصيد بعدها"]} empty="مفيش حركات على الحساب ده"
              rows={q.data.lines.map((l) => [l.no, l.date.slice(0, 10), `${l.nature}${l.memo ? ` · ${l.memo}` : ""}`, Number(l.debit) ? money(l.debit) : "", Number(l.credit) ? money(l.credit) : "", money(l.balance)])} />
          </div>
          <div className="row end no-print"><button className="btn ghost sm" onClick={() => printBlock(ref.current)}><Icon name="file" />اطبع الكشف</button></div>
        </>
      )}
    </Modal>
  );
}
