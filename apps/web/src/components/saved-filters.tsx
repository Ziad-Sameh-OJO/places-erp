"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { type FilterValues, activeCount, sameFilters, useSavedFilters } from "@/lib/saved-filters";
import { Field, Icon, Modal, onFormSubmit, useToast } from "./ui";

/**
 * «فلاتري» above a list's filters: the person's saved filter sets as chips (one click applies all of them again), and
 * «احفظ الفلاتر دي» once something is picked that isn't saved yet. Nothing shows until there is something to save.
 * The same bar on every list page (client, 22 Nov: inventory, leads and the rest), like leads' saved views.
 */
export function SavedFilters({ page, value, onPick }: { page: string; value: FilterValues; onPick: (f: FilterValues) => void }) {
  const t = useTranslations("ui.savedFilters");
  const toast = useToast();
  const saved = useSavedFilters(page);
  const [naming, setNaming] = useState(false);
  const canSave = activeCount(value) > 0 && !saved.list.some((v) => sameFilters(v.f, value));
  if (!saved.list.length && !canSave) return null;
  return (
    <div className="views-bar" role="toolbar" aria-label={t("label")}>
      <span className="lbl">{t("title")}</span>
      {saved.list.map((v, i) => (
        <SavedChip key={`${v.name}-${i}`} name={v.name} on={sameFilters(v.f, value)} removeLabel={t("remove")}
          onPick={() => onPick(v.f)} onRemove={() => { saved.remove(i); toast(t("removed")); }} />
      ))}
      {canSave && <button type="button" className="vchip add" onClick={() => setNaming(true)}><Icon name="plus" />{t("saveThis")}</button>}
      {naming && (
        <SaveModal title={t("saveTitle")} label={t("name")} placeholder={t("namePlaceholder")} save={t("save")} onClose={() => setNaming(false)}
          onSave={(name) => { saved.add({ name, f: value }); setNaming(false); toast(t("saved", { name })); }} />
      )}
    </div>
  );
}

/** One saved filter set: pressed while it's the one applied; × forgets it. */
export function SavedChip({ name, on, removeLabel, onPick, onRemove }: { name: string; on: boolean; removeLabel: string; onPick: () => void; onRemove: () => void }) {
  return (
    <button type="button" className="vchip" aria-pressed={on} onClick={onPick}>
      <Icon name="star" />{name}
      <span className="vx" role="button" aria-label={removeLabel} onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</span>
    </button>
  );
}

/** Asks for the saved set's name. */
export function SaveModal({ title, label, placeholder, save, onClose, onSave }: {
  title: string; label: string; placeholder: string; save: string; onClose: () => void; onSave: (name: string) => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((d) => { const name = String(d.get("name") ?? "").trim(); if (name) onSave(name); })}>
        <Field label={label} req wide><input name="name" required maxLength={40} placeholder={placeholder} autoFocus /></Field>
        <div className="row end wide"><button className="btn"><Icon name="star" />{save}</button></div>
      </form>
    </Modal>
  );
}
