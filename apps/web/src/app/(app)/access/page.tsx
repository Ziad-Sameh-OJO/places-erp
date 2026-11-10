"use client";
import { useEffect, useState } from "react";
import { newParam } from "@/lib/new-param";
import { useTranslations } from "next-intl";
import { Tabs } from "@/components/ui";
import { RolesTab } from "@/features/access/roles";
import { UsersTab } from "@/features/access/users";
import { AuditTab } from "@/features/access/audit";

/** M-09 · الأدوار والصلاحيات. */
export default function AccessPage() {
  const t = useTranslations("pages.access");
  const [tab, setTab] = useState<"roles" | "users" | "audit">("roles");
  useEffect(() => { if (newParam() === "1") setTab("users"); }, []); // «جديد ← مستخدم جديد» (0.16): the accounts tab opens its form
  return (
    <>
      <div className="row"><Tabs value={tab} onChange={setTab} items={[["roles", t("roles")], ["users", t("users")], ["audit", t("audit")]]} /></div>
      {tab === "roles" ? <RolesTab /> : tab === "users" ? <UsersTab /> : <AuditTab />}
    </>
  );
}
