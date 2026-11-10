"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { serverText } from "@/lib/server-text";
import { day, dayTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { Card, Chip, Field, onFormSubmit, useAction } from "@/components/ui";
import { MyLeavesCard } from "@/features/hr/leaves";
import { MyExcusesCard } from "@/features/hr/excuses";
import { PushCard } from "@/features/notifications/push";

/** حسابي: who I am, my password, whether notifications also reach my email, push on this device (M-14 · 51), and my leaves (7.5). */
export default function ProfilePage() {
  const t = useTranslations("pages");
  const qc = useQueryClient();
  const run = useAction();
  const { me } = useMe();
  if (!me) return <p className="hint">{t("loading")}</p>;
  return (
    <div className="cols">
      <Card title={me.name} icon="id" sub={me.email}>
        {/* 12.15 · demo auth.js «بياناتي» */}
        <dl className="kv">{([
          [t("profile.mobile"), <span key="m" className="mono" dir="ltr">{me.profile.phone ?? "—"}</span>],
          [t("profile.roles"), <span key="r">{me.roleLabels.map((r) => <Chip key={r} tone="info">{serverText(r)}</Chip>)}</span>],
          [t("profile.department"), me.profile.department ? serverText(me.profile.department) : "—"],
          [t("profile.teamLeader"), me.profile.teamLeader ?? "—"],
          [t("profile.lastLogin"), me.profile.lastLoginAt ? dayTime(me.profile.lastLoginAt) : "—"],
          [t("profile.passwordChanged"), me.profile.passwordChangedAt ? day(me.profile.passwordChangedAt) : "—"],
        ] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <label className="tog">
          <input type="checkbox" defaultChecked={me.emailNotifications} onChange={(e) => run(async () => {
            await api.put("/notifications/preferences", { emailNotifications: e.target.checked });
            await qc.invalidateQueries({ queryKey: ["me"] });
          }, e.target.checked ? t("profile.emailOn") : t("profile.emailOff"))} />
          {t("profile.emailToggle")}
        </label>
      </Card>
      <PushCard />
      <Card title={t("profile.passwordTitle")} icon="lock" sub={t("profile.passwordSub")}>
        <form className="form" onSubmit={onFormSubmit((f) => {
          if (f.get("next") !== f.get("next2")) return void run(async () => { throw new Error(t("profile.mismatch")); });
          void run(async () => { await api.post("/auth/password", { current: f.get("current"), next: f.get("next") }); await qc.invalidateQueries({ queryKey: ["me"] }); }, t("profile.changed"));
        })}>
          <Field label={t("profile.current")} req><input name="current" type="password" autoComplete="current-password" required /></Field>
          <Field label={t("profile.next")} req><input name="next" type="password" autoComplete="new-password" required minLength={10} /></Field>
          <Field label={t("profile.next2")} req><input name="next2" type="password" autoComplete="new-password" required /></Field>
          <p className="hint">{t("profile.hint")}</p>
          <div className="row end"><button className="btn">{t("profile.change")}</button></div>
        </form>
      </Card>
      <MyLeavesCard />
      <MyExcusesCard />
    </div>
  );
}
