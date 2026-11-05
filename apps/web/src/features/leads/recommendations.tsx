"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecommendAnswers, Recommendations } from "@places/contracts";
import { Chip, Empty, Icon, Note, useAction } from "@/components/ui";
import { useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { money, num } from "@/lib/format";

const key = (id: string) => ["lead", id, "recommendations"];

/** The units that suit the lead's client (2.12); the drawer's tab shows how many. */
export const useRecommendations = (id: string) =>
  useQuery({ queryKey: key(id), queryFn: () => api.get<Recommendations>(`/leads/${id}/recommendations`) });

/**
 * Demo «الوحدات» (M-03 3.2 · 7.1): the units near the client's space and budget (± the tolerance in the settings), with
 * their finishing and type, the big divisible ones too; the narrowing questions cut the list, and their answers are
 * saved on the lead. Picking units for the client's PDF list is 2.13.
 */
export function RecommendedUnits({ id }: { id: string }) {
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const recs = useRecommendations(id);
  const r = recs.data;
  if (recs.error) return <Empty text={recs.error.message} />;
  if (!r) return <p className="hint">بيحمّل…</p>;
  const c = r.client;
  const save = (answers: RecommendAnswers) => void run(async () => { qc.setQueryData(key(id), await api.put<Recommendations>(`/leads/${id}/answers`, answers)); });
  const ask = (k: keyof RecommendAnswers, v: string) => save({ ...r.answers, [k]: v || undefined });
  return (
    <>
      <Note>الـ Recommendations بتطابق بيانات الكلاينت: <b>{c.type} · {c.space != null ? `${num(c.space)} م` : "أي مساحة"} · {c.condition ?? "أي تشطيب"} · {money(c.budget)} · {c.area || "—"}</b> (±{r.tolerancePct}%). والمساحات الكبيرة اللي «تنفع تتقسم» بتظهر كمان.</Note>
      {can("leads", "edit") && <Questions r={r} onAsk={ask} onReset={() => save({})} />}
      <div className="rec-list">
        {r.items.length ? r.items.map((u) => (
          <div key={u.id} className="rec">
            <span className="rec-match num">{u.match}%</span>
            <div className="rec-main"><b>{u.code} · {u.project}</b><small>{u.area} · الدور {u.floor || "—"} · {num(u.space)} م · {u.condition} · Parking {u.parking}</small></div>
            <div className="rec-price"><b className="num">{money(u.price)}</b><small>{u.monthly ? "في الشهر" : "إجمالي"}</small></div>
            {u.split ? <Chip tone="info">تتقسم · من {num(u.minSplit ?? c.space ?? 0)} م</Chip> : u.sameArea ? <Chip tone="ok">نفس المنطقة</Chip> : null}
          </div>
        )) : <Empty text="مفيش وحدات مطابقة. جرّب تشيل إجابة من الأسئلة." icon="building" />}
      </div>
    </>
  );
}

/** «جاوب عشان الـ Recommendations تقل» — the requirements' proposed questions (the client hasn't sent his list yet). */
function Questions({ r, onAsk, onReset }: { r: Recommendations; onAsk: (k: keyof RecommendAnswers, v: string) => void; onReset: () => void }) {
  const a = r.answers;
  const sale = r.client.type !== "Rent";
  return (
    <div className="qs">
      <span className="qs-t"><Icon name="filter" />جاوب عشان الـ Recommendations تقل:</span>
      <select value={a.floor ?? ""} onChange={(e) => onAsk("floor", e.target.value)} aria-label="الدور">
        <option value="">الدور: أي دور</option><option value="ground">دور أرضي بس</option>
      </select>
      <select value={a.parking ?? ""} onChange={(e) => onAsk("parking", e.target.value)} aria-label="الـ Parking">
        <option value="">Parking: مش مهم</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>Parking {n}+</option>)}
      </select>
      <select value={a.project ?? ""} onChange={(e) => onAsk("project", e.target.value)} aria-label="المشروع">
        <option value="">المشروع: أي مشروع</option>
        {[...new Set([...r.projects, ...(a.project ? [a.project] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={a.area ?? ""} onChange={(e) => onAsk("area", e.target.value)} aria-label="المنطقة">
        <option value="">المنطقة: أي منطقة</option><option value="same">نفس منطقة الكلاينت</option>
      </select>
      <select value={a.split ?? ""} onChange={(e) => onAsk("split", e.target.value)} aria-label="مساحة متقسمة">
        <option value="">مساحة متقسمة: تنفع</option><option value="no">مش عايز مساحة متقسمة</option>
      </select>
      {sale && <select value={a.payment ?? ""} onChange={(e) => onAsk("payment", e.target.value)} aria-label="طريقة الدفع">
        <option value="">الدفع: أي طريقة</option>
        {[...new Set([...r.paymentMethods, ...(a.payment ? [a.payment] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
      </select>}
      {sale && <label className="qs-t">التسليم قبل<input type="date" value={a.deliveryBy ?? ""} onChange={(e) => onAsk("deliveryBy", e.target.value)} aria-label="التسليم قبل" /></label>}
      {Object.values(a).some((v) => v != null && v !== "") && <button className="btn ghost sm" onClick={onReset}>مسح الإجابات</button>}
    </div>
  );
}
