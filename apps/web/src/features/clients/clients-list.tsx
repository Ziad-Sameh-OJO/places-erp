"use client";
import { useState } from "react";
import { KpiTile } from "@/components/blocks";
import { Chip, ExportButton, Icon, Note, Table } from "@/components/ui";
import { ago, num } from "@/lib/format";
import { ClientDrawer } from "./client-drawer";
import { KindChips } from "./client-bits";
import { MergeQueue } from "./merges";
import { type ClientQuery, filterQuery, useClient, useClientSummary, useClients } from "./use-clients";

const PAGE = 50;

/**
 * M-10 · العملاء والملاك (demo clients.js): the tiles, a search by name, number or company with «الكل · عملاء · ملاك»,
 * the list, and a person's file in a drawer. Who sees which file is the API's (M-10 4.1).
 */
export function ClientsList() {
  const [f, setF] = useState<ClientQuery>({});
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useClients(f, page, PAGE);
  const s = useClientSummary().data;
  const file = useClient(open);
  const filter = (next: ClientQuery) => { setF(next); setPage(1); };
  const failed = rows.error?.message;
  const list = failed ? [] : rows.data?.items ?? [];
  const total = failed ? 0 : rows.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const seg: [ClientQuery["kind"], string][] = [[undefined, "الكل"], ["client", "عملاء"], ["owner", "ملاك"]];

  return (
    <>
      <div className="kpis">
        <KpiTile label="العملاء" value={s ? num(s.clients) : "…"} sub="عملوا صفقة" icon="handshake" />
        <KpiTile label="الملاك" value={s ? num(s.owners) : "…"} sub="عندنا وحداتهم" icon="building" tone="ok" />
        <KpiTile label="ملاك محتاجين ابديت" value={s ? num(s.ownersStale) : "…"} sub="last update أكتر من شهر" icon="clock" tone="bad" onClick={() => filter({ ...f, stale: "true" })} />
        <KpiTile label="عميل ومالك" value={s ? num(s.both) : "…"} sub="نفس الشخص" icon="users" tone="warn" />
      </div>
      <MergeQueue />
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder="الاسم، الرقم، الشركة" value={f.q ?? ""} onChange={(e) => filter({ ...f, q: e.target.value })} aria-label="بحث في العملاء والملاك" /></label>
        <div className="seg" role="group" aria-label="النوع">
          {seg.map(([k, label]) => <button key={label} aria-pressed={f.kind === k} onClick={() => filter({ ...f, kind: k })}>{label}</button>)}
        </div>
        {/* M-10 6.1 the owners needing an update · M-10 3.3 a year without dealing */}
        <label className="tog"><input type="checkbox" checked={!!f.stale} onChange={(e) => filter({ ...f, stale: e.target.checked ? "true" : undefined })} /><span>ملاك محتاجين ابديت</span></label>
        <label className="tog"><input type="checkbox" checked={f.status === "inactive"} onChange={(e) => filter({ ...f, status: e.target.checked ? "inactive" : undefined })} /><span>Inactive</span></label>
        <span className="spacer" />
        <ExportButton module="clients" path="/clients/export" query={filterQuery(f)} filename="العملاء والملاك.xlsx" label="تصدير العملاء والملاك" />
      </div>
      <div className="row"><span className="hint num">{num(total)} ملف</span></div>
      {failed ? <Note kind="warn">{failed}</Note> : (
        <Table head={["الاسم", "النوع", "الأرقام", "الوحدات", "الصفقات", "آخر تواصل"]} empty="مفيش حد بالبحث ده" onRow={(i) => setOpen(list[i]!.id)}
          rows={list.map((p) => [
            <><b>{p.name}</b>{p.company && <span className="sub">{p.company}</span>}</>,
            <div className="row"><KindChips kind={p.kind} />{p.status === "inactive" && <Chip>Inactive</Chip>}</div>,
            <span className="mono">{p.phones ? p.phones.join(" · ") : "—"}</span>,
            <span className="n">{num(p.units)}</span>,
            <span className="n">{num(p.deals)}</span>,
            ago(p.lastContactAt),
          ])} />
      )}
      {!failed && pages > 1 && (
        <div className="row end">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
      <Note>العميل بيتعمل أوتوماتيك أول ما ليد يوصل Done Deal، والمالك مع أول وحدة ليه. والرقم بيمنع إن نفس الشخص يتسجّل مرتين.</Note>
      {open && <ClientDrawer ids={list.map((p) => p.id)} id={open} file={file.data} error={file.error} onGo={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
