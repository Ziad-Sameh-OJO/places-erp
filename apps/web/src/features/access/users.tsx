"use client";
import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Paged } from "@places/contracts";
import type { ModuleKey } from "@places/domain";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Avatar, Chip, ExportButton, Field, Icon, Modal, Note, Table, useAction } from "@/components/ui";
import { Matrix, type MatrixValue } from "./matrix";
import { STATUS, type RoleRow, type UserRow } from "./types";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—");

/** M-09 users: search (name, email, mobile, department — 5.2), filter, new account (activation email), edit, exceptions, stop / unlock / resend / reset. */
export function UsersTab() {
  const qc = useQueryClient();
  const run = useAction();
  const { me, can } = useMe();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [dept, setDept] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<UserRow | "new" | null>(null);
  const [perms, setPerms] = useState<UserRow | null>(null);
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
        <label className="search"><Icon name="search" /><input type="search" placeholder="اسم، إيميل، موبايل، قسم" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="بحث" /></label>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="الحالة">
          <option value="">كل الحالات</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label="القسم">
          <option value="">كل الأقسام</option>{depts.data?.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="spacer" />
        <span className="hint">{users.data?.total ?? 0} حساب</span>
        <ExportButton module="access" path="/access/users/export" query={new URLSearchParams(filters)} filename="المستخدمين.xlsx" />
        <ExportButton module="access" path="/access/report/permissions" filename="مين عنده أنهي صلاحية.xlsx" label="مين عنده أنهي صلاحية" />
        {can("access", "create") && <button className="btn" onClick={() => setForm("new")}>+ حساب جديد</button>}
      </div>
      <section className="card">
      <Table head={["الشخص", "الأدوار", "القسم", "الحالة", "آخر دخول", ""]} empty="مفيش حسابات تطابق البحث"
        rows={(users.data?.items ?? []).map((u) => {
          const [label, tone] = STATUS[u.status];
          return [
            <span className="who" key="w"><Avatar id={u.id} name={u.employee?.name ?? u.email} sm /><span><b>{u.employee?.name ?? "—"}</b><small className="mono">{u.email}</small></span></span>,
            <span key="r">{u.roles.map((r) => <Chip key={r.role.key} tone={r.primary ? "info" : ""}>{r.role.label}</Chip>)}{u._count.overrides > 0 && <Chip tone="warn">استثناءات {u._count.overrides}</Chip>}</span>,
            u.employee?.department ?? "—",
            <span key="s"><Chip tone={tone}>{label}</Chip>{u.otpRequired && <Chip plain>OTP</Chip>}</span>,
            fmt(u.lastLoginAt),
            <span className="row" key="a">
              {edit && <button className="btn ghost sm" onClick={() => setForm(u)}>تعديل</button>}
              <button className="btn ghost sm" onClick={() => setPerms(u)}>الصلاحيات</button>
              {edit && u.status === "LOCKED" && <button className="btn ghost sm" onClick={() => act(u, "unlock", "الحساب اتفتح")}>فتح</button>}
              {edit && u.status === "INVITED" && <button className="btn ghost sm" onClick={() => act(u, "invite", `اتبعت إيميل التفعيل على ${u.email}`)}>ابعت التفعيل تاني</button>}
              {edit && u.status === "ACTIVE" && <button className="btn ghost sm" onClick={() => act(u, "reset", `اتبعت لينك تغيير الباسورد على ${u.email}`)}>تغيير الباسورد</button>}
              {u.id !== me?.id && (u.status === "DISABLED"
                ? edit && <button className="btn ghost sm" onClick={() => act(u, "enable", "الحساب اتفعّل")}>تفعيل</button>
                : stop && <button className="btn danger sm" onClick={() => confirm(`توقف حساب ${u.employee?.name}؟ هيخرج من كل الأجهزة فوراً.`) && act(u, "disable", "الحساب اتوقف")}>إيقاف</button>)}
            </span>,
          ];
        })} />
      {pages > 1 && <div className="row end"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button><span className="hint">{page} / {pages}</span><button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button></div>}
      {form && <UserForm user={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await refresh(); }} />}
      {perms && <UserPermissions user={perms} onClose={() => { setPerms(null); refresh(); }} />}
      </section>
    </>
  );
}

function UserForm({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: () => void }) {
  const run = useAction();
  const { me } = useMe();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleRow[]>("/access/roles") });
  const tls = useQuery({ queryKey: ["users", "tl"], queryFn: () => api.get<Paged<UserRow>>("/access/users?role=tl&pageSize=50") });
  const everyone = useQuery({ queryKey: ["users", "all"], queryFn: () => api.get<Paged<UserRow>>("/access/users?pageSize=100") });
  const primary = user?.roles.find((r) => r.primary)?.role.key ?? user?.roles[0]?.role.key ?? "sales";
  const extra = new Set(user?.roles.filter((r) => r.role.key !== primary).map((r) => r.role.key));
  const isAdmin = me?.roles.includes("admin");
  const choosable = (roles.data ?? []).filter((r) => r.key !== "admin" || isAdmin || primary === "admin" || extra.has("admin"));

  async function submit(f: FormData) {
    const role = String(f.get("role"));
    const body = {
      name: f.get("name"), email: f.get("email"), phone: f.get("phone") || undefined, department: f.get("department"), role,
      extraRoles: f.getAll("extra").map(String).filter((k) => k !== role), teamLeaderId: f.get("tl") || null, managerId: f.get("manager") || null,
      endDate: f.get("endDate") || null, otpRequired: f.get("otp") === "on",
    };
    await run(async () => { await (user ? api.put(`/access/users/${user.id}`, body) : api.post("/access/users", body)); onSaved(); },
      user ? "اتحفظ · الصلاحيات بتتطبّق فوراً" : `الحساب اتعمل · اتبعت إيميل التفعيل على ${body.email}`);
  }
  return (
    <Modal title={user ? `تعديل ${user.employee?.name}` : "حساب جديد"} onClose={onClose}>
      <form className="grid" action={submit}>
        <Field label="الاسم" req><input name="name" required minLength={2} defaultValue={user?.employee?.name ?? ""} /></Field>
        <Field label="الإيميل" req><input name="email" type="email" required defaultValue={user?.email ?? ""} /></Field>
        <Field label="الموبايل"><input name="phone" inputMode="tel" defaultValue={user?.phone ?? ""} /></Field>
        <Field label="القسم" req><input name="department" required defaultValue={user?.employee?.department ?? ""} /></Field>
        <Field label="الدور الأساسي" req><select name="role" defaultValue={primary}>{choosable.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>
        <Field label="الـ Team Leader (للسيلز)"><select name="tl" defaultValue={user?.employee?.teamLeaderId ?? ""}><option value="">—</option>{tls.data?.items.filter((t) => t.employee).map((t) => <option key={t.id} value={t.employee!.id}>{t.employee!.name}</option>)}</select></Field>
        <Field label="المدير المباشر"><select name="manager" defaultValue={user?.employee?.managerId ?? ""}><option value="">— (الـ Team Leader لو سيلز)</option>{everyone.data?.items.filter((t) => t.employee && t.id !== user?.id).map((t) => <option key={t.id} value={t.employee!.id}>{t.employee!.name}</option>)}</select></Field>
        <fieldset className="field wide" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend><span>أدوار إضافية (لو بيعمل أكتر من حاجة)</span></legend>
          <div className="chips-edit">{choosable.map((r) => <label key={r.key} className="tog"><input type="checkbox" name="extra" value={r.key} defaultChecked={extra.has(r.key)} />{r.label}</label>)}</div>
        </fieldset>
        <Field label="آخر يوم شغل (الحساب بيتوقف بعده)"><input name="endDate" type="date" defaultValue={user?.endDate?.slice(0, 10) ?? ""} /></Field>
        <label className="tog"><input type="checkbox" name="otp" defaultChecked={user?.otpRequired ?? false} />كود OTP على الإيميل مع كل دخول</label>
        <div className="row end wide">
          {!user && <span className="hint spacer">هيتعمل له فايل موظف في الـ HR، ويوصله إيميل تفعيل يعمل منه الباسورد.</span>}
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button className="btn">{user ? "احفظ" : "اعمل الحساب وابعت التفعيل"}</button>
        </div>
      </form>
    </Modal>
  );
}

interface PermView { roles: { key: string; label: string }[]; fromRoles: MatrixValue; overrides: MatrixValue; effective: MatrixValue; editable: boolean }

/** Who may tick here is the API's answer (`editable`): «edit» → anyone, the Operations Head → his team (M-09 2.2). */
function UserPermissions({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const qc = useQueryClient();
  const run = useAction();
  const key = ["user-perms", user.id];
  const p = useQuery({ queryKey: key, queryFn: () => api.get<PermView>(`/access/users/${user.id}/permissions`) });
  const save = (changes: MatrixValue | Record<string, null>) => run(async () => {
    qc.setQueryData(key, await api.patch<PermView>(`/access/users/${user.id}/permissions`, changes));
    await qc.invalidateQueries({ queryKey: ["me"] });
  }, "اتحفظ · بيتطبّق فوراً");
  const overridden = Object.keys(p.data?.overrides ?? {}) as ModuleKey[];
  return (
    <Modal title={`صلاحيات ${user.employee?.name ?? user.email}`} onClose={onClose}>
      {!p.data ? <p className="hint">بيحمّل…</p> : <>
        <p className="hint">الأدوار: {p.data.roles.map((r) => <Chip key={r.key} tone="info">{r.label}</Chip>)} · الخانات الملوّنة مختلفة عن الدور (استثناء ليه هو بس).</p>
        <Matrix value={p.data.effective} base={p.data.fromRoles} editable={p.data.editable} onChange={save} />
        {overridden.length > 0 && <Note kind="warn">فيه {overridden.length} استثناء للشخص ده.</Note>}
        <div className="row end">
          {overridden.length > 0 && p.data.editable && <button className="btn ghost" onClick={() => save(Object.fromEntries(overridden.map((m) => [m, null])))}>رجّع زي الدور</button>}
          <button className="btn" onClick={onClose}>تمام</button>
        </div>
      </>}
    </Modal>
  );
}
