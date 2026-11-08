"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { TASK_STATUS_LABEL } from "@places/domain";
import { Chip, Icon } from "@/components/ui";
import { day } from "@/lib/format";
import { useMe } from "@/lib/me";
import { serverText } from "@/lib/server-text";
import { NewTask } from "./new-task";
import { KIND_LOOK } from "./tasks-page";
import { useTaskOptions, useUnitTasks } from "./use-tasks";

/** The unit drawer's «المهام» tab (2.30, demo inventory.js `unitDrawer`): its label and count, or null without «tasks: view». */
export function useUnitTasksTab(unitId: string): ["tasks", string, number | undefined] | null {
  const t = useTranslations("tasks.unit");
  const { can } = useMe();
  const tasks = useUnitTasks(unitId, can("tasks"));
  return can("tasks") ? ["tasks", t("tab"), tasks.data?.length] : null;
}

/** The unit's tasks, and giving one about it: a shoot, a Retouch, and a rent unit sent to Randa (resale update). */
export function UnitTasks({ u }: { u: { id: string; code: string; project: string; type: string } }) {
  const t = useTranslations("tasks");
  const { me, can } = useMe();
  const tasks = useUnitTasks(u.id, true).data ?? [];
  const options = useTaskOptions(can("tasks", "create")).data;
  const [giving, setGiving] = useState<string | null>(null);
  const gives = (k: string) => !!options?.kinds.some((x) => x.key === k);
  // the demo: Randa (resale) doesn't send a unit to herself, and only a rent unit goes to resale
  const toResale = gives("toResale") && u.type === "Rent" && !me?.roles.includes("resale");
  return <>
    {tasks.length ? tasks.map((x) => (
      <div className="line-item" key={x.id}>
        <span><Chip tone={KIND_LOOK[x.kind]?.tone ?? ""}>{serverText(x.kindLabel)}</Chip> {x.to.name} · {day(x.dueOn)}</span>
        <span className="hint">{serverText(TASK_STATUS_LABEL[x.status])}</span>
      </div>
    )) : <p className="hint">{t("unit.none")}</p>}
    {(gives("photo") || gives("retouch") || toResale) && <div className="row">
      {gives("photo") && <button className="btn ghost" onClick={() => setGiving("photo")}><Icon name="camera" />{t("give.photo")}</button>}
      {gives("retouch") && <button className="btn ghost" onClick={() => setGiving("retouch")}><Icon name="image" />{t("give.retouch")}</button>}
      {toResale && <button className="btn ghost" onClick={() => setGiving("toResale")}><Icon name="send" />{t("unit.toResale")}</button>}
    </div>}
    {giving && <NewTask kind={giving} options={options} unit={u} onClose={() => setGiving(null)} />}
  </>;
}
