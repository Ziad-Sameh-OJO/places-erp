"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { AreaTabView } from "@places/contracts";
import { Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";

/** The demo's sheet tabs under the list (labels in <bdi>: «101 to 200» next to its count read backwards in RTL): «كل المساحات», each range with its count, and «+» for the team (2.5). */
export function AreaTabsBar({ tabs, value, onChange, editable }: { tabs: AreaTabView[]; value: string | undefined; onChange: (id: string | undefined) => void; editable: boolean }) {
  const t = useTranslations("inventory.areaTabs");
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="sheet-tabs" role="tablist" aria-label={t("ranges")}>
        <button role="tab" aria-selected={!value} onClick={() => onChange(undefined)}>{t("all")}</button>
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={value === x.id} onClick={() => onChange(x.id)}><bdi dir="ltr">{x.label}</bdi> <span className="tab-n">{num(x.count)}</span></button>
        ))}
        {editable && <button onClick={() => setEditing(true)} title={t("editTabs")} aria-label={t("editTabs")}><Icon name="plus" /></button>}
      </div>
      {editing && <AreaTabsEditor tabs={tabs} onClose={() => setEditing(false)} onRemoved={(id) => value === id && onChange(undefined)} />}
    </>
  );
}

/** Demo «تابات المساحات»: the ranges, «شيل», and a new range. Changing one is the requirements' «يعدّلوا» (M-03 7.2). */
function AreaTabsEditor({ tabs, onClose, onRemoved }: { tabs: AreaTabView[]; onClose: () => void; onRemoved: (id: string) => void }) {
  const t = useTranslations("inventory.areaTabs");
  const tc = useTranslations("inventory.common");
  const qc = useQueryClient();
  const run = useAction();
  const [edit, setEdit] = useState<AreaTabView | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["area-tabs"] }), qc.invalidateQueries({ queryKey: ["units"] })]);
  const save = (d: FormData) => {
    const min = Number(d.get("min")), maxText = String(d.get("max") ?? "").trim();
    const body = { min, max: maxText ? Number(maxText) : null };
    void run(async () => {
      if (edit) await api.patch(`/inventory/area-tabs/${edit.id}`, body); else await api.post("/inventory/area-tabs", body);
      await refresh();
      setEdit(null);
    }, edit ? t("edited") : t("added"));
  };
  const remove = (x: AreaTabView) => void run(async () => {
    await api.del(`/inventory/area-tabs/${x.id}`);
    onRemoved(x.id);
    if (edit?.id === x.id) setEdit(null);
    await refresh();
  }, t("removed"));
  return (
    <Modal title={t("title")} onClose={onClose}>
      <Note>{t("note")}</Note>
      <Table head={[t("tab"), t("from"), t("to"), ""]} empty={t("empty")} rows={tabs.map((x) => [
        <bdi key="l" dir="ltr" className="mono">{x.label}</bdi>, num(x.min), x.max == null ? "∞" : num(x.max),
        <span key="a" className="row">
          <button type="button" className="btn ghost sm" onClick={() => setEdit(x)}>{t("edit")}</button>
          <button type="button" className="btn ghost sm" onClick={() => remove(x)}><Icon name="x" />{t("remove")}</button>
        </span>,
      ])} />
      {/* keyed by the tab being changed, so the fields start from its numbers */}
      <form key={edit?.id ?? "new"} className="grid" onSubmit={onFormSubmit(save)}>
        <Field label={t("fromM")} req><input name="min" type="number" min={1} step={1} required defaultValue={edit?.min ?? ""} /></Field>
        <Field label={t("toM")}><input name="max" type="number" min={1} step={1} defaultValue={edit?.max ?? ""} placeholder={t("openEnded")} /></Field>
        <div className="row end wide">
          {edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>{tc("cancel")}</button>}
          <button className="btn">{edit ? t("saveEdit") : <><Icon name="plus" />{t("add")}</>}</button>
        </div>
      </form>
    </Modal>
  );
}
