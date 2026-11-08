"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AccountNode } from "@places/contracts";
import { Field, Modal, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";
import { only } from "./field-lock";
import { SYSTEM_CODES, flatten, useRefreshFinance } from "./use-finance";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** «حساب جديد في الشجرة» (demo acctNew): the code comes from the parent; an opening balance posts its own entry. */
export function AccountForm({ roots, parentId, onClose }: { roots: AccountNode[]; parentId: string | null; onClose: () => void }) {
  const t = useTranslations("finance");
  const run = useAction();
  const refresh = useRefreshFinance();
  const [busy, setBusy] = useState(false);
  const fields = useFields("finance"); // M-09: no opening balance from a read-only / hidden amount
  const all = flatten(roots);
  const parents = all.filter(({ node }) => !SYSTEM_CODES.has(node.code));
  const leaves = all.filter(({ leaf, node }) => leaf && node.code !== "34");
  const submit = onFormSubmit(async (d) => {
    const s = (k: string) => String(d.get(k) ?? "").trim();
    const body: Record<string, string> = { parentId: s("parentId"), name: s("name") };
    if (s("kind")) body.kind = s("kind");
    if (s("opening") && Number(s("opening")) > 0) { body.opening = s("opening"); body.date = s("date"); if (s("counterId")) body.counterId = s("counterId"); }
    setBusy(true);
    await run(async () => { const r = await api.post<{ code: string }>("/finance/accounts", body); await refresh(); onClose(); return r; }, t("accountForm.added"));
    setBusy(false);
  });
  return (
    <Modal title={t("accountForm.title")} onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Field label={t("accountForm.parent")} req wide>
          <select name="parentId" defaultValue={parentId ?? ""} required>
            <option value="" disabled>{t("common.choose")}</option>
            {parents.map(({ node, path }) => <option key={node.id} value={node.id}>{node.code} · {path.map(serverText).join(t("common.pathSep"))}</option>)}
          </select>
        </Field>
        <Field label={t("accountForm.name")} req wide><input name="name" required minLength={2} maxLength={120} /></Field>
        <Field label={t("accountForm.kind")}>
          <select name="kind" defaultValue=""><option value="">{t("accountKind.normal")}</option><option value="treasury">{t("accountKind.treasury")}</option><option value="bank">{t("accountKind.bank")}</option><option value="wallet">{t("accountKind.wallet")}</option></select>
        </Field>
        {only(fields, "amount", <Field label={t("accountForm.opening")}><input name="opening" inputMode="decimal" pattern="\d+(\.\d{1,2})?" placeholder="0" /></Field>)}
        <Field label={t("accountForm.counter")}>
          <select name="counterId" defaultValue=""><option value="">{t("accountForm.retained")}</option>{leaves.map(({ node }) => <option key={node.id} value={node.id}>{node.code} · {serverText(node.name)}</option>)}</select>
        </Field>
        <Field label={t("accountForm.date")}><input type="date" name="date" defaultValue={today()} max={today()} /></Field>
        <Note>{t("accountForm.note")}</Note>
        <button className="btn" disabled={busy}>{busy ? t("common.saving") : t("accountForm.submit")}</button>
      </form>
    </Modal>
  );
}
