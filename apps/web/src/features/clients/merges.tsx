"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ClientFile } from "@places/contracts";
import { Card, Chip, Icon, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useFields, useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { KindChips } from "./client-bits";
import { useMerges } from "./use-clients";

/**
 * M-10 2.2 · «طلبات مستنية الأوبريشن» (like the leads' duplicates card): each merge with the two files, why, and
 * ادمج / ارفض. Shown only to people who may approve.
 */
export function MergeQueue() {
  const { can } = useMe();
  const t = useTranslations("clients.merges");
  const merges = useMerges(can("clients", "approve"));
  const run = useAction();
  const qc = useQueryClient();
  const items = merges.data ?? [];
  if (!items.length) return null;
  const decide = (id: string, decision: "approve" | "reject") => run(async () => {
    await api.post(`/clients/merges/${id}`, { decision });
    await qc.invalidateQueries({ queryKey: ["clients"] });
  }, decision === "approve" ? t("merged") : t("rejected"));
  return (
    <Card className="attn" title={t("title")} icon="alert" extra={<Chip tone="warn">{items.length}</Chip>}>
      {items.map((m) => (
        <div className="line-item" key={m.id}>
          <span><Icon name="users" /><span>
            <b>{m.drop.name}</b> <KindChips kind={m.drop.kind} /> {t("into")} <b>{m.keep.name}</b> <KindChips kind={m.keep.kind} />
            <small className="hint"> · {serverText(m.reason)}{m.by ? t("by", { name: m.by }) : t("system")}</small>
          </span></span>
          <button className="btn sm" onClick={() => void decide(m.id, "approve")}>{t("merge")}</button>
          <button className="btn ghost sm" onClick={() => void decide(m.id, "reject")}>{t("reject")}</button>
        </div>
      ))}
    </Card>
  );
}

/** In a file's drawer: «ادمج بالموبايل» — the other file's number; Operations approves (M-10 2.2). */
export function SuggestMergeForm({ file }: { file: ClientFile }) {
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const t = useTranslations("clients.suggest");
  const fields = useFields("clients"); // M-09: merging by number needs the numbers
  if (!can("clients", "edit") || !fields.shows("phones")) return null;
  const save = onFormSubmit((d) => run(async () => {
    await api.post(`/clients/${file.id}/merges`, { phone: d.get("phone") });
    await qc.invalidateQueries({ queryKey: ["clients", "merges"] });
    (document.getElementById("cl-merge") as HTMLInputElement | null)?.form?.reset();
  }, t("sent")));
  return (
    <form className="card flat" onSubmit={save}>
      <div className="card-head"><h3><span className="ico"><Icon name="users" /></span><span>{t("title")}<small>{t("sub")}</small></span></h3></div>
      <div className="row">
        <input name="phone" id="cl-merge" required inputMode="tel" placeholder={t("phone")} aria-label={t("phone")} maxLength={20} />
        <button className="btn ghost">{t("send")}</button>
      </div>
    </form>
  );
}
