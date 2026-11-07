"use client";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { OfficeAssetView, OfficeBoyShiftView } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useOfficeAssets, useOfficeBoys } from "./use-office-assets";

/** The demo's office cards under procurement (M-08 3.1): the assets register and the office boys' rota by area. */
export function OfficeCards({ lead }: { lead?: ReactNode }) {
  const { can } = useMe();
  const keeps = can("procurement", "edit"); // Mokhtar and the admins; the API decides
  return (
    <div className="cols">
      {lead}
      <AssetsCard keeps={keeps} />
      <OfficeBoysCard keeps={keeps} />
    </div>
  );
}

function RepairChip({ needsRepair }: { needsRepair: boolean }) {
  const t = useTranslations("procurement");
  return <Chip tone={needsRepair ? "warn" : "ok"} plain>{needsRepair ? t("assets.needsRepair") : t("assets.ok")}</Chip>;
}

function AssetsCard({ keeps }: { keeps: boolean }) {
  const t = useTranslations("procurement");
  const q = useOfficeAssets();
  const qc = useQueryClient();
  const run = useAction();
  const [edit, setEdit] = useState<OfficeAssetView | null>(null);
  const [formKey, setFormKey] = useState(0); // a new key empties the «أصل جديد» form after it's added
  const refresh = () => qc.invalidateQueries({ queryKey: ["office-assets"] });
  const items = q.data?.items ?? [];
  const last = q.data?.lastReview;
  const reviewed = last
    ? <Chip tone={q.data?.reviewedThisMonth ? "ok" : "warn"}>{t("assets.reviewedOn", { day: day(last.at) })}</Chip>
    : <Chip tone="warn">{t("assets.notReviewed")}</Chip>;
  const add = (d: FormData) => void run(async () => {
    await api.post("/procurement/office-assets", { name: String(d.get("name") ?? ""), place: String(d.get("place") ?? "") });
    await refresh();
    setFormKey((k) => k + 1);
  }, t("assets.added"));
  const review = () => void run(async () => { await api.post("/procurement/office-assets/review"); await refresh(); }, t("assets.reviewSaved"));
  return (
    <Card title={t("assets.title")} icon="building" extra={q.data && reviewed}>
      <Table head={[t("assets.asset"), t("assets.place"), t("assets.state")]} empty={q.isPending ? t("common.loading") : t("assets.empty")} {...(keeps ? { onRow: (i: number) => setEdit(items[i] ?? null) } : {})}
        rows={items.map((a) => [a.name, a.place || "—", <RepairChip key="r" needsRepair={a.needsRepair} />])} />
      {keeps && (
        <form key={formKey} className="row" onSubmit={onFormSubmit(add)}>
          <input name="name" required placeholder={t("assets.newAsset")} aria-label={t("assets.newAsset")} />
          <input name="place" placeholder={t("assets.place")} aria-label={t("assets.place")} style={{ maxWidth: 120 }} />
          <button className="btn ghost sm"><Icon name="plus" />{t("common.add")}</button>
          <button type="button" className="btn ghost sm" onClick={review}><Icon name="check" />{t("assets.reviewMonth")}</button>
        </form>
      )}
      {edit && <AssetEditor asset={edit} onClose={() => setEdit(null)} onSaved={refresh} />}
    </Card>
  );
}

/** Change an asset (name, place, «سليم / محتاج صيانة») or take it off the register. */
function AssetEditor({ asset, onClose, onSaved }: { asset: OfficeAssetView; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const t = useTranslations("procurement");
  const run = useAction();
  const save = (d: FormData) => void run(async () => {
    await api.patch(`/procurement/office-assets/${asset.id}`, { name: String(d.get("name") ?? ""), place: String(d.get("place") ?? ""), needsRepair: d.get("state") === "repair" });
    await onSaved();
    onClose();
  }, t("assets.edited"));
  const remove = () => void run(async () => { await api.del(`/procurement/office-assets/${asset.id}`); await onSaved(); onClose(); }, t("assets.removed"));
  return (
    <Modal title={t("assets.editTitle")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label={t("assets.asset")} req><input name="name" required defaultValue={asset.name} /></Field>
        <Field label={t("assets.place")}><input name="place" defaultValue={asset.place} /></Field>
        <Field label={t("assets.state")}>
          <select name="state" defaultValue={asset.needsRepair ? "repair" : "ok"}><option value="ok">{t("assets.ok")}</option><option value="repair">{t("assets.needsRepair")}</option></select>
        </Field>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={remove}><Icon name="x" />{t("assets.remove")}</button>
          <button className="btn">{t("common.saveEdit")}</button>
        </div>
      </form>
    </Modal>
  );
}

function OfficeBoysCard({ keeps }: { keeps: boolean }) {
  const t = useTranslations("procurement");
  const q = useOfficeBoys();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<OfficeBoyShiftView | "new" | null>(null);
  const rows = q.data ?? [];
  return (
    <Card title={t("boys.title")} icon="users" sub={t("boys.sub")}
      extra={keeps && <button className="btn ghost sm" onClick={() => setEdit("new")}><Icon name="plus" />{t("boys.area")}</button>}>
      <Table head={[t("boys.areaCol"), t("boys.owner"), t("boys.slots")]} empty={q.isPending ? t("common.loading") : t("boys.empty")} {...(keeps ? { onRow: (i: number) => setEdit(rows[i] ?? null) } : {})}
        rows={rows.map((s) => [s.area, s.name, s.slots])} />
      {edit && <ShiftEditor shift={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["office-boys"] })} />}
    </Card>
  );
}

/** A row of the rota: new, changed, or removed. */
function ShiftEditor({ shift, onClose, onSaved }: { shift: OfficeBoyShiftView | null; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const t = useTranslations("procurement");
  const run = useAction();
  const save = (d: FormData) => void run(async () => {
    const body = { area: String(d.get("area") ?? ""), name: String(d.get("name") ?? ""), slots: String(d.get("slots") ?? "") };
    if (shift) await api.patch(`/procurement/office-boys/${shift.id}`, body); else await api.post("/procurement/office-boys", body);
    await onSaved();
    onClose();
  }, shift ? t("boys.edited") : t("boys.added"));
  const remove = (id: string) => void run(async () => { await api.del(`/procurement/office-boys/${id}`); await onSaved(); onClose(); }, t("boys.removed"));
  return (
    <Modal title={shift ? t("boys.editTitle") : t("boys.newTitle")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit(save)}>
        <Field label={t("boys.areaCol")} req wide><input name="area" required defaultValue={shift?.area} placeholder={t("boys.areaPlaceholder")} /></Field>
        <Field label={t("boys.owner")} req><input name="name" required defaultValue={shift?.name} /></Field>
        <Field label={t("boys.slots")} req><input name="slots" required defaultValue={shift?.slots} placeholder="9:00 · 13:00 · 17:00" /></Field>
        <div className="row end wide">
          {shift && <button type="button" className="btn ghost" onClick={() => remove(shift.id)}><Icon name="x" />{t("boys.remove")}</button>}
          <button className="btn">{shift ? t("common.saveEdit") : <><Icon name="plus" />{t("common.add")}</>}</button>
        </div>
      </form>
    </Modal>
  );
}
