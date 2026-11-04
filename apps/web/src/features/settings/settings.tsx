"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Settings } from "@places/contracts";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Chip, Field, Icon, ImportDialog, Note, Table, Tabs, useAction } from "@/components/ui";

type ListKey = "areas" | "channels" | "companyCategories" | "vendors";
const LISTS: [ListKey, string][] = [["areas", "المناطق (Areas)"], ["channels", "الـ Channels"], ["companyCategories", "كاتيجوريز الشركات"], ["vendors", "الموردين"]];

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
        <LeadLogRoles chosen={d.leadLogRoles} editable={ed} onSave={(roles) => set("leadLogRoles", roles, "اتحفظ · الأدوار دي هتشوف تاب Logs في الليد")} />
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

/**
 * Who sees a lead's «Logs» tab besides the admin (client meeting, 4 Nov · 1.25). The role list comes from
 * الأدوار والصلاحيات; the admin is always included and isn't offered.
 */
function LeadLogRoles({ chosen, editable, onSave }: { chosen: string[]; editable: boolean; onSave: (roles: string[]) => void }) {
  const { can } = useMe();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<{ key: string; label: string }[]>("/access/roles"), enabled: can("access", "view") });
  const label = new Map((roles.data ?? []).map((r) => [r.key, r.label]));
  // The ticks live here and one save goes out half a second after the last click, with the whole list: saving
  // on every click from the server's last answer lost clicks made before it came back (found by testing).
  const [picked, setPicked] = useState(chosen);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef(false);
  useEffect(() => { if (!pending.current) setPicked(chosen); }, [chosen]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const toggle = (key: string, on: boolean) => {
    const next = on ? [...picked.filter((k) => k !== key), key] : picked.filter((k) => k !== key);
    setPicked(next);
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current = false; onSave(next); }, 500);
  };
  return (
    <Card title="مين يشوف Logs الليد" icon="lock" sub="الأدمن دايماً · واختار الأدوار التانية">
      {roles.data ? (
        <div className="chips-edit">
          {roles.data.filter((r) => r.key !== "admin").map((r) => (
            <label key={r.key} className="tog"><input type="checkbox" checked={picked.includes(r.key)} disabled={!editable} onChange={(e) => toggle(r.key, e.target.checked)} /> {r.label}</label>
          ))}
        </div>
      ) : <p className="hint">{chosen.length ? chosen.map((k) => label.get(k) ?? k).join("، ") : "الأدمن بس"}</p>}
    </Card>
  );
}
