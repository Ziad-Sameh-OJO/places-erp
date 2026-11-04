"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { otpResendWait } from "@places/domain";
import { api } from "@/lib/api";
import { Field } from "@/components/ui";
import { AuthForm, str } from "../form";

/** M-09 sign-in: email + password; a 6-digit code by email only for people the admin turned OTP on for. */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"login" | "otp" | "forgot" | "sent">("login");
  const [email, setEmail] = useState("");

  if (step === "otp") return <OtpStep email={email} onBack={() => setStep("login")} onDone={() => router.replace("/")} />;
  if (step === "forgot") return (
    <>
      <h1>نسيت الباسورد</h1><p className="hint">اكتب إيميلك وهنبعتلك لينك تعمل منه باسورد جديد.</p>
      <AuthForm onSubmit={async (f) => { await api.post("/auth/forgot", { email: str(f, "email") }); setStep("sent"); }}>
        <Field label="الإيميل" req><input name="email" type="email" required defaultValue={email} autoFocus /></Field>
        <button className="btn">ابعت اللينك</button>
        <button type="button" className="btn ghost sm" onClick={() => setStep("login")}>رجوع</button>
      </AuthForm>
    </>
  );
  if (step === "sent") return (
    <>
      <h1>شوف إيميلك</h1><p className="hint">لو الإيميل ده عليه حساب، هيوصلك لينك تغيير الباسورد (صالح 30 دقيقة).</p>
      <button className="btn ghost" onClick={() => setStep("login")}>رجوع لتسجيل الدخول</button>
    </>
  );
  return (
    <>
      <h1>تسجيل الدخول</h1><p className="hint">ادخل بإيميل الشغل والباسورد بتاعك.</p>
      <AuthForm onSubmit={async (f) => {
        const e = str(f, "email");
        setEmail(e);
        const r = await api.post<{ otpRequired: boolean }>("/auth/login", { email: e, password: str(f, "password") });
        if (r.otpRequired) setStep("otp"); else router.replace("/");
      }}>
        <Field label="الإيميل" req><input name="email" type="email" autoComplete="username" required defaultValue={email} autoFocus /></Field>
        <Field label="الباسورد" req><input name="password" type="password" autoComplete="current-password" required /></Field>
        <button className="btn">دخول</button>
        <button type="button" className="btn ghost sm" onClick={() => setStep("forgot")}>نسيت الباسورد؟</button>
      </AuthForm>
    </>
  );
}

/** The code screen, with «ابعت كود تاني» counting down the minute since the last code (M-09 2.4). */
function OtpStep({ email, onBack, onDone }: { email: string; onBack: () => void; onDone: () => void }) {
  const [sentAt, setSentAt] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const wait = otpResendWait(sentAt, now);
  async function resend() {
    try { await api.post("/auth/otp/resend", { email }); setSentAt(new Date()); setNow(new Date()); setMsg("اتبعت كود جديد."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "حصل خطأ"); }
  }
  return (
    <>
      <h1>كود التأكيد</h1><p className="hint">بعتنا كود من 6 أرقام على <b>{email}</b> · صالح 10 دقايق.</p>
      {msg && <div className="auth-msg" role="status">{msg}</div>}
      <AuthForm onSubmit={async (f) => { setMsg(null); await api.post("/auth/otp", { email, code: str(f, "code") }); onDone(); }}>
        <Field label="الكود" req><input name="code" inputMode="numeric" maxLength={6} pattern="\d{6}" required autoComplete="one-time-code" autoFocus /></Field>
        <button className="btn">تأكيد</button>
        <button type="button" className="btn ghost sm" disabled={wait > 0} onClick={resend}>{wait > 0 ? `تقدر تطلب كود تاني بعد ${wait} ثانية` : "ابعت كود تاني"}</button>
        <button type="button" className="btn ghost sm" onClick={onBack}>رجوع</button>
      </AuthForm>
    </>
  );
}
