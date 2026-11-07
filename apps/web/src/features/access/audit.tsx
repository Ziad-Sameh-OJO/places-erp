"use client";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Paged } from "@places/contracts";
import { AUDIT_ACTION_LABEL } from "@places/domain";
import { api } from "@/lib/api";
import { MODULE_LABEL } from "@/lib/nav";
import { ExportButton, Table } from "@/components/ui";
import { useTranslations } from "next-intl";
import { dateLocale } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import type { UserRow } from "./types";

interface AuditRow { id: string; at: string; userId: string | null; module: string; entity: string; entityId: string; action: string; after: unknown; userAgent: string | null; ip: string | null }

/** The device in two words from the user agent (the full one is in the tooltip and the Excel file). */
const device = (ua: string | null) => {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua.split(/[\s/]/)[0];
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
};

/** Q50 · M-09 5.2 · 6.1: who changed what, when and from which device, newest first; by module, person and days; to Excel. */
export function AuditTab() {
  const t = useTranslations("access.audit");
  const [module, setModule] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const filters = { ...(module ? { module } : {}), ...(userId ? { userId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const qs = new URLSearchParams({ page: String(page), pageSize: "50", ...filters });
  const log = useQuery({ queryKey: ["audit", qs.toString()], queryFn: () => api.get<Paged<AuditRow>>(`/access/audit?${qs}`), placeholderData: keepPreviousData });
  const people = useQuery({ queryKey: ["users", "all"], queryFn: () => api.get<Paged<UserRow>>("/access/users?pageSize=100") });
  const name = (id: string | null) => (id ? people.data?.items.find((u) => u.id === id)?.employee?.name ?? "—" : t("system"));
  const pages = log.data ? Math.max(1, Math.ceil(log.data.total / log.data.pageSize)) : 1;
  const set = (fn: (v: string) => void) => (e: { target: { value: string } }) => { fn(e.target.value); setPage(1); };
  return (
    <>
      <div className="toolbar">
        <select value={module} onChange={set(setModule)} aria-label={t("module")}>
          <option value="">{t("allModules")}</option>{Object.entries(MODULE_LABEL).map(([k, l]) => <option key={k} value={k}>{serverText(l)}</option>)}
        </select>
        <select value={userId} onChange={set(setUserId)} aria-label={t("person")}>
          <option value="">{t("allPeople")}</option>
          {(people.data?.items ?? []).filter((u) => u.employee).map((u) => <option key={u.id} value={u.id}>{u.employee!.name}</option>)}
        </select>
        <label className="date-f"><span>{t("from")}</span><input type="date" value={from} max={to || undefined} onChange={set(setFrom)} /></label>
        <label className="date-f"><span>{t("to")}</span><input type="date" value={to} min={from || undefined} onChange={set(setTo)} /></label>
        <span className="spacer" />
        <span className="hint">{t("count", { count: log.data?.total ?? 0 })}</span>
        <ExportButton module="access" path="/access/audit/export" query={new URLSearchParams(filters)} filename="Audit Log.xlsx" />
      </div>
      <section className="card">
      <Table head={[t("head.time"), t("head.who"), t("head.module"), t("head.change"), t("head.on"), t("head.device")]} empty={t("empty")}
        rows={(log.data?.items ?? []).map((x) => [
          new Date(x.at).toLocaleString(dateLocale(), { dateStyle: "short", timeStyle: "short" }), name(x.userId), MODULE_LABEL[x.module] ? serverText(MODULE_LABEL[x.module]!) : x.module,
          `${AUDIT_ACTION_LABEL[x.action] ? serverText(AUDIT_ACTION_LABEL[x.action]!) : x.action} · ${x.entity}`, x.entity === "User" ? name(x.entityId) : <span className="mono">{x.entityId}</span>,
          <span key="d" title={[x.userAgent, x.ip].filter(Boolean).join(" · ")}>{device(x.userAgent)}</span>,
        ])} />
      {pages > 1 && <div className="row end"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("newer")}</button><span className="hint">{page} / {pages}</span><button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("older")}</button></div>}
      </section>
    </>
  );
}
