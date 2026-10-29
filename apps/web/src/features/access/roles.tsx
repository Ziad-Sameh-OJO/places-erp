"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTIONS, MODULES } from "@places/domain";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Chip, Field, Modal, Note, useAction } from "@/components/ui";
import { Matrix, type MatrixValue } from "./matrix";
import { SCOPES, TIERS, type RoleRow } from "./types";

/** M-09 roles: pick a role, change its data scope and its matrix; new / copy / edit / delete. Saved at once. */
export function RolesTab() {
  const qc = useQueryClient();
  const run = useAction();
  const { me, can } = useMe();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleRow[]>("/access/roles") });
  const [pick, setPick] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "new" | "edit" | "copy"; role?: RoleRow } | null>(null);
  const role = roles.data?.find((r) => r.key === pick) ?? roles.data?.[0];
  // the Super Admin role is changed by a Super Admin only (the API refuses anyone else)
  const editable = can("access", "edit") && (role?.key !== "admin" || !!me?.roles.includes("admin"));
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["roles"] }), qc.invalidateQueries({ queryKey: ["me"] })]);

  const save = (changes: MatrixValue) => run(async () => { await api.patch(`/access/roles/${role!.key}/permissions`, changes); await refresh(); }, "اتحفظ · بيتطبّق فوراً");
  const preset = (kind: "all" | "view" | "none") => save(Object.fromEntries(MODULES.map((m) => [m, kind === "all" ? [...ACTIONS] : kind === "view" ? ["view"] : m === "home" ? ["view"] : []])));

  if (!roles.data) return <p className="hint">بيحمّل…</p>;
  return (
    <div className="access-grid">
      <Card title="الأدوار" icon="users" extra={can("access", "create") && <button className="btn sm" onClick={() => setForm({ mode: "new" })}>+ دور جديد</button>}>
        <div className="role-list">
          {roles.data.map((r) => (
            <button key={r.key} aria-pressed={r.key === role?.key} onClick={() => setPick(r.key)}>
              <span>{r.label}<br /><small>{r.tier}</small></span><Chip plain>{r.users}</Chip>
            </button>
          ))}
        </div>
      </Card>
      {role && (
        <Card title={role.label} icon="lock" sub={`${role.tier} · ${role.users} شخص${role.builtIn ? " · دور أساسي" : ""}`}
          extra={<div className="matrix-tools">
            {editable && <button className="btn ghost sm" onClick={() => setForm({ mode: "edit", role })}>تعديل</button>}
            {can("access", "create") && <button className="btn ghost sm" onClick={() => setForm({ mode: "copy", role })}>نسخة</button>}
            {can("access", "delete") && !role.builtIn && <button className="btn danger sm" disabled={role.users > 0} title={role.users ? "فيه ناس على الدور ده" : ""}
              onClick={() => confirm(`تمسح دور «${role.label}»؟`) && run(async () => { await api.del(`/access/roles/${role.key}`); setPick(null); await refresh(); }, "الدور اتمسح")}>مسح</button>}
          </div>}>
          <div className="matrix-tools">
            <span className="hint">نطاق البيانات:</span>
            <select value={role.scope.toLowerCase()} disabled={!editable} aria-label="نطاق البيانات"
              onChange={(e) => run(async () => { await api.patch(`/access/roles/${role.key}`, { scope: e.target.value }); await refresh(); }, "اتحفظ")}>
              {SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {editable && <><span className="spacer" /><span className="hint">ابدأ بـ:</span>
              <button className="btn ghost sm" onClick={() => preset("all")}>كله</button>
              <button className="btn ghost sm" onClick={() => preset("view")}>يشوف بس</button>
              <button className="btn ghost sm" onClick={() => preset("none")}>ولا حاجة</button></>}
          </div>
          {!editable && <Note>{role.key === "admin" ? "دور الـ Super Admin بيتعدّل من Super Admin بس." : "عرض بس · التعديل لمن عنده «الأدوار والصلاحيات: يعدّل»."}</Note>}
          <Matrix value={role.permissions} editable={editable} onChange={save} />
        </Card>
      )}
      {form && <RoleForm {...form} roles={roles.data} onClose={() => setForm(null)} onSaved={async (key) => { setPick(key); setForm(null); await refresh(); }} />}
    </div>
  );
}

function RoleForm({ mode, role, roles, onClose, onSaved }: { mode: "new" | "edit" | "copy"; role?: RoleRow; roles: RoleRow[]; onClose: () => void; onSaved: (key: string) => void }) {
  const run = useAction();
  const title = mode === "edit" ? `تعديل ${role!.label}` : mode === "copy" ? `نسخة من ${role!.label}` : "دور جديد";
  async function submit(f: FormData) {
    const body = { label: String(f.get("label")), tier: String(f.get("tier")), scope: String(f.get("scope")) };
    await run(async () => {
      if (mode === "edit") { await api.patch(`/access/roles/${role!.key}`, body); onSaved(role!.key); return; }
      const from = mode === "copy" ? role!.key : String(f.get("from") || "") || undefined;
      const r = await api.post<{ key: string }>("/access/roles", { ...body, behavesLike: String(f.get("behavesLike")), ...(from ? { copyFrom: from } : {}) });
      onSaved(r.key);
    }, "اتحفظ");
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" action={submit}>
        <Field label="اسم الدور" req><input name="label" required minLength={2} defaultValue={role ? role.label + (mode === "copy" ? " (نسخة)" : "") : ""} /></Field>
        <Field label="المستوى في الهيكل"><select name="tier" defaultValue={role?.tier ?? "Executive Staff"}>{TIERS.map(([t, ar]) => <option key={t} value={t}>{t} · {ar}</option>)}</select></Field>
        <Field label="نطاق البيانات"><select name="scope" defaultValue={role?.scope.toLowerCase() ?? "own"}>{SCOPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {mode !== "edit" && <Field label="بيشتغل زي (الصفحة الرئيسية والتنبيهات)">
          <select name="behavesLike" defaultValue={role?.behavesLike ?? role?.key ?? "sales"}>{roles.filter((r) => r.builtIn).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></Field>}
        {mode === "new" && <Field label="ابدأ بصلاحيات"><select name="from" defaultValue=""><option value="">ولا حاجة (هتختار من المصفوفة)</option>{roles.map((r) => <option key={r.key} value={r.key}>زي {r.label}</option>)}</select></Field>}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>إلغاء</button><button className="btn">حفظ</button></div>
      </form>
    </Modal>
  );
}
