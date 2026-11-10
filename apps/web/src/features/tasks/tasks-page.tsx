"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { TaskRow } from "@places/contracts";
import { TASK_SIDES, TASK_STATUSES, TASK_STATUS_LABEL, type TaskSide } from "@places/domain";
import { TeamTaskModal } from "@/features/inventory/team-tasks";
import { Kanban } from "@/components/blocks";
import { Avatar, Chip, Icon, Note, Tabs, useAction, useToast } from "@/components/ui";
import { day } from "@/lib/format";
import { useFields, useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { NewTask } from "./new-task";
import { TaskFolder } from "./task-folder";
import { useTaskActions, useTaskOptions, useTaskUnits, useTasks } from "./use-tasks";

type Tone = "" | "acc" | "info" | "warn" | "ok";
/** The demo's chip and icon per kind (tasks.js `KIND`). */
export const KIND_LOOK: Record<string, { tone: Tone; icon: "camera" | "image" | "clock" | "send" | "megaphone" | "check" }> = {
  photo: { tone: "acc", icon: "camera" }, retouch: { tone: "info", icon: "image" }, followup: { tone: "warn", icon: "clock" },
  toResale: { tone: "ok", icon: "send" }, marketing: { tone: "", icon: "megaphone" }, team: { tone: "info", icon: "check" },
};
/** The kind tabs (demo `KIND` order), shown only when the side has some; their words in tasks.kinds. */
const KIND_TABS = ["team", "photo", "retouch", "followup", "toResale", "marketing"] as const;
/** The words of each button (demo tasks.js `card`): the move a person makes, not the lane's name (tasks.moves, tasks.toasts). */
const MOVES = ["progress", "done", "uploaded", "todo"] as const;
const isMove = (s: string): s is (typeof MOVES)[number] => (MOVES as readonly string[]).includes(s);

/** The note on top of the board, per role (demo tasks.js): its key in tasks.roleNotes. */
function roleNote(roles: string[]): "marketing" | "photographer" | "designer" | "other" {
  if (roles.includes("marketing")) return "marketing";
  if (roles.includes("photographer")) return "photographer";
  if (roles.includes("designer")) return "designer";
  return "other";
}

/**
 * M-04 · المهام (demo tasks.js): tabs by kind, a filter by assignee, the four lanes, and the card's own buttons.
 * Dragging a card to another lane asks the API for that move; who may do what is the server's (taskMove).
 */
export function TasksPage() {
  const t = useTranslations("tasks");
  const { me, can } = useMe();
  const tasks = useTasks();
  const options = useTaskOptions(can("tasks", "create")).data;
  const { move } = useTaskActions();
  const run = useAction();
  const toast = useToast();
  const [kind, setKind] = useState("");
  const [to, setTo] = useState("");
  const [giving, setGiving] = useState<string | null>(null);
  // a notification links to one task («/tasks?id=…», task.new): it is marked on the board and scrolled to
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => { setFocus(new URLSearchParams(window.location.search).get("id")); }, []);
  useEffect(() => { if (focus && tasks.data) document.querySelector(".tcard.selected")?.scrollIntoView({ block: "center" }); }, [focus, tasks.data]);
  const [side, setSide] = useState<TaskSide>("team");
  const [teamTask, setTeamTask] = useState(false);
  const units = useTaskUnits("", teamTask).data ?? [];
  // 4.14 (demo `tkSide`): the two sides with their counts on top; the kind tabs below count the chosen side only
  const board = tasks.data ?? [];
  const all = board.filter((x) => x.side === side);
  const inKind = all.filter((x) => !kind || x.kind === kind);
  const list = inKind.filter((x) => !to || x.to.id === to);
  const people = [...new Map(all.map((x) => [x.to.id, x.to.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  const gives = (k: string) => options?.kinds.some((x) => x.key === k);

  const go = (task: TaskRow, status: string) => {
    if (task.status === status) return;
    if (status === "uploaded" && task.kind !== "retouch") { toast(t("retouchOnly")); return; }
    const approve = task.status === "uploaded";
    void run(() => move(task.id, status), approve ? (status === "done" ? t("approved") : t("returned")) : isMove(status) ? t(`toasts.${status}`) : undefined);
  };
  const lanes = TASK_STATUSES.map((s) => ({ key: s, title: serverText(TASK_STATUS_LABEL[s]), items: list.filter((x) => x.status === s) }));
  const tabs: [string, string, number][] = [["", t("all"), all.length], ...KIND_TABS.filter((k) => all.some((x) => x.kind === k)).map((k) => [k, t(`kinds.${k}`), all.filter((x) => x.kind === k).length] as [string, string, number])];
  const pickSide = (s: TaskSide) => { setSide(s); setKind(""); setTo(""); };

  return (
    <>
      <Note>{t(`roleNotes.${roleNote(me?.roles ?? [])}`)}</Note>
      <div className="row">
        <div className="seg" role="group" aria-label={t("sides.label")}>
          {TASK_SIDES.map((s) => (
            <button key={s} aria-pressed={side === s} onClick={() => pickSide(s)}>
              <Icon name={s === "team" ? "users" : "send"} /><span>{t(`sides.${s}`, { count: board.filter((x) => x.side === s).length })}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        {/* 2.16: Manar's daily task for her team, from here too (demo: inventory's «مهمة للفريق») */}
        {can("inventory", "approve") && <button className="btn" onClick={() => setTeamTask(true)}><Icon name="plus" />{t("give.team")}</button>}
      </div>
      <div className="row">
        <Tabs value={kind} onChange={setKind} items={tabs} />
        <span className="spacer" />
        {gives("photo") && <button className="btn ghost" onClick={() => setGiving("photo")}><Icon name="camera" />{t("give.photo")}</button>}
        {gives("retouch") && <button className="btn ghost" onClick={() => setGiving("retouch")}><Icon name="image" />{t("give.retouch")}</button>}
        {gives("toResale") && <button className="btn ghost" onClick={() => setGiving("toResale")}><Icon name="send" />{t("kinds.toResale")}</button>}
        {gives("marketing") && <button className="btn" onClick={() => setGiving("marketing")}><Icon name="plus" />{t("give.marketing")}</button>}
      </div>
      {people.length > 1 && (
        <div className="toolbar">
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("assignee")}>
            <option value="">{t("allAssignees")}</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
      )}
      {tasks.error && <Note kind="warn">{tasks.error.message}</Note>}
      <Kanban lanes={lanes} itemKey={(x) => x.id} cardClass={(x) => `${x.late ? "late" : ""} ${x.id === focus ? "selected" : ""}`}
        {...(can("tasks", "edit") ? { onMove: go } : {})}
        card={(x) => <TaskCard t={x} onMove={(s) => go(x, s)} />} />
      {giving && <NewTask kind={giving} options={options} onClose={() => setGiving(null)} />}
      {teamTask && <TeamTaskModal units={units} onClose={() => { setTeamTask(false); void tasks.refetch(); }} />}
    </>
  );
}

function TaskCard({ t, onMove }: { t: TaskRow; onMove: (status: string) => void }) {
  const tr = useTranslations("tasks.card");
  const look = KIND_LOOK[t.kind] ?? { tone: "" as Tone, icon: "megaphone" as const };
  const u = t.unit;
  const fields = useFields("tasks"); // M-09: a hidden owner, number or note comes blank from the API; the place line goes too
  return (
    <>
      <div className="row">
        <Chip tone={look.tone}>{serverText(t.kindLabel)}</Chip><span className="spacer" />
        <span className={`hint ${t.late ? "bad-t" : ""}`}><Icon name="calendar" />{day(t.dueOn)}</span>
      </div>
      <b>{t.title ?? (u ? `${u.code} · ${u.project}` : "—")}</b>
      {u && (
        <span className="hint">
          {fields.shows("place") && tr("place", { area: u.area, floor: String(u.floor || "—"), building: String(u.building || "—") })}{u.ownerName ? ` · ${u.ownerName}` : ""} {u.ownerPhone && <span className="mono">{u.ownerPhone}</span>}
        </span>
      )}
      {u && t.can.folder.open && <TaskFolder task={{ ...t, unit: u }} />}
      {t.sla && <SlaLine sla={t.sla} kind={t.kind} />}
      {t.note && <span className="hint">{t.note}</span>}
      {t.returned > 0 && <span className="hint warn-t">{tr("returned", { count: t.returned })}</span>}
      <div className="row">
        {t.by ? <Avatar id={t.by.id} name={t.by.name} sm /> : <span className="hint">{tr("system")}</span>}
        <span className="hint">{tr("arrow")}</span><Avatar id={t.to.id} name={t.to.name} sm /><span className="hint">{t.to.name}</span>
      </div>
      {t.can.moves.length > 0 && (
        <div className="row" onClick={(e) => e.stopPropagation()}>
          {t.can.moves.map((s) => <MoveButton key={s} t={t} to={s} onMove={onMove} />)}
        </div>
      )}
    </>
  );
}

/** M-12: the shoot's 72 h from the unit's registration, the Retouch's 48 h — met / missed once Done, else the hours left. */
function SlaLine({ sla, kind }: { sla: NonNullable<TaskRow["sla"]>; kind: string }) {
  const t = useTranslations("tasks.sla");
  const hours = kind === "photo" ? 72 : 48;
  if (sla.met !== null) return <span className="row"><Chip tone={sla.met ? "ok" : "bad"}>{sla.met ? t("met", { hours }) : t("missed", { hours })}</Chip></span>;
  return sla.hoursLeft >= 0
    ? <span className={`hint ${sla.hoursLeft < 12 ? "warn-t" : ""}`}><Icon name="clock" />{t("left", { left: sla.hoursLeft, hours })}</span>
    : <span className="hint bad-t"><Icon name="clock" />{t("late", { late: -sla.hoursLeft, hours })}</span>;
}

/** The demo's buttons: Retouch waiting → «موافقة» / «رجّعها»; Done → Undo; otherwise «ابدأ» / «Done». */
function MoveButton({ t, to, onMove }: { t: TaskRow; to: string; onMove: (status: string) => void }) {
  const tr = useTranslations("tasks");
  if (t.status === "uploaded") {
    return to === "done"
      ? <button className="btn sm" onClick={() => onMove("done")}><Icon name="check" />{tr("approve")}</button>
      : <button className="btn ghost sm" onClick={() => onMove("todo")}>{tr("sendBack")}</button>;
  }
  if (to === "todo") return t.status === "done" ? <button className="btn ghost sm" onClick={() => onMove("todo")}><Icon name="undo" />Undo</button> : null;
  if (to === "uploaded") return <button className="btn sm" onClick={() => onMove("uploaded")}><Icon name="upload" />{tr("moves.uploaded")}</button>;
  return <button className={`btn sm ${to === "progress" ? "ghost" : ""}`} onClick={() => onMove(to)}>{isMove(to) ? tr(`moves.${to}`) : to}</button>;
}
