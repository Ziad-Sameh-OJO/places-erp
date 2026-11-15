"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadRequest, type CompanyProfileAdmin, type CompanyProfileLatest, type DealLogoView, type StoredFile, type UploadTicket } from "@places/contracts";
import { Card, Chip, Icon, useAction } from "@/components/ui";
import { put } from "@/components/file-upload";
import { api } from "@/lib/api";
import { ago, day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";

const ADMIN = ["company-profile-admin"];
const LATEST = ["company-profile"];
const PREVIEW = "/api/v1/marketing/company-profile/preview";

export const useCompanyProfileAdmin = (enabled = true) => useQuery({ queryKey: ADMIN, queryFn: () => api.get<CompanyProfileAdmin>("/marketing/company-profile/admin"), enabled });

/** One file straight to storage, as the browser does everywhere: ask, PUT, complete. */
async function uploadOne(file: File, purpose?: "profile"): Promise<string> {
  const req = { name: file.name, mime: file.type, size: file.size, ...(purpose ? { purpose } : {}) };
  const check = UploadRequest.safeParse(req);
  if (!check.success) throw new Error(check.error.issues[0]!.message);
  const t = await api.post<UploadTicket>("/files/uploads", req);
  await put(t, file, () => undefined);
  return (await api.post<StoredFile>(`/files/${t.id}/complete`)).id;
}

/**
 * M-04 · Q26 · the Company Profile card on «الصفقات»: marketing's PDF, what «Update» would add, «شوف الشكل الجديد»
 * (the file + «عملاؤنا» page, nothing saved), «Update» (everyone gets it from now on), and the older versions.
 */
export function CompanyProfileCard() {
  const t = useTranslations("marketing.profile");
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const data = useCompanyProfileAdmin().data;
  const edit = can("marketing", "approve");
  const latest = data?.versions[0];
  const c = data?.changes;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ADMIN }), qc.invalidateQueries({ queryKey: LATEST })]);

  const upload = (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    void run(async () => {
      if (f.type !== "application/pdf") throw new Error(t("onlyPdf"));
      await api.put("/marketing/company-profile/file", { fileId: await uploadOne(f, "profile") });
      await refresh();
    }, t("uploaded")).finally(() => setBusy(false));
  };
  const publish = () => {
    setBusy(true);
    void run(async () => { await api.post("/marketing/company-profile/publish"); await refresh(); }, t("published")).finally(() => setBusy(false));
  };

  const summary = !data?.base ? t("noFile")
    : !c?.any ? t("upToDate")
    : [c.added && t("added", { n: c.added }), c.removed && t("removed", { n: c.removed }), c.newBase && t("newFile")].filter(Boolean).join(" · ");

  return (
    <Card title="Company Profile" icon="file" sub={t("sub")} className="cp-card"
      extra={latest ? <Chip tone="ok">{t("live", { when: ago(latest.at) })}</Chip> : <Chip tone="warn">{t("notLive")}</Chip>}>
      <div className="cp-row">
        <div className="cp-file">
          <span className="cp-ico"><Icon name="file" /></span>
          <div>
            <b>{data?.base ? data.base.name : t("noFileTitle")}</b>
            <small>{data?.base ? t("fileAt", { when: day(data.base.at) }) : t("noFileHint")}</small>
          </div>
          {edit && (
            <label className={`btn ghost sm ${busy ? "disabled" : ""}`}><Icon name="upload" />{data?.base ? t("replace") : t("upload")}
              <input type="file" accept="application/pdf" hidden disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          )}
        </div>
        <div className={`cp-state ${c?.any ? "on" : ""}`}>
          <Icon name={c?.any ? "sparkle" : "check"} />
          <span>{summary}</span>
        </div>
        <div className="row end cp-actions">
          {latest?.url && <a className="btn ghost sm" href={latest.url} target="_blank" rel="noopener noreferrer"><Icon name="file" />{t("open")}</a>}
          {data?.base && <a className="btn ghost sm" href={PREVIEW} target="_blank" rel="noopener noreferrer"><Icon name="play" />{t("preview")}</a>}
          {edit && <button type="button" className="btn sm" disabled={busy || !c?.any} onClick={publish}><Icon name="upload" />Update</button>}
        </div>
      </div>
      {data && data.versions.length > 0 && (
        <div className="cp-history">
          <button type="button" className="linkish" onClick={() => setHistory(!history)}>{history ? t("hideHistory") : t("history", { n: data.versions.length })}</button>
          {history && (
            <ol>
              {data.versions.map((v, i) => (
                <li key={v.id}>
                  <span className="mono">v{data.versions.length - i}</span>
                  <span>{day(v.at)} · {v.by}</span>
                  <span className="hint">{t("logos", { n: v.logos })}</span>
                  {i === 0 && <Chip tone="ok">{t("current")}</Chip>}
                  {v.download && <a href={v.download} download><Icon name="download" /></a>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}

/** A Done Deal's logo on «الصفقات»: upload (or replace), then Done = on «عملاؤنا» at the next Update; «شيل» takes it back. */
export function DealLogoCell({ dealId, logo, company }: { dealId: string; logo: DealLogoView | undefined; company: string }) {
  const t = useTranslations("marketing.profile.logo");
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const edit = can("marketing", "approve");
  const go = (fn: () => Promise<unknown>, done: string) => { setBusy(true); void run(async () => { await fn(); await qc.invalidateQueries({ queryKey: ADMIN }); }, done).finally(() => setBusy(false)); };
  const upload = (f: File | undefined) => f && go(async () => {
    if (!f.type.startsWith("image/")) throw new Error(t("onlyImage"));
    await api.put(`/marketing/company-profile/logos/${dealId}`, { fileId: await uploadOne(f) });
  }, t("uploaded"));

  const picker = (label: string) => edit && (
    <label className={`cp-up ${busy ? "disabled" : ""}`} title={label} aria-label={`${label} · ${company}`}>
      {logo ? <Icon name="swap" /> : <><Icon name="upload" /><span>{label}</span></>}
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
    </label>
  );

  if (!logo) return <div className="cp-logo">{picker(t("upload")) || "—"}</div>;
  return (
    <div className="cp-logo">
      <span className="cp-pic">{logo.url ? <img src={logo.url} alt={company} /> : <Icon name="image" />}</span>
      {picker(t("replace"))}
      {logo.done
        ? <>
          <Chip tone={logo.published ? "ok" : "info"}>{logo.published ? t("inProfile") : t("waiting")}</Chip>
          {edit && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => go(() => api.del(`/marketing/company-profile/logos/${dealId}/done`), t("removedToast"))}>{t("remove")}</button>}
        </>
        : edit && <button type="button" className="btn sm" disabled={busy} onClick={() => go(() => api.post(`/marketing/company-profile/logos/${dealId}/done`), t("doneToast"))}><Icon name="check" />Done</button>}
    </div>
  );
}

/** Home, for everyone: the newest Company Profile to open or save and send (nothing until marketing's first Update). */
export function CompanyProfileLink() {
  const t = useTranslations("marketing.profile.home");
  const latest = useQuery({ queryKey: LATEST, queryFn: () => api.get<CompanyProfileLatest>("/marketing/company-profile") }).data?.latest;
  if (!latest) return null;
  return (
    <Card title="Company Profile" icon="file" sub={t("sub", { when: day(latest.at) })}>
      <div className="row">
        {latest.url && <a className="btn ghost sm" href={latest.url} target="_blank" rel="noopener noreferrer"><Icon name="file" />{t("open")}</a>}
        {latest.download && <a className="btn sm" href={latest.download} download><Icon name="download" />{t("save")}</a>}
      </div>
    </Card>
  );
}
