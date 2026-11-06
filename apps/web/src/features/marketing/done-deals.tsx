"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FILE_KINDS, UploadRequest, type MarketingDeal, type Paged, type StoredFile, type UploadTicket } from "@places/contracts";
import { put } from "@/components/file-upload";
import { Icon, Note, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { useMe } from "@/lib/me";

const KEY = ["marketing-deals"];
// the demo lists every Done Deal on one page; 100 is the API's page cap
export const useMarketingDeals = () => useQuery({ queryKey: KEY, queryFn: () => api.get<Paged<MarketingDeal>>("/deals/marketing?pageSize=100") });

/** Upload → finish → attach: the API takes only a finished upload of the caller's own (0.9). */
async function uploadLogo(dealId: string, file: File) {
  const req = { name: file.name, mime: file.type, size: file.size };
  const check = UploadRequest.safeParse(req);
  if (!check.success) throw new Error(check.error.issues[0]!.message);
  if (!(FILE_KINDS.image.mimes as readonly string[]).includes(file.type)) throw new Error("لازم صورة");
  const t = await api.post<UploadTicket>("/files/uploads", req);
  await put(t, file, () => undefined);
  const f = await api.post<StoredFile>(`/files/${t.id}/complete`);
  await api.put(`/deals/marketing/${dealId}/logo`, { fileId: f.id });
}

/**
 * The demo's «الصفقات» tab (4.9 · M-02 2.1 (7) · Q26): a Done Deal shows here once the Office Manager approves it,
 * with only the allowed fields — the Buyer, company, type, space and location — and marketing attaches its logo.
 */
export function DoneDeals() {
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const deals = useMarketingDeals();
  const [busy, setBusy] = useState<string | null>(null);
  const attach = (d: MarketingDeal, file: File) => {
    setBusy(d.id);
    void run(async () => { await uploadLogo(d.id, file); await qc.invalidateQueries({ queryKey: KEY }); }, "الـ Logo اترفع على الديل").finally(() => setBusy(null));
  };
  const open = (d: MarketingDeal) => void run(async () => {
    const { url } = await api.get<{ url: string }>(`/deals/marketing/${d.id}/logo`);
    window.open(url, "_blank", "noopener");
  });
  const logo = (d: MarketingDeal) => {
    if (d.logo) return <button type="button" className="lnk" onClick={() => open(d)}><Icon name="image" />{d.logo.name}</button>;
    if (!can("marketing", "edit")) return "—";
    return (
      <label className="btn ghost sm" aria-disabled={busy === d.id}>
        <Icon name="upload" />{busy === d.id ? "بيترفع…" : "ارفع Logo"}
        <input type="file" accept={FILE_KINDS.image.mimes.join(",")} hidden disabled={busy !== null} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) attach(d, f); }} />
      </label>
    );
  };
  return (
    <>
      <Note>الـ Done Deals بتظهر هنا بعد موافقة الـ Office Manager. مسموح تشوفي: الـ location، والمساحة، واسم الشركة، والـ type، واسم الـ Buyer بس، وتقدري ترفقي Logo لكل ديل.</Note>
      {deals.error && <Note kind="warn">{deals.error.message}</Note>}
      <Table
        head={["الـ Buyer", "الشركة", "Type", "المساحة", "Location", "Logo"]}
        empty="مفيش صفقات لسه"
        rows={(deals.data?.items ?? []).map((d) => [
          <b key="b">{d.buyer}</b>, d.company || "—", d.type || "—", <span key="s" className="n">{num(d.space)} م</span>, d.location || "—", logo(d),
        ])}
      />
    </>
  );
}
