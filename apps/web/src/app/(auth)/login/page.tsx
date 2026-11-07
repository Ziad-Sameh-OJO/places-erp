"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { otpResendWait } from "@places/domain";
import { api } from "@/lib/api";
import { Field } from "@/components/ui";
import { AuthForm, str } from "../form";

/** M-09 sign-in: email + password; a 6-digit code by email only for people the admin turned OTP on for. */
export default function LoginPage() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const [step, setStep] = useState<"login" | "otp" | "forgot" | "sent">("login");
  const [email, setEmail] = useState("");

  if (step === "otp") return <OtpStep email={email} onBack={() => setStep("login")} onDone={() => router.replace("/")} />;
  if (step === "forgot") return (
    <>
      <h1>{t("forgotTitle")}</h1><p className="hint">{t("forgotHint")}</p>
      <AuthForm onSubmit={async (f) => { await api.post("/auth/forgot", { email: str(f, "email") }); setStep("sent"); }}>
        <Field label={t("email")} req><input name="email" type="email" required defaultValue={email} autoFocus /></Field>
        <button className="btn">{t("sendLink")}</button>
        <button type="button" className="btn ghost sm" onClick={() => setStep("login")}>{t("back")}</button>
      </AuthForm>
    </>
  );
  if (step === "sent") return (
    <>
      <h1>{t("sentTitle")}</h1><p className="hint">{t("sentHint")}</p>
      <button className="btn ghost" onClick={() => setStep("login")}>{t("backToSignIn")}</button>
    </>
  );
  return (
    <>
      <h1>{t("title")}</h1><p className="hint">{t("hint")}</p>
      <AuthForm onSubmit={async (f) => {
        const e = str(f, "email");
        setEmail(e);
        const r = await api.post<{ otpRequired: boolean }>("/auth/login", { email: e, password: str(f, "password") });
        if (r.otpRequired) setStep("otp"); else router.replace("/");
      }}>
        <Field label={t("email")} req><input name="email" type="email" autoComplete="username" required defaultValue={email} autoFocus /></Field>
        <Field label={t("password")} req><input name="password" type="password" autoComplete="current-password" required /></Field>
        <button className="btn">{t("submit")}</button>
        <button type="button" className="btn ghost sm" onClick={() => setStep("forgot")}>{t("forgot")}</button>
      </AuthForm>
    </>
  );
}

/** The code screen, with «ابعت كود تاني» counting down the minute since the last code (M-09 2.4). */
function OtpStep({ email, onBack, onDone }: { email: string; onBack: () => void; onDone: () => void }) {
  const t = useTranslations("auth.otp");
  const tAuth = useTranslations("auth");
  const [sentAt, setSentAt] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const wait = otpResendWait(sentAt, now);
  async function resend() {
    try { await api.post("/auth/otp/resend", { email }); setSentAt(new Date()); setNow(new Date()); setMsg(t("resent")); }
    catch (e) { setMsg(e instanceof Error ? e.message : tAuth("error")); }
  }
  return (
    <>
      <h1>{t("title")}</h1><p className="hint">{t.rich("hint", { email, b: (c) => <b>{c}</b> })}</p>
      {msg && <div className="auth-msg" role="status">{msg}</div>}
      <AuthForm onSubmit={async (f) => { setMsg(null); await api.post("/auth/otp", { email, code: str(f, "code") }); onDone(); }}>
        <Field label={t("code")} req><input name="code" inputMode="numeric" maxLength={6} pattern="\d{6}" required autoComplete="one-time-code" autoFocus /></Field>
        <button className="btn">{t("confirm")}</button>
        <button type="button" className="btn ghost sm" disabled={wait > 0} onClick={resend}>{wait > 0 ? t("wait", { seconds: wait }) : t("resend")}</button>
        <button type="button" className="btn ghost sm" onClick={onBack}>{t("back")}</button>
      </AuthForm>
    </>
  );
}
