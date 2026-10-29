"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Field } from "@/components/ui";
import { AuthForm, PW_HINT, str } from "./form";

/** The page behind the activation and reset links: the token from the email + a new password. */
export function PasswordPage({ kind }: { kind: "activate" | "reset" }) {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const title = kind === "activate" ? "تفعيل الحساب" : "باسورد جديد";
  if (!token) return <><h1>اللينك ناقص</h1><p className="hint">افتح اللينك من الإيميل زي ما هو.</p><Link className="btn ghost" href="/login">تسجيل الدخول</Link></>;
  if (done) return <><h1>تمام</h1><p className="hint">الباسورد اتعمل. ادخل بيه دلوقتي.</p><Link className="btn" href="/login">تسجيل الدخول</Link></>;
  return (
    <>
      <h1>{title}</h1><p className="hint">{kind === "activate" ? "أهلاً بيك في Places ERP · اعمل الباسورد بتاعك." : "اكتب الباسورد الجديد."}</p>
      <AuthForm onSubmit={async (f) => {
        if (str(f, "pw") !== str(f, "pw2")) throw new Error("الباسوردين مش زي بعض");
        await api.post(`/auth/${kind}`, { token, password: str(f, "pw") });
        setDone(true);
      }}>
        <Field label="الباسورد" req><input name="pw" type="password" autoComplete="new-password" required minLength={10} autoFocus /></Field>
        <Field label="أكّد الباسورد" req><input name="pw2" type="password" autoComplete="new-password" required /></Field>
        <p className="hint">{PW_HINT}</p>
        <button className="btn">{kind === "activate" ? "فعّل الحساب" : "غيّر الباسورد"}</button>
      </AuthForm>
    </>
  );
}
