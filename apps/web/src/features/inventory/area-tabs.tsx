"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AreaTabView } from "@places/contracts";
import { Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";

/** The demo's sheet tabs under the list (labels in <bdi>: «101 to 200» next to its count read backwards in RTL): «كل المساحات», each range with its count, and «+» for the team (2.5). */
export function AreaTabsBar({ tabs, value, onChange, editable }: { tabs: AreaTabView[]; value: string | undefined; onChange: (id: string | undefined) => void; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="sheet-tabs" role="tablist" aria-label="تقسيم المساحات">
        <button role="tab" aria-selected={!value} onClick={() => onChange(undefined)}>كل المساحات</button>
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}><bdi dir="ltr">{t.label}</bdi> <span className="tab-n">{num(t.count)}</span></button>
        ))}
        {editable && <button onClick={() => setEditing(true)} title="عدّل تابات المساحات" aria-label="عدّل تابات المساحات"><Icon name="plus" /></button>}
      </div>
      {editing && <AreaTabsEditor tabs={tabs} onClose={() => setEditing(false)} onRemoved={(id) => value === id && onChange(undefined)} />}
    </>
  );
}

/** Demo «تابات المساحات»: the ranges, «شيل», and a new range. Changing one is the requirements' «يعدّلوا» (M-03 7.2). */
function AreaTabsEditor({ tabs, onClose, onRemoved }: { tabs: AreaTabView[]; onClose: () => void; onRemoved: (id: string) => void }) {
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
    }, edit ? "اتعدّل التاب" : "اتضاف التاب · ظاهر تحت القايمة");
  };
  const remove = (t: AreaTabView) => void run(async () => {
    await api.del(`/inventory/area-tabs/${t.id}`);
    onRemoved(t.id);
    if (edit?.id === t.id) setEdit(null);
    await refresh();
  }, "اتشال التاب · وحداته رجعت تتقسم بالمساحة");
  return (
    <Modal title="تابات المساحات" onClose={onClose}>
      <Note>الشرايح دي Customized. منار أو رندا يضيفوا أو يعدّلوا أو يشيلوا أي تاب.</Note>
      <Table head={["التاب", "من", "لحد", ""]} empty="مفيش تابات" rows={tabs.map((t) => [
        <bdi key="l" dir="ltr" className="mono">{t.label}</bdi>, num(t.min), t.max == null ? "∞" : num(t.max),
        <span key="a" className="row">
          <button type="button" className="btn ghost sm" onClick={() => setEdit(t)}>عدّل</button>
          <button type="button" className="btn ghost sm" onClick={() => remove(t)}><Icon name="x" />شيل</button>
        </span>,
      ])} />
      {/* keyed by the tab being changed, so the fields start from its numbers */}
      <form key={edit?.id ?? "new"} className="grid" onSubmit={onFormSubmit(save)}>
        <Field label="من (م)" req><input name="min" type="number" min={1} step={1} required defaultValue={edit?.min ?? ""} /></Field>
        <Field label="لحد (م)"><input name="max" type="number" min={1} step={1} defaultValue={edit?.max ?? ""} placeholder="فاضي = وأكتر" /></Field>
        <div className="row end wide">
          {edit && <button type="button" className="btn ghost" onClick={() => setEdit(null)}>إلغاء</button>}
          <button className="btn">{edit ? "احفظ التعديل" : <><Icon name="plus" />إضافة تاب</>}</button>
        </div>
      </form>
    </Modal>
  );
}
