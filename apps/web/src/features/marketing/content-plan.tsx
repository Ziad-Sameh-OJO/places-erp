"use client";
import { useNewParam } from "@/lib/new-param";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PostInput, PostRow } from "@places/contracts";
import { Chip, Field, Icon, Modal, Note, Table, onFormSubmit, useAction, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { dateLocale, dayTime } from "@/lib/format";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { useMe } from "@/lib/me";
import { useChannels } from "./use-campaigns";
import { PostMediaFolder, uploadPostMedia } from "./post-media";

type Tone = "ok" | "warn" | "acc" | "bad";
/** The demo's chip per state: متجدول · مستني موافقة · اتنشر, and «Reminder النهارده». */
/** The tone per state; the name is marketing.content.state.<state>. */
const STATE: Record<PostRow["state"], Tone> = { published: "ok", waiting: "warn", today: "bad", scheduled: "acc" };
/** Saturday first (demo calendar); names in marketing.content.week. */
const WEEK = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] as const;
const cairoDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const shift = (month: string, by: number) => { const [y, m] = month.split("-").map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 + by, 15)); return d.toISOString().slice(0, 7); };

/** The demo's «Content plan» tab: a month calendar or a list, the post's details, approve / «اتنشر», a new post. */
export function ContentPlan() {
  const t = useTranslations("marketing.content");
  const { can } = useMe();
  const [mode, setMode] = useState<"cal" | "list">("cal");
  const [month, setMonth] = useState(() => cairoDay(new Date().toISOString()).slice(0, 7));
  const [open, setOpen] = useState<PostRow | null>(null);
  const [creating, setCreating] = useState(false);
  useNewParam("post", () => setCreating(true), can("marketing", "create")); // «جديد ← بوست في الـ Content plan» (0.16)
  const posts = useQuery({ queryKey: ["posts", month], queryFn: () => api.get<PostRow[]>(`/marketing/posts?month=${month}`) });
  const items = posts.data ?? [];
  const label = new Date(`${month}-15T12:00:00Z`).toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });
  return (
    <>
      <div className="row">
        <div className="seg" role="group" aria-label={t("view")}>
          <button aria-pressed={mode === "cal"} onClick={() => setMode("cal")}><Icon name="calendar" />Calendar</button>
          <button aria-pressed={mode === "list"} onClick={() => setMode("list")}><Icon name="list" />{t("list")}</button>
        </div>
        <button className="round sm" onClick={() => setMonth(shift(month, -1))} aria-label={t("prevMonth")}>›</button>
        <b>{label}</b>
        <button className="round sm" onClick={() => setMonth(shift(month, 1))} aria-label={t("nextMonth")}>‹</button>
        <span className="spacer" />
        <div className="legend-inline"><Chip tone="acc">{t("state.scheduled")}</Chip><Chip tone="warn">{t("state.waiting")}</Chip><Chip tone="ok">{t("state.published")}</Chip></div>
        {can("marketing", "create") && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" />{t("post")}</button>}
      </div>
      {posts.error && <Note kind="warn">{posts.error.message}</Note>}
      {mode === "cal" ? <Calendar month={month} items={items} onOpen={setOpen} /> : (
        <Table head={[t("head.post"), "Channel", t("head.campaign"), t("head.at"), t("head.status"), ""]} empty={posts.isPending ? t("loading") : t("empty")}
          rows={items.map((p) => [
            <b key="t">{p.title}</b>, serverText(p.channel), p.campaign?.name ?? "—",
            <span key="a">{dayTime(p.at)}{p.publishedAt && <span className="sub">{t("publishedAt", { at: dayTime(p.publishedAt) })}</span>}</span>,
            <Chip key="s" tone={STATE[p.state]}>{t(`state.${p.state}`)}</Chip>,
            <PostActions key="x" p={p} />,
          ])} />
      )}
      <Note>{t("note")}</Note>
      {open && (
        <Modal title={open.title} onClose={() => setOpen(null)}>
          <dl className="kv">
            {([["Channel", serverText(open.channel)], [t("head.campaign"), open.campaign?.name ?? "—"], [t("head.at"), dayTime(open.at)], [t("head.status"), t(`state.${open.state}`)],
              [t("actuallyPublished"), open.publishedAt ? dayTime(open.publishedAt) : "—"], ...(open.description ? [[t("description"), open.description]] : [])] as [string, string][])
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <PostMediaFolder postId={open.id} />
          <div className="row end"><PostActions p={open} onDone={() => setOpen(null)} /></div>
        </Modal>
      )}
      {creating && <NewPost onClose={() => setCreating(false)} />}
    </>
  );
}

/** demo ui.js `U.calendar`: the week starts on Saturday; three posts a day, then «+n». */
function Calendar({ month, items, onOpen }: { month: string; items: PostRow[]; onOpen: (p: PostRow) => void }) {
  const t = useTranslations("marketing.content.week");
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 1) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = cairoDay(new Date().toISOString());
  const byDay = new Map<string, PostRow[]>();
  for (const p of items) { const k = cairoDay(p.at); byDay.set(k, [...(byDay.get(k) ?? []), p]); }
  return (
    <div className="cal">
      <div className="cal-head">{WEEK.map((w) => <span key={w}>{t(w)}</span>)}</div>
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
  const t = useTranslations("marketing.content.actions");
  const { can } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const act = (path: string, ok: string) => void run(async () => { await api.post(`/marketing/posts/${p.id}/${path}`); await qc.invalidateQueries({ queryKey: ["posts"] }); onDone?.(); }, ok);
  if (p.state === "published") return null;
  if (!p.approved) return can("marketing", "approve") ? <button className="btn sm" onClick={() => act("approve", t("approved"))}>{t("approve")}</button> : null;
  return can("marketing", "edit") ? <button className="btn ghost sm" onClick={() => act("published", t("publishedToast"))}>{t("published")}</button> : null;
}

/**
 * «بوست في الـ Content plan» (M-04 2.1 step 6): the post, channel, the publish time, the description, and its images /
 * videos (4.21). The campaign field is gone (demo 9 Nov); old posts keep theirs.
 */
function NewPost({ onClose }: { onClose: () => void }) {
  const t = useTranslations("marketing.content.new");
  const tm = useTranslations("marketing.content.media");
  const run = useAction();
  const toast = useToast();
  const qc = useQueryClient();
  const channels = useChannels().data ?? [];
  return (
    <Modal title={t("title")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const text = (k: string) => String(f.get(k) ?? "").trim();
        const files = f.getAll("media").filter((x): x is File => x instanceof File && x.size > 0);
        if (files.some((x) => !/^(image|video)\//.test(x.type))) throw new Error(tm("onlyMedia"));
        const body: PostInput = { title: text("title"), channel: text("channel"), at: text("at"), ...(text("description") ? { description: text("description") } : {}) };
        const { id } = await api.post<{ id: string }>("/marketing/posts", body);
        // the post is saved first; a failed upload leaves it scheduled, and «ضيف صورة / فيديو» in it tries again
        const n = await uploadPostMedia(id, files, tm("onlyMedia")).finally(() => qc.invalidateQueries({ queryKey: ["posts"] }));
        onClose();
        toast(n ? t("scheduledWith", { n }) : t("scheduled"));
      }))}>
        <Field label={t("post")} req wide><input name="title" required /></Field>
        <Field label="Channel"><select name="channel">{channels.map((c) => <option key={c} value={c}>{serverText(c)}</option>)}</select></Field>
        <Field label={t("at")} req wide><input name="at" type="datetime-local" required /></Field>
        <Field label={t("description")} wide><textarea name="description" /></Field>
        <Field label={t("media")} wide><input name="media" type="file" multiple accept="image/*,video/*" /></Field>
        <div className="row end wide"><button className="btn">{t("save")}</button></div>
      </form>
    </Modal>
  );
}
