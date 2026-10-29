"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Settings } from "@places/contracts";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Chip, Field, Icon, Note, Table, Tabs, useAction } from "@/components/ui";

type ListKey = "areas" | "channels" | "companyCategories" | "vendors";
const LISTS: [ListKey, string][] = [["areas", "المناطق (Areas)"], ["channels", "الـ Channels"], ["companyCategories", "كاتيجوريز الشركات"], ["vendors", "الموردين"]];

/** M-13 · الإعدادات: lists, lead stages, time rules, official holidays. Everyone reads; «master: edit» changes. */
export function SettingsPage() {
  const qc = useQueryClient();
  const run = useAction();
  const { can } = useMe();
  const ed = can("master", "edit");
  const [tab, setTab] = useState<"lists" | "stages" | "time" | "holidays">("lists");
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

      {tab === "lists" && <div className="cols">
        {LISTS.map(([key, label]) => (
          <Card key={key} title={label} icon="list" extra={<Chip plain>{d[key].length}</Chip>}>
            <div className="chips-edit">
              {d[key].map((x, i) => (
                <span className="chip-e" key={x}>{x}{ed && <button aria-label={`شيل ${x}`} onClick={() => set(key, d[key].filter((_, j) => j !== i), "اتشال من القوايم الجديدة · البيانات القديمة زي ما هي")}><Icon name="x" /></button>}</span>
              ))}
            </div>
            {ed && <form className="row" action={(f) => { const v = String(f.get("v")).trim(); if (v && !d[key].includes(v)) set(key, [...d[key], v], "اتضاف · ظاهر في كل الشاشات"); }}>
              <input name="v" placeholder="إضافة…" required aria-label={`إضافة لـ ${label}`} /><button className="btn ghost sm">+ إضافة</button>
            </form>}
          </Card>
        ))}
      </div>}

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

      {tab === "holidays" && <Card title="كالندر الإجازات الرسمية" icon="calendar" sub="في يوم الإجازة الـ SLA بيمشي بالساعة العادية، والبصمة متحسبش غياب">
        <Table head={["اليوم", "الإجازة", ""]} empty="مفيش إجازات متسجلة" rows={(holidays.data ?? []).map((h) => {
          const day = h.day.slice(0, 10);
          return [new Date(`${day}T12:00:00`).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), h.label,
            ed ? <button key="x" className="btn ghost sm" aria-label={`شيل ${h.label}`} onClick={() => run(async () => { await api.del(`/settings/holidays/${day}`); await qc.invalidateQueries({ queryKey: ["holidays"] }); }, "اتشالت")}><Icon name="x" /></button> : ""];
        })} />
        {ed && <form className="row" action={(f) => run(async () => { await api.post("/settings/holidays", { day: f.get("day"), label: f.get("label") }); await qc.invalidateQueries({ queryKey: ["holidays"] }); }, "اتضافت")}>
          <input type="date" name="day" required aria-label="اليوم" /><input name="label" placeholder="اسم الإجازة" required minLength={2} aria-label="اسم الإجازة" /><button className="btn ghost">+ إضافة</button>
        </form>}
      </Card>}
    </>
  );
}
