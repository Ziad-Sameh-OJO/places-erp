"use client";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import type { MoveEffect, MoveView } from "@places/contracts";
import { Empty, Icon, Modal } from "@/components/ui";
import { money } from "./money";
import { serverText } from "@/lib/server-text";
import { printBlock } from "./print";
import { useEntry, useMove } from "./use-finance";

/** The voucher (demo `voucher()`): its fields, its journal entry, «الأثر على شجرة الحسابات» after saving, signatures and «اطبع السند». */
export function Voucher({ move, effect, onClose }: { move: MoveView; effect?: MoveEffect[]; onClose: () => void }) {
  const t = useTranslations("finance");
  const ref = useRef<HTMLDivElement>(null);
  const entry = useEntry(move.entry.id).data;
  const label = serverText(move.label);
  const acct = (a: { code: string; name: string }) => `${a.code} · ${serverText(a.name)}`;
  const kv: [string, string][] = [
    [t("common.date"), move.date], [t("common.amount"), money(move.amount)], [t("voucher.entry"), `${move.entry.no} · ${label}`],
    ...(move.ref ? [[t("move.ref"), move.ref] as [string, string]] : []),
    ...(move.from ? [[t("common.from"), acct(move.from)] as [string, string]] : []),
    ...(move.to ? [[t("common.to"), acct(move.to)] as [string, string]] : []),
    ...(move.party ? [[t("cash.party"), move.party] as [string, string]] : []), ...(move.account ? [[t("common.account"), acct(move.account)] as [string, string]] : []),
    ...(move.kind === "settle" ? [[t("voucher.spent"), money(move.spent ?? "0")], [t("voucher.returned"), money(move.returned ?? "0")]] as [string, string][] : []),
    ...(move.memo ? [[t("common.memo"), move.memo] as [string, string]] : []), [t("voucher.by"), move.by],
  ];
  return (
    <Modal title={`${label} · ${move.no}`} onClose={onClose}>
      <div ref={ref}>
        <div className="pdf">
          <div className="pdf-head"><b>Places · {label}</b><span className="mono">{move.no}</span></div>
          <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <h4 className="mini-h">{t("voucher.entry")} {move.entry.no}</h4>
          {!entry ? <Empty text={t("common.loading")} icon="clock" /> : (
            <table className="je">
              <thead><tr><th>{t("common.account")}</th><th>{t("common.debit")}</th><th>{t("common.credit")}</th></tr></thead>
              <tbody>{entry.lines.map((l, i) => <tr key={i}><td><span className="mono">{l.code}</span> {serverText(l.name)}</td><td className="num">{Number(l.debit) ? money(l.debit) : ""}</td><td className="num">{Number(l.credit) ? money(l.credit) : ""}</td></tr>)}</tbody>
            </table>
          )}
          {effect && <>
            <h4 className="mini-h">{t("common.effect")}</h4>
            <table className="je"><thead><tr><th>{t("common.account")}</th><th>{t("common.before")}</th><th>{t("common.after")}</th></tr></thead>
              <tbody>{effect.map((e) => <tr key={e.code}><td><span className="mono">{e.code}</span> {serverText(e.name)}</td><td className="num">{money(e.before)}</td><td className="num"><b>{money(e.after)}</b></td></tr>)}</tbody></table>
          </>}
          <div className="row" style={{ marginTop: 28 }}><span className="spacer">{t("voucher.recipientSign")}</span><span>{t("voucher.accountantSign")}</span></div>
        </div>
      </div>
      <div className="row end no-print"><button className="btn ghost sm" onClick={() => printBlock(ref.current)}><Icon name="file" />{t("voucher.print")}</button>
        <a className="btn ghost sm" href={`/api/v1/finance/moves/${move.id}/pdf`} target="_blank" rel="noreferrer"><Icon name="file" />{t("voucher.pdf")}</a></div>
    </Modal>
  );
}

/** A voucher opened from the list. */
export function VoucherById({ id, onClose }: { id: string; onClose: () => void }) {
  const m = useMove(id).data;
  return m ? <Voucher move={m} onClose={onClose} /> : null;
}
