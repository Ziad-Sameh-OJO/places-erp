"use client";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Paged } from "@places/contracts";
import { api } from "@/lib/api";
import { MODULE_LABEL } from "@/lib/nav";
import { Table } from "@/components/ui";
import type { UserRow } from "./types";

interface AuditRow { id: string; at: string; userId: string | null; module: string; entity: string; entityId: string; action: string; after: unknown }
const ACTION: Record<string, string> = {
  create: "إضافة", update: "تعديل", delete: "مسح", login: "دخول", locked: "اتقفل (5 محاولات غلط)", unlock: "فتح الحساب", disable: "إيقاف",
  enable: "تفعيل", activated: "فعّل حسابه", "password-reset": "غيّر الباسورد (لينك)", "password-changed": "غيّر الباسورد", permissions: "تعديل المصفوفة",
  "invite-resent": "إعادة إيميل التفعيل", "reset-sent": "إرسال لينك تغيير الباسورد",
};

/** Q50: who changed what and when, newest first, filterable by module. */
export function AuditTab() {
  const [module, setModule] = useState("");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), pageSize: "50", ...(module ? { module } : {}) });
  const log = useQuery({ queryKey: ["audit", qs.toString()], queryFn: () => api.get<Paged<AuditRow>>(`/access/audit?${qs}`), placeholderData: keepPreviousData });
  const people = useQuery({ queryKey: ["users", "all"], queryFn: () => api.get<Paged<UserRow>>("/access/users?pageSize=100") });
  const name = (id: string | null) => (id ? people.data?.items.find((u) => u.id === id)?.employee?.name ?? "—" : "السيستم");
  const pages = log.data ? Math.max(1, Math.ceil(log.data.total / log.data.pageSize)) : 1;
  return (
    <>
      <div className="toolbar">
        <select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} aria-label="الموديول">
          <option value="">كل الموديولات</option>{Object.entries(MODULE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="hint">{log.data?.total ?? 0} تغيير</span>
      </div>
      <section className="card">
      <Table head={["الوقت", "مين", "الموديول", "التغيير", "على"]} empty="مفيش تغييرات"
        rows={(log.data?.items ?? []).map((x) => [
          new Date(x.at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }), name(x.userId), MODULE_LABEL[x.module] ?? x.module,
          `${ACTION[x.action] ?? x.action} · ${x.entity}`, x.entity === "User" ? name(x.entityId) : <span className="mono">{x.entityId}</span>,
        ])} />
      {pages > 1 && <div className="row end"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>الأحدث</button><span className="hint">{page} / {pages}</span><button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>الأقدم</button></div>}
      </section>
    </>
  );
}
