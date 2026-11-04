"use client";
import { useState } from "react";
import { notFound } from "next/navigation";
import { LEAD_STAGES } from "@places/domain";
import { Card, Chip, useToast } from "@/components/ui";
import { Drawer, Fab, Kanban, KpiTile, Stepper } from "@/components/blocks";

interface Demo { id: string; title: string; lane: string }

/** Development-only gallery of the shared blocks (not in the menu, 404 in production). */
export default function UiGallery() {
  if (process.env.NODE_ENV === "production") notFound();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Demo[]>([
    { id: "1", title: "ليد · شركة تجربة", lane: "todo" }, { id: "2", title: "تصوير وحدة U-101", lane: "doing" }, { id: "3", title: "Retouch U-102", lane: "done" },
  ]);
  const lanes = [["todo", "جديد"], ["doing", "شغال"], ["done", "خلص", "ok"]].map(([key, title, tone]) => ({ key: key!, title: title!, tone, items: items.filter((i) => i.lane === key) }));
  return (
    <>
      <div className="cols">
        <KpiTile label="ليدز النهارده" value="24" sub="من كل الـ Channels" icon="users" delta={12} />
        <KpiTile label="المحصّل الشهر ده" value="1.2M" icon="wallet" tone="ok" delta={-4} />
        <KpiTile label="متأخر في الـ SLA" value="3" icon="clock" tone="bad" onClick={() => toast("دوست على الكارت")} />
      </div>
      <Card title="Stepper" icon="layers"><Stepper stages={LEAD_STAGES.slice(0, 10)} current="Meeting" /></Card>
      <Card title="Kanban (اسحب كارت لعمود تاني)" icon="board">
        <Kanban lanes={lanes} itemKey={(i) => i.id} card={(i) => <b>{i.title}</b>}
          onMove={(item, lane) => setItems((all) => all.map((x) => (x.id === item.id ? { ...x, lane } : x)))} />
      </Card>
      <Card title="Drawer" icon="file"><button className="btn" onClick={() => setOpen(true)}>افتح الدروار</button></Card>
      {open && (
        <Drawer title="أحمد محمود" sub="L-1042 · ليد" chips={<><Chip tone="info">Meeting</Chip><Chip tone="ok">Qualified</Chip></>}
          onClose={() => setOpen(false)} onPrev={() => toast("السابق")} onNext={() => toast("التالي")} position="3/23"
          foot={<button className="btn" onClick={() => setOpen(false)}>تمام</button>}>
          <Stepper stages={LEAD_STAGES.slice(0, 10)} current="Meeting" />
          <p className="hint">محتوى الدروار. على الموبايل بيطلع bottom sheet.</p>
        </Drawer>
      )}
      <Fab onClick={() => toast("زرار جديد (بيظهر على الموبايل بس)")} />
    </>
  );
}
