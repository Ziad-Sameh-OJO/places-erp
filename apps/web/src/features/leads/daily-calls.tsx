"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { MyCalls } from "@places/contracts";
import { Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";

/**
 * M-01 · Telesales' «مكالماتي النهارده» (client, 11 Nov): she writes the day's total calls (the KPI takes the larger of
 * it and the ones on leads); a «By Telesales» lead today makes the day a full one even under the target.
 */
export function DailyCalls({ calls }: { calls: MyCalls & { today: NonNullable<MyCalls["today"]> } }) {
  const t = useTranslations("leads.dailyCalls");
  const run = useAction();
  const qc = useQueryClient();
  const target = calls.goal!.target, d = calls.today;
  const save = (f: FormData) => run(async () => {
    await api.put("/leads/calls/daily", { count: Number(f.get("count")) });
    await qc.invalidateQueries({ queryKey: ["my-calls"] });
  }, t("saved"));
  return (
    <Note {...(d.counts >= target ? { kind: "ok" as const } : {})}>
      <form className="row daily-calls" onSubmit={onFormSubmit(save)}>
        <span>{t.rich("line", { counts: num(d.counts), target, b: (c) => <b>{c}</b> })}</span>
        <label className="row">
          <span className="hint">{t("mine")}</span>
          <input name="count" type="number" min={0} max={2000} required defaultValue={d.entered ?? ""} key={d.entered ?? "x"} style={{ width: 90 }} aria-label={t("mine")} />
        </label>
        <button className="btn sm"><Icon name="check" />{t("save")}</button>
        <span className="hint">{d.telesalesLead && d.counts === target && Math.max(d.entered ?? 0, calls.count) < target ? t("fullByLead") : t("onLeads", { n: num(calls.count) })}</span>
      </form>
    </Note>
  );
}
