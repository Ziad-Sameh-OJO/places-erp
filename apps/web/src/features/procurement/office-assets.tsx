"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OfficeAssetView, OfficeBoyShiftView } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useOfficeAssets, useOfficeBoys } from "./use-office-assets";

/** The demo's office cards under procurement (M-08 3.1): the assets register and the office boys' rota by area. */
export function OfficeCards() {
  const { can } = useMe();
  const keeps = can("procurement", "edit"); // Mokhtar and the admins; the API decides
  return (
    <div className="cols">
      <AssetsCard keeps={keeps} />
      <OfficeBoysCard keeps={keeps} />
    </div>
  );
}

const repairChip = (needsRepair: boolean) => <Chip tone={needsRepair ? "warn" : "ok"} plain>{needsRepair ? "محتاج صيانة" : "سليم"}</Chip>;

function AssetsCard({ keeps }: { keeps: boolean }) {
  const q = useOfficeAssets();
  const qc = useQueryClient();
  const run = useAction();
  const [edit, setEdit] = useState<OfficeAssetView | null>(null);
  const [formKey, setFormKey] = useState(0); // a new key empties the «أصل جديد» form after it's added
  const refresh = () => qc.invalidateQueries({ queryKey: ["office-assets"] });
  const items = q.data?.items ?? [];
  const last = q.data?.lastReview;
  const reviewed = last
    ? <Chip tone={q.data?.reviewedThisMonth ? "ok" : "warn"}>اتراجع {day(last.at)}</Chip>
    : <Chip tone="warn">ماتراجعش</Chip>;
  const add = (d: FormData) => void run(async () => {
    await api.post("/procurement/office-assets", { name: String(d.get("name") ?? ""), place: String(d.get("place") ?? "") });
    await refresh();
    setFormKey((k) => k + 1);
  }, "اتضاف الأصل");
  const review = () => void run(async () => { await api.post("/procurement/office-assets/review"); await refresh(); }, "اتسجّلت المراجعة");
  return (
    <Card title="سجل أصول المكتب" icon="building" extra={q.data && reviewed}>
      <Table head={["الأصل", "المكان", "الحالة"]} empty={q.isPending ? "بيحمّل…" : "السجل فاضي"} {...(keeps ? { onRow: (i: number) => setEdit(items[i] ?? null) } : {})}
        rows={items.map((a) => [a.name, a.place || "—", repairChip(a.needsRepair)])} />
      {keeps && (
        <form key={formKey} className="row" onSubmit={onFormSubmit(add)}>
          <input name="name" required placeholder="أصل جديد" aria-label="أصل جديد" />
          <input name="place" placeholder="المكان" aria-label="المكان" style={{ maxWidth: 120 }} />
          <button className="btn ghost sm"><Icon name="plus" />ضيف</button>
          <button type="button" className="btn ghost sm" onClick={review}><Icon name="check" />اتراجع الشهر ده</button>
        </form>
      )}
      {edit && <AssetEditor asset={edit} onClose={() => setEdit(null)} onSaved={refresh} />}
    </Card>
  );
}

/** Change an asset (name, place, «سليم / محتاج صيانة») or take it off the register. */
function AssetEditor({ asset, onClose, onSaved }: { asset: OfficeAssetView; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const run = useAction();
  const save = (d: FormData) => void run(async () => {
    await api.patch(`/procurement/office-assets/${asset.id}`, { name: String(d.get("name") ?? ""), place: String(d.get("place") ?? ""), needsRepair: d.get("state") === "repair" });
    await onSaved();
    onClose();
  }, "اتعدّل الأصل");
  const remove = () => void run(async () => { await api.del(`/procurement/office-assets/${asset.id}`); await onSaved(); onClose(); }, "اتشال الأصل من السجل");
  return (
    <Modal title="عدّل الأصل" onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label="الأصل" req><input name="name" required defaultValue={asset.name} /></Field>
        <Field label="المكان"><input name="place" defaultValue={asset.place} /></Field>
        <Field label="الحالة">
          <select name="state" defaultValue={asset.needsRepair ? "repair" : "ok"}><option value="ok">سليم</option><option value="repair">محتاج صيانة</option></select>
        </Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={remove}><Icon name="x" />شيل من السجل</button>
          <button className="btn">احفظ التعديل</button>
        </div>
      </form>
    </Modal>
  );
}

function OfficeBoysCard({ keeps }: { keeps: boolean }) {
  const q = useOfficeBoys();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<OfficeBoyShiftView | "new" | null>(null);
  const rows = q.data ?? [];
  return (
    <Card title="جدول الـ Office Boys" icon="users" sub="متقسّم على المناطق · نانسي بتقيّم الالتزام"
      extra={keeps && <button className="btn ghost sm" onClick={() => setEdit("new")}><Icon name="plus" />منطقة</button>}>
      <Table head={["المنطقة", "المسؤول", "المواعيد"]} empty={q.isPending ? "بيحمّل…" : "الجدول فاضي"} {...(keeps ? { onRow: (i: number) => setEdit(rows[i] ?? null) } : {})}
        rows={rows.map((s) => [s.area, s.name, s.slots])} />
      {edit && <ShiftEditor shift={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["office-boys"] })} />}
    </Card>
  );
}

/** A row of the rota: new, changed, or removed. */
function ShiftEditor({ shift, onClose, onSaved }: { shift: OfficeBoyShiftView | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const run = useAction();
  const save = (d: FormData) => void run(async () => {
    const body = { area: String(d.get("area") ?? ""), name: String(d.get("name") ?? ""), slots: String(d.get("slots") ?? "") };
    if (shift) await api.patch(`/procurement/office-boys/${shift.id}`, body); else await api.post("/procurement/office-boys", body);
    await onSaved();
    onClose();
  }, shift ? "اتعدّل الجدول" : "اتضافت المنطقة للجدول");
  const remove = (id: string) => void run(async () => { await api.del(`/procurement/office-boys/${id}`); await onSaved(); onClose(); }, "اتشالت من الجدول");
  return (
    <Modal title={shift ? "عدّل المنطقة" : "منطقة جديدة"} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label="المنطقة" req wide><input name="area" required defaultValue={shift?.area} placeholder="الدور الأرضي + الاستقبال" /></Field>
        <Field label="المسؤول" req><input name="name" required defaultValue={shift?.name} /></Field>
        <Field label="المواعيد" req><input name="slots" required defaultValue={shift?.slots} placeholder="9:00 · 13:00 · 17:00" /></Field>
        <div className="row end wide">
          {shift && <button type="button" className="btn ghost" onClick={() => remove(shift.id)}><Icon name="x" />شيل</button>}
          <button className="btn">{shift ? "احفظ التعديل" : <><Icon name="plus" />ضيف</>}</button>
        </div>
      </form>
    </Modal>
  );
}
