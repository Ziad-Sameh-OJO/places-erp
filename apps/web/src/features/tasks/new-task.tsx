"use client";
import { useState } from "react";
import type { TaskOptions } from "@places/contracts";
import { taskKind } from "@places/domain";
import { Field, Icon, Modal, onFormSubmit, useAction } from "@/components/ui";
import { useTaskActions, useTaskUnits } from "./use-tasks";

/** The demo's titles of the form, per kind (tasks.js `taskNew`). */
const TITLE: Record<string, string> = {
  photo: "مهمة تصوير للمصوّر", retouch: "مهمة Retouch للمصمم (من غير AI)", toResale: "ابعت الوحدة لرندا · ابديت للبيع", marketing: "مهمة تسويق",
};
const DONE: Record<string, string> = { photo: "المهمة اتبعتت للمصوّر، ورحمة شايفاها" };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** Give a task (M-04 2.1 step 4): the unit (its data reaches the assignee), or the marketing task's type; who; the day. */
export function NewTask({ kind, options, onClose }: { kind: string; options: TaskOptions | undefined; onClose: () => void }) {
  const run = useAction();
  const { create } = useTaskActions();
  const [q, setQ] = useState("");
  const withUnit = taskKind(kind)?.withUnit ?? false;
  const units = useTaskUnits(q, withUnit).data ?? [];
  const assignees = options?.kinds.find((k) => k.key === kind)?.assignees ?? [];
  return (
    <Modal title={TITLE[kind] ?? "مهمة"} onClose={onClose}>
      <form className="grid" onSubmit={onFormSubmit((f) => run(async () => {
        const text = (k: string) => String(f.get(k) ?? "").trim();
        await create({
          kind, toUserId: text("toUserId"), dueOn: text("dueOn"),
          ...(withUnit ? { unitId: text("unitId") } : { title: text("title") }),
          ...(text("note") ? { note: text("note") } : {}),
        });
        onClose();
      }, DONE[kind] ?? "المهمة اتبعتت"))}>
        {withUnit ? (
          <Field label="الوحدة" req wide>
            <input type="search" placeholder="دوّر بالكود أو البروجكت" value={q} onChange={(e) => setQ(e.target.value)} aria-label="دوّر على الوحدة" />
            <select name="unitId" required aria-label="الوحدة">
              {units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.project}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="المهمة" req wide>
            <select name="title" required>{options?.marketingTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </Field>
        )}
        <Field label="مسؤول" req>
          <select name="toUserId" required>{assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>
        <Field label="الميعاد" req><input name="dueOn" type="date" defaultValue={today()} required /></Field>
        <Field label="ملاحظات" wide>
          <textarea name="note" maxLength={1000} placeholder={kind === "photo" ? "بيانات الوحدة بتتبعت أوتوماتيك: الكود والبروجكت والمبنى والدور واللوكيشن ورقم المالك" : ""} />
        </Field>
        <div className="row end wide"><button className="btn"><Icon name="send" />ابعت المهمة</button></div>
      </form>
    </Modal>
  );
}
