"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { activeValues, type BulkReview, type BulkSent, type Settings } from "@places/contracts";
import { api } from "@/lib/api";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction, useToast } from "@/components/ui";
import { useLeadOptions } from "./use-leads";

const KEY = ["lead-bulk"];

/** Operations' pending bulk entries (1.19). Only fetched for people who may approve (the API checks it again). */
export const useBulkPending = (enabled: boolean) => useQuery({ queryKey: KEY, queryFn: () => api.get<BulkReview[]>("/leads/bulk"), enabled });

/** Demo «إدخال جماعي (شيت أرقام)»: paste the numbers or read them from a sheet, with the channel and the campaign. */
export function BulkNew({ settings, onClose }: { settings: Settings | undefined; onClose: () => void }) {
  const t = useTranslations("leads.bulk");
  const run = useAction();
  const toast = useToast();
  const campaigns = useLeadOptions().data?.campaigns ?? [];
  const [numbers, setNumbers] = useState("");
  const [channel, setChannel] = useState("");
  const read = (f: File | undefined) => f && run(async () => {
    const r = await api.upload<{ numbers: string[] }>("/leads/bulk/sheet", f);
    setNumbers(r.numbers.join("\n"));
    toast(r.numbers.length ? t("read", { count: r.numbers.length }) : t("readNone"));
  });
  const send = onFormSubmit((f) => run(async () => {
    const r = await api.post<BulkSent>("/leads/bulk", { numbers, channel, campaignId: String(f.get("campaignId") ?? "") || undefined });
    toast(t("sent", { count: r.count }) + (r.duplicates ? t("sentDuplicates", { count: r.duplicates }) : ""));
    onClose();
  }));
  const own = campaigns.filter((c) => c.channel === channel);
  return (
    <Modal title={t("title")} onClose={onClose}>
      <Note>{t("note")}</Note>
      <form className="grid" onSubmit={send}>
        <Field label={t("numbers")} req wide>
          <textarea name="numbers" required value={numbers} onChange={(e) => setNumbers(e.target.value)} style={{ minHeight: 150 }} placeholder={"01012345678\n01198765432"} />
        </Field>
        <Field label={t("orUpload")} wide>
          <label className="btn ghost"><Icon name="upload" />{t("pickFile")}
            <input type="file" hidden accept=".xlsx,.csv" aria-label={t("excelFile")} onChange={(e) => { read(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </Field>
        <Field label="Channel" req>
          <select name="channel" required value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">{t("pick")}</option>
            {activeValues(settings?.channels ?? []).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Campaign">
          <select name="campaignId" key={channel}>
            {!channel ? <option value="">{t("channelFirst")}</option> : own.length ? <><option value="">{t("noCampaign")}</option>{own.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</> : <option value="">{t("noCampaigns")}</option>}
          </select>
        </Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button>
          <button className="btn"><Icon name="send" />{t("send")}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Demo «مراجعة التوزيع»: each salesperson's share today, «شيله» / «رجّعه», then approve or reject with a reason. */
export function BulkReviewModal({ bulk, onClose }: { bulk: BulkReview; onClose: () => void }) {
  const t = useTranslations("leads.bulk.review");
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  const toggle = (id: string, excluded: boolean) => run(async () => { await api.put(`/leads/bulk/${bulk.id}/people/${id}`, { excluded }); await refresh(); });
  const approve = () => run(async () => {
    const r = await api.post<{ count: number }>(`/leads/bulk/${bulk.id}/decide`, { approve: true });
    toast(t("approved", { count: r.count }));
    await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["leads"] })]);
    onClose();
  });
  const reject = onFormSubmit((f) => run(async () => {
    await api.post(`/leads/bulk/${bulk.id}/decide`, { approve: false, reason: String(f.get("reason") ?? "") });
    toast(t("rejected"));
    await refresh();
    onClose();
  }));
  const pool = bulk.people.filter((p) => !p.onLeave && !p.excluded).length;
  return (
    <Modal title={t("title", { count: bulk.total })} onClose={onClose}>
      <Note>{bulk.channel} / {bulk.campaign?.name ?? "—"} · {bulk.duplicates ? <>{t.rich("duplicates", { count: bulk.duplicates, b: (c) => <b>{c}</b> })} · </> : null}{t.rich("split", { fresh: bulk.fresh, pool, b: (c) => <b>{c}</b> })}</Note>
      <Table head={[t("sales"), t("gets"), ""]} rows={bulk.people.map((p) => [
        <span key="n">{p.name}{p.onLeave && <> <Chip tone="warn">{t("onLeave")}</Chip></>}</span>,
        <span key="c" className="num">{p.excluded || p.onLeave ? "—" : p.count}</span>,
        p.onLeave ? "" : <button key="b" type="button" className="btn ghost sm" onClick={() => toggle(p.id, !p.excluded)}>{p.excluded ? t("putBack") : t("takeOut")}</button>,
      ])} />
      {rejecting ? (
        <form className="grid" onSubmit={reject}>
          <Field label={t("reason")} req wide><textarea name="reason" required maxLength={500} /></Field>
          <div className="row end wide"><button type="button" className="btn ghost" onClick={() => setRejecting(false)}>{t("back")}</button><button className="btn danger">{t("reject")}</button></div>
        </form>
      ) : (
        <div className="row end"><button type="button" className="btn danger" onClick={() => setRejecting(true)}>{t("reject")}</button><button type="button" className="btn" onClick={approve}>{t("approve")}</button></div>
      )}
    </Modal>
  );
}
