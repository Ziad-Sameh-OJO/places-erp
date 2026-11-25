"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { MailServerView } from "@places/contracts";
import { SUPER_ADMIN_ROLE } from "@places/domain";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Field, Icon, Note, onFormSubmit, useAction, useToast } from "@/components/ui";

/** The usual servers, so the Super Admin picks one instead of looking up host and port. */
const PRESETS = { gmail: { host: "smtp.gmail.com", port: 465, secure: true }, outlook: { host: "smtp.office365.com", port: 587, secure: false } } as const;
type Provider = keyof typeof PRESETS | "other";
const providerOf = (host: string): Provider => (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find((k) => PRESETS[k].host === host) ?? (host ? "other" : "gmail");

/**
 * M-14 3.1 «إيميل الإرسال» (demo admin.js, widened on request): the mail server the system sends through — the
 * service, the sign-in email and its App Password, and the From. The password is written only, never shown.
 */
export function MailServerCard() {
  const t = useTranslations("notifications.rules.from");
  const qc = useQueryClient();
  const run = useAction(), toast = useToast();
  const { me } = useMe();
  const canEdit = !!me?.roles.includes(SUPER_ADMIN_ROLE);
  const q = useQuery({ queryKey: ["mail-server"], queryFn: () => api.get<MailServerView>("/notifications/mail/server") });
  const testMail = () => run(async () => {
    const r = await api.post<{ to: string; from: string }>("/notifications/mail/test");
    await qc.invalidateQueries({ queryKey: ["mail-log"] });
    toast(t("testSent", { from: r.from, to: r.to }));
  });
  return (
    <Card title={t("title")} icon="send" sub={t("sub")}>
      {q.data && <MailServerForm key={`${q.data.host}:${q.data.user}`} v={q.data} canEdit={canEdit} onTest={() => void testMail()} />}
    </Card>
  );
}

function MailServerForm({ v, canEdit, onTest }: { v: MailServerView; canEdit: boolean; onTest: () => void }) {
  const t = useTranslations("notifications.rules.from");
  const tr = useTranslations("notifications.rules");
  const qc = useQueryClient();
  const run = useAction();
  const [provider, setProvider] = useState<Provider>(providerOf(v.host));
  const [server, setServer] = useState({ host: v.host || PRESETS.gmail.host, port: v.port, secure: v.secure });
  const pick = (p: Provider) => { setProvider(p); if (p !== "other") setServer({ ...PRESETS[p] }); };
  const save = onFormSubmit((f) => run(async () => {
    await api.put("/notifications/mail/server", {
      ...server, user: f.get("user"), password: f.get("password") ?? "", fromName: f.get("fromName") ?? "", from: f.get("from"),
    });
    await qc.invalidateQueries({ queryKey: ["mail-server"] });
  }, tr("saved")));
  const off = !canEdit;
  return (
    // .grid: two columns where there's room, one on a phone (mobile.css)
    <form className="grid" onSubmit={save}>
      <div className="wide"><Note {...(v.source === "none" ? { kind: "warn" as const } : v.source === "page" ? { kind: "ok" as const } : {})}>{t(`source.${v.source}`)}</Note></div>
      <Field label={t("provider")} wide>
        <select value={provider} disabled={off} onChange={(e) => pick(e.target.value as Provider)}>
          {(["gmail", "outlook", "other"] as const).map((p) => <option key={p} value={p}>{t(`providers.${p}`)}</option>)}
        </select>
      </Field>
      {provider === "other" && <>
        <Field label={t("host")} wide><input dir="ltr" required value={server.host} disabled={off} onChange={(e) => setServer({ ...server, host: e.target.value })} /></Field>
        <Field label={t("port")}><input dir="ltr" type="number" min={1} max={65535} required value={server.port} disabled={off} onChange={(e) => setServer({ ...server, port: Number(e.target.value) })} /></Field>
        <Field label={t("security")}>
          <select value={server.secure ? "ssl" : "starttls"} disabled={off} onChange={(e) => setServer({ ...server, secure: e.target.value === "ssl" })}>
            <option value="ssl">{t("ssl")}</option><option value="starttls">{t("starttls")}</option>
          </select>
        </Field>
      </>}
      <Field label={t("user")} req><input name="user" type="email" dir="ltr" required autoComplete="off" defaultValue={v.user} disabled={off} /></Field>
      <Field label={t("password")} req={!v.hasPassword}>
        <input name="password" type="password" dir="ltr" autoComplete="new-password" required={!v.hasPassword} placeholder={v.hasPassword ? t("passwordSaved") : ""} disabled={off} />
      </Field>
      {provider !== "other" && <div className="wide"><Note>{t(provider === "gmail" ? "gmailNote" : "outlookNote")}</Note></div>}
      <Field label={t("fromName")}><input name="fromName" defaultValue={v.fromName || "Places ERP"} disabled={off} /></Field>
      <Field label={t("label")} req><input name="from" type="email" dir="ltr" required defaultValue={v.from} disabled={off} /></Field>
      {off && <div className="wide"><Note>{t("superOnly")}</Note></div>}
      <div className="row end wide">
        {/* 12.14 · demo admin.js nfTest: to my own address, through the saved server; the result shows in «سجل الإيميلات» */}
        <button type="button" className="btn ghost sm" onClick={onTest}><Icon name="send" />{t("test")}</button>
        {canEdit && <button className="btn sm">{tr("save")}</button>}
      </div>
    </form>
  );
}
