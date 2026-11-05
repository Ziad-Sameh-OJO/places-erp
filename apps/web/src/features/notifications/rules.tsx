"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Settings } from "@places/contracts";
import type { Channel } from "@places/domain";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Field, Note, Table, Tick, useAction } from "@/components/ui";
import { MailLog } from "./mail-log";

interface Rule { key: string; label: string; to: string; channels: Channel[]; important: boolean }
const CH: [Channel, string][] = [["app", "جوه السيستم"], ["push", "Push"], ["email", "إيميل"]];

/** M-14: each event goes to whom and on which channel; the sending address. */
export function NotificationRules() {
  const qc = useQueryClient();
  const run = useAction();
  const { can, canSet } = useMe();
  const ed = can("integrations", "edit");
  const rules = useQuery({ queryKey: ["notif-rules"], queryFn: () => api.get<Rule[]>("/notifications/rules") });
  const s = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const toggle = (r: Rule, c: Channel, on: boolean) => run(async () => {
    await api.put(`/notifications/rules/${r.key}`, { channels: on ? [...r.channels, c] : r.channels.filter((x) => x !== c) });
    await qc.invalidateQueries({ queryKey: ["notif-rules"] });
  }, "اتحفظ");
  return (
    <>
      <div className="cols">
        <Card title="إيميل الإرسال" icon="send" sub="الإيميل اللي كل الإشعارات بتطلع منه">
          {s.data && <form className="form" action={(f) => run(async () => { await api.put("/settings/notificationsFrom", { value: f.get("from") }); await qc.invalidateQueries({ queryKey: ["settings"] }); }, "اتحفظ")}>
            <Field label="من"><input name="from" type="email" dir="ltr" defaultValue={s.data.notificationsFrom} disabled={!canSet("notificationsFrom")} /></Field>
            {canSet("notificationsFrom") && <div className="row end"><button className="btn ghost sm">احفظ</button></div>}
          </form>}
        </Card>
        <Card title="تفضيلاتي" icon="bell" sub="من صفحة «حسابي»">
          <Note>الإشعارات المهمة (Alarm / سحب ليد / الـ Excuse الخامس) بتوصل على الإيميل دايماً، وبتفضل لحد ما تتقري.</Note>
        </Card>
      </div>
      <Card title="قواعد الإشعارات" icon="bell" sub="كل حدث بيروح لمين، جوه السيستم و/أو Push و/أو إيميل">
        <Table head={["الحدث", "لمين", ...CH.map(([, l]) => l)]} rows={(rules.data ?? []).map((r) => [
          <b key="l">{r.label}{r.important && " ·  مهم"}</b>, r.to,
          ...CH.map(([c, l]) => <Tick key={c} checked={r.channels.includes(c)} disabled={!ed} label={`${r.label} ${l}`} onChange={(v) => toggle(r, c, v)} />),
        ])} />
        <Note>الـ Push بيوصل لكل موبايل أو كمبيوتر صاحبه فعّل الإشعارات عليه من «حسابي».</Note>
      </Card>
      {ed && <MailLog />}
    </>
  );
}
