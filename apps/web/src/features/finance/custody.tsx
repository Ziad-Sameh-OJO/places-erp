"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Holder, MoveEffect, MoveView } from "@places/contracts";
import { Card, Empty, Note, Table } from "@/components/ui";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { useCash } from "./use-finance";
import { MoveForm } from "./move-form";
import { Voucher } from "./voucher";
import { LedgerModal } from "./ledger-modal";

/** M-07 · «العهد والسلف» (9.3): open custody with «تسوية»; each employee's advance account (131…) with its statement. */
export function Custody() {
  const t = useTranslations("finance");
  const { can } = useMe();
  const cash = useCash();
  const [settle, setSettle] = useState<Holder | null>(null);
  const [saved, setSaved] = useState<{ move: MoveView; effect: MoveEffect[] } | null>(null);
  const [statement, setStatement] = useState<string | null>(null);
  if (!cash.data) return <Empty text={t("common.loading")} icon="clock" />;
  const c = cash.data, canPost = can("finance", "create");
  const open = c.custody.filter((h) => Number(h.balance));
  return (
    <>
      <Note>{t("custody.note")}</Note>
      <Card title={t("custody.openTitle")} icon="wallet">
        <Table head={[t("common.code"), t("custody.with"), t("custody.now"), ""]} empty={t("custody.empty")} onRow={(i) => setStatement(open[i]!.accountId)}
          rows={open.map((h) => [<span key="c" className="mono">{h.code}</span>, h.name, money(h.balance),
            canPost ? <button key="s" className="btn sm" onClick={(e) => { e.stopPropagation(); setSettle(h); }}>{t("custody.settle")}</button> : ""])} />
      </Card>
      <Card title={t("common.employeeAdvances")} icon="users" sub={t("custody.advancesSub")}>
        <Table head={[t("common.code"), t("common.employee"), t("custody.balance")]} empty={t("common.noAdvances")} onRow={(i) => setStatement(c.advances[i]!.accountId)}
          rows={c.advances.map((h) => [<span key="c" className="mono">{h.code}</span>, h.name, money(h.balance)])} />
      </Card>
      {settle && <MoveForm kind="settle" cash={c} settle={settle} onClose={() => setSettle(null)} onSaved={(s) => { setSettle(null); setSaved(s); }} />}
      {saved && <Voucher move={saved.move} effect={saved.effect} onClose={() => setSaved(null)} />}
      {statement && <LedgerModal id={statement} onClose={() => setStatement(null)} />}
    </>
  );
}
