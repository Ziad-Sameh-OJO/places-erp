"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { MAX_LIST_UNITS, type ListOfOptionsInput } from "@places/contracts";
import { Field, Icon, Modal, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * M-03 6.1 «list of options as pdf»: the units picked in the sheet go out as one file for a client — the full deck of
 * each (cover, building, specs, inside photos) or the short one (the slide's specs and photos), as PDF or PowerPoint,
 * with the client's name on the cover. The API builds it in the client's design and checks every unit.
 */
export function ListOfOptionsBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const t = useTranslations("inventory.listOfOptions");
  const [open, setOpen] = useState(false);
  const many = ids.length > MAX_LIST_UNITS;
  // on <body>, like the leads' bulk bar: the page's entrance animation would carry a fixed bar inside it
  return createPortal(
    <>
      <div className="bulk" role="toolbar" aria-label={t("bar")}>
        <b className="num">{ids.length}</b><span>{t("picked", { count: ids.length })}</span>
        <button className="btn sm" disabled={many} title={many ? t("tooMany", { max: String(MAX_LIST_UNITS) }) : undefined} onClick={() => setOpen(true)}><Icon name="file" />{t("make")}</button>
        <button className="btn ghost sm" onClick={onClear}>{t("clear")}</button>
      </div>
      {open && <ListOfOptionsModal ids={ids} onClose={() => setOpen(false)} />}
    </>,
    document.body,
  );
}

function ListOfOptionsModal({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const t = useTranslations("inventory.listOfOptions");
  const run = useAction();
  const [kind, setKind] = useState<ListOfOptionsInput["kind"]>("pdf");
  const [format, setFormat] = useState<ListOfOptionsInput["format"]>("pdf");
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const make = () => {
    setBusy(true);
    const body: ListOfOptionsInput = { unitIds: ids, kind, format, ...(client.trim() ? { client: client.trim() } : {}) };
    void run(async () => {
      try { await api.download("/inventory/unit-lists", `List of options.${format}`, body); onClose(); } finally { setBusy(false); }
    }, t("done"));
  };
  return (
    <Modal title={t("title", { n: String(ids.length), count: ids.length })} onClose={onClose}>
      <Field label={t("kind")}>
        <div className="seg" role="group" aria-label={t("kind")}>
          <button type="button" aria-pressed={kind === "pdf"} onClick={() => setKind("pdf")}>{t("full")}</button>
          <button type="button" aria-pressed={kind === "slide"} onClick={() => setKind("slide")}>{t("short")}</button>
        </div>
      </Field>
      <p className="hint">{kind === "pdf" ? t("fullHint") : t("shortHint")}</p>
      <Field label={t("format")}>
        <div className="seg" role="group" aria-label={t("format")}>
          <button type="button" aria-pressed={format === "pdf"} onClick={() => setFormat("pdf")}>PDF</button>
          <button type="button" aria-pressed={format === "pptx"} onClick={() => setFormat("pptx")}>PowerPoint</button>
        </div>
      </Field>
      <Field label={t("client")}>
        <input value={client} maxLength={120} placeholder={t("clientHint")} onChange={(e) => setClient(e.target.value)} />
      </Field>
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>{t("cancel")}</button>
        <button className="btn" disabled={busy} onClick={make}><Icon name="download" />{busy ? t("making") : t("download")}</button>
      </div>
    </Modal>
  );
}
