"use client";
import { type ReactNode, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Paged } from "@places/contracts";
import type { ModuleKey } from "@places/domain";
import { api } from "@/lib/api";
import { useFields, useMe } from "@/lib/me";
import { Avatar, Chip, ExportButton, Field, Icon, Modal, Note, Table, useAction } from "@/components/ui";
import { Matrix, type MatrixValue } from "./matrix";
import { STATUS, type RoleRow, type UserRow } from "./types";
import { useTranslations } from "next-intl";
import { dateLocale } from "@/lib/format";
import { serverText } from "@/lib/server-text";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(dateLocale(), { dateStyle: "medium", timeStyle: "short" }) : "—");

/** M-09 users: search (name, email, mobile, department — 5.2), filter, new account (activation email), edit, exceptions, stop / unlock / resend / reset. */
export function UsersTab() {
  const t = useTranslations("access.users");
  const tStatus = useTranslations("access.status");
  const qc = useQueryClient();
  const run = useAction();
  const { me, can } = useMe();
  const fields = useFields("access"); // M-09: hidden fields' columns and filters aren't there (the API blanks them)
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dept, setDept] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<UserRow | "new" | null>(null);
  const [perms, setPerms] = useState<UserRow | null>(null);
  const [handover, setHandover] = useState<UserRow | null>(null);
  const filters = { ...(q ? { q } : {}), ...(status ? { status } : {}), ...(dept ? { department: dept } : {}) };
  const qs = new URLSearchParams({ page: String(page), pageSize: "25", ...filters });
  const depts = useQuery({ queryKey: ["users", "departments"], queryFn: () => api.get<string[]>("/access/users/departments") });
  const users = useQuery({ queryKey: ["users", qs.toString()], queryFn: () => api.get<Paged<UserRow>>(`/access/users?${qs}`), placeholderData: keepPreviousData });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });
  const act = (u: UserRow, path: string, ok: string) => run(async () => { await api.post(`/access/users/${u.id}/${path}`); await refresh(); }, ok);
  const edit = can("access", "edit");
  const stop = can("access", "create"); // M-09 4.1: HR adds and stops accounts
  const pages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize)) : 1;

  return (
    <>
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder={t("searchPlaceholder")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label={t("search")} /></label>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t("status")}>
          <option value="">{t("allStatuses")}</option>{(Object.keys(STATUS) as UserRow["status"][]).map((k) => <option key={k} value={k}>{tStatus(k)}</option>)}
        </select>
        {fields.shows("department") && <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label={t("department")}>
          <option value="">{t("allDepartments")}</option>{depts.data?.map((d) => <option key={d} value={d}>{serverText(d)}</option>)}
        </select>}
        <span className="spacer" />
        <span className="hint">{t("count", { count: users.data?.total ?? 0 })}</span>
        <ExportButton module="access" path="/access/users/export" query={new URLSearchParams(filters)} filename={t("exportFile")} />
        <ExportButton module="access" path="/access/report/permissions" filename={t("permsReportFile")} label={t("permsReport")} />
        {can("access", "create") && <button className="btn" onClick={() => setForm("new")}>{t("newAccount")}</button>}
      </div>
      <section className="card">
      <Table head={[t("head.person"), t("head.roles"), ...(fields.shows("department") ? [t("head.department")] : []), t("head.status"), ...(fields.shows("lastLoginAt") ? [t("head.lastLogin")] : []), ""]} empty={t("empty")}
        rows={(users.data?.items ?? []).map((u) => {
          const tone = STATUS[u.status];
          return [
            <span className="who" key="w"><Avatar id={u.id} name={u.employee?.name ?? u.email} sm /><span><b>{u.employee?.name ?? "—"}</b>{u.email && <small className="mono" dir="ltr">{u.email}</small>}</span></span>,
            <span key="r">{u.roles.map((r) => <Chip key={r.role.key} tone={r.primary ? "info" : ""}>{serverText(r.role.label)}</Chip>)}{u._count.overrides > 0 && <Chip tone="warn">{t("overrides", { count: u._count.overrides })}</Chip>}</span>,
            ...(fields.shows("department") ? [u.employee?.department ? serverText(u.employee.department) : "—"] : []),
            <span key="s"><Chip tone={tone}>{tStatus(u.status)}</Chip>{u.otpRequired && <Chip plain>OTP</Chip>}</span>,
            ...(fields.shows("lastLoginAt") ? [fmt(u.lastLoginAt)] : []),
            <span className="row" key="a">
              {edit && <button className="btn ghost sm" onClick={() => setForm(u)}>{t("edit")}</button>}
              <button className="btn ghost sm" onClick={() => setPerms(u)}>{t("permissions")}</button>
              {edit && u.status === "LOCKED" && <button className="btn ghost sm" onClick={() => act(u, "unlock", t("unlocked"))}>{t("unlock")}</button>}
              {edit && u.status === "INVITED" && <button className="btn ghost sm" onClick={() => act(u, "invite", t("invited", { email: u.email }))}>{t("resendInvite")}</button>}
              {edit && u.status === "ACTIVE" && <button className="btn ghost sm" onClick={() => act(u, "reset", t("resetSent", { email: u.email }))}>{t("resetPassword")}</button>}
              {stop && (u.status === "DISABLED" || u.endDate) && <button className="btn ghost sm" onClick={() => setHandover(u)}>{t("handover")}</button>}
              {u.id !== me?.id && (u.status === "DISABLED"
                ? edit && <button className="btn ghost sm" onClick={() => act(u, "enable", t("enabled"))}>{t("enable")}</button>
                : stop && <button className="btn danger sm" onClick={() => confirm(t("confirmDisable", { name: u.employee?.name ?? "" })) && act(u, "disable", t("disabled"))}>{t("disable")}</button>)}
            </span>,
          ];
        })} />
      {pages > 1 && <div className="row end"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</button><span className="hint">{page} / {pages}</span><button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</button></div>}
      {form && <UserForm user={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await refresh(); }} />}
      {handover && <Handover user={handover} onClose={() => setHandover(null)} />}
      {perms && <UserPermissions user={perms} onClose={() => { setPerms(null); refresh(); }} />}
      </section>
    </>
  );
}

function UserForm({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("access.userForm");
  const run = useAction();
  const { me } = useMe();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleRow[]>("/access/roles") });
  const tls = useQuery({ queryKey: ["users", "tl"], queryFn: () => api.get<Paged<UserRow>>("/access/users?role=tl&pageSize=50") });
  const everyone = useQuery({ queryKey: ["users", "all"], queryFn: () => api.get<Paged<UserRow>>("/access/users?pageSize=100") });
  const primary = user?.roles.find((r) => r.primary)?.role.key ?? user?.roles[0]?.role.key ?? "sales";
  const extra = new Set(user?.roles.filter((r) => r.role.key !== primary).map((r) => r.role.key));
  const isAdmin = me?.roles.includes("admin");
  const fields = useFields("access");
  /** M-09: a hidden input is gone, a read-only one locked (left out of the save: the API keeps it). A new account always takes its required fields. */
  const only = (key: string, node: ReactNode, required = false) =>
    !user && required ? node : !fields.shows(key) ? null : fields.edits(key) ? node : <fieldset key={key} className="field-lock" disabled>{node}</fieldset>;
  const choosable = (roles.data ?? []).filter((r) => r.key !== "admin" || isAdmin || primary === "admin" || extra.has("admin"));

  async function submit(f: FormData) {
    const role = String(f.get("role"));
    const body = {
      name: f.get("name"), email: f.get("email") ?? undefined, phone: f.get("phone") || undefined, department: f.get("department") ?? undefined, role,
      extraRoles: f.getAll("extra").map(String).filter((k) => k !== role), teamLeaderId: f.get("tl") || null, managerId: f.get("manager") || null,
      endDate: f.get("endDate") || null, otpRequired: f.get("otp") === "on",
    };
    await run(async () => { await (user ? api.put(`/access/users/${user.id}`, body) : api.post("/access/users", body)); onSaved(); },
      user ? t("saved") : t("created", { email: String(body.email) }));
  }
  return (
    <Modal title={user ? t("editTitle", { name: user.employee?.name ?? "" }) : t("newTitle")} onClose={onClose}>
      <form className="grid" action={submit}>
        <Field label={t("name")} req><input name="name" required minLength={2} defaultValue={user?.employee?.name ?? ""} /></Field>
        {only("email", <Field label={t("email")} req><input name="email" type="email" required defaultValue={user?.email ?? ""} /></Field>, true)}
        {only("phone", <Field label={t("phone")}><input name="phone" inputMode="tel" defaultValue={user?.phone ?? ""} /></Field>)}
        {only("department", <Field label={t("department")} req><input name="department" required defaultValue={user?.employee?.department ?? ""} /></Field>, true)}
        <Field label={t("primaryRole")} req><select name="role" defaultValue={primary}>{choosable.map((r) => <option key={r.key} value={r.key}>{serverText(r.label)}</option>)}</select></Field>
        {only("teamLeader", <Field label={t("teamLeader")}><select name="tl" defaultValue={user?.employee?.teamLeaderId ?? ""}><option value="">—</option>{tls.data?.items.filter((x) => x.employee).map((x) => <option key={x.id} value={x.employee!.id}>{x.employee!.name}</option>)}</select></Field>)}
        {only("manager", <Field label={t("manager")}><select name="manager" defaultValue={user?.employee?.managerId ?? ""}><option value="">{t("managerNone")}</option>{everyone.data?.items.filter((x) => x.employee && x.id !== user?.id).map((x) => <option key={x.id} value={x.employee!.id}>{x.employee!.name}</option>)}</select></Field>)}
        <fieldset className="field wide" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend><span>{t("extraRoles")}</span></legend>
          <div className="chips-edit">{choosable.map((r) => <label key={r.key} className="tog"><input type="checkbox" name="extra" value={r.key} defaultChecked={extra.has(r.key)} />{serverText(r.label)}</label>)}</div>
        </fieldset>
        {only("endDate", <Field label={t("endDate")}><input name="endDate" type="date" defaultValue={user?.endDate?.slice(0, 10) ?? ""} /></Field>)}
        {only("otpRequired", <label className="tog"><input type="checkbox" name="otp" defaultChecked={user?.otpRequired ?? false} />{t("otp")}</label>)}
        <div className="row end wide">
          {!user && <span className="hint spacer">{t("newHint")}</span>}
          <button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button>
          <button className="btn">{user ? t("save") : t("create")}</button>
        </div>
      </form>
    </Modal>
  );
}

/** M-09 2.2 · 7.1: the leaver's open leads and tasks go to someone, once their direct manager approves. */
function Handover({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const t = useTranslations("access.handover");
  const run = useAction();
  // shortcut: the first 100 working accounts (as the form's «المدير المباشر»), a search box once there are more
  const active = useQuery({ queryKey: ["users", "active"], queryFn: () => api.get<Paged<UserRow>>("/access/users?status=ACTIVE&pageSize=100") });
  const submit = (f: FormData) => run(async () => { await api.post(`/access/users/${user.id}/handover`, { to: f.get("to") }); onClose(); }, t("sent"));
  return (
    <Modal title={t("title", { name: user.employee?.name ?? user.email })} onClose={onClose}>
      <form className="grid" action={submit}>
        <Field label={t("to")} req><select name="to" required defaultValue=""><option value="" disabled>{t("choose")}</option>{active.data?.items.filter((x) => x.employee && x.id !== user.id).map((x) => <option key={x.id} value={x.id}>{x.employee!.name}</option>)}</select></Field>
        <div className="row end wide">
          <span className="hint spacer">{t("hint")}</span>
          <button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button>
          <button className="btn">{t("submit")}</button>
        </div>
      </form>
    </Modal>
  );
}

interface PermView { roles: { key: string; label: string }[]; fromRoles: MatrixValue; overrides: MatrixValue; effective: MatrixValue; editable: boolean }

/** Who may tick here is the API's answer (`editable`): «edit» → anyone, the Operations Head → his team (M-09 2.2). */
function UserPermissions({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const t = useTranslations("access.userPerms");
  const qc = useQueryClient();
  const run = useAction();
  const key = ["user-perms", user.id];
  const p = useQuery({ queryKey: key, queryFn: () => api.get<PermView>(`/access/users/${user.id}/permissions`) });
  const save = (changes: MatrixValue | Record<string, null>) => run(async () => {
    qc.setQueryData(key, await api.patch<PermView>(`/access/users/${user.id}/permissions`, changes));
    await qc.invalidateQueries({ queryKey: ["me"] });
  }, t("saved"));
  const overridden = Object.keys(p.data?.overrides ?? {}) as ModuleKey[];
  return (
    <Modal title={t("title", { name: user.employee?.name ?? user.email })} onClose={onClose}>
      {!p.data ? <p className="hint">{t("loading")}</p> : <>
        <p className="hint">{t("roles")} {p.data.roles.map((r) => <Chip key={r.key} tone="info">{serverText(r.label)}</Chip>)} · {t("legend")}</p>
        <Matrix value={p.data.effective} base={p.data.fromRoles} editable={p.data.editable} onChange={save} />
        {overridden.length > 0 && <Note kind="warn">{t("overrides", { count: overridden.length })}</Note>}
        <div className="row end">
          {overridden.length > 0 && p.data.editable && <button className="btn ghost" onClick={() => save(Object.fromEntries(overridden.map((m) => [m, null])))}>{t("reset")}</button>}
          <button className="btn" onClick={onClose}>{t("ok")}</button>
        </div>
      </>}
    </Modal>
  );
}
