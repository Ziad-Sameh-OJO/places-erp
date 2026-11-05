"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HolidayView, Settings } from "@places/contracts";
import { durationText, type LeadRules } from "@places/domain";
import { Holidays } from "@/components/holidays";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { Card, Chip, Icon, ImportDialog, Note, Table, Tabs, useAction } from "@/components/ui";

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
  const holidays = useQuery({ queryKey: ["holidays"], queryFn: () => api.get<HolidayView[]>("/settings/holidays") });
  const stages = useQuery({ queryKey: ["stages"], queryFn: () => api.get<{ stage: string; qualified: boolean }[]>("/settings/stages"), enabled: tab === "stages" });
  const set = <K extends keyof Settings>(key: K, value: Settings[K], ok = "اتحفظ · ظاهر في كل الشاشات") =>
    run(async () => { await api.put(`/settings/${key}`, { value }); await qc.invalidateQueries({ queryKey: ["settings"] }); }, ok);

  if (!s.data) return <p className="hint">بيحمّل…</p>;
  const d = s.data;
  return (
    <>
      <div className="row"><Tabs value={tab} onChange={setTab} items={[["lists", "القوايم"], ["stages", "مراحل الليد"], ["time", "المواعيد والقواعد"], ["holidays", "الإجازات الرسمية", holidays.data?.length]]} /></div>
      {/* the lists have their own editors (#186): each card shows what this person may do */}
      {!ed && tab !== "lists" && <Note>عرض بس · التعديل لـ Super Admin أو مدير القسم.</Note>}

      {tab === "lists" && <ListsTab settings={d} />}

      {tab === "stages" && <Card title="مراحل الليد" icon="layers" sub="الترتيب، وأنهي مرحلة بتخلّي الليد Qualified (من الركوايرمنتس)">
        <Table head={["#", "المرحلة", "Qualified؟"]} rows={(stages.data ?? []).map((x, i) => [i + 1, <b key="s">{x.stage}</b>, x.qualified ? <Chip tone="ok">اه · أوتوماتيك</Chip> : <Chip plain>لأ</Chip>])} />
      </Card>}

      {tab === "time" && <div className="cols">
        <SlaSummary />
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

      {tab === "holidays" && <Card title="كالندر الإجازات الرسمية" icon="calendar" sub="من يوم لـ يوم (زي العيد) · في أيامها الـ SLA بيمشي بمواعيد يوم الإجازة ومابتتحسبش في ساعات الشغل"
        extra={ed && <button className="btn ghost sm" onClick={() => setImporting(true)}><Icon name="upload" />استيراد Excel</button>}>
        <Holidays path="/settings/holidays" editable={ed} />
      </Card>}
      {importing && <ImportDialog<{ from: string; to: string; label: string }> title="استيراد الإجازات الرسمية" path="/settings/holidays/import" template="قالب الإجازات الرسمية.xlsx"
        columns={[["from", "من"], ["to", "لحد"], ["label", "الإجازة"]]} onClose={() => setImporting(false)}
        onDone={() => { setImporting(false); void qc.invalidateQueries({ queryKey: ["holidays"] }); }} />}
    </>
  );
}

/** The demo's «قواعد الـ SLA» card: the numbers live in «قواعد الليدز» now (1.29), this shows them and links there. */
function SlaSummary() {
  const { can } = useMe();
  const rules = useQuery({ queryKey: ["lead-rules"], queryFn: () => api.get<LeadRules>("/leads/rules"), enabled: can("settings", "view") });
  const r = rules.data;
  return (
    <Card title="قواعد الـ SLA" icon="clock">
      {r ? (
        <ul className="rules">
          <li><b>تنبيه</b><span>{durationText(r.sla.warnMin)} (أيام الشغل) · {durationText(r.sla.holWarnMin)} (الإجازات)</span></li>
          <li><b>سحب الليد</b><span>{durationText(r.sla.pullMin)} · {durationText(r.sla.holPullMin)} في الإجازات</span></li>
          <li><b>No Answer</b><span>{durationText(r.noAnswer.hours * 60)} عند كل سيلز · Telesales في الروتيشن رقم {r.noAnswer.toTelesalesAt}</span></li>
        </ul>
      ) : <p className="hint">المواعيد والمسؤولين في «قواعد الليدز والتوزيع».</p>}
      {can("settings", "view") && <a className="btn ghost sm" href="/settings">عدّل من قواعد الليدز</a>}
    </Card>
  );
}
