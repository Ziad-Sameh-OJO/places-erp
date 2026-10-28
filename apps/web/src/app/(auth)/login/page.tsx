"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

/** M-09 sign-in: email + password (no OTP by default, per the client). */
export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(form: FormData) {
    setError(null);
    try {
      await api.post("/auth/login", { email: form.get("email"), password: form.get("password") });
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصل خطأ");
    }
  }

  return (
    <main className="auth">
      <form action={onSubmit} className="auth-card">
        <h1>تسجيل الدخول</h1>
        <label>الإيميل<input name="email" type="email" autoComplete="username" required /></label>
        <label>الباسورد<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">دخول</button>
      </form>
    </main>
  );
}
