"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TaskOptions } from "@places/contracts";
import { taskKind } from "@places/domain";
import { Field, Icon, Modal, onFormSubmit, useAction, useToast } from "@/components/ui";
import { serverText } from "@/lib/server-text";
import { useFields } from "@/lib/me";
import { useTaskActions, useTaskUnits } from "./use-tasks";

/** The demo's titles of the form, per kind (tasks.js `taskNew`): their words in tasks.newTask.titles. */
const TITLED = ["photo", "retouch", "toResale", "marketing"] as const;
const titled = (k: string): k is (typeof TITLED)[number] => (TITLED as readonly string[]).includes(k);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** Give a task (M-04 2.1 step 4): the unit (its data reaches the assignee), or the marketing task's type; who; the day. */
export function NewTask({ kind, options, onClose }: { kind: string; options: TaskOptions | undefined; onClose: () => void }) {
  const t = useTranslations("tasks.newTask");
  const run = useAction();
  const toast = useToast();
  const { create } = useTaskActions();
  const [q, setQ] = useState("");
  const withUnit = taskKind(kind)?.withUnit ?? false;
  const units = useTaskUnits(q, withUnit).data ?? [];
  const assignees = options?.kinds.find((k) => k.key === kind)?.assignees ?? [];
  const fields = useFields("tasks");
  return (
    <Modal title={titled(kind) ? t(`titles.${kind}`) : t("titles.default")} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const text = (k: string) => String(f.get(k) ?? "").trim();
        const r = await create({
          kind, toUserId: text("toUserId"), dueOn: text("dueOn"),
          ...(withUnit ? { unitId: text("unitId") } : { title: text("title") }),
          ...(text("note") ? { note: text("note") } : {}),
        });
        onClose();
        // M-04 2.1 step 4 «وحدة في اليوم»: the demo warns on a second photo task for the day but still sends it
        const done = kind === "photo" ? t("sentPhoto") : t("sent");
        toast(r.warning ? `${serverText(r.warning)} · ${done}` : done);
      }))}>
        {withUnit ? (
          <Field label={t("unit")} req wide>
            <input type="search" placeholder={t("searchUnit")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("searchUnitLabel")} />
            <select name="unitId" required aria-label={t("unit")}>
              {units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.project}</option>)}
            </select>
          </Field>
        ) : (
          <Field label={t("task")} req wide>
            <select name="title" required>{options?.marketingTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </Field>
        )}
        <Field label={t("assignee")} req>
          <select name="toUserId" required>{assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        <Field label={t("due")} req><input name="dueOn" type="date" defaultValue={today()} required /></Field>
        {/* M-09: a note the person may not set starts empty (the API too), so a new task has no input for it */}
        {fields.edits("note") && <Field label={t("notes")} wide>
          <textarea name="note" maxLength={1000} placeholder={kind === "photo" ? t("photoNote") : ""} />
        </Field>}
        <div className="row end wide"><button className="btn"><Icon name="send" />{t("send")}</button></div>
      </form>
    </Modal>
  );
}
