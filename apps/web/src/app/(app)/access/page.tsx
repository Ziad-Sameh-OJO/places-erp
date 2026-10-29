"use client";
import { useState } from "react";
import { Tabs } from "@/components/ui";
import { RolesTab } from "@/features/access/roles";
import { UsersTab } from "@/features/access/users";
import { AuditTab } from "@/features/access/audit";

/** M-09 · الأدوار والصلاحيات. */
export default function AccessPage() {
  const [tab, setTab] = useState<"roles" | "users" | "audit">("roles");
  return (
    <>
      <div className="row"><Tabs value={tab} onChange={setTab} items={[["roles", "الأدوار والصلاحيات"], ["users", "المستخدمين"], ["audit", "Audit Log"]]} /></div>
      {tab === "roles" ? <RolesTab /> : tab === "users" ? <UsersTab /> : <AuditTab />}
    </>
  );
}
