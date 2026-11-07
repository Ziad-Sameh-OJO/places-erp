"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocTemplateView, DocumentsSetup, EntityView, StoredFile, UploadTicket } from "@places/contracts";
import { TEMPLATE_WORDS } from "@places/domain";
import { put } from "@/components/file-upload";
import { Card, Chip, Field, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";

const useSetup = () => useQuery({ queryKey: ["settings", "documents"], queryFn: () => api.get<DocumentsSetup>("/settings/documents") });

/** The demo shrinks the image before saving (stamp 420px PNG, logo 600px JPG on white) so every PDF stays light. */
async function uploadImage(file: File, max: number, mime: "image/png" | "image/jpeg", msg: { notImage: string; broken: string }): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error(msg.notImage);
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  const g = c.getContext("2d")!;
  if (mime === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error(msg.broken))), mime, 0.9));
  const t = await api.post<UploadTicket>("/files/uploads", { name: file.name.replace(/\.\w+$/, mime === "image/png" ? ".png" : ".jpg"), mime, size: blob.size });
  await put(t, blob, () => undefined);
  return (await api.post<StoredFile>(`/files/${t.id}/complete`)).id;
}

/** «الختم والإمضا» (12.12): the Super Admin uploads them; they go on every PDF the system prints. */
export function StampTab() {
  const t = useTranslations("settings.stamp");
  const tImg = useTranslations("settings.image");
  const { me } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const s = useSetup().data?.stamp;
  const su = !!me?.roles.includes("admin");
  const set = (kind: "stamp" | "signature", file: File | null) => run(async () => {
    await api.put("/settings/stamp", { kind, fileId: file ? await uploadImage(file, 420, "image/png", { notImage: tImg("notImage"), broken: tImg("broken") }) : null });
    await qc.invalidateQueries({ queryKey: ["settings", "documents"] });
  }, file ? t("uploaded") : t("removed"));
  const box = (kind: "stamp" | "signature", label: string) => (
    <Card title={label} icon="file" extra={s?.[kind] ? <Chip tone="ok">{t("hasFile")}</Chip> : <Chip>{t("notYet")}</Chip>}>
      <div className="brand-box">{s?.[kind] ? <img src={s[kind]!} alt={label} /> : <p className="hint">{t("none", { label })}</p>}</div>
      {su && <div className="row">
        <label className="btn ghost sm"><Icon name="upload" />{s?.[kind] ? t("change", { label }) : t("upload", { label })}<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void set(kind, f); }} /></label>
        {s?.[kind] && <button className="btn ghost sm" onClick={() => void set(kind, null)}><Icon name="x" />{t("remove")}</button>}
      </div>}
    </Card>
  );
  return (
    <>
      {su ? <Note>{t("note")}</Note>
        : <Note kind="warn">{t("adminOnly")}</Note>}
      <div className="cols">{box("signature", t("signature"))}{box("stamp", t("stamp"))}</div>
      {s?.at && <p className="hint">{t("lastChange", { by: s.by ?? "", at: day(s.at) })}</p>}
    </>
  );
}

/** «قوالب المستندات» (12.12): the entities claims go out under (logo + bank) and the claim / receipt templates. */
export function TemplatesTab() {
  const t = useTranslations("settings.templates");
  const { can, me } = useMe();
  const ed = can("master", "edit");
  const d = useSetup().data;
  // the bank details claims ask the client to pay into are the Super Admin's, like the stamp (M-13 2.2)
  const su = !!me?.roles.includes("admin");
  if (!d) return <p className="hint">{t("loading")}</p>;
  return (
    <>
      <h3 className="mini-h">{t("entitiesTitle")}</h3>
      <Note>{t("entitiesNote")}</Note>
      <div className="cols">{d.entities.map((e) => <EntityCard key={e.id} e={e} ed={su} />)}</div>
      <h3 className="mini-h">{t("title")}</h3>
      <Note>{t("wordsNote", { words: TEMPLATE_WORDS.map((w) => `{${w}}`).join(" ") })}</Note>
      <div className="cols">{d.templates.map((x) => <TemplateCard key={x.kind} t={x} ed={ed} />)}</div>
    </>
  );
}

function EntityCard({ e, ed }: { e: EntityView; ed: boolean }) {
  const t = useTranslations("settings.entity");
  const tImg = useTranslations("settings.image");
  const qc = useQueryClient();
  const run = useAction();
  const save = (patch: () => Promise<Partial<Pick<EntityView, "bank" | "accountName" | "accountNo" | "iban">> & { logoFileId?: string }>, ok: string) => run(async () => {
    await api.put(`/settings/entities/${e.id}`, { bank: e.bank, accountName: e.accountName, accountNo: e.accountNo, iban: e.iban, ...(await patch()) });
    await qc.invalidateQueries({ queryKey: ["settings", "documents"] });
  }, ok);
  const logo = (f: File) => save(async () => ({ logoFileId: await uploadImage(f, 600, "image/jpeg", { notImage: tImg("notImage"), broken: tImg("broken") }) }), t("logoChanged"));
  return (
    <Card title={e.name} icon="layers">
      <div className="brand-box">{e.logo ? <img src={e.logo} alt={e.name} /> : <p className="hint">{t("noLogo")}</p>}</div>
      {ed && <label className="btn ghost sm"><Icon name="upload" />{t("changeLogo")}<input type="file" accept="image/png,image/jpeg" hidden onChange={(x) => { const f = x.target.files?.[0]; x.target.value = ""; if (f) void logo(f); }} /></label>}
      <form className="grid" onSubmit={onFormSubmit((f) => save(async () => ({ bank: String(f.get("bank")), accountName: String(f.get("accountName")), accountNo: String(f.get("accountNo")), iban: String(f.get("iban")) }), t("saved")))}>
        {(["bank", "accountName", "accountNo", "iban"] as const).map((k) =>
          <Field key={k} label={t(k)}><input name={k} defaultValue={e[k]} disabled={!ed} dir={k === "accountNo" || k === "iban" ? "ltr" : undefined} /></Field>)}
        {ed && <div className="row end wide"><button className="btn sm">{t("save")}</button></div>}
      </form>
    </Card>
  );
}

function TemplateCard({ t, ed }: { t: DocTemplateView; ed: boolean }) {
  const tr = useTranslations("settings.template");
  const qc = useQueryClient();
  const run = useAction();
  const done = () => qc.invalidateQueries({ queryKey: ["settings", "documents"] });
  return (
    <Card title={tr(`kinds.${t.kind}`)} icon="file" extra={t.custom ? <Chip tone="ok">{tr("custom")}</Chip> : undefined}>
      {/* key: a reset brings the default text back into the fields */}
      <form key={`${t.title}${t.body}${t.closing}`} className="grid" onSubmit={onFormSubmit((f) => run(async () => { await api.put(`/settings/templates/${t.kind}`, { title: f.get("title"), body: f.get("body"), closing: f.get("closing") }); await done(); }, tr("saved")))}>
        <Field label={tr("titleField")} wide><input name="title" defaultValue={t.title} disabled={!ed} required /></Field>
        <Field label={tr("body")} wide><textarea name="body" rows={6} defaultValue={t.body} disabled={!ed} required /></Field>
        <Field label={tr("closing")} wide><textarea name="closing" rows={3} defaultValue={t.closing} disabled={!ed} /></Field>
        <div className="row end wide">
          {ed && t.custom && <button type="button" className="btn ghost sm" onClick={() => void run(async () => { await api.del(`/settings/templates/${t.kind}`); await done(); }, tr("resetDone"))}>{tr("reset")}</button>}
          <a className="btn ghost sm" href={`/api/v1/settings/templates/${t.kind}/preview`} target="_blank" rel="noreferrer"><Icon name="file" />{tr("preview")}</a>
          {ed && <button className="btn sm">{tr("save")}</button>}
        </div>
      </form>
    </Card>
  );
}
