"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BroadcastBoard, BroadcastInput, MyBroadcast, TaskUnitOption } from "@places/contracts";
import { Avatar, Card, Chip, Field, Icon, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, num } from "@/lib/format";
import { useMe } from "@/lib/me";

export const useBroadcasts = (enabled = true) => useQuery({ queryKey: ["broadcasts"], queryFn: () => api.get<BroadcastBoard>("/marketing/broadcasts"), enabled });

/** The demo's «Broadcast» tab (marketing.js): a new message for sales with its Hot Inventory, who sent it, other units. */
export function Broadcast() {
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const board = useBroadcasts().data;
  const items = board?.items ?? [];
  const self = items.flatMap((b) => b.sent.filter((s) => s.otherUnits.length).map((s) => ({ ...s, key: `${b.id}-${s.id}` })));
  const approve = (id: string) => void run(async () => { await api.post(`/marketing/broadcasts/${id}/approve`); await qc.invalidateQueries({ queryKey: ["broadcasts"] }); }, "اتوافق عليه · اتبعت للسيلز");
  return (
    <>
      {can("marketing", "create") && <NewBroadcast week={board?.week} />}
      <Table head={["الرسالة", "الموافقة", "بعتوها", "لسه", ""]} empty="مفيش Broadcast لسه"
        rows={items.map((b) => [
          <span key="t" className="wrap"><b>{b.text}</b>{b.hotUnits.length > 0 && <span className="sub mono">{b.hotUnits.map((u) => u.code).join("، ")}</span>}</span>,
          b.approved ? <Chip key="a" tone="ok">اتوافق</Chip> : <Chip key="a" tone="warn">مستني مدير التسويق</Chip>,
          <div key="s" className="avs">{b.sent.length ? b.sent.map((s) => <Avatar key={s.id} id={s.id} name={s.name} sm />) : "—"}</div>,
          <span key="p" className="n">{num(b.pending)}</span>,
          !b.approved && can("marketing", "approve") ? <button key="x" className="btn sm" onClick={() => approve(b.id)}>موافقة</button> : "",
        ])} />
      {self.length > 0 && (
        <Card title="Broadcast عمله السيلز لوحدات تانية" icon="megaphone" sub="السيلز بيسجّلوه وهم بيدوسوا Done">
          <Table head={["السيلز", "الوحدات", "إمتى"]} rows={self.map((s) => [s.name, <span key="u" className="mono">{s.otherUnits.join("، ")}</span>, ago(s.doneAt)])} />
        </Card>
      )}
    </>
  );
}

/** «رسالة Broadcast جديدة للسيلز»: picture + text + logo, sent as a task to every salesperson (M-04 2.1 step 7). */
function NewBroadcast({ week }: { week: BroadcastBoard["week"] | undefined }) {
  const run = useAction();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<TaskUnitOption[]>([]);
  const units = useQuery({ queryKey: ["hot-units", q], queryFn: () => api.get<TaskUnitOption[]>(`/marketing/broadcasts/hot-units?q=${encodeURIComponent(q)}`) }).data ?? [];
  const toggle = (u: TaskUnitOption) => setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));
  return (
    <Card title="رسالة Broadcast جديدة للسيلز" icon="megaphone" sub="صورة + نص + لوجو · بتتبعت كمهمة إرسال في لوحة كل سيلز">
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const body: BroadcastInput = { text: String(f.get("text") ?? "").trim(), logo: f.get("logo") === "on", hotUnitIds: picked.map((u) => u.id) };
        await api.post("/marketing/broadcasts", body);
        setPicked([]);
        await qc.invalidateQueries({ queryKey: ["broadcasts"] });
      }, "اتبعتت كمهمة لكل السيلز"))}>
        <Field label="النص" req wide><textarea name="text" required placeholder="النص اللي السيلز هيبعته لعملائه" /></Field>
        <Field label="Hot Inventory (الوحدات اللي في الرسالة)" wide>
          <input type="search" placeholder="دوّر بالكود أو البروجكت أو المساحة" value={q} onChange={(e) => setQ(e.target.value)} aria-label="دوّر على وحدة" />
          <div className="row wrap">
            {units.map((u) => (
              <button type="button" key={u.id} className={`chip ${picked.some((x) => x.id === u.id) ? "acc" : ""}`} onClick={() => toggle(u)} aria-pressed={picked.some((x) => x.id === u.id)}>
                {u.code} · {u.project} · {num(u.space)} م
              </button>
            ))}
          </div>
          {picked.length > 0 && <span className="hint">اخترت: {picked.map((u) => u.code).join("، ")}</span>}
        </Field>
        <label className="tog"><input type="checkbox" name="logo" defaultChecked /><span>حط اللوجو</span></label>
        <p className="hint wide">مواعيد الـ Broadcast الثابتة: يومين في الأسبوع · الأسبوع ده اتبعت {week?.sent ?? 0} من {week?.of ?? 2}</p>
        <div className="row end wide"><button className="btn"><Icon name="send" />ابعت للسيلز</button></div>
      </form>
    </Card>
  );
}

/** On a salesperson's home (M-04 6.1 «مهام Broadcast في لوحة السيلز»): the message to send, then Done / share. */
export function MyBroadcasts() {
  const run = useAction();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["my-broadcasts"], queryFn: () => api.get<MyBroadcast[]>("/marketing/broadcasts/mine") }).data ?? [];
  const open = list.filter((b) => !b.doneAt);
  if (!open.length) return null;
  const done = (id: string, others: string) => void run(async () => {
    await api.post(`/marketing/broadcasts/${id}/done`, { otherUnits: others.split(/[\s,،]+/).filter(Boolean) });
    await qc.invalidateQueries({ queryKey: ["my-broadcasts"] });
  }, "تمام · رحمة شايفة إنك بعتها");
  return (
    <Card title="Broadcast من التسويق" icon="megaphone" sub="ابعت الرسالة لقايمة عملائك ودوس Done">
      {open.map((b) => (
        <form key={b.id} className="grid" onSubmit={onFormSubmit((f) => done(b.id, String(f.get("others") ?? "")))}>
          <p className="wide"><b>{b.text}</b>{b.hotUnits.length > 0 && <span className="sub mono"> {b.hotUnits.map((u) => u.code).join("، ")}</span>}</p>
          <Field label="عملت Broadcast لوحدات تانية؟ (أكواد)" wide><input name="others" placeholder="U-101، U-205" /></Field>
          <div className="row end wide"><button className="btn sm"><Icon name="check" />Done / share</button></div>
        </form>
      ))}
      <Note>Done يعني إنك بعتها. لو بعت عن وحدات تانية اكتب أكوادها عشان تظهر للتسويق.</Note>
    </Card>
  );
}
