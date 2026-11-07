"use client";
import { useState } from "react";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { LEAD_STAGES } from "@places/domain";
import { Card, Chip, useToast } from "@/components/ui";
import { Drawer, Fab, Kanban, KpiTile, Stepper } from "@/components/blocks";

interface Demo { id: string; title: string; lane: string }

/** Development-only gallery of the shared blocks (not in the menu, 404 in production). */
export default function UiGallery() {
  if (process.env.NODE_ENV === "production") notFound();
  const t = useTranslations("pages.devUi");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Demo[]>([
    { id: "1", title: t("item1"), lane: "todo" }, { id: "2", title: t("item2"), lane: "doing" }, { id: "3", title: "Retouch U-102", lane: "done" },
  ]);
  const lanes = [["todo", t("laneTodo")], ["doing", t("laneDoing")], ["done", t("laneDone"), "ok"]].map(([key, title, tone]) => ({ key: key!, title: title!, tone, items: items.filter((i) => i.lane === key) }));
  return (
    <>
      <div className="cols">
        <KpiTile label={t("kpiLeads")} value="24" sub={t("kpiLeadsSub")} icon="users" delta={12} />
        <KpiTile label={t("kpiCollected")} value="1.2M" icon="wallet" tone="ok" delta={-4} />
        <KpiTile label={t("kpiSla")} value="3" icon="clock" tone="bad" onClick={() => toast(t("cardClicked"))} />
      </div>
      <Card title="Stepper" icon="layers"><Stepper stages={LEAD_STAGES.slice(0, 10)} current="Meeting" /></Card>
      <Card title={t("kanban")} icon="board">
        <Kanban lanes={lanes} itemKey={(i) => i.id} card={(i) => <b>{i.title}</b>}
          onMove={(item, lane) => setItems((all) => all.map((x) => (x.id === item.id ? { ...x, lane } : x)))} />
      </Card>
      <Card title="Drawer" icon="file"><button className="btn" onClick={() => setOpen(true)}>{t("openDrawer")}</button></Card>
      {open && (
        <Drawer title={t("drawerName")} sub={t("drawerSub")} chips={<><Chip tone="info">Meeting</Chip><Chip tone="ok">Qualified</Chip></>}
          onClose={() => setOpen(false)} onPrev={() => toast(t("prev"))} onNext={() => toast(t("next"))} position="3/23"
          foot={<button className="btn" onClick={() => setOpen(false)}>{t("ok")}</button>}>
          <Stepper stages={LEAD_STAGES.slice(0, 10)} current="Meeting" />
          <p className="hint">{t("drawerBody")}</p>
        </Drawer>
      )}
      <Fab onClick={() => toast(t("fab"))} />
    </>
  );
}
