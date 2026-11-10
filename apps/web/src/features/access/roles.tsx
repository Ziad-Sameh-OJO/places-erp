"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ACTIONS, MODULES } from "@places/domain";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Chip, Field, Modal, Note, onFormSubmit, Tabs, useAction } from "@/components/ui";
import { Matrix, type MatrixValue } from "./matrix";
import { RoleFields } from "./role-fields";
import { SCOPES, TIERS, type RoleRow } from "./types";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";

/** M-09 roles: pick a role, change its data scope and its matrix; new / copy / edit / delete. Saved at once. */
export function RolesTab() {
  const t = useTranslations("access.roles");
  const tScope = useTranslations("access.scopes");
  const qc = useQueryClient();
  const run = useAction();
  const { me, can } = useMe();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<RoleRow[]>("/access/roles") });
  const [pick, setPick] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "new" | "edit" | "copy"; role?: RoleRow } | null>(null);
  // the role's module actions, or its fields (M-09 field permissions): two tabs, so the fields aren't lost under the matrix
  const [part, setPart] = useState<"perms" | "fields">("perms");
  const role = roles.data?.find((r) => r.key === pick) ?? roles.data?.[0];
  // the Super Admin role is changed by a Super Admin only (the API refuses anyone else)
  const editable = can("access", "edit") && (role?.key !== "admin" || !!me?.roles.includes("admin"));
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["roles"] }), qc.invalidateQueries({ queryKey: ["me"] })]);

  const save = (changes: MatrixValue) => run(async () => { await api.patch(`/access/roles/${role!.key}/permissions`, changes); await refresh(); }, t("savedNow"));
  const preset = (kind: "all" | "view" | "none") => save(Object.fromEntries(MODULES.map((m) => [m, kind === "all" ? [...ACTIONS] : kind === "view" ? ["view"] : m === "home" ? ["view"] : []])));

  if (!roles.data) return <p className="hint">{t("loading")}</p>;
  return (
    <div className="access-grid">
      <Card title={t("title")} icon="users" extra={can("access", "create") && <button className="btn sm" onClick={() => setForm({ mode: "new" })}>{t("newRole")}</button>}>
        <div className="role-list">
          {roles.data.map((r) => (
            <button key={r.key} aria-pressed={r.key === role?.key} onClick={() => setPick(r.key)}>
              <span>{serverText(r.label)}<br /><small>{r.tier}</small></span><Chip plain>{r.users}</Chip>
            </button>
          ))}
        </div>
      </Card>
      {role && (
        <Card title={serverText(role.label)} icon="lock" sub={`${role.tier} · ${t("people", { count: role.users })}${role.builtIn ? t("builtIn") : ""}`}
          extra={<div className="matrix-tools">
            {editable && <button className="btn ghost sm" onClick={() => setForm({ mode: "edit", role })}>{t("edit")}</button>}
            {can("access", "create") && <button className="btn ghost sm" onClick={() => setForm({ mode: "copy", role })}>{t("copy")}</button>}
            {can("access", "delete") && !role.builtIn && <button className="btn danger sm" disabled={role.users > 0} title={role.users ? t("hasPeople") : ""}
              onClick={() => confirm(t("confirmDelete", { label: serverText(role.label) })) && run(async () => { await api.del(`/access/roles/${role.key}`); setPick(null); await refresh(); }, t("deleted"))}>{t("delete")}</button>}
          </div>}>
          <Tabs value={part} onChange={setPart} items={[["perms", t("partPerms")], ["fields", t("partFields")]]} />
          {part === "perms" ? <>
          <div className="matrix-tools">
            <span className="hint">{t("scopeLabel")}</span>
            <select value={role.scope.toLowerCase()} disabled={!editable} aria-label={t("scope")}
              onChange={(e) => run(async () => { await api.patch(`/access/roles/${role.key}`, { scope: e.target.value }); await refresh(); }, t("saved"))}>
              {SCOPES.map((k) => <option key={k} value={k}>{tScope(k)}</option>)}
            </select>
            {editable && <><span className="spacer" /><span className="hint">{t("startWith")}</span>
              <button className="btn ghost sm" onClick={() => preset("all")}>{t("presetAll")}</button>
              <button className="btn ghost sm" onClick={() => preset("view")}>{t("presetView")}</button>
              <button className="btn ghost sm" onClick={() => preset("none")}>{t("presetNone")}</button></>}
          </div>
          {!editable && <Note>{role.key === "admin" ? t("adminOnly") : t("viewOnly")}</Note>}
          <Matrix value={role.permissions} editable={editable} onChange={save} />
          </> : <>
          {!editable && <Note>{role.key === "admin" ? t("adminOnly") : t("viewOnly")}</Note>}
          <RoleFields key={role.key} role={role} editable={editable} />
          </>}
        </Card>
      )}
      {form && <RoleForm {...form} roles={roles.data} onClose={() => setForm(null)} onSaved={async (key) => { setPick(key); setForm(null); await refresh(); }} />}
    </div>
  );
}

function RoleForm({ mode, role, roles, onClose, onSaved }: { mode: "new" | "edit" | "copy"; role?: RoleRow; roles: RoleRow[]; onClose: () => void; onSaved: (key: string) => void }) {
  const t = useTranslations("access.roleForm");
  const tScope = useTranslations("access.scopes");
  const tTier = useTranslations("access.tiers");
  const run = useAction();
  const title = mode === "edit" ? t("editTitle", { label: serverText(role!.label) }) : mode === "copy" ? t("copyTitle", { label: serverText(role!.label) }) : t("newTitle");
  async function submit(f: FormData) {
    const body = { label: String(f.get("label")), tier: String(f.get("tier")), scope: String(f.get("scope")) };
    await run(async () => {
      if (mode === "edit") { await api.patch(`/access/roles/${role!.key}`, body); onSaved(role!.key); return; }
      const from = mode === "copy" ? role!.key : String(f.get("from") || "") || undefined;
      const r = await api.post<{ key: string }>("/access/roles", { ...body, behavesLike: String(f.get("behavesLike")), ...(from ? { copyFrom: from } : {}) });
      onSaved(r.key);
    }, t("saved"));
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={onFormSubmit(submit)}>
        <Field label={t("label")} req><input name="label" required minLength={2} defaultValue={role ? role.label + (mode === "copy" ? t("copySuffix") : "") : ""} /></Field>
        <Field label={t("tier")}><select name="tier" defaultValue={role?.tier ?? "Executive Staff"}>{TIERS.map(([tier, k]) => <option key={tier} value={tier}>{tier} · {tTier(k)}</option>)}</select></Field>
        <Field label={t("scope")}><select name="scope" defaultValue={role?.scope.toLowerCase() ?? "own"}>{SCOPES.map((k) => <option key={k} value={k}>{tScope(k)}</option>)}</select></Field>
        {mode !== "edit" && <Field label={t("behavesLike")}>
          <select name="behavesLike" defaultValue={role?.behavesLike ?? role?.key ?? "sales"}>{roles.filter((r) => r.builtIn).map((r) => <option key={r.key} value={r.key}>{serverText(r.label)}</option>)}</select></Field>}
        {mode === "new" && <Field label={t("startFrom")}><select name="from" defaultValue=""><option value="">{t("startEmpty")}</option>{roles.map((r) => <option key={r.key} value={r.key}>{t("like", { label: serverText(r.label) })}</option>)}</select></Field>}
        <div className="row end"><button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button><button className="btn">{t("save")}</button></div>
      </form>
    </Modal>
  );
}
