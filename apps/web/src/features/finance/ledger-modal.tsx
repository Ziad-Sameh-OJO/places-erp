"use client";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Empty, Icon, Modal, Table } from "@/components/ui";
import { money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { printBlock } from "./print";
import { useLedger } from "./use-finance";

/** An account's statement (demo «كشف حساب» / «رصيده جه منين»): every line with the running balance, printable. */
export function LedgerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("finance");
  const q = useLedger(id);
  const ref = useRef<HTMLDivElement>(null);
  const a = q.data?.account;
  return (
    <Modal title={a ? `${t("ledger.title")} · ${a.code} · ${serverText(a.name)}` : t("ledger.title")} onClose={onClose}>
      {!q.data ? <Empty text={t("common.loading")} icon="clock" /> : (
        <>
          <div ref={ref}>
            <p className="hint">{q.data.account.path.map(serverText).join(t("common.pathSep"))} · {t("ledger.balanceNow")} <b className="num">{money(q.data.balance)}</b></p>
            <Table head={[t("journal.entry"), t("common.date"), t("common.memo"), t("common.debit"), t("common.credit"), t("ledger.balanceAfter")]} empty={t("ledger.empty")}
              rows={q.data.lines.map((l) => [l.no, l.date.slice(0, 10), `${serverText(l.nature)}${l.memo ? ` · ${l.memo}` : ""}`, Number(l.debit) ? money(l.debit) : "", Number(l.credit) ? money(l.credit) : "", money(l.balance)])} />
          </div>
          <div className="row end no-print"><button className="btn ghost sm" onClick={() => printBlock(ref.current)}><Icon name="file" />{t("ledger.print")}</button></div>
        </>
      )}
    </Modal>
  );
}
