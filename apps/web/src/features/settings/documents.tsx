"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DocTemplateView, DocumentsSetup, EntityView, StoredFile, UploadTicket } from "@places/contracts";
import { TEMPLATE_WORDS } from "@places/domain";
import { put } from "@/components/file-upload";
import { Card, Chip, Field, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";

const useSetup = () => useQuery({ queryKey: ["settings", "documents"], queryFn: () => api.get<DocumentsSetup>("/settings/documents") });

/** The demo shrinks the image before saving (stamp 420px PNG, logo 600px JPG on white) so every PDF stays light. */
async function uploadImage(file: File, max: number, mime: "image/png" | "image/jpeg"): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("ارفع صورة PNG أو JPG");
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  const g = c.getContext("2d")!;
  if (mime === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("الصورة مش سليمة"))), mime, 0.9));
  const t = await api.post<UploadTicket>("/files/uploads", { name: file.name.replace(/\.\w+$/, mime === "image/png" ? ".png" : ".jpg"), mime, size: blob.size });
  await put(t, blob, () => undefined);
  return (await api.post<StoredFile>(`/files/${t.id}/complete`)).id;
}

/** «الختم والإمضا» (12.12): the Super Admin uploads them; they go on every PDF the system prints. */
export function StampTab() {
  const { me } = useMe();
  const qc = useQueryClient();
  const run = useAction();
  const s = useSetup().data?.stamp;
  const su = !!me?.roles.includes("admin");
  const set = (kind: "stamp" | "signature", file: File | null) => run(async () => {
    await api.put("/settings/stamp", { kind, fileId: file ? await uploadImage(file, 420, "image/png") : null });
    await qc.invalidateQueries({ queryKey: ["settings", "documents"] });
  }, file ? "اترفع · هيظهر على كل الملفات" : "اتشال");
  const box = (kind: "stamp" | "signature", label: string) => (
    <Card title={label} icon="file" extra={s?.[kind] ? <Chip tone="ok">مرفوع</Chip> : <Chip>لسه</Chip>}>
      <div className="brand-box">{s?.[kind] ? <img src={s[kind]!} alt={label} /> : <p className="hint">مفيش {label} لسه</p>}</div>
      {su && <div className="row">
        <label className="btn ghost sm"><Icon name="upload" />{s?.[kind] ? "غيّر" : "ارفع"} {label}<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void set(kind, f); }} /></label>
        {s?.[kind] && <button className="btn ghost sm" onClick={() => void set(kind, null)}><Icon name="x" />شيل</button>}
      </div>}
    </Card>
  );
  return (
    <>
      {su ? <Note>الإمضا والختم اللي بترفعهم هنا بيتحطوا على أي ملف بيطلع من السيستم (السندات، والـ TCR، وكشوف الحساب، والقيود، وورق الموظفين) لما يتطبع أو يتحفظ PDF. يُفضّل صورة PNG بخلفية شفافة.</Note>
        : <Note kind="warn">الختم والإمضا بيرفعهم الـ Super Admin بس.</Note>}
      <div className="cols">{box("signature", "الإمضا")}{box("stamp", "الختم")}</div>
      {s?.at && <p className="hint">آخر تعديل: {s.by} · {day(s.at)}</p>}
    </>
  );
}

/** «قوالب المستندات» (12.12): the entities claims go out under (logo + bank) and the claim / receipt templates. */
export function TemplatesTab() {
  const { can } = useMe();
  const ed = can("master", "edit");
  const d = useSetup().data;
  if (!d) return <p className="hint">بيحمّل…</p>;
  return (
    <>
      <h3 className="mini-h">الجهات اللي بتطلع باسمها المطالبات</h3>
      <Note>اللوجو بيظهر فوق المطالبة والإيصال، وبيانات البنك بتتكتب في المطالبة عشان العميل يحوّل عليها.</Note>
      <div className="cols">{d.entities.map((e) => <EntityCard key={e.id} e={e} ed={ed} />)}</div>
      <h3 className="mini-h">القوالب</h3>
      <Note>الكلمات اللي بين {"{}"} بتتملي لوحدها: {TEMPLATE_WORDS.map((w) => `{${w}}`).join(" ")}. الختم والإمضا بيتحطوا لوحدهم وقت الطباعة.</Note>
      <div className="cols">{d.templates.map((t) => <TemplateCard key={t.kind} t={t} ed={ed} />)}</div>
    </>
  );
}

function EntityCard({ e, ed }: { e: EntityView; ed: boolean }) {
  const qc = useQueryClient();
  const run = useAction();
  const save = (patch: () => Promise<Partial<Pick<EntityView, "bank" | "accountName" | "accountNo" | "iban">> & { logoFileId?: string }>, ok: string) => run(async () => {
    await api.put(`/settings/entities/${e.id}`, { bank: e.bank, accountName: e.accountName, accountNo: e.accountNo, iban: e.iban, ...(await patch()) });
    await qc.invalidateQueries({ queryKey: ["settings", "documents"] });
  }, ok);
  const logo = (f: File) => save(async () => ({ logoFileId: await uploadImage(f, 600, "image/jpeg") }), "اتغيّر اللوجو");
  return (
    <Card title={e.name} icon="layers">
      <div className="brand-box">{e.logo ? <img src={e.logo} alt={e.name} /> : <p className="hint">مفيش لوجو لسه</p>}</div>
      {ed && <label className="btn ghost sm"><Icon name="upload" />غيّر اللوجو<input type="file" accept="image/png,image/jpeg" hidden onChange={(x) => { const f = x.target.files?.[0]; x.target.value = ""; if (f) void logo(f); }} /></label>}
      <form className="grid" onSubmit={onFormSubmit((f) => save(async () => ({ bank: String(f.get("bank")), accountName: String(f.get("accountName")), accountNo: String(f.get("accountNo")), iban: String(f.get("iban")) }), "اتحفظ"))}>
        {([["bank", "البنك"], ["accountName", "اسم الحساب"], ["accountNo", "رقم الحساب"], ["iban", "IBAN"]] as const).map(([k, l]) =>
          <Field key={k} label={l}><input name={k} defaultValue={e[k]} disabled={!ed} dir={k === "accountNo" || k === "iban" ? "ltr" : undefined} /></Field>)}
        {ed && <div className="row end wide"><button className="btn sm">احفظ</button></div>}
      </form>
    </Card>
  );
}

function TemplateCard({ t, ed }: { t: DocTemplateView; ed: boolean }) {
  const qc = useQueryClient();
  const run = useAction();
  const done = () => qc.invalidateQueries({ queryKey: ["settings", "documents"] });
  return (
    <Card title={t.kind === "claim" ? "قالب المطالبة" : "قالب إيصال استلام النقدية"} icon="file" extra={t.custom ? <Chip tone="ok">متعدّل</Chip> : undefined}>
      {/* key: a reset brings the default text back into the fields */}
      <form key={`${t.title}${t.body}${t.closing}`} className="grid" onSubmit={onFormSubmit((f) => run(async () => { await api.put(`/settings/templates/${t.kind}`, { title: f.get("title"), body: f.get("body"), closing: f.get("closing") }); await done(); }, "اتحفظ القالب"))}>
        <Field label="العنوان" wide><input name="title" defaultValue={t.title} disabled={!ed} required /></Field>
        <Field label="النص" wide><textarea name="body" rows={6} defaultValue={t.body} disabled={!ed} required /></Field>
        <Field label="الختام" wide><textarea name="closing" rows={3} defaultValue={t.closing} disabled={!ed} /></Field>
        <div className="row end wide">
          {ed && t.custom && <button type="button" className="btn ghost sm" onClick={() => void run(async () => { await api.del(`/settings/templates/${t.kind}`); await done(); }, "رجع للقالب الافتراضي")}>رجّع الافتراضي</button>}
          <a className="btn ghost sm" href={`/api/v1/settings/templates/${t.kind}/preview`} target="_blank" rel="noreferrer"><Icon name="file" />شوف شكلها</a>
          {ed && <button className="btn sm">احفظ</button>}
        </div>
      </form>
    </Card>
  );
}
