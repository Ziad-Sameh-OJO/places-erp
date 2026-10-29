"use client";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Chip, Field, useAction } from "@/components/ui";

/** حسابي: who I am, my password, and whether notifications also reach my email. */
export default function ProfilePage() {
  const qc = useQueryClient();
  const run = useAction();
  const { me } = useMe();
  if (!me) return <p className="hint">بيحمّل…</p>;
  return (
    <div className="cols">
      <Card title={me.name} icon="id" sub={me.email}>
        <p>{me.roleLabels.map((r) => <Chip key={r} tone="info">{r}</Chip>)}</p>
        <label className="tog">
          <input type="checkbox" defaultChecked={me.emailNotifications} onChange={(e) => run(async () => {
            await api.put("/notifications/preferences", { emailNotifications: e.target.checked });
            await qc.invalidateQueries({ queryKey: ["me"] });
          }, e.target.checked ? "هيوصلك كمان على الإيميل" : "جوه السيستم بس (المهم بيوصل الإيميل برضه)")} />
          ابعتلي الإشعارات كمان على الإيميل
        </label>
      </Card>
      <Card title="تغيير الباسورد" icon="lock" sub="هتخرج من كل الأجهزة التانية">
        <form className="form" action={(f) => {
          if (f.get("next") !== f.get("next2")) return void run(async () => { throw new Error("الباسوردين مش زي بعض"); });
          void run(() => api.post("/auth/password", { current: f.get("current"), next: f.get("next") }), "الباسورد اتغير");
        }}>
          <Field label="الباسورد الحالي" req><input name="current" type="password" autoComplete="current-password" required /></Field>
          <Field label="الباسورد الجديد" req><input name="next" type="password" autoComplete="new-password" required minLength={10} /></Field>
          <Field label="أكّد الباسورد الجديد" req><input name="next2" type="password" autoComplete="new-password" required /></Field>
          <p className="hint">10 حروف على الأقل، فيهم حروف وأرقام.</p>
          <div className="row end"><button className="btn">غيّر الباسورد</button></div>
        </form>
      </Card>
    </div>
  );
}
