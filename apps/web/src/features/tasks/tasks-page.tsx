"use client";
import { useState } from "react";
import type { TaskRow } from "@places/contracts";
import { TASK_STATUSES, TASK_STATUS_LABEL } from "@places/domain";
import { Kanban } from "@/components/blocks";
import { Avatar, Chip, Icon, Note, Tabs, useAction, useToast } from "@/components/ui";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { NewTask } from "./new-task";
import { useTaskActions, useTaskOptions, useTasks } from "./use-tasks";

type Tone = "" | "acc" | "info" | "warn" | "ok";
/** The demo's chip and icon per kind (tasks.js `KIND`). */
export const KIND_LOOK: Record<string, { tone: Tone; icon: "camera" | "image" | "clock" | "send" | "megaphone" }> = {
  photo: { tone: "acc", icon: "camera" }, retouch: { tone: "info", icon: "image" }, followup: { tone: "warn", icon: "clock" },
  toResale: { tone: "ok", icon: "send" }, marketing: { tone: "", icon: "megaphone" },
};
const KIND_TABS: [string, string][] = [["photo", "تصوير"], ["retouch", "Retouch"], ["followup", "متابعة مع المالك"], ["toResale", "ابديت للبيع"], ["marketing", "تسويق"]];
/** The words of each button (demo tasks.js `card`): the move a person makes, not the lane's name. */
const MOVE_LABEL: Record<string, string> = { progress: "ابدأ", done: "Done", uploaded: "رفعت الصور على السيستم", todo: "Undo" };
const DONE_TOAST: Record<string, string> = { done: "Done", uploaded: "اتبعتت لمنار توافق", progress: "In Progress", todo: "رجعت للمهام" };

/** The note on top of the board, per role (demo tasks.js). */
function roleNote(roles: string[]): string {
  if (roles.includes("marketing")) return "رحمة بتشوف كل مهام المصوّر حتى اللي منار ورندا بيدّوها.";
  if (roles.includes("photographer")) return "منار بتدّيك وحدة في اليوم ورندا بتدّيك وحدة. بيانات الوحدة بتوصلك مع المهمة.";
  if (roles.includes("designer")) return "ارفع الصور بعد الـ Retouch على صفحة الوحدة في السيستم. المهمة مبتبقاش Done غير لما منار توافق.";
  return "اسحب الكارت بين الأعمدة عشان تغيّر حالته.";
}

/**
 * M-04 · المهام (demo tasks.js): tabs by kind, a filter by assignee, the four lanes, and the card's own buttons.
 * Dragging a card to another lane asks the API for that move; who may do what is the server's (taskMove).
 */
export function TasksPage() {
  const { me, can } = useMe();
  const tasks = useTasks();
  const options = useTaskOptions(can("tasks", "create")).data;
  const { move } = useTaskActions();
  const run = useAction();
  const toast = useToast();
  const [kind, setKind] = useState("");
  const [to, setTo] = useState("");
  const [giving, setGiving] = useState<string | null>(null);
  const all = tasks.data ?? [];
  const inKind = all.filter((t) => !kind || t.kind === kind);
  const list = inKind.filter((t) => !to || t.to.id === to);
  const people = [...new Map(all.map((t) => [t.to.id, t.to.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  const gives = (k: string) => options?.kinds.some((x) => x.key === k);

  const go = (t: TaskRow, status: string) => {
    if (t.status === status) return;
    if (status === "uploaded" && t.kind !== "retouch") { toast("العمود ده لمهام الـ Retouch بس"); return; }
    const approve = t.status === "uploaded";
    void run(() => move(t.id, status), approve ? (status === "done" ? "اتوافق على الـ Retouch" : "رجعت للمصمم للتعديل") : DONE_TOAST[status]);
  };
  const lanes = TASK_STATUSES.map((s) => ({ key: s, title: TASK_STATUS_LABEL[s], items: list.filter((t) => t.status === s) }));
  const tabs: [string, string, number][] = [["", "الكل", all.length], ...KIND_TABS.map(([k, l]) => [k, l, all.filter((t) => t.kind === k).length] as [string, string, number])];

  return (
    <>
      <Note>{roleNote(me?.roles ?? [])}</Note>
      <div className="row">
        <Tabs value={kind} onChange={setKind} items={tabs} />
        <span className="spacer" />
        {gives("photo") && <button className="btn ghost" onClick={() => setGiving("photo")}><Icon name="camera" />مهمة تصوير</button>}
        {gives("retouch") && <button className="btn ghost" onClick={() => setGiving("retouch")}><Icon name="image" />مهمة Retouch</button>}
        {gives("toResale") && <button className="btn ghost" onClick={() => setGiving("toResale")}><Icon name="send" />ابديت للبيع</button>}
        {gives("marketing") && <button className="btn" onClick={() => setGiving("marketing")}><Icon name="plus" />مهمة تسويق</button>}
      </div>
      {people.length > 1 && (
        <div className="toolbar">
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="المسؤول">
            <option value="">كل المسؤولين</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      )}
      {tasks.error && <Note kind="warn">{tasks.error.message}</Note>}
      <Kanban lanes={lanes} itemKey={(t) => t.id} cardClass={(t) => (t.late ? "late" : "")}
        {...(can("tasks", "edit") ? { onMove: go } : {})}
        card={(t) => <TaskCard t={t} onMove={(s) => go(t, s)} />} />
      {giving && <NewTask kind={giving} options={options} onClose={() => setGiving(null)} />}
    </>
  );
}

function TaskCard({ t, onMove }: { t: TaskRow; onMove: (status: string) => void }) {
  const look = KIND_LOOK[t.kind] ?? { tone: "" as Tone, icon: "megaphone" as const };
  const u = t.unit;
  return (
    <>
      <div className="row">
        <Chip tone={look.tone}>{t.kindLabel}</Chip><span className="spacer" />
        <span className={`hint ${t.late ? "bad-t" : ""}`}><Icon name="calendar" />{day(t.dueOn)}</span>
      </div>
      <b>{t.title ?? (u ? `${u.code} · ${u.project}` : "—")}</b>
      {u && (
        <span className="hint">
          {u.area} · الدور {u.floor || "—"} · مبنى {u.building || "—"}{u.ownerName ? ` · ${u.ownerName}` : ""} {u.ownerPhone && <span className="mono">{u.ownerPhone}</span>}
        </span>
      )}
      {t.note && <span className="hint">{t.note}</span>}
      {t.returned > 0 && <span className="hint warn-t">رجعت للتعديل {t.returned} مرة</span>}
      <div className="row">
        {t.by ? <Avatar id={t.by.id} name={t.by.name} sm /> : <span className="hint">السيستم</span>}
        <span className="hint">←</span><Avatar id={t.to.id} name={t.to.name} sm /><span className="hint">{t.to.name}</span>
      </div>
      {t.can.moves.length > 0 && (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          {t.can.moves.map((s) => <MoveButton key={s} t={t} to={s} onMove={onMove} />)}
        </div>
      )}
    </>
  );
}

/** The demo's buttons: Retouch waiting → «موافقة» / «رجّعها»; Done → Undo; otherwise «ابدأ» / «Done». */
function MoveButton({ t, to, onMove }: { t: TaskRow; to: string; onMove: (status: string) => void }) {
  if (t.status === "uploaded") {
    return to === "done"
      ? <button className="btn sm" onClick={() => onMove("done")}><Icon name="check" />موافقة</button>
      : <button className="btn ghost sm" onClick={() => onMove("todo")}>رجّعها</button>;
  }
  if (to === "todo") return t.status === "done" ? <button className="btn ghost sm" onClick={() => onMove("todo")}><Icon name="undo" />Undo</button> : null;
  if (to === "uploaded") return <button className="btn sm" onClick={() => onMove("uploaded")}><Icon name="upload" />{MOVE_LABEL.uploaded}</button>;
  return <button className={`btn sm ${to === "progress" ? "ghost" : ""}`} onClick={() => onMove(to)}>{MOVE_LABEL[to]}</button>;
}
