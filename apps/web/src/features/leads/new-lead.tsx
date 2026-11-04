"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatedLead, DuplicateCheckResult } from "@places/contracts";
import { Field, Icon, Modal, Note, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useLeadOptions, useSettings } from "./use-leads";

const TYPES = ["Rent", "Resale", "Primary", "Income"] as const; // requirements M-01 (the demo leaves Primary out)
const CONDITIONS = ["متشطب", "نص تشطيب", "Core & Shell"];
/** «رقم في كل سطر» (or commas), digits only, as the API normalises them. */
const phonesOf = (text: string) => text.split(/[\n,]/).map((p) => p.replace(/\D/g, "")).filter(Boolean);

/** Waits for the typing to settle before asking the API about the mobiles. */
function useSettled(value: string, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Demo «ليد جديد». Routing is the API's: a salesperson's own lead stays theirs, Telesales chooses «يفضل عندي» or
 * «التوزيع», Operations may pick a salesperson by hand (uses up their turn), everyone else goes by area.
 * A mobile we already have is flagged while typing; only someone who may open that lead gets a link to it (M-01 Q7).
 */
export function NewLead({ onClose, onOpenLead }: { onClose: () => void; onOpenLead: (id: string) => void }) {
  const { me, can } = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const settings = useSettings();
  const options = useLeadOptions();
  const [phones, setPhones] = useState("");
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState(false);
  const checked = phonesOf(useSettled(phones)).filter((p) => /^01[0-25]\d{8}$/.test(p));
  const dup = useQuery({
    queryKey: ["lead-dup", checked.join(",")], enabled: checked.length > 0,
    queryFn: () => api.get<DuplicateCheckResult>(`/leads/duplicate-check?phones=${checked.join(",")}`),
  }).data?.hit;
  const isTelesales = !!me?.roles.includes("telesales");
  const ownLead = me?.scope === "own" && !isTelesales;
  const byHand = can("leads", "approve") && !!options.data?.salespeople.length;
  const campaigns = (options.data?.campaigns ?? []).filter((c) => c.channel === channel);

  const save = async (f: FormData) => {
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const body = {
      name: text("name"), phones: phonesOf(text("phones")), area: text("area"), type: text("type"), channel: text("channel"),
      ...(text("company") ? { company: text("company") } : {}), ...(text("space") ? { space: Number(text("space")) } : {}),
      ...(text("condition") ? { condition: text("condition") } : {}), ...(text("budget") ? { budget: text("budget") } : {}),
      ...(text("campaignId") ? { campaignId: text("campaignId") } : {}), ...(text("assignToId") ? { assignToId: text("assignToId") } : {}),
      ...(isTelesales ? { keep: text("keep") === "keep" } : {}), ...(text("note") ? { note: text("note") } : {}),
    };
    setBusy(true);
    try {
      const lead = await api.post<CreatedLead>("/leads", body);
      toast(lead.ownedByTelesales || ownLead || !lead.assignedTo ? "الليد اتحفظ عندك" : `الليد راح لـ ${lead.assignedTo.name}`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "حصل خطأ";
      toast(msg);
      if (msg.startsWith("العميل ده موجود")) onClose(); // sent to Operations: nothing more to do here (demo)
    } finally {
      setBusy(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["leads"] }), qc.invalidateQueries({ queryKey: ["leads-summary"] }), qc.invalidateQueries({ queryKey: ["lead-duplicates"] })]);
    }
  };

  return (
    <Modal title="ليد جديد" onClose={onClose}>
      <form className="grid" action={save}>
        <Field label="الاسم" req><input name="name" required minLength={2} maxLength={120} /></Field>
        <Field label="الشركة"><input name="company" maxLength={160} placeholder="اكتب أو اختار من شيت الشركات" /></Field>
        <Field label="الموبايل (رقم في كل سطر)" req>
          <textarea name="phones" required placeholder="01xxxxxxxxx" value={phones} onChange={(e) => setPhones(e.target.value)} />
        </Field>
        {dup && (
          <div className="wide">
            <Note kind="warn">
              الرقم ده موجود قبل كده في ليد <b className="mono">{dup.code}</b>. العميل ده مكرر: الأوبريشن هتشوف تفاصيل الاتنين وتقرر أنهي بيانات تفضل وأنهي channel يتحسب.
              {dup.leadId && <> <button type="button" className="link" onClick={() => onOpenLead(dup.leadId!)}>افتح الليد</button></>}
            </Note>
          </div>
        )}
        <Field label="Area" req>
          <select name="area" required defaultValue=""><option value="">اختار</option>{settings.data?.areas.map((a) => <option key={a}>{a}</option>)}</select>
        </Field>
        <Field label="Type"><select name="type">{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Space (م)"><input name="space" type="number" min="1" step="1" /></Field>
        <Field label="Condition"><select name="condition">{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Budget"><input name="budget" type="number" min="0" step="1" dir="ltr" /></Field>
        <Field label="Channel" req>
          <select name="channel" required value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">اختار</option>{settings.data?.channels.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Campaign name">
          <select name="campaignId">
            {channel ? <><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</> : <option value="">اختار الـ channel الأول</option>}
          </select>
        </Field>
        {ownLead && <p className="hint wide">الليد اللي بتدخّله بنفسك بيفضل بتاعك ومش بيدخل التوزيع.</p>}
        {byHand && (
          <Field label="Sales">
            <select name="assignToId"><option value="">أوتوماتيك من الـ area</option>{options.data!.salespeople.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <small className="hint">لو اخترت سيلز بالاسم، بيتعدّى دوره في التوزيع الجاي.</small>
          </Field>
        )}
        {isTelesales && (
          <Field label="الليد يروح لـ">
            <select name="keep"><option value="route">التوزيع (حسب الـ area)</option><option value="keep">يفضل عندي (بكلّمه أنا)</option></select>
          </Field>
        )}
        <Field label="Note" wide><textarea name="note" maxLength={2000} /></Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
          <button className="btn" disabled={busy}><Icon name="plus" />{dup ? "ابعته للأوبريشن تقرر" : "حفظ الليد"}</button>
        </div>
      </form>
    </Modal>
  );
}
