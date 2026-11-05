"use client";
import { useQueryClient } from "@tanstack/react-query";
import type { ClientFile } from "@places/contracts";
import { Card, Chip, Icon, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { KindChips } from "./client-bits";
import { useMerges } from "./use-clients";

/**
 * M-10 2.2 · «طلبات مستنية الأوبريشن» (like the leads' duplicates card): each merge with the two files, why, and
 * ادمج / ارفض. Shown only to people who may approve.
 */
export function MergeQueue() {
  const { can } = useMe();
  const merges = useMerges(can("clients", "approve"));
  const run = useAction();
  const qc = useQueryClient();
  const items = merges.data ?? [];
  if (!items.length) return null;
  const decide = (id: string, decision: "approve" | "reject") => run(async () => {
    await api.post(`/clients/merges/${id}`, { decision });
    await qc.invalidateQueries({ queryKey: ["clients"] });
  }, decision === "approve" ? "الملفين اتدمجوا" : "اترفض");
  return (
    <Card className="attn" title="طلبات دمج مستنية الأوبريشن" icon="alert" extra={<Chip tone="warn">{items.length}</Chip>}>
      {items.map((m) => (
        <div className="line-item" key={m.id}>
          <span><Icon name="users" /><span>
            <b>{m.drop.name}</b> <KindChips kind={m.drop.kind} /> ← يتدمج في <b>{m.keep.name}</b> <KindChips kind={m.keep.kind} />
            <small className="hint"> · {m.reason}{m.by ? ` · اقترحه ${m.by}` : " · السيستم"}</small>
          </span></span>
          <button className="btn sm" onClick={() => void decide(m.id, "approve")}>ادمج</button>
          <button className="btn ghost sm" onClick={() => void decide(m.id, "reject")}>ارفض</button>
        </div>
      ))}
    </Card>
  );
}

/** In a file's drawer: «ادمج بالموبايل» — the other file's number; Operations approves (M-10 2.2). */
export function SuggestMergeForm({ file }: { file: ClientFile }) {
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  if (!can("clients", "edit")) return null;
  const save = onFormSubmit((d) => run(async () => {
    await api.post(`/clients/${file.id}/merges`, { phone: d.get("phone") });
    await qc.invalidateQueries({ queryKey: ["clients", "merges"] });
    (document.getElementById("cl-merge") as HTMLInputElement | null)?.form?.reset();
  }, "اتبعت للأوبريشن تقرر"));
  return (
    <form className="card flat" onSubmit={save}>
      <div className="card-head"><h3><span className="ico"><Icon name="users" /></span><span>ادمج بالموبايل<small>نفس الشخص في ملف تاني · الأوبريشن بتوافق</small></span></h3></div>
      <div className="row">
        <input name="phone" id="cl-merge" required inputMode="tel" placeholder="رقم الملف التاني" aria-label="رقم الملف التاني" maxLength={20} />
        <button className="btn ghost">اقترح دمج</button>
      </div>
    </form>
  );
}
