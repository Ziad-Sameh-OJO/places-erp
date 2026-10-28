"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Me { id: string; name: string; scope: string; permissions: Record<string, string[]> }

/** Home: placeholder until the role dashboards are ported (phase 1). Shows who is signed in and their modules. */
export default function HomePage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me") });
  if (me.isPending) return <p>جاري التحميل…</p>;
  if (me.isError) return <p role="alert">{me.error.message}</p>;
  return (
    <main>
      <h1>أهلاً {me.data.name}</h1>
      <p>نطاق البيانات: {me.data.scope}</p>
      <ul>{Object.entries(me.data.permissions).map(([m, a]) => <li key={m}>{m}: {a.join(" · ")}</li>)}</ul>
    </main>
  );
}
