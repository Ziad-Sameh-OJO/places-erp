"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { activeValues, type CostCenterView, type Settings } from "@places/contracts";
import { Card, Empty, Note, Table, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { money } from "@/lib/format";

type Filters = Partial<Record<"channel" | "salesId" | "area" | "campaignId" | "from" | "to", string>>;

/**
 * M-07 9.10 · «Cost Center» (demo cost()): each collected deal, the campaign's spend it carries (÷ the campaign's
 * Qualified leads, Q40), its commissions and what's left; by platform on top. Below, 9.6's commission rates.
 */
export function CostCenter() {
  const [f, setF] = useState<Filters>({});
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const q = useQuery({ queryKey: ["finance", "cost-center", qs], queryFn: () => api.get<CostCenterView>(`/finance/cost-center${qs ? `?${qs}` : ""}`) });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sel = (k: keyof Filters, all: string, opts: [string, string][], label: string) => (
    <select value={f[k] ?? ""} onChange={set(k)} aria-label={label}><option value="">{all}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );
  const s = settings.data, v = q.data;
  const max = Math.max(1, ...(v?.byChannel ?? []).map((c) => Number(c.marketing)));
  return (
    <>
      <div className="toolbar">
        {sel("channel", "كل المنصات", activeValues(s?.channels ?? []).map((c) => [c, c]), "المنصة")}
        {sel("campaignId", "كل الكامبينز", (v?.options.campaigns ?? []).map((c) => [c.id, c.name]), "الكامبين")}
        {sel("salesId", "كل السيلز", (v?.options.sales ?? []).map((p) => [p.id, p.name]), "السيلز")}
        {sel("area", "كل المناطق", activeValues(s?.areas ?? []).map((a) => [a, a]), "المنطقة")}
        <label className="date-f"><span>من</span><input type="date" value={f.from ?? ""} onChange={set("from")} /></label>
        <label className="date-f"><span>لحد</span><input type="date" value={f.to ?? ""} onChange={set("to")} /></label>
      </div>
      {!v ? <Empty text="بيحمّل…" icon="clock" /> : <>
        <Card title="الصفقات كلّفت كام ماركتينج · حسب المنصة" icon="chart">
          {v.byChannel.length ? <div className="hbars">
            {v.byChannel.map((c) => (
              <div className="hb" key={c.channel}>
                <span className="hb-l">{c.channel}<small>إيراد {money(c.revenue)}</small></span>
                <div className="bar"><i style={{ width: `${(Number(c.marketing) / max) * 100}%` }} /></div>
                <span className="hb-v">{money(c.marketing)}</span>
              </div>
            ))}
          </div> : <Empty text="مفيش صفقات اتحصّل منها بالفلاتر دي" />}
        </Card>
        <Table head={["الصفقة", "المنصة · الكامبين", "السيلز", "المنطقة", "الإيراد", "تكلفة الماركتينج", "العمولة", "صافي الصفقة"]}
          rows={v.rows.map((r) => [
            <span key="c" className="mono">{r.code}</span>, <span key="ch">{r.channel}<span className="sub">{r.campaign ?? "—"}</span></span>, r.sales.join("، "), r.area ?? "—",
            <span key="r" className="n">{money(r.revenue)}</span>, <span key="m" className="n">{money(r.marketing)}</span>, <span key="k" className="n">{money(r.commission)}</span>, <b key="t" className="n">{money(r.net)}</b>,
          ])} />
        <Note>تكلفة الماركتينج على الصفقة = صرف الكامبين اللي جابت الليد ÷ عدد الـ Qualified leads اللي جابتهم. العمولة = عمولة السيلز على اللي اتحصّل + عمولة الأوبريشن + العمولة الخارجية. في الحسابات (قايمة الدخل) الكامبين بيفضل بإجماليها.</Note>
      </>}
      {s && <Rates s={s} />}
    </>
  );
}

/** 9.6 (needs-client): the Super Admin's rates; the demo's 5% and 0 until the client confirms. */
function Rates({ s }: { s: Settings }) {
  const { canSet } = useMe();
  const run = useAction();
  const qc = useQueryClient();
  const ed = canSet("opsCommissionPct");
  const save = (f: FormData) => run(async () => {
    await api.put("/settings/opsCommissionPct", { value: Number(f.get("ops")) });
    await api.put("/settings/externalCommissionPct", { value: Number(f.get("ext")) });
    await qc.invalidateQueries({ queryKey: ["settings"] });
  }, "اتحفظ · بيتطبّق على التحصيلات الجاية");
  return (
    <Card title="نسب عمولة الأوبريشن والعمولة الخارجية" icon="wallet" sub="من عمولة Places، وبتتقيد مع أول تحصيل للصفقة · العمولة الخارجية اللي بتتكتب في مراجعة الصفقة بتغلب النسبة">
      <form className="row" action={save}>
        <label className="date-f"><span>الأوبريشن</span><input name="ops" type="number" min={0} max={100} step="any" defaultValue={s.opsCommissionPct} disabled={!ed} style={{ width: 80 }} />%</label>
        <label className="date-f"><span>الخارجية</span><input name="ext" type="number" min={0} max={100} step="any" defaultValue={s.externalCommissionPct} disabled={!ed} style={{ width: 80 }} />%</label>
        {ed && <button className="btn ghost sm">احفظ</button>}
      </form>
    </Card>
  );
}
