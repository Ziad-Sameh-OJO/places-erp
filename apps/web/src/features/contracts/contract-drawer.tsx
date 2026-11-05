"use client";
import { Chip, Empty, Icon, Note, Table, useAction } from "@/components/ui";
import { Drawer } from "@/components/blocks";
import { day, money } from "@/lib/format";
import { INSTALLMENT, openContractFile, statusChip, useContract } from "./use-contracts";

/** The demo's contract drawer (clients.js ctDrawer): the renewal note, the details, then the installment table. */
export function ContractDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useContract(id);
  const run = useAction();
  const c = q.data;
  if (!c) return <Drawer title={q.error ? "العقد مش موجود" : "بيحمّل…"} onClose={onClose}><Empty text={q.error?.message ?? "بيحمّل…"} icon="clock" /></Drawer>;
  const [tone, label] = statusChip(c);
  const kv: [string, React.ReactNode][] = [
    ["العميل", c.client], ["الوحدة", <span key="u" className="mono">{c.unitCode}</span>], ["الصفقة", <span key="d" className="mono">{c.dealCode}</span>],
    ["البداية", day(c.startsOn)], ["النهاية", day(c.endsOn)], ["القيمة", money(c.value)], ["الزيادة السنوية", `${c.escalation}%`],
    ["قيمة السنة الجاية", money(c.nextYearValue)],
    ["ملف العقد", c.file ? <button key="f" type="button" className="btn ghost sm" onClick={() => void run(() => openContractFile(c.id))}><Icon name="file" />{c.file.name}</button> : "—"],
  ];
  return (
    <Drawer title={`عقد ${c.code}`} sub={`${c.client} · ${c.unitCode}`} chips={<Chip tone={tone}>{label}</Chip>} onClose={onClose}>
      {c.endingSoon && <Note kind="warn">العقد بينتهي بعد <b>{c.daysLeft}</b> يوم. التنبيهات بتتبعت 90 و60 و30 يوم قبل النهاية.</Note>}
      <dl className="kv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <section className="card flat">
        <div className="card-head"><h3><span className="ico"><Icon name="calendar" /></span><span>جدول الأقساط</span></h3></div>
        <Table head={["الميعاد", "المبلغ", "المدفوع", "الحالة"]} rows={c.installments.map((i) => [
          day(i.dueOn), <span key="a" className="n">{money(i.amount)}</span>, <span key="p" className="n">{money(i.paid)}</span>,
          <Chip key="s" tone={INSTALLMENT[i.state][0]}>{INSTALLMENT[i.state][1]}</Chip>,
        ])} />
      </section>
    </Drawer>
  );
}
