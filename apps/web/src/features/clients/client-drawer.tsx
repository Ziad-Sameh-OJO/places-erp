"use client";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ClientFile } from "@places/contracts";
import { Drawer } from "@/components/blocks";
import { Card, Chip, Empty, Icon, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useFields, useMe } from "@/lib/me";
import { day, dayTime, money, num } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { KindChips } from "./client-bits";
import { SuggestMergeForm } from "./merges";
import { PrivacyBits } from "./privacy";

/**
 * The demo's file drawer (clients.js clDrawer): the details with what they owe, their units with the last update,
 * their contracts, «سجّل تواصل», and the whole history newest first. Prev / next walk the list.
 */
export function ClientDrawer({ ids, id, file, error, onGo, onClose }: {
  ids: string[]; id: string; file: ClientFile | undefined; error: Error | null; onGo: (id: string) => void; onClose: () => void;
}) {
  const t = useTranslations("clients.drawer");
  const tk = useTranslations("clients.kind");
  const fields = useFields("clients"), inv = useFields("inventory");
  const at = ids.indexOf(id);
  const prev = at > 0 ? ids[at - 1] : undefined, next = at >= 0 && at < ids.length - 1 ? ids[at + 1] : undefined;
  if (error) return <Drawer title={t("notFound")} onClose={onClose}><Empty text={error.message} /></Drawer>;
  if (!file) return <Drawer title="…" onClose={onClose}><p className="hint">{t("loading")}</p></Drawer>;
  const p = file;
  // M-09 field permissions: a hidden field's row is gone (the API blanks it anyway)
  const kv = ([
    ["kind", t("kind"), tk(p.kind)],
    ["phones", t("phones"), p.phones ? p.phones.map((x) => <span key={x} className="mono">{x}<br /></span>) : "—"],
    ["company", t("company"), p.company || "—"],
    ["units", t("units"), num(p.units.length)],
    ["deals", t("deals"), num(p.deals.length)],
    ["balance", t("paid"), money(p.balance.paid)],
    ["balance", t("owes"), money(p.balance.remaining)],
  ] satisfies [string, string, ReactNode][]).filter(([k]) => fields.shows(k)).map(([, k, v]) => [k, v] as const);
  const space = inv.shows("space"), lastUpdate = inv.shows("lastOwnerUpdateAt");
  return (
    <Drawer title={p.name} sub={t("fileOf", { kind: tk(p.kind) })} chips={<><KindChips kind={p.kind} />{p.status === "inactive" && <Chip>Inactive</Chip>}</>} onClose={onClose}
      {...(prev ? { onPrev: () => onGo(prev) } : {})} {...(next ? { onNext: () => onGo(next) } : {})}
      {...(ids.length > 1 && at >= 0 ? { position: `${at + 1}/${ids.length}` } : {})}>
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {p.units.length > 0 && (
        <Card className="flat" title={t("unitsTitle")} icon="building">
          {p.units.map((u) => (
            <div key={u.id} className="line-item">
              <span><b className="mono">{u.code}</b> · {u.project}{space && <> · {t("space", { space: num(u.space) })}</>}</span>
              {lastUpdate && (u.stale ? <Chip tone="bad">{t("needsUpdate")}</Chip> : <Chip tone="ok">{day(u.lastOwnerUpdateAt)}</Chip>)}
            </div>
          ))}
        </Card>
      )}
      {p.contracts.length > 0 && (
        <Card className="flat" title={t("contracts")} icon="file">
          {p.contracts.map((c) => <div key={c.id} className="line-item"><span><b className="mono">{c.code}</b> · {t("endsOn", { date: day(c.endsOn) })}</span></div>)}
        </Card>
      )}
      <PrivacyBits file={p} />
      <LogForm file={p} />
      <SuggestMergeForm file={p} />
      {fields.shows("timeline") && <h4 className="mini-h">{t("history")}</h4>}
      {!fields.shows("timeline") ? null : p.timeline.length
        ? <div className="timeline">{p.timeline.map((x, i) => <div key={i}>{serverText(x.text)}<small>{x.by ?? t("system")} · {dayTime(x.at)}</small></div>)}</div>
        : <Empty text={t("nothing")} icon="clock" />}
    </Drawer>
  );
}

/** «سجّل تواصل» (M-10 2.1 step 5): for whoever may log on the file (sales on their clients, M-10 4.1). */
function LogForm({ file }: { file: ClientFile }) {
  const t = useTranslations("clients.log");
  const me = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const fields = useFields("clients"); // M-09: logging writes the history, so a read-only history has no form
  if (!me.can("clients", "create") || !fields.edits("timeline")) return null;
  const save = onFormSubmit((d) => run(async () => {
    await api.post(`/clients/${file.id}/interactions`, { kind: d.get("kind"), text: d.get("text") });
    await Promise.all([qc.invalidateQueries({ queryKey: ["client", file.id] }), qc.invalidateQueries({ queryKey: ["clients"] })]);
    (document.getElementById("cl-t") as HTMLInputElement | null)?.form?.reset();
  }, t("saved")));
  return (
    <form className="card flat" onSubmit={save}>
      <div className="card-head"><h3><span className="ico"><Icon name="phone" /></span><span>{t("title")}</span></h3></div>
      <div className="row">
        <select name="kind" id="cl-k" aria-label={t("kind")}>{file.interactionKinds.map((k) => <option key={k} value={k}>{serverText(k)}</option>)}</select>
        <input name="text" id="cl-t" required placeholder={t("details")} aria-label={t("details")} maxLength={1000} />
        <button className="btn ghost"><Icon name="plus" />{t("log")}</button>
      </div>
    </form>
  );
}
