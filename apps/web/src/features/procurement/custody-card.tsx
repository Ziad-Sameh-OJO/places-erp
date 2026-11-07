"use client";
import { useTranslations } from "next-intl";
import { Card, Icon, onFormSubmit, useAction } from "@/components/ui";
import { KpiTile } from "@/components/blocks";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useOverview, useRefreshProcurement } from "./use-purchases";

/**
 * demo «عهدة مختار والتنفيذ» (KPI M-12): the safe(s) finance put a ceiling on, against their balance (Q47), and the
 * requests settled within 48 hours. Finance sets the ceiling here.
 */
export function CustodyCard() {
  const t = useTranslations("procurement");
  const { can } = useMe();
  const o = useOverview();
  const run = useAction();
  const refresh = useRefreshProcurement();
  if (!o.data) return null;
  const capped = o.data.cash.filter((c) => c.cap !== null);
  const { done, total } = o.data.in48;
  const save = (d: FormData) => void run(async () => {
    await api.put("/procurement/custody-cap", { accountId: String(d.get("accountId") ?? ""), cap: String(d.get("cap") ?? "").trim() });
    await refresh();
  }, t("custody.capSaved"));
  return (
    <Card title={t("custody.title")} icon="wallet">
      <div className="kpis sm">
        {capped.map((c) => <KpiTile key={c.accountId} label={t("custody.balanceOf", { name: serverText(c.name) })} value={money(c.balance)} sub={t("custody.cap", { amount: money(c.cap) })} icon="wallet" tone={Number(c.balance) <= Number(c.cap) ? "ok" : "bad"} />)}
        <KpiTile label={t("custody.in48")} value={total ? `${Math.round((done / total) * 100)}%` : "—"} sub={t("custody.in48Sub", { done: String(done), total: String(total), count: total })} icon="clock" tone={done / Math.max(1, total) >= 0.9 ? "ok" : "warn"} />
      </div>
      {capped.length === 0 && <p className="hint">{t("custody.noCap")}</p>}
      <p className="hint">{t("custody.rule")}</p>
      {can("finance", "edit") && (
        <form className="row" onSubmit={onFormSubmit(save)}>
          <select name="accountId" aria-label={t("custody.safe")} defaultValue={o.data.cash.find((c) => /مختار/.test(c.name))?.accountId}>{o.data.cash.map((c) => <option key={c.accountId} value={c.accountId}>{serverText(c.name)}</option>)}</select>
          <input name="cap" required inputMode="decimal" type="number" min={0} step="0.01" placeholder={t("custody.capLabel")} aria-label={t("custody.capLabel")} style={{ maxWidth: 140 }} />
          <button className="btn ghost sm"><Icon name="check" />{t("custody.setCap")}</button>
        </form>
      )}
    </Card>
  );
}
