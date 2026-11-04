"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RoutingView } from "@places/contracts";
import { Avatar, Card, Chip, Empty, Note, Tick, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { num } from "@/lib/format";

/**
 * Demo «إعدادات توزيع المناطق» (1.12): areas × salespeople. A tick puts the salesperson in that area's rotation
 * (M-01 Q1); every tick saves at once and is audited. Today's order by fingerprint comes with 1.23.
 */
export function RoutingTab({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: ["routing"], queryFn: () => api.get<RoutingView>("/leads/routing") });
  if (q.error) return <Note kind="warn">{q.error.message}</Note>;
  if (!q.data) return <p className="hint">بيحمّل…</p>;
  const { areas, salespeople, routing } = q.data;
  const tick = (area: string, employeeId: string, on: boolean) => void run(async () => {
    // the answer is the whole table as saved, so quick ticks never show a stale state
    qc.setQueryData(["routing"], await api.put<RoutingView>("/leads/routing", { area, employeeId, on }));
  }, "اتحفظ");
  return (
    <>
      {!editable && <Note>عرض بس · التعديل محتاج صلاحية «يعدّل» على إعدادات التوزيع</Note>}
      <Card title="إعدادات توزيع المناطق" icon="route" sub="لما حد يختار area في الليد، الليد بيروح دايركت للسيلز دول" extra={editable ? undefined : <Chip plain>عرض بس</Chip>}>
        {!areas.length || !salespeople.length ? <Empty text="مفيش مناطق أو سيلز لسه" /> : (
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
                    <td><b>{a}</b><span className="sub num">{num((routing[a] ?? []).length)} سيلز</span></td>
                    {salespeople.map((s) => (
                      <td key={s.id}>
                        <Tick checked={(routing[a] ?? []).includes(s.id)} disabled={!editable} label={`${a} · ${s.name}`} onChange={(on) => tick(a, s.id, on)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">لو الـ area ليها أكتر من سيلز، الليدز بتتوزع بينهم بالدور، بالترتيب اللي اتعلّموا بيه.</p>
      </Card>
    </>
  );
}
