"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostInput, PostRow } from "@places/contracts";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { useMe } from "@/lib/me";
import { useCampaigns, useChannels } from "./use-campaigns";

type Tone = "ok" | "warn" | "acc" | "bad";
/** The demo's chip per state: متجدول · مستني موافقة · اتنشر, and «Reminder النهارده». */
const STATE: Record<PostRow["state"], [Tone, string]> = { published: ["ok", "اتنشر"], waiting: ["warn", "مستني موافقة"], today: ["bad", "Reminder النهارده"], scheduled: ["acc", "متجدول"] };
const WEEK = ["سبت", "أحد", "اتنين", "تلات", "أربع", "خميس", "جمعة"];
const cairoDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const shift = (month: string, by: number) => { const [y, m] = month.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 + by, 15)); return d.toISOString().slice(0, 7); };

/** The demo's «Content plan» tab: a month calendar or a list, the post's details, approve / «اتنشر», a new post. */
export function ContentPlan() {
  const { can } = useMe();
  const [mode, setMode] = useState<"cal" | "list">("cal");
  const [month, setMonth] = useState(() => cairoDay(new Date().toISOString()).slice(0, 7));
  const [open, setOpen] = useState<PostRow | null>(null);
  const [creating, setCreating] = useState(false);
  const posts = useQuery({ queryKey: ["posts", month], queryFn: () => api.get<PostRow[]>(`/marketing/posts?month=${month}`) });
  const items = posts.data ?? [];
  const label = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  return (
    <>
      <div className="row">
        <div className="seg" role="group" aria-label="العرض">
          <button aria-pressed={mode === "cal"} onClick={() => setMode("cal")}><Icon name="calendar" />Calendar</button>
          <button aria-pressed={mode === "list"} onClick={() => setMode("list")}><Icon name="list" />قايمة</button>
        </div>
        <button className="round sm" onClick={() => setMonth(shift(month, -1))} aria-label="الشهر اللي فات">›</button>
        <b>{label}</b>
        <button className="round sm" onClick={() => setMonth(shift(month, 1))} aria-label="الشهر الجاي">‹</button>
        <span className="spacer" />
        <div className="legend-inline"><Chip tone="acc">متجدول</Chip><Chip tone="warn">مستني موافقة</Chip><Chip tone="ok">اتنشر</Chip></div>
        {can("marketing", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />بوست</button>}
      </div>
      {posts.error && <Note kind="warn">{posts.error.message}</Note>}
      {mode === "cal" ? <Calendar month={month} items={items} onOpen={setOpen} /> : (
        <Table head={["البوست", "Channel", "الكامبين", "الميعاد", "الحالة", ""]} empty={posts.isPending ? "بيحمّل…" : "مفيش بوستات في الشهر ده"}
          rows={items.map((p) => [
            <b key="t">{p.title}</b>, p.channel, p.campaign?.name ?? "—",
            <span key="a">{dayTime(p.at)}{p.publishedAt && <span className="sub">اتنشر {dayTime(p.publishedAt)}</span>}</span>,
            <Chip key="s" tone={STATE[p.state][0]}>{STATE[p.state][1]}</Chip>,
            <PostActions key="x" p={p} />,
          ])} />
      )}
      <Note>كل بوست له ميعاد نشر، والـ Reminder بيوصل في الميعاد، وبيتسجّل وقت النشر الفعلي. البوستات بتتراجع من مدير التسويق قبل ما تتنشر.</Note>
      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)}>
          <dl className="kv">
            {([["Channel", open.channel], ["الكامبين", open.campaign?.name ?? "—"], ["الميعاد", dayTime(open.at)], ["الحالة", STATE[open.state][1]],
              ["اتنشر فعلاً", open.publishedAt ? dayTime(open.publishedAt) : "—"], ...(open.description ? [["الوصف", open.description]] : [])] as [string, string][])
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="row end"><PostActions p={open} onDone={() => setOpen(null)} /></div>
        </Modal>
      )}
      {creating && <NewPost onClose={() => setCreating(false)} />}
    </>
  );
}

/** demo ui.js `U.calendar`: the week starts on Saturday; three posts a day, then «+n». */
function Calendar({ month, items, onOpen }: { month: string; items: PostRow[]; onOpen: (p: PostRow) => void }) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 1) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = cairoDay(new Date().toISOString());
  const byDay = new Map<string, PostRow[]>();
  for (const p of items) { const k = cairoDay(p.at); byDay.set(k, [...(byDay.get(k) ?? []), p]); }
  return (
    <div className="cal">
      <div className="cal-head">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-grid">
        {Array.from({ length: lead }, (_, i) => <div key={`o${i}`} className="cal-cell off" />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, "0")}`, list = byDay.get(iso) ?? [];
          return (
            <div key={iso} className={`cal-cell ${iso === today ? "today" : ""}`}>
              <span className="cal-d">{i + 1}</span>
              {list.slice(0, 3).map((p) => (
                <button key={p.id} className={`cal-item ${p.state === "published" ? "ok" : p.state === "waiting" ? "warn" : ""}`} title={p.title} onClick={() => onOpen(p)}>{p.title}</button>
              ))}
              {list.length > 3 && <small>+{list.length - 3}</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** demo `postActs`: the manager approves a waiting post; an approved one is marked «اتنشر» (its actual time). */
function PostActions({ p, onDone }: { p: PostRow; onDone?: () => void }) {
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const act = (path: string, ok: string) => void run(async () => { await api.post(`/marketing/posts/${p.id}/${path}`); await qc.invalidateQueries({ queryKey: ["posts"] }); onDone?.(); }, ok);
  if (p.state === "published") return null;
  if (!p.approved) return can("marketing", "approve") ? <button className="btn sm" onClick={() => act("approve", "البوست اتوافق عليه")}>موافقة</button> : null;
  return can("marketing", "edit") ? <button className="btn ghost sm" onClick={() => act("published", "اتسجّل وقت النشر")}>اتنشر</button> : null;
}

/** «بوست في الـ Content plan» (M-04 2.1 step 6): the design / video, channel, campaign, the publish time, the description. */
function NewPost({ onClose }: { onClose: () => void }) {
  const run = useAction();
  const qc = useQueryClient();
  const channels = useChannels().data ?? [];
  const campaigns = useCampaigns().data ?? [];
  return (
    <Modal title="بوست في الـ Content plan" onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const text = (k: string) => String(f.get(k) ?? "").trim();
        const body: PostInput = { title: text("title"), channel: text("channel"), at: text("at"), ...(text("campaignId") ? { campaignId: text("campaignId") } : {}), ...(text("description") ? { description: text("description") } : {}) };
        await api.post("/marketing/posts", body);
        await qc.invalidateQueries({ queryKey: ["posts"] });
        onClose();
      }, "البوست اتجدول"))}>
        <Field label="البوست (التصميم / الفيديو)" req wide><input name="title" required /></Field>
        <Field label="Channel"><select name="channel">{channels.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="الكامبين"><select name="campaignId"><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="ميعاد النشر" req wide><input name="at" type="datetime-local" required /></Field>
        <Field label="الوصف" wide><textarea name="description" /></Field>
        <div className="row end wide"><button className="btn">حفظ · هيجيلك Reminder في الميعاد</button></div>
      </form>
    </Modal>
  );
}
