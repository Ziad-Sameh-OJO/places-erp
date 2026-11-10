"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Settings } from "@places/contracts";
import type { Channel } from "@places/domain";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Field, Note, onFormSubmit, Table, Tick, useAction } from "@/components/ui";
import { MailLog } from "./mail-log";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";

interface Rule { key: string; label: string; to: string; channels: Channel[]; important: boolean }
const CH: Channel[] = ["app", "push", "email"];

/** M-14: each event goes to whom and on which channel; the sending address. */
export function NotificationRules() {
  const t = useTranslations("notifications.rules");
  const chLabel = (c: Channel) => t(`channels.${c}`);
  const qc = useQueryClient();
  const run = useAction();
  const { can, canSet } = useMe();
  const ed = can("integrations", "edit");
  const rules = useQuery({ queryKey: ["notif-rules"], queryFn: () => api.get<Rule[]>("/notifications/rules") });
  const s = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const toggle = (r: Rule, c: Channel, on: boolean) => run(async () => {
    await api.put(`/notifications/rules/${r.key}`, { channels: on ? [...r.channels, c] : r.channels.filter((x) => x !== c) });
    await qc.invalidateQueries({ queryKey: ["notif-rules"] });
  }, t("saved"));
  return (
    <>
      <div className="cols">
        <Card title={t("from.title")} icon="send" sub={t("from.sub")}>
          {s.data && <form className="form" onSubmit={onFormSubmit((f) => run(async () => { await api.put("/settings/notificationsFrom", { value: f.get("from") }); await qc.invalidateQueries({ queryKey: ["settings"] }); }, t("saved")))}>
            <Field label={t("from.label")}><input name="from" type="email" dir="ltr" defaultValue={s.data.notificationsFrom} disabled={!canSet("notificationsFrom")} /></Field>
            {canSet("notificationsFrom") && <div className="row end"><button className="btn ghost sm">{t("save")}</button></div>}
          </form>}
        </Card>
        <Card title={t("prefs.title")} icon="bell" sub={t("prefs.sub")}>
          <Note>{t("prefs.note")}</Note>
        </Card>
      </div>
      <Card title={t("title")} icon="bell" sub={t("sub")}>
        <Table head={[t("head.event"), t("head.to"), ...CH.map(chLabel)]} rows={(rules.data ?? []).map((r) => [
          <b key="l">{serverText(r.label)}{r.important && t("important")}</b>, serverText(r.to),
          ...CH.map((c) => <Tick key={c} checked={r.channels.includes(c)} disabled={!ed} label={`${serverText(r.label)} ${chLabel(c)}`} onChange={(v) => toggle(r, c, v)} />),
        ])} />
        <Note>{t("pushNote")}</Note>
      </Card>
      {ed && <MailLog />}
    </>
  );
}
