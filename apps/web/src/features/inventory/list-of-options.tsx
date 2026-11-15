"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { MAX_LIST_UNITS, UploadRequest, type LeadRow, type ListOfOptionsInput, type Paged, type StoredFile, type UploadTicket } from "@places/contracts";
import { put } from "@/components/file-upload";
import { Field, Icon, Modal, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";

/**
 * M-03 6.1 «list of options as pdf»: the units picked in the sheet go out as one file for a client — the full deck of
 * each (cover, building, specs, inside photos) or the short one (the slide's specs and photos), as PDF or PowerPoint,
 * with the client's name on the cover. The API builds it in the client's design and checks every unit.
 */
type Known = ReadonlyMap<string, { code: string; project: string; space: number }>;

export function ListOfOptionsBar({ ids, units, onClear }: { ids: string[]; units: Known; onClear: () => void }) {
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
      {open && <ListOfOptionsModal ids={ids} units={units} onClose={() => setOpen(false)} />}
    </>,
    document.body,
  );
}

function ListOfOptionsModal({ ids, units, onClose }: { ids: string[]; units: Known; onClose: () => void }) {
  const t = useTranslations("inventory.listOfOptions");
  // the order the client sees them in: «OPTION 1, 2…» in the file (client, 15 Nov); starts as picked
  const [order, setOrder] = useState(ids);
  const move = (i: number, by: -1 | 1) => setOrder((o) => { const n = [...o]; [n[i], n[i + by]] = [n[i + by]!, n[i]!]; return n; });
  const run = useAction();
  const [kind, setKind] = useState<ListOfOptionsInput["kind"]>("pdf");
  const [format, setFormat] = useState<ListOfOptionsInput["format"]>("pdf");
  const [client, setClient] = useState("");
  // 14.9 · the client from the salesperson's own leads (optional): the list is recorded on that lead too
  const { me, can } = useMe();
  const [leadQ, setLeadQ] = useState(""), [leadSearch, setLeadSearch] = useState("");
  const [lead, setLead] = useState<LeadRow | null>(null);
  useEffect(() => { const h = setTimeout(() => setLeadSearch(leadQ.trim()), 300); return () => clearTimeout(h); }, [leadQ]);
  const leads = useQuery({
    queryKey: ["leads", "list-of-options", leadSearch, me?.employeeId],
    queryFn: () => api.get<Paged<LeadRow>>(`/leads?pageSize=20${leadSearch ? `&q=${encodeURIComponent(leadSearch)}` : ""}${me?.employeeId ? `&assignedToId=${me.employeeId}` : ""}`),
    enabled: can("leads", "edit"),
  });
  const leadOptions = [...(lead ? [lead] : []), ...(leads.data?.items ?? []).filter((l) => l.id !== lead?.id)];
  // the client company's logo for the cover (optional, client 15 Nov): previewed here, uploaded on «نزّل الملف»
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const pickLogo = (f: File | undefined) => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    setLogo(f ?? null);
    setLogoUrl(f ? URL.createObjectURL(f) : null);
  };
  const uploadLogo = async (f: File): Promise<string> => {
    const req = { name: f.name, mime: f.type, size: f.size };
    const check = UploadRequest.safeParse(req);
    if (!check.success || !f.type.startsWith("image/")) throw new Error(check.success ? t("logoImage") : check.error.issues[0]!.message);
    const tk = await api.post<UploadTicket>("/files/uploads", req);
    await put(tk, f, () => undefined);
    return (await api.post<StoredFile>(`/files/${tk.id}/complete`)).id;
  };
  const [busy, setBusy] = useState(false);
  const make = () => {
    setBusy(true);
    void run(async () => {
      try {
        const body: ListOfOptionsInput = { unitIds: order, kind, format, ...(client.trim() ? { client: client.trim() } : {}), ...(logo ? { clientLogoFileId: await uploadLogo(logo) } : {}) };
        await api.download(lead ? `/leads/${lead.id}/options-list` : "/inventory/unit-lists", `List of options.${format}`, body);
        onClose();
      } finally { setBusy(false); }
    }, lead ? t("doneOnLead", { name: lead.name }) : t("done"));
  };
  return (
    <Modal title={t("title", { n: String(ids.length), count: ids.length })} onClose={onClose}>
      <Field label={t("order")}>
        <ol className="lo-order">
          {order.map((id, i) => {
            const u = units.get(id);
            return (
              <li key={id}>
                <span className="lo-n num">{i + 1}</span>
                <span className="lo-u"><b className="mono">{u?.code ?? "—"}</b>{u && <small>{u.project}{u.space ? ` · ${u.space} م²` : ""}</small>}</span>
                <span className="lo-mv">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("up", { code: u?.code ?? "" })}>↑</button>
                  <button type="button" className="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={t("down", { code: u?.code ?? "" })}>↓</button>
                </span>
              </li>
            );
          })}
        </ol>
        <small className="hint">{t("orderHint")}</small>
      </Field>
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
      {can("leads", "edit") && <Field label={t("lead")}>
        <div className="search"><Icon name="search" /><input type="search" value={leadQ} onChange={(e) => setLeadQ(e.target.value)} placeholder={t("leadSearch")} aria-label={t("leadSearch")} /></div>
        <select value={lead?.id ?? ""} aria-label={t("lead")} onChange={(e) => setLead(leadOptions.find((l) => l.id === e.target.value) ?? null)}>
          <option value="">{t("noLead")}</option>
          {leadOptions.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.code}</option>)}
        </select>
        <small className="hint">{t("leadHint")}</small>
      </Field>}
      <Field label={t("client")}>
        <input value={client} maxLength={120} placeholder={lead?.name ?? t("clientHint")} onChange={(e) => setClient(e.target.value)} />
      </Field>
      <Field label={t("logo")}>
        <div className="lo-logo">
          {logoUrl ? <span className="lo-logo-pic"><img src={logoUrl} alt={t("logo")} /></span> : null}
          <label className="btn ghost sm"><Icon name="upload" />{logo ? t("logoChange") : t("logoPick")}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {logo && <button type="button" className="btn ghost sm" onClick={() => pickLogo(undefined)}><Icon name="x" />{t("logoRemove")}</button>}
          <small className="hint">{t("logoHint")}</small>
        </div>
      </Field>
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>{t("cancel")}</button>
        <button className="btn" disabled={busy} onClick={make}><Icon name="download" />{busy ? t("making") : t("download")}</button>
      </div>
    </Modal>
  );
}
