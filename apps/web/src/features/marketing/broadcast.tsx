"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BroadcastBoard, BroadcastInput, HotUnitOption, MyBroadcast } from "@places/contracts";
import { Avatar, Card, Chip, Field, Icon, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, num } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { HotUnitPicker } from "./hot-unit-picker";
import { BroadcastImagePicker, BroadcastImages, uploadBroadcastImages } from "./broadcast-images";

export const useBroadcasts = (enabled = true) => useQuery({ queryKey: ["broadcasts"], queryFn: () => api.get<BroadcastBoard>("/marketing/broadcasts"), enabled });

/** The demo's «Broadcast» tab (marketing.js): a new message for sales with its Hot Inventory, who sent it, other units. */
export function Broadcast() {
  const t = useTranslations("marketing.broadcast");
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const board = useBroadcasts().data;
  const items = board?.items ?? [];
  const self = items.flatMap((b) => b.sent.filter((s) => s.otherUnits.length).map((s) => ({ ...s, key: `${b.id}-${s.id}` })));
  const approve = (id: string) => void run(async () => { await api.post(`/marketing/broadcasts/${id}/approve`); await qc.invalidateQueries({ queryKey: ["broadcasts"] }); }, t("approvedToast"));
  return (
    <>
      <div className={can("marketing", "create") ? "cols wide" : "cols"}>
        {can("marketing", "create") && <NewBroadcast week={board?.week} />}
        {board && <WhatsAppLimit w={board.whatsapp} />}
      </div>
      <Table head={[t("head.message"), t("head.approval"), t("head.sent"), t("head.pending"), ""]} empty={t("empty")}
        rows={items.map((b) => [
          <span key="t" className="wrap"><BroadcastImages images={b.images} sm /><b>{b.text}</b>{b.hotUnits.length > 0 && <span className="sub mono">{b.hotUnits.map((u) => u.code).join(t("sep"))}</span>}</span>,
          b.approved ? <Chip key="a" tone="ok">{t("approved")}</Chip> : <Chip key="a" tone="warn">{t("waiting")}</Chip>,
          <div key="s" className="avs">{b.sent.length ? b.sent.map((s) => <Avatar key={s.id} id={s.id} name={s.name} sm />) : "—"}</div>,
          <span key="p" className="n">{num(b.pending)}</span>,
          !b.approved && can("marketing", "approve") ? <button key="x" className="btn sm" onClick={() => approve(b.id)}>{t("approve")}</button> : "",
        ])} />
      {self.length > 0 && (
        <Card title={t("self.title")} icon="megaphone" sub={t("self.sub")}>
          <Table head={[t("self.sales"), t("self.units"), t("self.when")]} rows={self.map((s) => [s.name, <span key="u" className="mono">{s.otherUnits.join(t("sep"))}</span>, ago(s.doneAt)])} />
        </Card>
      )}
    </>
  );
}

/** M-04 2.3 · the demo's «حد الواتساب اليومي» card: today's messages of the limit, a bar (warn past 60%, red past 85%). It warns only. */
function WhatsAppLimit({ w }: { w: BroadcastBoard["whatsapp"] }) {
  const t = useTranslations("marketing.broadcast.limit");
  const pct = w.limit > 0 ? Math.min(100, (w.sent / w.limit) * 100) : 0;
  const bar = w.tone === "ok" ? "" : w.tone;
  return (
    <Card title={t("title")} icon="alert" extra={<Chip tone={w.tone}>{`${num(w.sent)} / ${num(w.limit)}`}</Chip>}>
      <div className={`bar ${bar}`}><i style={{ width: `${pct}%` }} /></div>
      <p className="hint">{t("hint")}</p>
    </Card>
  );
}

/** «رسالة Broadcast جديدة للسيلز»: picture + text + logo, sent as a task to every salesperson (M-04 2.1 step 7). */
function NewBroadcast({ week }: { week: BroadcastBoard["week"] | undefined }) {
  const t = useTranslations("marketing.broadcast.new");
  const run = useAction();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<HotUnitOption[]>([]);
  const [images, setImages] = useState<File[]>([]);
  return (
    <Card title={t("title")} icon="megaphone" sub={t("sub")}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const text = String(f.get("text") ?? "").trim();
        const body: BroadcastInput = { text, imageFileIds: await uploadBroadcastImages(images), hotUnitIds: picked.map((u) => u.id) };
        await api.post("/marketing/broadcasts", body);
        setPicked([]);
        setImages([]);
        await qc.invalidateQueries({ queryKey: ["broadcasts"] });
      }, t("sent")))}>
        <Field label={t("images.label")} wide><BroadcastImagePicker files={images} onChange={setImages} /></Field>
        <Field label={t("text")} req wide><textarea name="text" required placeholder={t("textPlaceholder")} /></Field>
        <Field label={t("hot")} wide><HotUnitPicker picked={picked} onChange={setPicked} /></Field>
        <p className="hint wide">{t("schedule", { sent: week?.sent ?? 0, of: week?.of ?? 2 })}</p>
        <div className="row end wide"><button className="btn"><Icon name="send" />{t("submit")}</button></div>
      </form>
    </Card>
  );
}

/** On a salesperson's home (M-04 6.1 «مهام Broadcast في لوحة السيلز»): the message to send, then Done / share. */
export function MyBroadcasts() {
  const t = useTranslations("marketing.broadcast.mine");
  const tb = useTranslations("marketing.broadcast");
  const run = useAction();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["my-broadcasts"], queryFn: () => api.get<MyBroadcast[]>("/marketing/broadcasts/mine") }).data ?? [];
  const open = list.filter((b) => !b.doneAt);
  if (!open.length) return null;
  const done = (id: string, others: string) => void run(async () => {
    await api.post(`/marketing/broadcasts/${id}/done`, { otherUnits: others.split(/[\s,،]+/).filter(Boolean) });
    await qc.invalidateQueries({ queryKey: ["my-broadcasts"] });
  }, t("done"));
  return (
    <Card title={t("title")} icon="megaphone" sub={t("sub")}>
      {open.map((b) => (
        <form key={b.id} className="grid" onSubmit={onFormSubmit((f) => done(b.id, String(f.get("others") ?? "")))}>
          <div className="wide"><BroadcastImages images={b.images} save={t("save")} /></div>
          <p className="wide"><b>{b.text}</b>{b.hotUnits.length > 0 && <span className="sub mono"> {b.hotUnits.map((u) => u.code).join(tb("sep"))}</span>}</p>
          <Field label={t("others")} wide><input name="others" placeholder={t("othersPlaceholder")} /></Field>
          <div className="row end wide"><button className="btn sm"><Icon name="check" />Done / share</button></div>
        </form>
      ))}
      <Note>{t("note")}</Note>
    </Card>
  );
}
