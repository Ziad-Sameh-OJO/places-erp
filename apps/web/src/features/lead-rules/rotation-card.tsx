"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RotationView } from "@places/contracts";
import { Avatar, Card, Chip, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * Demo «ترتيب الروتيشن النهارده» (1.23): automatic by who fingerprinted first, a Visit counting from its time (7.3);
 * the arrows change it for today only, «رجّعه أوتوماتيك بالبصمة» puts it back. The API saves and audits.
 */
export function RotationCard({ editable }: { editable: boolean }) {
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: ["rotation"], queryFn: () => api.get<RotationView>("/leads/rotation") });
  if (q.error) return <Note kind="warn">{q.error.message}</Note>;
  if (!q.data) return <p className="hint">بيحمّل…</p>;
  const { people, manual } = q.data;
  const move = (i: number, dir: -1 | 1) => void run(async () => {
    const ids = people.map((p) => p.id);
    [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
    qc.setQueryData(["rotation"], await api.put<RotationView>("/leads/rotation", { ids }));
  }, "اتحفظ · الترتيب ده للنهارده بس");
  const auto = () => void run(async () => { qc.setQueryData(["rotation"], await api.del<RotationView>("/leads/rotation")); }, "رجع أوتوماتيك بالبصمة");
  return (
    <Card title="ترتيب الروتيشن النهارده" icon="users" sub="أول واحد بصم بياخد أول ليد، واللي عنده Visit بيتحسب من ميعادها. تقدر تغيّر الترتيب في أي وقت النهارده"
      extra={manual ? <Chip tone="warn">متعدّل يدوي</Chip> : <Chip tone="ok">أوتوماتيك بالبصمة</Chip>}>
      {people.length ? people.map((p, i) => (
        <div key={p.id} className="line-item">
          <b className="num">{i + 1}</b>
          <span className="who"><Avatar id={p.id} name={p.name} sm /><span>{p.name}</span></span>
          <small className="hint num">{p.visit ? `Visit ${p.visit}` : p.start ? `بصم ${p.start}` : "مابصمش لسه"}</small>
          {editable && <>
            <button className="btn ghost sm" disabled={!i} onClick={() => move(i, -1)} aria-label={`طلّع ${p.name} لفوق`}>↑</button>
            <button className="btn ghost sm" disabled={i === people.length - 1} onClick={() => move(i, 1)} aria-label={`نزّل ${p.name} لتحت`}>↓</button>
          </>}
        </div>
      )) : <p className="hint">مفيش سيلز شغالين النهارده</p>}
      {manual && editable && <div className="row end"><button className="btn ghost sm" onClick={auto}>رجّعه أوتوماتيك بالبصمة</button></div>}
    </Card>
  );
}
