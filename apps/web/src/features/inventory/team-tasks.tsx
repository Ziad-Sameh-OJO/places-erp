"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { TeamMember, TeamTaskView, UnitRow } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";

const CAP = 30; // domain TEAM_TASKS_PER_DAY (the API refuses the 31st)

/**
 * 2.16 · «مهمة للفريق» (demo invwork.js teamTask): Manar picks who (with today's count out of 30), the task and the unit;
 * under it, what she gave today and what's still open.
 */
export function TeamTaskModal({ units, onClose }: { units: Pick<UnitRow, "id" | "code" | "project">[]; onClose: () => void }) {
  const t = useTranslations("inventory.teamTasks");
  const qc = useQueryClient();
  const run = useAction();
  const team = useQuery({ queryKey: ["team-tasks", "team"], queryFn: () => api.get<TeamMember[]>("/inventory/team-tasks/team") }).data ?? [];
  const given = useQuery({ queryKey: ["team-tasks", "given"], queryFn: () => api.get<TeamTaskView[]>("/inventory/team-tasks") }).data ?? [];
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    void run(async () => {
      try {
        await api.post("/inventory/team-tasks", { toUserId: f.get("to"), title: f.get("title"), unitId: f.get("unit") || undefined });
        form.reset();
        await qc.invalidateQueries({ queryKey: ["team-tasks"] });
      } finally { setBusy(false); }
    }, t("sent"));
  };
  return (
    <Modal title={t("title")} onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Field label={t("to")} req>
          <select name="to" required>{team.map((p) => <option key={p.id} value={p.id} disabled={!p.room}>{t("member", { name: p.name, today: p.today, cap: CAP })}</option>)}</select>
        </Field>
        <Field label={t("task")} req><input name="title" required maxLength={300} placeholder={t("taskExample")} /></Field>
        <Field label={t("unit")}>
          <select name="unit"><option value="">—</option>{units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.project}</option>)}</select>
        </Field>
        <div className="row end wide"><button className="btn" disabled={busy || !team.length}><Icon name="send" />{t("send")}</button></div>
      </form>
      {!!given.length && <TaskLines tasks={given} who="to" />}
    </Modal>
  );
}

function TaskLines({ tasks, who, onDone }: { tasks: TeamTaskView[]; who: "to" | "by"; onDone?: (t: TeamTaskView) => void }) {
  const tr = useTranslations("inventory.teamTasks");
  return (
    <div>
      {tasks.map((t) => (
        <div key={t.id} className="line-item">
          <span>{t.status === "done" ? <Chip tone="ok">{tr("done")}</Chip> : <Chip tone="warn">{tr("waiting")}</Chip>} {t.title}{t.unit && <span className="mono"> · {t.unit.code}</span>}</span>
          <span className="hint">{who === "to" ? t.to.name : tr("from", { name: t.by.name })} · {dayTime(t.createdAt)}</span>
          {onDone && t.status !== "done" && <button className="btn sm" onClick={() => onDone(t)}><Icon name="check" />{tr("done")}</button>}
        </div>
      ))}
    </div>
  );
}

/** Home (Randa / Sara / Marwa): «مهمة من منار: …» with «خلصت» (demo invInbox). Nothing when there are none. */
export function MyTeamTasks() {
  const tr = useTranslations("inventory.teamTasks");
  const qc = useQueryClient();
  const run = useAction();
  const tasks = useQuery({ queryKey: ["team-tasks", "mine"], queryFn: () => api.get<TeamTaskView[]>("/inventory/team-tasks/mine") }).data ?? [];
  if (!tasks.length) return null;
  const done = (t: TeamTaskView) => void run(async () => {
    await api.post(`/inventory/team-tasks/${t.id}/done`);
    await qc.invalidateQueries({ queryKey: ["team-tasks", "mine"] });
  }, tr("markedDone"));
  return (
    <Card title={tr("fromManar")} icon="check" sub={tr("waitingCount", { count: tasks.filter((t) => t.status !== "done").length })}>
      <TaskLines tasks={tasks} who="by" onDone={done} />
    </Card>
  );
}
