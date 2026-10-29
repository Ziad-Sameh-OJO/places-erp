"use client";
import { useState, type FormEvent, type ReactNode } from "react";

/** A sign-in form: one submit at a time, the API's message shown in the demo's red box. */
export function AuthForm({ onSubmit, children }: { onSubmit: (f: FormData) => Promise<void>; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setBusy(true);
    try { await onSubmit(new FormData(e.currentTarget)); }
    catch (err) { setError(err instanceof Error ? err.message : "حصل خطأ"); }
    finally { setBusy(false); }
  }
  return (
    <form className="auth-form" onSubmit={submit} aria-busy={busy}>
      {error && <div className="auth-msg" role="alert">{error}</div>}
      <fieldset disabled={busy} style={{ display: "contents" }}>{children}</fieldset>
    </form>
  );
}
export const str = (f: FormData, k: string) => String(f.get(k) ?? "");
export const PW_HINT = "10 حروف على الأقل، فيهم حروف وأرقام.";
