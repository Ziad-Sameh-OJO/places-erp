"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import type { UnitRow } from "@places/contracts";
import { Chip, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";

/**
 * 4.13 · the demo's unitWebAd: marketing's «Website Ads» cell, Yes (the ad is on the website) or No; a press switches
 * it, and the tooltip says when and by whom it was marked (the API audits every switch).
 */
export function WebsiteAdCell({ u }: { u: UnitRow }) {
  const t = useTranslations("inventory.webAd");
  const qc = useQueryClient();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const ad = u.websiteAd ?? null;
  const posted = !!ad;
  const flip = () => void run(async () => {
    setBusy(true);
    try {
      await api.post(`/inventory/units/${u.id}/website-ad`, { posted: !posted });
      await Promise.all([qc.invalidateQueries({ queryKey: ["units"] }), qc.invalidateQueries({ queryKey: ["unit"] })]);
    } finally { setBusy(false); }
  }, `${u.code}: Website Ads ${posted ? "No" : "Yes"}`);
  const title = ad ? t("posted", { day: day(ad.at), by: ad.by ? ` · ${ad.by.name}` : "" }) : t("notPosted");
  return (
    <button type="button" className="lnk web-ad" title={title} aria-label={title} disabled={busy} onClick={(e) => { e.stopPropagation(); flip(); }}>
      {posted ? <Chip tone="ok">Yes</Chip> : <Chip tone="warn">No</Chip>}
    </button>
  );
}
