"use client";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ClientFile } from "@places/contracts";
import { Drawer } from "@/components/blocks";
import { Card, Chip, Empty, Icon, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { day, dayTime, money, num } from "@/lib/format";
import { KIND_WORD, KindChips } from "./client-bits";
import { SuggestMergeForm } from "./merges";
import { PrivacyBits } from "./privacy";

/**
 * The demo's file drawer (clients.js clDrawer): the details with what they owe, their units with the last update,
 * their contracts, «سجّل تواصل», and the whole history newest first. Prev / next walk the list.
 */
export function ClientDrawer({ ids, id, file, error, onGo, onClose }: {
  ids: string[]; id: string; file: ClientFile | undefined; error: Error | null; onGo: (id: string) => void; onClose: () => void;
}) {
  const at = ids.indexOf(id);
  const prev = at > 0 ? ids[at - 1] : undefined, next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : undefined;
  if (error) return <Drawer title="الملف مش موجود" onClose={onClose}><Empty text={error.message} /></Drawer>;
  if (!file) return <Drawer title="…" onClose={onClose}><p className="hint">بيحمّل…</p></Drawer>;
  const p = file;
  const kv: [string, ReactNode][] = [
    ["النوع", KIND_WORD[p.kind]],
    ["الأرقام", p.phones ? p.phones.map((x) => <span key={x} className="mono">{x}<br /></span>) : "—"],
    ["الشركة", p.company || "—"],
    ["الوحدات", num(p.units.length)],
    ["الصفقات", num(p.deals.length)],
    ["دفع", money(p.balance.paid)],
    ["عليه", money(p.balance.remaining)],
  ];
  return (
    <Drawer title={p.name} sub={`ملف ${KIND_WORD[p.kind]}`} chips={<><KindChips kind={p.kind} />{p.status === "inactive" && <Chip>Inactive</Chip>}</>} onClose={onClose}
      {...(prev ? { onPrev: () => onGo(prev) } : {})} {...(next ? { onNext: () => onGo(next) } : {})}
      {...(ids.length > 1 && at >= 0 ? { position: `${at + 1}/${ids.length}` } : {})}>
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {p.units.length > 0 && (
        <Card className="flat" title="وحداته" icon="building">
          {p.units.map((u) => (
            <div key={u.id} className="line-item">
              <span><b className="mono">{u.code}</b> · {u.project} · {num(u.space)} م</span>
              {u.stale ? <Chip tone="bad">محتاجة ابديت</Chip> : <Chip tone="ok">{day(u.lastOwnerUpdateAt)}</Chip>}
            </div>
          ))}
        </Card>
      )}
      {p.contracts.length > 0 && (
        <Card className="flat" title="العقود" icon="file">
          {p.contracts.map((c) => <div key={c.id} className="line-item"><span><b className="mono">{c.code}</b> · ينتهي {day(c.endsOn)}</span></div>)}
        </Card>
      )}
      <PrivacyBits file={p} />
      <LogForm file={p} />
      <SuggestMergeForm file={p} />
      <h4 className="mini-h">التاريخ كله</h4>
      {p.timeline.length
        ? <div className="timeline">{p.timeline.map((x, i) => <div key={i}>{x.text}<small>{x.by ?? "السيستم"} · {dayTime(x.at)}</small></div>)}</div>
        : <Empty text="مفيش" icon="clock" />}
    </Drawer>
  );
}

/** «سجّل تواصل» (M-10 2.1 step 5): for whoever may log on the file (sales on their clients, M-10 4.1). */
function LogForm({ file }: { file: ClientFile }) {
  const me = useMe();
  const run = useAction();
  const qc = useQueryClient();
  if (!me.can("clients", "create")) return null;
  const save = onFormSubmit((d) => run(async () => {
    await api.post(`/clients/${file.id}/interactions`, { kind: d.get("kind"), text: d.get("text") });
    await Promise.all([qc.invalidateQueries({ queryKey: ["client", file.id] }), qc.invalidateQueries({ queryKey: ["clients"] })]);
    (document.getElementById("cl-t") as HTMLInputElement | null)?.form?.reset();
  }, "اتسجّل"));
  return (
    <form className="card flat" onSubmit={save}>
      <div className="card-head"><h3><span className="ico"><Icon name="phone" /></span><span>سجّل تواصل</span></h3></div>
      <div className="row">
        <select name="kind" id="cl-k" aria-label="نوع التواصل">{file.interactionKinds.map((k) => <option key={k}>{k}</option>)}</select>
        <input name="text" id="cl-t" required placeholder="التفاصيل" aria-label="التفاصيل" maxLength={1000} />
        <button className="btn ghost"><Icon name="plus" />سجّل</button>
      </div>
    </form>
  );
}
