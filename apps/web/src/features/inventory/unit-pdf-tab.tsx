"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { UnitDetail, UnitPdfPreview } from "@places/contracts";
import { Chip, Icon, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * 2.8 · 2.23 · the demo's «PDF & slide» tab: the PDF and the slide in the client's design, each also as PowerPoint (made
 * by the system from the sheet and the Pic & Info photos, nobody edits them), and Manar's «Confirm وانشره للسيلز» (Q15).
 * Any edit sends it back (Q19).
 */
export function UnitPdfTab({ u, canConfirm }: { u: UnitDetail; canConfirm: boolean }) {
  const t = useTranslations("inventory.pdf");
  const qc = useQueryClient();
  const base = `/api/v1/inventory/units/${u.id}`;
  const run = useAction();
  const confirm = () => void run(async () => {
    await api.post(`/inventory/units/${u.id}/pdf/confirm`);
    await Promise.all([qc.invalidateQueries({ queryKey: ["unit"] }), qc.invalidateQueries({ queryKey: ["units"] })]);
  }, t("published"));
  return (
    <>
      <DeckPreview u={u} />
      <div className="row">
        <a className="btn" href={`${base}/pdf`} target="_blank" rel="noopener noreferrer"><Icon name="file" />{t("openPdf")}</a>
        <a className="btn ghost" href={`${base}/pdf/pptx`}><Icon name="download" />{t("pdfPptx")}</a>
        <a className="btn ghost" href={`${base}/slide`} target="_blank" rel="noopener noreferrer"><Icon name="board" />{t("openSlide")}</a>
        <a className="btn ghost" href={`${base}/slide/pptx`}><Icon name="download" />{t("slidePptx")}</a>
      </div>
      <Note>{t("note")}</Note>
      {u.pdfStatus === "draft" && canConfirm
        ? <button className="btn" onClick={confirm}><Icon name="check" />{t("confirm")}</button>
        : u.pdfStatus === "draft" ? <Chip tone="warn">{t("waiting")}</Chip> : <Chip tone="ok">{t("published2")}</Chip>}
    </>
  );
}

/**
 * 2.25 · the demo's deckPreview: the PDF's cover and specs page, small, side by side. The API draws them from the unit
 * as it is now, so the key follows its last edit (and any ["unit"] refresh, like the photos', fetches them again).
 */
function DeckPreview({ u }: { u: UnitDetail }) {
  const t = useTranslations("inventory.pdf");
  const q = useQuery({ queryKey: ["unit", u.id, "preview", u.updatedAt, u.photoCount], queryFn: () => api.get<UnitPdfPreview>(`/inventory/units/${u.id}/pdf/preview`) });
  return (
    <div className="b-mini" aria-label={t("preview")}>
      {q.data?.pages.map((html, i) => <MiniPage key={i} html={html} />)}
    </div>
  );
}

/** One 1280 × 720 page scaled to the tile's width; sandboxed (no scripts, nothing reaches the app). */
function MiniPage({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="b-mini-pg" ref={box}>
      <iframe srcDoc={html} sandbox="" tabIndex={-1} aria-hidden="true" title="" style={{ transform: `scale(${scale})` }} />
    </div>
  );
}
