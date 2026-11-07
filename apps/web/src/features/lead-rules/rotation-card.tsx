"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { RotationView } from "@places/contracts";
import { Avatar, Card, Chip, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * Demo «ترتيب الروتيشن النهارده» (1.23): automatic by who fingerprinted first, a Visit counting from its time (7.3);
 * the arrows change it for today only, «رجّعه أوتوماتيك بالبصمة» puts it back. The API saves and audits.
 */
export function RotationCard({ editable }: { editable: boolean }) {
  const t = useTranslations("leadRules.rotation");
  const qc = useQueryClient();
  const run = useAction();
  const q = useQuery({ queryKey: ["rotation"], queryFn: () => api.get<RotationView>("/leads/rotation") });
  if (q.error) return <Note kind="warn">{q.error.message}</Note>;
  if (!q.data) return <p className="hint">{t("loading")}</p>;
  const { people, manual } = q.data;
  const move = (i: number, dir: -1 | 1) => void run(async () => {
    const ids = people.map((p) => p.id);
    [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
    qc.setQueryData(["rotation"], await api.put<RotationView>("/leads/rotation", { ids }));
  }, t("saved"));
  const auto = () => void run(async () => { qc.setQueryData(["rotation"], await api.del<RotationView>("/leads/rotation")); }, t("backToAuto"));
  return (
    <Card title={t("title")} icon="users" sub={t("sub")}
      extra={manual ? <Chip tone="warn">{t("manual")}</Chip> : <Chip tone="ok">{t("auto")}</Chip>}>
      {people.length ? people.map((p, i) => (
        <div key={p.id} className="line-item">
          <b className="num">{i + 1}</b>
          <span className="who"><Avatar id={p.id} name={p.name} sm /><span>{p.name}</span></span>
          <small className="hint num">{p.visit ? `Visit ${p.visit}` : p.start ? t("fingerprinted", { time: p.start }) : t("notYet")}</small>
          {editable && <>
            <button className="btn ghost sm" disabled={!i} onClick={() => move(i, -1)} aria-label={t("up", { name: p.name })}>↑</button>
            <button className="btn ghost sm" disabled={i === people.length - 1} onClick={() => move(i, 1)} aria-label={t("down", { name: p.name })}>↓</button>
          </>}
        </div>
      )) : <p className="hint">{t("nobody")}</p>}
      {manual && editable && <div className="row end"><button className="btn ghost sm" onClick={auto}>{t("resetAuto")}</button></div>}
    </Card>
  );
}
