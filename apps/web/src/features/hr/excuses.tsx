"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExcuseView } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const TONE: Record<ExcuseView["status"], "warn" | "info" | "ok" | "bad"> = { pending_tl: "warn", approved_tl: "info", confirmed: "ok", rejected: "bad", refused: "bad" };
const useRefresh = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ["hr"] }); };

/** «Excuse» on the profile (7.4): a ticket to the Team Leader then HR; 1–2 free, 3–4 half a day, the 5th refused. */
export function MyExcusesCard() {
  const q = useQuery({ queryKey: ["hr", "excuses", "mine"], queryFn: () => api.get<ExcuseView[]>("/hr/excuses/mine"), retry: false });
  const [ask, setAsk] = useState(false);
  const run = useAction();
  const refresh = useRefresh();
  if (!q.data) return null;
  const month = q.data.filter((x) => x.day.startsWith(today().slice(0, 7)) && x.status !== "rejected").length;
  return (
    <Card title="Excuse" icon="ticket" sub={`الشهر ده: ${month} · أول اتنين من غير خصم، التالت والرابع نص يوم، والخامس بيترفض`} extra={<button className="btn sm" onClick={() => setAsk(true)}><Icon name="plus" />اطلب Excuse</button>}>
      <Table head={["اليوم", "#", "الحالة", "التذكرة"]} empty="مفيش" rows={q.data.map((x) => [x.day, x.number, <span key="s"><Chip tone={TONE[x.status]}>{x.statusLabel}</Chip>{x.rejectReason && <span className="sub">{x.rejectReason}</span>}</span>, x.ticket ?? "—"])} />
      {ask && (
        <Modal title="اطلب Excuse" onClose={() => setAsk(false)}>
          <form className="grid" onSubmit={onFormSubmit(async (f) => run(async () => { await api.post("/hr/excuses", { day: f.get("day"), reason: f.get("reason") }); await refresh(); setAsk(false); }, "اتبعت للـ Team Leader"))}>
            <Field label="اليوم" req><input name="day" type="date" defaultValue={today()} min={today()} required /></Field>
            <Field label="السبب" req wide><input name="reason" required minLength={2} maxLength={300} /></Field>
            <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setAsk(false)}>إلغاء</button><button className="btn">ابعت</button></div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

/** HR / the Team Leader: the Excuses in scope, the ones waiting for me first (inside «الإجازات»). */
export function ExcusesCard() {
  const q = useQuery({ queryKey: ["hr", "excuses", "list"], queryFn: () => api.get<ExcuseView[]>("/hr/excuses") });
  const [reject, setReject] = useState<ExcuseView | null>(null);
  const run = useAction();
  const refresh = useRefresh();
  if (!q.data) return null;
  const rows = [...q.data].sort((a, b) => Number(!!b.canDecide) - Number(!!a.canDecide));
  const approve = (x: ExcuseView) => run(async () => { await api.post(`/hr/excuses/${x.id}/approve`); await refresh(); }, x.canDecide === "tl" ? "اتوافق · راح للـ HR" : "اتأكد · اليوم بقى Excuse");
  return (
    <Card title="الـ Excuse" icon="ticket" sub="تذكرة للـ Team Leader وبعدين الـ HR · كل Excuse بيروح عليه Alarm" extra={rows.some((x) => x.canDecide) ? <Chip tone="warn">{rows.filter((x) => x.canDecide).length}</Chip> : undefined}>
      <Table head={["الموظف", "اليوم", "#", "التكلفة", "السبب", "الحالة", ""]} empty="مفيش" rows={rows.map((x) => [<b key="n">{x.name}</b>, x.day, x.number, x.cost, x.reason,
        <Chip key="s" tone={TONE[x.status]}>{x.statusLabel}</Chip>,
        x.canDecide ? <span key="a" className="row"><button className="btn sm" onClick={() => void approve(x)}>{x.canDecide === "tl" ? "موافقة" : "أكّدي"}</button><button className="btn ghost sm" onClick={() => setReject(x)}>رفض</button></span> : ""])} />
      {reject && (
        <Modal title="رفض الـ Excuse" onClose={() => setReject(null)}>
          <form className="grid" onSubmit={onFormSubmit(async (f) => run(async () => { await api.post(`/hr/excuses/${reject.id}/reject`, { reason: f.get("reason") }); await refresh(); setReject(null); }, "اترفض"))}>
            <Field label="السبب" req wide><input name="reason" required minLength={2} /></Field>
            <div className="row end wide"><button className="btn danger">رفض</button></div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
