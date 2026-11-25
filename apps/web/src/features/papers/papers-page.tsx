"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import type { PaperOptions, PaperRow, StoredFile, TemplateCard, TemplateView } from "@places/contracts";
import { managesTemplates } from "@places/domain";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { Card, Chip, Empty, Field, Icon, Modal, Note, Table, Tabs, onFormSubmit, useAction, useToast } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import { MultiPick } from "@/features/leads/multi-pick";

type Tab = "request" | "mine" | "approvals" | "templates";
const KEY = ["papers"] as const;
const TONE = { pending: "warn", approved: "ok", ready: "ok", rejected: "bad" } as const;

/** A checkbox with its words beside it (the house «tog», as the inventory's filters). */
const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="tog"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
);

/** Opens the filled Word file (a short link from the API, as an attachment). */
async function download(id: string) {
  const { url } = await api.get<{ url: string }>(`/papers/${id}/file`);
  window.location.href = url;
}

/**
 * «المستندات» (client, 25 Nov): pick a document, fill its blanks, download the Word file; «مستنداتي» keeps everything
 * issued; the approvers decide what waits for them; the Super Admin and the Office Manager set the templates up.
 */
export function PapersPage() {
  const t = useTranslations("papers");
  const { me } = useMe();
  const manages = managesTemplates(me?.roles ?? []);
  const [tab, setTab] = useState<Tab>("request");
  const [adding, setAdding] = useState(false);
  const linked = useSearchParams().get("tab");
  const router = useRouter();
  const approvals = useQuery({ queryKey: [...KEY, "approvals"], queryFn: () => api.get<PaperRow[]>("/papers/approvals") });
  const waiting = approvals.data?.filter((d) => d.status === "pending").length ?? 0;
  // the notification «مستند مستني موافقتك» opens «/papers?tab=approvals», also when the page is already open (it stays
  // mounted); the param is dropped once read, so the same link works again
  useEffect(() => {
    if (linked !== "approvals" && linked !== "mine" && linked !== "templates") return;
    setTab(linked);
    router.replace("/papers", { scroll: false });
  }, [linked, router]);
  const items: [Tab, string, number?][] = [["request", t("tabs.request")], ["mine", t("tabs.mine")],
    ...(approvals.data?.length ? [["approvals", t("tabs.approvals"), waiting || undefined] as [Tab, string, number?]] : []),
    ...(manages ? [["templates", t("tabs.templates")] as [Tab, string]] : [])];
  return (
    <>
      <div className="row"><Tabs<Tab> items={items} value={tab} onChange={setTab} /></div>
      {tab === "request" && <Request onIssued={() => setTab("mine")} onNewTemplate={manages ? () => { setTab("templates"); setAdding(true); } : undefined} />}
      {tab === "mine" && <Mine />}
      {tab === "approvals" && <Approvals rows={approvals.data ?? []} />}
      {tab === "templates" && manages && <Templates adding={adding} setAdding={setAdding} />}
    </>
  );
}

function Request({ onIssued, onNewTemplate }: { onIssued: () => void; onNewTemplate?: (() => void) | undefined }) {
  const t = useTranslations("papers");
  const q = useQuery({ queryKey: [...KEY, "cards"], queryFn: () => api.get<TemplateCard[]>("/papers/templates") });
  const [open, setOpen] = useState<TemplateCard | null>(null);
  if (!q.data) return <Empty text={t("loading")} icon="clock" />;
  // a manager's first visit: what the page is for, and where templates come from
  if (!q.data.length) return (
    <Card>
      <Empty text={onNewTemplate ? t("request.firstTime") : t("request.none")} icon="folder" />
      {onNewTemplate && <div className="row" style={{ justifyContent: "center" }}><button className="btn" onClick={onNewTemplate}><Icon name="plus" />{t("templates.new")}</button></div>}
    </Card>
  );
  return (
    <>
      <div className="paper-cards">
        {q.data.map((c) => (
          <button key={c.id} type="button" className="paper-card" onClick={() => setOpen(c)}>
            <Icon name="file" /><b>{c.name}</b>
            <small className="hint">{t("request.fields", { count: c.fields.length })}{c.mode === "approve" && ` · ${t("request.needsApproval")}`}</small>
          </button>
        ))}
      </div>
      {open && <Fill card={open} onClose={() => setOpen(null)} onIssued={onIssued} />}
    </>
  );
}

function Fill({ card, values = {}, onClose, onIssued }: { card: TemplateCard; values?: Record<string, string>; onClose: () => void; onIssued: () => void }) {
  const t = useTranslations("papers");
  const qc = useQueryClient();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={card.name} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((d) => {
        setBusy(true);
        void run(async () => {
          try {
            const row = await api.post<PaperRow>("/papers", { templateId: card.id, values: Object.fromEntries(card.fields.map((f) => [String(f.id), String(d.get(`f${f.id}`) ?? "")])) });
            await qc.invalidateQueries({ queryKey: KEY });
            onClose(); onIssued();
            if (row.canDownload) await download(row.id);
          } finally { setBusy(false); }
        }, card.mode === "approve" ? t("fill.sent") : t("fill.ready"));
      })}>
        {card.mode === "approve" && <div className="wide"><Note>{t("fill.approveNote")}</Note></div>}
        {card.fields.map((f) => (
          <Field key={f.id} label={f.label} wide><input name={`f${f.id}`} defaultValue={values[String(f.id)] ?? ""} maxLength={2000} /></Field>
        ))}
        {!card.fields.length && <p className="hint wide">{t("fill.noFields")}</p>}
        <p className="hint wide">{t("fill.emptyHint")}</p>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={onClose}>{t("cancel")}</button>
          <button className="btn" disabled={busy}><Icon name="download" />{card.mode === "approve" ? t("fill.send") : t("fill.make")}</button>
        </div>
      </form>
    </Modal>
  );
}

function Mine() {
  const t = useTranslations("papers");
  const run = useAction();
  const q = useQuery({ queryKey: [...KEY, "mine"], queryFn: () => api.get<PaperRow[]>("/papers/mine") });
  const [again, setAgain] = useState<PaperRow | null>(null);
  const cards = useQuery({ queryKey: [...KEY, "cards"], queryFn: () => api.get<TemplateCard[]>("/papers/templates") });
  if (!q.data) return <Empty text={t("loading")} icon="clock" />;
  const card = again && cards.data?.find((c) => c.id === again.template.id);
  return (
    <Card title={t("tabs.mine")} icon="folder" sub={t("mine.sub")}>
      <Table head={[t("cols.code"), t("cols.doc"), t("cols.status"), t("cols.date"), t("cols.values"), ""]} empty={t("mine.empty")}
        rows={q.data.map((d) => [
          <span key="c" className="mono">{d.code}</span>, <b key="n">{d.template.name}</b>, <Status key="s" d={d} />, day(d.createdAt),
          <small key="v" className="hint">{d.values.map((v) => `${v.label}: ${v.value}`).join(" · ")}</small>,
          <span key="a" className="row">
            {d.canDownload && <button className="btn ghost sm" onClick={() => void run(() => download(d.id))}><Icon name="download" />{t("download")}</button>}
            {cards.data?.some((c) => c.id === d.template.id) && <button className="btn ghost sm" onClick={() => setAgain(d)}><Icon name="undo" />{t("mine.again")}</button>}
          </span>,
        ])} />
      {again && card && <Fill card={card} values={valuesOf(card, again)} onClose={() => setAgain(null)} onIssued={() => setAgain(null)} />}
    </Card>
  );
}

/**
 * «استخدمه تاني»: the old values back in the form, field by field — by id (two blanks may share a label, «التاريخ»),
 * by label only if the document came from another template.
 */
const valuesOf = (card: TemplateCard, d: PaperRow) =>
  Object.fromEntries(card.fields.flatMap((f) => {
    const v = d.template.id === card.id ? d.values.find((x) => x.id === f.id) : d.values.find((x) => x.label === f.label);
    return v ? [[String(f.id), v.value]] : [];
  }));

function Status({ d }: { d: PaperRow }) {
  const t = useTranslations("papers.status");
  return (
    <span>
      <Chip tone={TONE[d.status]}>{t(d.status)}</Chip>
      {d.decidedBy && <small className="hint"> {t("by", { name: d.decidedBy })}</small>}
      {d.note && <small className="hint"> · {d.note}</small>}
    </span>
  );
}

function Approvals({ rows }: { rows: PaperRow[] }) {
  const t = useTranslations("papers");
  const qc = useQueryClient();
  const run = useAction();
  const [rejecting, setRejecting] = useState<PaperRow | null>(null);
  const decide = (d: PaperRow, approve: boolean, note?: string) => void run(async () => {
    await api.post(`/papers/${d.id}/decide`, { approve, ...(note ? { note } : {}) });
    await qc.invalidateQueries({ queryKey: KEY });
    setRejecting(null);
  }, approve ? t("approvals.approved") : t("approvals.rejected"));
  return (
    <Card title={t("tabs.approvals")} icon="check" sub={t("approvals.sub")}>
      <Table head={[t("cols.code"), t("cols.doc"), t("cols.by"), t("cols.date"), t("cols.values"), t("cols.status"), ""]} empty={t("approvals.empty")}
        rows={rows.map((d) => [
          <span key="c" className="mono">{d.code}</span>, <b key="n">{d.template.name}</b>, d.by.name, day(d.createdAt),
          <small key="v" className="hint">{d.values.map((v) => `${v.label}: ${v.value}`).join(" · ")}</small>, <Status key="s" d={d} />,
          <span key="a" className="row">
            <button className="btn ghost sm" onClick={() => void run(() => download(d.id))}><Icon name="download" />{t("approvals.read")}</button>
            {d.status === "pending" && <>
              <button className="btn sm" onClick={() => decide(d, true)}><Icon name="check" />{t("approvals.approve")}</button>
              <button className="btn ghost sm" onClick={() => setRejecting(d)}><Icon name="x" />{t("approvals.reject")}</button>
            </>}
          </span>,
        ])} />
      {rejecting && (
        <Modal title={t("approvals.rejectTitle", { code: rejecting.code })} onClose={() => setRejecting(null)}>
          <form className="grid" onSubmit={onFormSubmit((f) => decide(rejecting, false, String(f.get("note") ?? "").trim()))}>
            <Field label={t("approvals.why")} req wide><textarea name="note" required maxLength={500} rows={3} /></Field>
            <div className="row end wide"><button className="btn"><Icon name="x" />{t("approvals.reject")}</button></div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

function Templates({ adding, setAdding }: { adding: boolean; setAdding: (v: boolean) => void }) {
  const t = useTranslations("papers");
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: [...KEY, "manage"], queryFn: () => api.get<TemplateView[]>("/papers/templates/manage") });
  const [editing, setEditing] = useState<{ v: TemplateView; fresh: boolean } | null>(null);
  return (
    <Card title={t("tabs.templates")} icon="folder" sub={t("templates.sub")} extra={<button className="btn sm" onClick={() => setAdding(true)}><Icon name="plus" />{t("templates.new")}</button>}>
      {!q.data ? <Empty text={t("loading")} icon="clock" /> : (
        <Table head={[t("cols.doc"), t("templates.fieldsCol"), t("templates.modeCol"), t("templates.issued"), t("cols.status"), ""]} empty={t("templates.empty")}
          rows={q.data.map((x) => [
            <b key="n">{x.name}</b>, String(x.fields.filter((f) => !f.skip).length), t(`templates.mode.${x.mode}`), String(x.issued),
            <Chip key="s" tone={x.active ? "ok" : ""}>{x.active ? t("templates.on") : t("templates.off")}</Chip>,
            <span key="a" className="row">
              <button className="btn ghost sm" onClick={() => setEditing({ v: x, fresh: false })}><Icon name="filter" />{t("templates.setup")}</button>
              <button className="btn ghost sm" onClick={() => void run(async () => { const { url } = await api.get<{ url: string }>(`/papers/templates/${x.id}/file`); window.location.href = url; })}><Icon name="download" />{t("templates.file")}</button>
            </span>,
          ])} />
      )}
      {adding && <NewTemplate onClose={() => setAdding(false)} onCreated={(v) => { setAdding(false); setEditing({ v, fresh: true }); void qc.invalidateQueries({ queryKey: KEY }); }} />}
      {editing && <Setup v={editing.v} fresh={editing.fresh} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function NewTemplate({ onClose, onCreated }: { onClose: () => void; onCreated: (v: TemplateView) => void }) {
  const t = useTranslations("papers.templates");
  const run = useAction();
  const [file, setFile] = useState<StoredFile | null>(null);
  return (
    <Modal title={t("new")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((d) => void run(async () => {
        if (!file) throw new Error(t("needFile"));
        onCreated(await api.post<TemplateView>("/papers/templates", { name: String(d.get("name") ?? "").trim(), fileId: file.id }));
      }))}>
        <Field label={t("name")} req wide><input name="name" required minLength={2} maxLength={80} placeholder={t("namePh")} /></Field>
        <div className="wide"><FileUpload kind="word" onUploaded={setFile} /></div>
        <div className="wide"><Note>{t("howTo")}</Note></div>
        <div className="row end wide"><button className="btn" disabled={!file}><Icon name="check" />{t("create")}</button></div>
      </form>
    </Modal>
  );
}

/** Everything about one template: the names of its fields, who issues it, «بلّغ بس» or «لازم موافقة», the stamp. */
function Setup({ v, fresh, onClose }: { v: TemplateView; fresh: boolean; onClose: () => void }) {
  const t = useTranslations("papers.templates");
  const qc = useQueryClient();
  const run = useAction();
  const toast = useToast();
  const opts = useQuery({ queryKey: [...KEY, "options"], queryFn: () => api.get<PaperOptions>("/papers/templates/options") });
  const [fields, setFields] = useState(v.fields);
  const [s, setS] = useState({ seeRoles: v.seeRoles, seeUserIds: v.seeUserIds.join(","), mode: v.mode, approverIds: v.approverIds.join(","), notifyIds: v.notifyIds.join(","), stamp: v.stamp, active: fresh || v.active });
  const ids = (x: string) => (x ? x.split(",") : []);
  const save = (name: string) => void run(async () => {
    await api.put(`/papers/templates/${v.id}`, { name, fields: fields.map((f) => ({ id: f.id, label: f.label, skip: f.skip })), seeRoles: s.seeRoles, seeUserIds: ids(s.seeUserIds), mode: s.mode,
      approverIds: ids(s.approverIds), notifyIds: ids(s.notifyIds), stamp: s.stamp, active: s.active });
    await qc.invalidateQueries({ queryKey: KEY });
    onClose();
  }, t("saved"));
  const archive = () => confirm(t("archiveConfirm", { name: v.name })) && void run(async () => { await api.del(`/papers/templates/${v.id}`); await qc.invalidateQueries({ queryKey: KEY }); onClose(); toast(t("archived")); });
  const people = opts.data?.people ?? [];
  return (
    <Modal title={t("setupOf", { name: v.name })} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((d) => save(String(d.get("name") ?? "").trim()))}>
        {!v.active && <div className="wide"><Note kind="warn">{t(fresh ? "draftNew" : "draft")}</Note></div>}
        <Field label={t("name")} req wide><input name="name" required minLength={2} maxLength={80} defaultValue={v.name} /></Field>
        <div className="wide paper-fields">
          <b>{t("fields")}</b>
          <p className="hint">{t("fieldsHint")}</p>
          {!fields.length && <Note kind="warn">{t("noFields")}</Note>}
          {fields.map((f, i) => (
            <div key={f.id} className={`paper-field ${f.skip ? "off" : ""}`}>
              <small className="hint">{t("context", { n: f.id, text: f.context })}</small>
              <div className="row">
                <input value={f.label} disabled={f.skip} maxLength={80} aria-label={t("fieldName", { n: f.id })}
                  onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Check label={t("skip")} checked={f.skip} onChange={(skip) => setFields(fields.map((x, j) => (j === i ? { ...x, skip } : x)))} />
              </div>
            </div>
          ))}
        </div>
        <div className="wide">
          <b>{t("who")}</b>
          <p className="hint">{t("whoHint")}</p>
          <div className="row wrap">{opts.data?.roles.map((r) => (
            <Check key={r.key} label={r.name} checked={s.seeRoles.includes(r.key)} onChange={(on) => setS({ ...s, seeRoles: on ? [...s.seeRoles, r.key] : s.seeRoles.filter((x) => x !== r.key) })} />
          ))}</div>
          <MultiPick label={t("seePeople")} all={t("seePeopleAll")} picked={s.seeUserIds} options={people} onChange={(x) => setS({ ...s, seeUserIds: x })} />
        </div>
        <div className="wide">
          <b>{t("modeTitle")}</b>
          <div className="seg" role="group" aria-label={t("modeTitle")}>
            {(["notify", "approve"] as const).map((m) => <button key={m} type="button" aria-pressed={s.mode === m} onClick={() => setS({ ...s, mode: m })}>{t(`mode.${m}`)}</button>)}
          </div>
          {s.mode === "approve" && <Field label={t("approvers")} req wide><MultiPick label={t("approvers")} all={t("pick")} picked={s.approverIds} options={people} onChange={(x) => setS({ ...s, approverIds: x })} /></Field>}
          <Field label={t("notify")} wide><MultiPick label={t("notify")} all={t("nobody")} picked={s.notifyIds} options={people} onChange={(x) => setS({ ...s, notifyIds: x })} /></Field>
        </div>
        <div className="wide">
          <Check label={t("stamp")} checked={s.stamp} onChange={(stamp) => setS({ ...s, stamp })} />
          <p className="hint">{v.marks.stamp || v.marks.signature ? t("stampHas", { what: [v.marks.stamp && t("stampWord"), v.marks.signature && t("signatureWord")].filter(Boolean).join(" · ") }) : t("stampHow")}</p>
          <Check label={t("active")} checked={s.active} onChange={(active) => setS({ ...s, active })} />
        </div>
        <div className="row end wide">
          <button type="button" className="btn ghost" onClick={archive}><Icon name="x" />{t("archive")}</button>
          <span className="spacer" />
          <button className="btn"><Icon name="check" />{t("save")}</button>
        </div>
      </form>
    </Modal>
  );
}
