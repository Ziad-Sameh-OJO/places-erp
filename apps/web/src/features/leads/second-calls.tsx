"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { SecondCallRow } from "@places/contracts";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { Card, Chip, Field, Icon, Modal, onFormSubmit, useAction } from "@/components/ui";

const KEY = ["lead-second-calls"];

/** Demo «مكالمات التحقق (Second Calls)» (11.15): today's leads to call, plus past days' ones still not done. Operations only. */
export function SecondCalls({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useTranslations("leads.secondCalls");
  const { can } = useMe();
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<SecondCallRow[]>("/leads/second-calls"), enabled: can("leads", "approve") });
  const [doing, setDoing] = useState<SecondCallRow | null>(null);
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const due = rows.filter((r) => !r.late), late = rows.length - due.length, done = due.filter((r) => r.done).length;
  return (
    <Card title={t("title")} icon="phone" sub={t("sub")}
      extra={<span><Chip tone={done < due.length ? "warn" : "ok"}>{t("doneToday", { done, total: due.length })}</Chip>{late > 0 && <> <Chip tone="bad">{t("fromPast", { count: late })}</Chip></>}</span>}>
      {rows.map((r) => (
        <div className="line-item" key={r.id}>
          <span><span><button className="link" onClick={() => onOpen(r.id)}><b>{r.name}</b></button> · {r.sales ?? "—"} · {r.channel}{r.late && <> <Chip tone="bad">{t("late", { day: day(r.createdAt) })}</Chip></>}</span></span>
          {r.done
            ? <span><Chip tone="ok">Second Call Done</Chip> <small className="hint">{r.done.note}</small></span>
            : <button className="btn sm" onClick={() => setDoing(r)}><Icon name="phone" />Second Call Done</button>}
        </div>
      ))}
      {doing && <SecondCallModal lead={doing} onClose={() => setDoing(null)} />}
    </Card>
  );
}

function SecondCallModal({ lead, onClose }: { lead: SecondCallRow; onClose: () => void }) {
  const t = useTranslations("leads.secondCalls");
  const run = useAction();
  const qc = useQueryClient();
  const save = onFormSubmit((f) => run(async () => {
    await api.post(`/leads/second-calls/${lead.id}`, { called: f.get("called") === "on", sent: f.get("sent") === "on", note: String(f.get("note") ?? "") });
    await qc.invalidateQueries({ queryKey: KEY });
    onClose();
  }, "Second Call Done"));
  return (
    <Modal title={`Second Call · ${lead.name}`} onClose={onClose}>
      <form className="grid" onSubmit={save}>
        <label className="tog"><input type="checkbox" name="called" defaultChecked /><span>{t("called")}</span></label>
        <label className="tog"><input type="checkbox" name="sent" defaultChecked /><span>{t("sent")}</span></label>
        <Field label={t("note")} req wide><textarea name="note" required maxLength={1000} placeholder={t("notePlaceholder")} /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button><button className="btn"><Icon name="check" />Second Call Done</button></div>
      </form>
    </Modal>
  );
}
