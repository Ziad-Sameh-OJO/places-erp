"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { Field } from "@/components/ui";
import { AuthForm, str } from "./form";

/** The page behind the activation and reset links: the token from the email + a new password. */
export function PasswordPage({ kind }: { kind: "activate" | "reset" }) {
  const t = useTranslations("auth.password");
  const tAuth = useTranslations("auth");
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const title = kind === "activate" ? t("activateTitle") : t("resetTitle");
  if (!token) return <><h1>{t("missingTitle")}</h1><p className="hint">{t("missingHint")}</p><Link className="btn ghost" href="/login">{t("signIn")}</Link></>;
  if (done) return <><h1>{t("doneTitle")}</h1><p className="hint">{t("doneHint")}</p><Link className="btn" href="/login">{t("signIn")}</Link></>;
  return (
    <>
      <h1>{title}</h1><p className="hint">{kind === "activate" ? t("activateHint") : t("resetHint")}</p>
      <AuthForm onSubmit={async (f) => {
        if (str(f, "pw") !== str(f, "pw2")) throw new Error(t("mismatch"));
        await api.post(`/auth/${kind}`, { token, password: str(f, "pw") });
        setDone(true);
      }}>
        <Field label={t("password")} req><input name="pw" type="password" autoComplete="new-password" required minLength={10} autoFocus /></Field>
        <Field label={t("confirm")} req><input name="pw2" type="password" autoComplete="new-password" required /></Field>
        <p className="hint">{tAuth("pwHint")}</p>
        <button className="btn">{kind === "activate" ? t("activate") : t("change")}</button>
      </AuthForm>
    </>
  );
}
