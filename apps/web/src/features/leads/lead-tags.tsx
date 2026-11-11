"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { LeadTags } from "@places/contracts";
import { Chip, Icon, Modal, Note, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { ago, day } from "@/lib/format";
import { useMe } from "@/lib/me";

const KEY = ["lead-tags"];
export const useTagPeople = (enabled = true) => useQuery({ queryKey: ["lead-tag-people"], queryFn: () => api.get<{ id: string; name: string }[]>("/lead-tags/people"), enabled, staleTime: 5 * 60_000 });
export const useLeadTags = (enabled: boolean, leadId?: string) =>
  useQuery({ queryKey: [...KEY, leadId ?? "all"], queryFn: () => api.get<LeadTags>(`/lead-tags${leadId ? `?leadId=${leadId}` : ""}`), enabled });
/** Salespeople and Team Leaders tag; whoever approves leads decides. */
export const useTags = () => {
  const { me, can } = useMe();
  const tags = !!me?.employeeId && (me.roles.includes("sales") || me.roles.includes("tl"));
  return { tags, decides: tags || can("leads", "approve") };
};

/** M-01 · Tags (client, 11 Nov): pick the salespeople working this lead with you (not yourself, not its owner). */
export function TagPicker({ value, onChange, exclude = [] }: { value: string[]; onChange: (ids: string[]) => void; exclude?: (string | null | undefined)[] }) {
  const t = useTranslations("leads.tags");
  const { me } = useMe();
  const people = (useTagPeople().data ?? []).filter((p) => p.id !== me?.employeeId && !exclude.includes(p.id));
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  return (
    <div className="tag-picker">
      <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} disabled={value.length >= 5} aria-label={t("pick")}>
        <option value="">{value.length >= 5 ? t("max") : t("pick")}</option>
        {people.filter((p) => !value.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {value.length > 0 && (
        <div className="row wrap">
          {value.map((id) => (
            <span key={id} className="chip acc tag-chip">{name(id)}<button type="button" onClick={() => onChange(value.filter((x) => x !== id))} aria-label={t("remove", { name: name(id) })}><Icon name="x" /></button></span>
          ))}
        </div>
      )}
      <small className="hint">{t("hint")}</small>
    </div>
  );
}

export const askTags = (leadId: string, employeeIds: string[]) => api.post<LeadTags>("/lead-tags", { leadId, employeeIds });

const tone = { PENDING: "warn", APPROVED: "ok", REJECTED: "bad" } as const;

function TagRows({ data, decide }: { data: LeadTags | undefined; decide: (id: string, approve: boolean) => void }) {
  const t = useTranslations("leads.tags");
  return (
    <Table head={[t("head.lead"), t("head.tagged"), t("head.by"), t("head.approver"), t("head.status"), t("head.at"), ""]} empty={t("empty")}
      rows={(data?.items ?? []).map((r) => [
        <span key="l" className="wrap"><b>{r.lead.name}</b><span className="sub mono">{r.lead.code}</span></span>,
        <b key="t">{r.tagged}</b>,
        r.by || "—",
        r.approver ?? t("operations"),
        <Chip key="s" tone={tone[r.status]}>{t(`status.${r.status}`)}</Chip>,
        <span key="a" title={day(r.at)}>{ago(r.at)}</span>,
        r.canDecide ? (
          <span key="d" className="row">
            <button className="btn sm" onClick={() => decide(r.id, true)}><Icon name="check" />{t("approve")}</button>
            <button className="btn ghost sm" onClick={() => decide(r.id, false)}>{t("reject")}</button>
          </span>
        ) : "",
      ])} />
  );
}

/** The «Tags» tab next to «البروكرز»: what waits for my approval, my requests and the leads I'm tagged on, with their state. */
export function TagsView() {
  const t = useTranslations("leads.tags");
  const run = useAction();
  const qc = useQueryClient();
  const q = useLeadTags(true);
  const decide = (id: string, approve: boolean) => void run(async () => {
    await api.post(`/lead-tags/${id}/decide`, { approve });
    await Promise.all([qc.invalidateQueries({ queryKey: KEY }), qc.invalidateQueries({ queryKey: ["leads"] })]);
  }, approve ? t("approved") : t("rejected"));
  return (
    <>
      <Note>{q.data?.toDecide ? t("waiting", { n: q.data.toDecide }) : t("note")}</Note>
      <TagRows data={q.data} decide={decide} />
    </>
  );
}

/** «Tag سيلز» inside a lead: its tags with their state, and ask for more. */
export function LeadTagsButton({ leadId, ownerId }: { leadId: string; ownerId: string | null }) {
  const t = useTranslations("leads.tags");
  const { tags } = useTags();
  const [open, setOpen] = useState(false);
  if (!tags) return null;
  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)}><Icon name="users" />{t("button")}</button>
      {open && <LeadTagsModal leadId={leadId} ownerId={ownerId} onClose={() => setOpen(false)} />}
    </>
  );
}

function LeadTagsModal({ leadId, ownerId, onClose }: { leadId: string; ownerId: string | null; onClose: () => void }) {
  const t = useTranslations("leads.tags");
  const run = useAction();
  const qc = useQueryClient();
  const q = useLeadTags(true, leadId);
  const [picked, setPicked] = useState<string[]>([]);
  const taken = (q.data?.items ?? []).filter((r) => r.status !== "REJECTED");
  const send = () => void run(async () => {
    await askTags(leadId, picked);
    setPicked([]);
    await qc.invalidateQueries({ queryKey: KEY });
  }, t("sent"));
  const decide = (id: string, approve: boolean) => void run(async () => {
    await api.post(`/lead-tags/${id}/decide`, { approve });
    await qc.invalidateQueries({ queryKey: KEY });
  }, approve ? t("approved") : t("rejected"));
  return (
    <Modal title={t("title")} onClose={onClose}>
      <TagRows data={q.data} decide={decide} />
      <div className="grid">
        <label className="field wide"><span>{t("add")}</span>
          <TagPicker value={picked} onChange={setPicked} exclude={[ownerId]} />
        </label>
        <div className="row end wide">
          <button className="btn ghost" onClick={onClose}>{t("close")}</button>
          <button className="btn" disabled={!picked.length} onClick={send}><Icon name="send" />{t("ask")}</button>
        </div>
      </div>
      {taken.length > 0 && <span className="hint">{t("already", { n: taken.length })}</span>}
    </Modal>
  );
}
