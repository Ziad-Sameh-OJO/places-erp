"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { UnitDetail } from "@places/contracts";
import { locationUrl } from "@places/domain";
import { Field, Modal, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { LocationLink } from "./unit-bits";

/**
 * 2.34 · the demo's unitLoc (inventory.js): «عدّل اللينك» / «ضيف لينك» next to the unit's Location. The API keeps the
 * old link in the Audit Log, sends the PDF back to Manar's confirm and makes the Last update today.
 */
export function LocationEdit({ u }: { u: UnitDetail }) {
  const t = useTranslations("inventory.location");
  const qc = useQueryClient();
  const run = useAction(), toast = useToast();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const start = () => { setLink(locationUrl(u.location)); setOpen(true); };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const v = link.trim();
    if (v === locationUrl(u.location)) { setOpen(false); toast(t("same")); return; }
    void run(async () => {
      setBusy(true);
      try {
        await api.post(`/inventory/units/${u.id}/location`, { location: v });
        setOpen(false);
        await Promise.all([qc.invalidateQueries({ queryKey: ["unit"] }), qc.invalidateQueries({ queryKey: ["units"] })]);
      } finally { setBusy(false); }
    }, t("done"));
  };
  return (
    <>
      <button className="btn ghost sm" onClick={start}>{u.location ? t("edit") : t("add")}</button>
      {open && <Modal title={`${t("title")} · ${u.code}`} onClose={() => setOpen(false)}>
        <form className="grid" onSubmit={save}>
          <Field label={t("link")} wide><input type="url" dir="ltr" required value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://maps.app.goo.gl/…" /></Field>
          {u.location && <p className="hint wide">{t("current")} <LocationLink location={u.location} full /></p>}
          <div className="row end wide"><button className="btn" disabled={busy}>{t("save")}</button></div>
        </form>
      </Modal>}
    </>
  );
}
