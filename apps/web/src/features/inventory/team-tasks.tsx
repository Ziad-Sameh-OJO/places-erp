"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TeamMember, TeamTaskView, UnitRow } from "@places/contracts";
import { Card, Chip, Field, Icon, Modal, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";

const CAP = 30; // domain TEAM_TASKS_PER_DAY (the API refuses the 31st)

/**
 * 2.16 · «مهمة للفريق» (demo invwork.js teamTask): Manar picks who (with today's count out of 30), the task and the unit;
 * under it, what she gave today and what's still open.
 */
export function TeamTaskModal({ units, onClose }: { units: UnitRow[]; onClose: () => void }) {
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
    }, "المهمة اتبعتت");
  };
  return (
    <Modal title="مهمة لفريق الانفنتوري" onClose={onClose}>
      <form className="grid" onSubmit={submit}>
        <Field label="لمين" req>
          <select name="to" required>{team.map((p) => <option key={p.id} value={p.id} disabled={!p.room}>{p.name} · النهارده {p.today} من {CAP}</option>)}</select>
        </Field>
        <Field label="المهمة" req><input name="title" required maxLength={300} placeholder="مثلاً: ارفعي صور U-104 وحدّثي اللينك" /></Field>
        <Field label="الوحدة">
          <select name="unit"><option value="">—</option>{units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.project}</option>)}</select>
        </Field>
        <div className="row end wide"><button className="btn" disabled={busy || !team.length}><Icon name="send" />ابعت</button></div>
      </form>
      {!!given.length && <TaskLines tasks={given} who="to" />}
    </Modal>
  );
}

function TaskLines({ tasks, who, onDone }: { tasks: TeamTaskView[]; who: "to" | "by"; onDone?: (t: TeamTaskView) => void }) {
  return (
    <div>
      {tasks.map((t) => (
        <div key={t.id} className="line-item">
          <span>{t.status === "done" ? <Chip tone="ok">خلصت</Chip> : <Chip tone="warn">مستنية</Chip>} {t.title}{t.unit && <span className="mono"> · {t.unit.code}</span>}</span>
          <span className="hint">{who === "to" ? t.to.name : `من ${t.by.name}`} · {dayTime(t.createdAt)}</span>
          {onDone && t.status !== "done" && <button className="btn sm" onClick={() => onDone(t)}><Icon name="check" />خلصت</button>}
        </div>
      ))}
    </div>
  );
}

/** Home (Randa / Sara / Marwa): «مهمة من منار: …» with «خلصت» (demo invInbox). Nothing when there are none. */
export function MyTeamTasks() {
  const qc = useQueryClient();
  const run = useAction();
  const tasks = useQuery({ queryKey: ["team-tasks", "mine"], queryFn: () => api.get<TeamTaskView[]>("/inventory/team-tasks/mine") }).data ?? [];
  if (!tasks.length) return null;
  const done = (t: TeamTaskView) => void run(async () => {
    await api.post(`/inventory/team-tasks/${t.id}/done`);
    await qc.invalidateQueries({ queryKey: ["team-tasks", "mine"] });
  }, "اتعلّمت Done");
  return (
    <Card title="مهام من منار" icon="check" sub={`${tasks.filter((t) => t.status !== "done").length} مستنية`}>
      <TaskLines tasks={tasks} who="by" onDone={done} />
    </Card>
  );
}
