"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { activeValues, type BulkReview, type BulkSent, type Settings } from "@places/contracts";
import { api } from "@/lib/api";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction, useToast } from "@/components/ui";
import { useLeadOptions } from "./use-leads";

const KEY = ["lead-bulk"];

/** Operations' pending bulk entries (1.19). Only fetched for people who may approve (the API checks it again). */
export const useBulkPending = (enabled: boolean) => useQuery({ queryKey: KEY, queryFn: () => api.get<BulkReview[]>("/leads/bulk"), enabled });

/** Demo «إدخال جماعي (شيت أرقام)»: paste the numbers or read them from a sheet, with the channel and the campaign. */
export function BulkNew({ settings, onClose }: { settings: Settings | undefined; onClose: () => void }) {
  const run = useAction();
  const toast = useToast();
  const campaigns = useLeadOptions().data?.campaigns ?? [];
  const [numbers, setNumbers] = useState("");
  const [channel, setChannel] = useState("");
  const read = (f: File | undefined) => f && run(async () => {
    const r = await api.upload<{ numbers: string[] }>("/leads/bulk/sheet", f);
    setNumbers(r.numbers.join("\n"));
    toast(r.numbers.length ? `اتقرا ${r.numbers.length} رقم من الملف` : "مقريتش أرقام من الملف");
  });
  const send = onFormSubmit((f) => run(async () => {
    const r = await api.post<BulkSent>("/leads/bulk", { numbers, channel, campaignId: String(f.get("campaignId") ?? "") || undefined });
    toast(`اتبعت للأوبريشن: ${r.count} رقم${r.duplicates ? ` (${r.duplicates} موجودين قبل كده)` : ""}`);
    onClose();
  }));
  const own = campaigns.filter((c) => c.channel === channel);
  return (
    <Modal title="إدخال جماعي (شيت أرقام)" onClose={onClose}>
      <Note>مثال: أرقام دخلت على كامبين ومردّوش. الأرقام بتتوزع على سيلز اليوم بالترتيب بعد موافقة الأوبريشن.</Note>
      <form className="grid" onSubmit={send}>
        <Field label="الأرقام (رقم في كل سطر، أو انسخ عمود من Excel)" req wide>
          <textarea name="numbers" required value={numbers} onChange={(e) => setNumbers(e.target.value)} style={{ minHeight: 150 }} placeholder={"01012345678\n01198765432"} />
        </Field>
        <Field label="أو ارفع ملف Excel / CSV" wide>
          <label className="btn ghost"><Icon name="upload" />اختار ملف Excel أو CSV
            <input type="file" hidden accept=".xlsx,.csv" aria-label="ملف Excel" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </Field>
        <Field label="Channel" req>
          <select name="channel" required value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">اختار</option>
            {activeValues(settings?.channels ?? []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Campaign">
          <select name="campaignId" key={channel}>
            {!channel ? <option value="">اختار الـ channel الأول</option> : own.length ? <><option value="">من غير كامبين</option>{own.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</> : <option value="">مفيش كامبينز</option>}
          </select>
        </Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button className="btn"><Icon name="send" />ابعت للأوبريشن</button>
        </div>
      </form>
    </Modal>
  );
}

/** Demo «مراجعة التوزيع»: each salesperson's share today, «شيله» / «رجّعه», then approve or reject with a reason. */
export function BulkReviewModal({ bulk, onClose }: { bulk: BulkReview; onClose: () => void }) {
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const toggle = (id: string, excluded: boolean) => run(async () => { await api.put(`/leads/bulk/${bulk.id}/people/${id}`, { excluded }); await refresh(); });
  const approve = () => run(async () => {
    const r = await api.post<{ count: number }>(`/leads/bulk/${bulk.id}/decide`, { approve: true });
    toast(`اتوزع ${r.count} رقم`);
    await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["leads"] })]);
    onClose();
  });
  const reject = onFormSubmit((f) => run(async () => {
    await api.post(`/leads/bulk/${bulk.id}/decide`, { approve: false, reason: String(f.get("reason") ?? "") });
    toast("الطلب اترفض");
    await refresh();
    onClose();
  }));
  const pool = bulk.people.filter((p) => !p.onLeave && !p.excluded).length;
  return (
    <Modal title={`مراجعة التوزيع · ${bulk.total} رقم`} onClose={onClose}>
      <Note>{bulk.channel} / {bulk.campaign?.name ?? "—"} · {bulk.duplicates ? <><b>{bulk.duplicates}</b> رقم موجود قبل كده ومش هيتوزع · </> : null}هيتوزع <b>{bulk.fresh}</b> رقم على <b>{pool}</b> سيلز بترتيب اليوم.</Note>
      <Table head={["السيلز", "هينزله", ""]} rows={bulk.people.map((p) => [
        <span key="n">{p.name}{p.onLeave && <> <Chip tone="warn">إجازة النهارده</Chip></>}</span>,
        <span key="c" className="num">{p.excluded || p.onLeave ? "—" : p.count}</span>,
        p.onLeave ? "" : <button key="b" type="button" className="btn ghost sm" onClick={() => toggle(p.id, !p.excluded)}>{p.excluded ? "رجّعه" : "شيله"}</button>,
      ])} />
      {rejecting ? (
        <form className="grid" onSubmit={reject}>
          <Field label="سبب الرفض" req wide><textarea name="reason" required maxLength={500} /></Field>
          <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setRejecting(false)}>رجوع</button><button className="btn danger">ارفض الطلب</button></div>
        </form>
      ) : (
        <div className="row end"><button type="button" className="btn danger" onClick={() => setRejecting(true)}>ارفض الطلب</button><button type="button" className="btn" onClick={approve}>وافق ووزّع</button></div>
      )}
    </Modal>
  );
}
