"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivityView, MyActivities } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { dayTime } from "@/lib/format";
import { useRefreshKpis } from "./use-kpis";

/** 11.13 «نشاطاتي · Farming و Approach» on the home page (demo kpis.js `actCard`). */
export function ActivitiesCard() {
  const t = useTranslations("kpis");
  const q = useQuery({ queryKey: ["kpis", "activities"], queryFn: () => api.get<MyActivities>("/kpis/activities") });
  const [adding, setAdding] = useState(false);
  const [answering, setAnswering] = useState<ActivityView | null>(null);
  if (!q.data?.show) return null;
  return (
    <Card title={t("activities.title")} icon="pin" sub={t("activities.sub")}>
      {q.data.items.map((a) => <Line key={a.id} a={a} onAnswer={() => setAnswering(a)} />)}
      {!q.data.items.length && <p className="hint">{t("activities.empty")}</p>}
      <div className="row end"><button className="btn ghost sm" onClick={() => setAdding(true)}><Icon name="plus" />{t("activities.new")}</button></div>
      {adding && <NewActivity onClose={() => setAdding(false)} />}
      {answering && <Result a={answering} onClose={() => setAnswering(null)} />}
    </Card>
  );
}

function Line({ a, onAnswer }: { a: ActivityView; onAnswer: () => void }) {
  const t = useTranslations("kpis");
  const outcome = a.kind === "Farming" ? `${a.got ? t("activities.got") : t("activities.gotNothing")} · ${a.note ?? ""}` : t("activities.companies", { list: a.companies.join(t("activities.listSep")) });
  const due = new Date(a.at) <= new Date();
  return (
    <div className="line-item">
      <span><Chip tone={a.kind === "Farming" ? "info" : ""} plain>{a.kind}</Chip><b>{a.place}</b><small className="hint">{dayTime(a.at)}</small></span>
      {a.status === "done" ? <><small>{outcome}</small><Chip tone="ok" plain>{t("activities.done")}</Chip></>
        : a.status === "notDone" ? <Chip tone="bad" plain>{t("activities.notDone")}</Chip>
        : due ? <button className="btn sm" onClick={onAnswer}>{t("activities.didYou")}</button> : <Chip plain>{t("activities.upcoming")}</Chip>}
    </div>
  );
}

function NewActivity({ onClose }: { onClose: () => void }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const save = (f: FormData) => run(async () => {
    const at = String(f.get("at") ?? "");
    await api.post("/kpis/activities", { kind: f.get("kind"), place: f.get("place"), at: at && new Date(at).toISOString() });
    await refresh(); onClose();
  }, t("activities.savedOk"));
  return (
    <Modal title={t("activities.new")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label={t("activities.kind")} req><select name="kind"><option value="Farming">Farming</option><option value="Approach">Approach</option></select></Field>
        <Field label={t("activities.place")} req><input name="place" required placeholder={t("activities.placePh")} /></Field>
        <Field label={t("activities.at")} req><input name="at" type="datetime-local" required /></Field>
        <div className="row end wide"><button type="button" className="btn ghost" onClick={onClose}>{t("common.cancel")}</button><button className="btn"><Icon name="plus" />{t("activities.record")}</button></div>
      </form>
    </Modal>
  );
}

function Result({ a, onClose }: { a: ActivityView; onClose: () => void }) {
  const t = useTranslations("kpis");
  const run = useAction(), refresh = useRefreshKpis();
  const send = (body: object, ok: string) => run(async () => { await api.post(`/kpis/activities/${a.id}/result`, body); await refresh(); onClose(); }, ok);
  const done = (f: FormData) => send({
    done: true, got: f.get("got") === "on", note: String(f.get("note") ?? ""),
    companies: String(f.get("companies") ?? "").split(/\n|,/).map((x) => x.trim()).filter(Boolean),
  }, t("activities.doneOk", { kind: a.kind }));
  return (
    <Modal title={`${a.kind} · ${a.place}`} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(done)}>
        {a.kind === "Farming" ? <>
          <label className="tog wide"><input type="checkbox" name="got" /><span>{t("activities.gotNew")}</span></label>
          <Field label={t("activities.whatGot")} wide><textarea name="note" placeholder={t("activities.whatGotPh")} /></Field>
        </> : <Field label={t("activities.companiesLabel")} req wide><textarea name="companies" required /></Field>}
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={() => void send({ done: false }, t("activities.notDoneOk"))}>{t("activities.didnt")}</button>
          <button className="btn"><Icon name="check" />{t("activities.did")}</button>
        </div>
      </form>
    </Modal>
  );
}
