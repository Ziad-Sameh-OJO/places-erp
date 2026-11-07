"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { RoutingView } from "@places/contracts";
import { Avatar, Card, Chip, Empty, Note, Tick, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";
import { RotationCard } from "./rotation-card";
import { serverText } from "@/lib/server-text";

/**
 * Demo «إعدادات توزيع المناطق» (1.12): areas × salespeople. A tick puts the salesperson in that area's rotation
 * (M-01 Q1); every tick saves at once and is audited. Beside it, today's order by fingerprint (1.23).
 */
export function RoutingTab({ editable }: { editable: boolean }) {
  const t = useTranslations("leadRules.routing");
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: ["routing"], queryFn: () => api.get<RoutingView>("/leads/routing") });
  if (q.error) return <Note kind="warn">{q.error.message}</Note>;
  if (!q.data) return <p className="hint">{t("loading")}</p>;
  const { areas, salespeople, routing } = q.data;
  const tick = (area: string, employeeId: string, on: boolean) => void run(async () => {
    // the answer is the whole table as saved, so quick ticks never show a stale state
    qc.setQueryData(["routing"], await api.put<RoutingView>("/leads/routing", { area, employeeId, on }));
  }, t("saved"));
  return (
    <>
      {!editable && <Note>{t("viewOnly")}</Note>}
      <div className="cols wide">
      <Card title={t("title")} icon="route" sub={t("sub")} extra={editable ? undefined : <Chip plain>{t("viewOnlyChip")}</Chip>}>
        {!areas.length || !salespeople.length ? <Empty text={t("empty")} /> : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Area</th>
                  {salespeople.map((s) => <th key={s.id} title={s.name}><span className="who"><Avatar id={s.id} name={s.name} sm /><span>{s.name.split(" ")[0]}</span></span></th>)}
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a}>
                    <td><b>{serverText(a)}</b><span className="sub num">{t("salesCount", { n: num((routing[a] ?? []).length) })}</span></td>
                    {salespeople.map((s) => (
                      <td key={s.id}>
                        <Tick checked={(routing[a] ?? []).includes(s.id)} disabled={!editable} label={`${serverText(a)} · ${s.name}`} onChange={(on) => tick(a, s.id, on)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">{t("hint")}</p>
      </Card>
      <div className="stack"><RotationCard editable={editable} /></div>
      </div>
    </>
  );
}
