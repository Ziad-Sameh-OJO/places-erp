"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HolidayView, Settings } from "@places/contracts";
import { durationText, type LeadRules } from "@places/domain";
import { Holidays } from "@/components/holidays";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";
import { Card, Chip, Icon, ImportDialog, Note, onFormSubmit, Table, Tabs, useAction } from "@/components/ui";

import { ListsTab } from "./lists";
import { StampTab, TemplatesTab } from "./documents";

/** M-13 · الإعدادات: lists, lead stages, time rules, official holidays. Everyone reads; each department's manager changes his own (M-13 4.1). */
export function SettingsPage() {
  const t = useTranslations("settings.page");
  const qc = useQueryClient();
  const run = useAction();
  const { can, canSet } = useMe();
  const [tab, setTab] = useState<"lists" | "stages" | "time" | "holidays" | "tpl" | "brand">("lists");
  // M-13 4.1: each card is its department's (the HR: leave types, holidays · the marketing: the WhatsApp limit)
  const edLeave = canSet("leaveTypes"), edWa = canSet("whatsappDailyLimit"), edHol = canSet("holidays"), edTol = canSet("recommendTolerancePct"), edTiers = canSet("tlTiers");
  const readOnly = tab === "time" ? !edLeave && !edWa && !edTol && !edTiers : tab === "holidays" ? !edHol : tab === "stages" || (tab === "tpl" && !can("master", "edit"));
  const [importing, setImporting] = useState(false);
  const s = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const holidays = useQuery({ queryKey: ["holidays"], queryFn: () => api.get<HolidayView[]>("/settings/holidays") });
  const stages = useQuery({ queryKey: ["stages"], queryFn: () => api.get<{ stage: string; qualified: boolean }[]>("/settings/stages"), enabled: tab === "stages" });
  const set = <K extends keyof Settings>(key: K, value: Settings[K], ok = t("saved")) =>
    run(async () => { await api.put(`/settings/${key}`, { value }); await qc.invalidateQueries({ queryKey: ["settings"] }); }, ok);

  if (!s.data) return <p className="hint">{t("loading")}</p>;
  const d = s.data;
  return (
    <>
      <div className="row"><Tabs value={tab} onChange={setTab} items={[["lists", t("tabs.lists")], ["stages", t("tabs.stages")], ["time", t("tabs.time")], ["holidays", t("tabs.holidays"), holidays.data?.length], ["tpl", t("tabs.tpl")], ["brand", t("tabs.brand")]]} /></div>
      {/* the lists have their own editors (#186): each card shows what this person may do */}
      {readOnly && <Note>{t("readOnly")}</Note>}

      {tab === "lists" && <ListsTab settings={d} />}
      {tab === "tpl" && <TemplatesTab />}
      {tab === "brand" && <StampTab />}

      {tab === "stages" && <Card title={t("stages.title")} icon="layers" sub={t("stages.sub")}>
        <Table head={["#", t("stages.stage"), t("stages.qualified")]} rows={(stages.data ?? []).map((x, i) => [i + 1, <b key="s">{serverText(x.stage)}</b>, x.qualified ? <Chip tone="ok">{t("stages.yes")}</Chip> : <Chip plain>{t("stages.no")}</Chip>])} />
      </Card>}

      {tab === "time" && <div className="cols">
        <SlaSummary />
        <Card title={t("leave.title")} icon="calendar">
          <form onSubmit={onFormSubmit((f) => set("leaveTypes", d.leaveTypes.map((x, i) => ({ ...x, days: +f.get(`d${i}`)! }))))}>
            <Table head={[t("leave.type"), t("leave.balance")]} rows={d.leaveTypes.map((x, i) => [serverText(x.name), <input key="d" name={`d${i}`} type="number" min={0} max={60} defaultValue={x.days} disabled={!edLeave} style={{ maxWidth: 90 }} aria-label={t("leave.balanceOf", { name: serverText(x.name) })} />])} />
            {edLeave && <div className="row end"><button className="btn sm">{t("save")}</button></div>}
          </form>
        </Card>
        <Card title={t("whatsapp.title")} icon="megaphone">
          <form className="row" onSubmit={onFormSubmit((f) => set("whatsappDailyLimit", +f.get("lim")!))}>
            <input name="lim" type="number" min={0} defaultValue={d.whatsappDailyLimit} disabled={!edWa} style={{ maxWidth: 120 }} aria-label={t("whatsapp.limit")} /><span className="hint">{t("whatsapp.perDay")}</span>
            {edWa && <button className="btn ghost sm">{t("save")}</button>}
          </form>
        </Card>
        {/* M-03 7.2: «قريبة من» is proposed as ±20% and waits for the client, so it's editable here (2.12) */}
        <Card title={t("recommend.title")} icon="building" sub={t("recommend.sub")}>
          <form className="row" onSubmit={onFormSubmit((f) => set("recommendTolerancePct", +f.get("tol")!))}>
            <span className="hint">±</span><input name="tol" type="number" min={0} max={100} defaultValue={d.recommendTolerancePct} disabled={!edTol} style={{ maxWidth: 90 }} aria-label={t("recommend.tolerance")} /><span className="hint">{t("recommend.ofArea")}</span>
            {edTol && <button className="btn ghost sm">{t("save")}</button>}
          </form>
        </Card>
        <TlTiers key={JSON.stringify(d.tlTiers)} tiers={d.tlTiers} canEdit={edTiers} save={(v) => set("tlTiers", v)} />
      </div>}

      {tab === "holidays" && <Card title={t("holidays.title")} icon="calendar" sub={t("holidays.sub")}
        extra={edHol && <button className="btn ghost sm" onClick={() => setImporting(true)}><Icon name="upload" />{t("holidays.import")}</button>}>
        <Holidays path="/settings/holidays" editable={edHol} />
      </Card>}
      {importing && <ImportDialog<{ from: string; to: string; label: string }> title={t("holidays.importTitle")} path="/settings/holidays/import" template={t("holidays.template")}
        columns={[["from", t("holidays.from")], ["to", t("holidays.to")], ["label", t("holidays.label")]]} onClose={() => setImporting(false)}
        onDone={() => { setImporting(false); void qc.invalidateQueries({ queryKey: ["holidays"] }); }} />}
    </>
  );
}

/** The demo's «قواعد الـ SLA» card: the numbers live in «قواعد الليدز» now (1.29), this shows them and links there. */
/** 5.8 · M-12 2.1 step 5: the TL's percentage by the team's achievement (demo «شرايح الـ Scheme بتاعة الـ TL»); an empty «أقل من» = «وأكتر». */
function TlTiers({ tiers, canEdit, save }: { tiers: Settings["tlTiers"]; canEdit: boolean; save: (v: Settings["tlTiers"]) => void }) {
  const t = useTranslations("settings.tlTiers");
  const [rows, setRows] = useState<Array<{ below: number | null; percent: number | null }>>(tiers);
  const edit = (i: number, k: "below" | "percent", v: string) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v === "" ? null : +v } : x)));
  return (
    <Card title={t("title")} icon="chart" sub={t("sub")}>
      <form onSubmit={onFormSubmit(() => save(rows.map((x, i) => ({ below: i === rows.length - 1 ? null : x.below, percent: x.percent ?? 0 }))))}>
        <Table head={[t("below"), t("percent"), ""]} rows={rows.map((x, i) => [
          i === rows.length - 1 ? <span key="b" className="hint">{t("andMore")}</span>
            : <input key="b" type="number" min={1} value={x.below ?? ""} onChange={(e) => edit(i, "below", e.target.value)} disabled={!canEdit} required style={{ maxWidth: 110 }} aria-label={t("belowOf", { n: i + 1 })} />,
          <input key="p" type="number" min={0} max={100} step="0.5" value={x.percent ?? ""} onChange={(e) => edit(i, "percent", e.target.value)} disabled={!canEdit} required style={{ maxWidth: 90 }} aria-label={t("percentOf", { n: i + 1 })} />,
          canEdit && rows.length > 1 ? <button key="x" type="button" className="btn ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t("remove")}><Icon name="x" /></button> : null,
        ])} />
        {canEdit && <div className="row end">
          <button type="button" className="btn ghost sm" onClick={() => setRows([{ below: 90, percent: 5 }, ...rows])}><Icon name="plus" />{t("add")}</button>
          <button className="btn sm">{t("save")}</button>
        </div>}
      </form>
    </Card>
  );
}

/** durationText is the domain's Arabic wording; the catalog gives its English. */
const dur = (min: number) => serverText(durationText(min));

function SlaSummary() {
  const t = useTranslations("settings.sla");
  const { can } = useMe();
  const rules = useQuery({ queryKey: ["lead-rules"], queryFn: () => api.get<LeadRules>("/leads/rules"), enabled: can("settings", "view") });
  const r = rules.data;
  return (
    <Card title={t("title")} icon="clock">
      {r ? (
        <ul className="rules">
          <li><b>{t("warn")}</b><span>{t("warnValue", { work: dur(r.sla.warnMin), holiday: dur(r.sla.holWarnMin) })}</span></li>
          <li><b>{t("pull")}</b><span>{t("pullValue", { work: dur(r.sla.pullMin), holiday: dur(r.sla.holPullMin) })}</span></li>
          <li><b>No Answer</b><span>{t("noAnswerValue", { time: dur(r.noAnswer.hours * 60), at: r.noAnswer.toTelesalesAt })}</span></li>
        </ul>
      ) : <p className="hint">{t("where")}</p>}
      {can("settings", "view") && <a className="btn ghost sm" href="/settings">{t("edit")}</a>}
    </Card>
  );
}
