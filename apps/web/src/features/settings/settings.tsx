"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Settings } from "@places/contracts";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Chip, Field, Icon, ImportDialog, Note, Table, Tabs, useAction } from "@/components/ui";

import { ListsTab } from "./lists";

/** M-13 · الإعدادات: lists, lead stages, time rules, official holidays. Everyone reads; «master: edit» changes. */
export function SettingsPage() {
  const qc = useQueryClient();
  const run = useAction();
  const { can } = useMe();
  const ed = can("master", "edit");
  const [tab, setTab] = useState<"lists" | "stages" | "time" | "holidays">("lists");
  const [importing, setImporting] = useState(false);
  const s = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const holidays = useQuery({ queryKey: ["holidays"], queryFn: () => api.get<{ day: string; label: string }[]>("/settings/holidays") });
  const stages = useQuery({ queryKey: ["stages"], queryFn: () => api.get<{ stage: string; qualified: boolean }[]>("/settings/stages"), enabled: tab === "stages" });
  const set = <K extends keyof Settings>(key: K, value: Settings[K], ok = "اتحفظ · ظاهر في كل الشاشات") =>
    run(async () => { await api.put(`/settings/${key}`, { value }); await qc.invalidateQueries({ queryKey: ["settings"] }); }, ok);

  if (!s.data) return <p className="hint">بيحمّل…</p>;
  const d = s.data;
  return (
    <>
      <div className="row"><Tabs value={tab} onChange={setTab} items={[["lists", "القوايم"], ["stages", "مراحل الليد"], ["time", "المواعيد والقواعد"], ["holidays", "الإجازات الرسمية", holidays.data?.length]]} /></div>
      {!ed && <Note>عرض بس · التعديل لـ Super Admin أو مدير القسم.</Note>}

      {tab === "lists" && <ListsTab settings={d} editable={ed} />}

      {tab === "stages" && <Card title="مراحل الليد" icon="layers" sub="الترتيب، وأنهي مرحلة بتخلّي الليد Qualified (من الركوايرمنتس)">
        <Table head={["#", "المرحلة", "Qualified؟"]} rows={(stages.data ?? []).map((x, i) => [i + 1, <b key="s">{x.stage}</b>, x.qualified ? <Chip tone="ok">اه · أوتوماتيك</Chip> : <Chip plain>لأ</Chip>])} />
      </Card>}

      {tab === "time" && <div className="cols">
        <Card title="قواعد الـ SLA" icon="clock" sub="بالدقايق · أيام الشغل 11:00–19:00، والإجازات بالساعة العادية">
          <form className="grid" action={(f) => set("slaRules", { warnAfter: +f.get("w")!, pullAfter: +f.get("p")!, holidayWarnAfter: +f.get("hw")!, holidayPullAfter: +f.get("hp")! })}>
            <Field label="تنبيه الـ TL (دقايق شغل)"><input name="w" type="number" min={10} defaultValue={d.slaRules.warnAfter} disabled={!ed} /></Field>
            <Field label="سحب الليد (دقايق شغل)"><input name="p" type="number" min={10} defaultValue={d.slaRules.pullAfter} disabled={!ed} /></Field>
            <Field label="تنبيه في الإجازة (دقايق)"><input name="hw" type="number" min={10} defaultValue={d.slaRules.holidayWarnAfter} disabled={!ed} /></Field>
            <Field label="سحب في الإجازة (دقايق)"><input name="hp" type="number" min={10} defaultValue={d.slaRules.holidayPullAfter} disabled={!ed} /></Field>
            {ed && <div className="row end wide"><button className="btn sm">احفظ القواعد</button></div>}
          </form>
        </Card>
        <Card title="أنواع الإجازات" icon="calendar">
          <form action={(f) => set("leaveTypes", d.leaveTypes.map((x, i) => ({ ...x, days: +f.get(`d${i}`)! })))}>
            <Table head={["النوع", "الرصيد السنوي"]} rows={d.leaveTypes.map((x, i) => [x.name, <input key="d" name={`d${i}`} type="number" min={0} max={60} defaultValue={x.days} disabled={!ed} style={{ maxWidth: 90 }} aria-label={`رصيد ${x.name}`} />])} />
            {ed && <div className="row end"><button className="btn sm">احفظ</button></div>}
          </form>
        </Card>
        <Card title="حد الواتساب اليومي" icon="megaphone">
          <form className="row" action={(f) => set("whatsappDailyLimit", +f.get("lim")!)}>
            <input name="lim" type="number" min={0} defaultValue={d.whatsappDailyLimit} disabled={!ed} style={{ maxWidth: 120 }} aria-label="الحد اليومي" /><span className="hint">رسالة في اليوم</span>
            {ed && <button className="btn ghost sm">احفظ</button>}
          </form>
        </Card>
      </div>}

      {tab === "holidays" && <Card title="كالندر الإجازات الرسمية" icon="calendar" sub="في يوم الإجازة الـ SLA بيمشي بالساعة العادية، والبصمة متحسبش غياب"
        extra={ed && <button className="btn ghost sm" onClick={() => setImporting(true)}><Icon name="upload" />استيراد Excel</button>}>
        <Table head={["اليوم", "الإجازة", ""]} empty="مفيش إجازات متسجلة" rows={(holidays.data ?? []).map((h) => {
          const day = h.day.slice(0, 10);
          return [new Date(`${day}T12:00:00`).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), h.label,
            ed ? <button key="x" className="btn ghost sm" aria-label={`شيل ${h.label}`} onClick={() => run(async () => { await api.del(`/settings/holidays/${day}`); await qc.invalidateQueries({ queryKey: ["holidays"] }); }, "اتشالت")}><Icon name="x" /></button> : ""];
        })} />
        {ed && <form className="row" action={(f) => run(async () => { await api.post("/settings/holidays", { day: f.get("day"), label: f.get("label") }); await qc.invalidateQueries({ queryKey: ["holidays"] }); }, "اتضافت")}>
          <input type="date" name="day" required aria-label="اليوم" /><input name="label" placeholder="اسم الإجازة" required minLength={2} aria-label="اسم الإجازة" /><button className="btn ghost">+ إضافة</button>
        </form>}
      </Card>}
      {importing && <ImportDialog<{ day: string; label: string }> title="استيراد الإجازات الرسمية" path="/settings/holidays/import" template="قالب الإجازات الرسمية.xlsx"
        columns={[["day", "التاريخ"], ["label", "الإجازة"]]} onClose={() => setImporting(false)}
        onDone={() => { setImporting(false); void qc.invalidateQueries({ queryKey: ["holidays"] }); }} />}
    </>
  );
}
