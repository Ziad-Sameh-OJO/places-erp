"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("clients.list");
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
  const seg: [ClientQuery["kind"], string][] = [[undefined, t("all")], ["client", t("clients")], ["owner", t("owners")]];

  return (
    <>
      <div className="kpis">
        <KpiTile label={t("tiles.clients")} value={s ? num(s.clients) : "…"} sub={t("tiles.clientsSub")} icon="handshake" />
        <KpiTile label={t("tiles.owners")} value={s ? num(s.owners) : "…"} sub={t("tiles.ownersSub")} icon="building" tone="ok" />
        <KpiTile label={t("stale")} value={s ? num(s.ownersStale) : "…"} sub={t("tiles.staleSub")} icon="clock" tone="bad" onClick={() => filter({ ...f, stale: "true" })} />
        <KpiTile label={t("tiles.both")} value={s ? num(s.both) : "…"} sub={t("tiles.bothSub")} icon="users" tone="warn" />
      </div>
      <MergeQueue />
      <div className="toolbar">
        <label className="search"><Icon name="search" /><input type="search" placeholder={t("search")} value={f.q ?? ""} onChange={(e) => filter({ ...f, q: e.target.value })} aria-label={t("searchLabel")} /></label>
        <div className="seg" role="group" aria-label={t("kind")}>
          {seg.map(([k, label]) => <button key={label} aria-pressed={f.kind === k} onClick={() => filter({ ...f, kind: k })}>{label}</button>)}
        </div>
        {/* M-10 6.1 the owners needing an update · M-10 3.3 a year without dealing */}
        <label className="tog"><input type="checkbox" checked={!!f.stale} onChange={(e) => filter({ ...f, stale: e.target.checked ? "true" : undefined })} /><span>{t("stale")}</span></label>
        <label className="tog"><input type="checkbox" checked={f.status === "inactive"} onChange={(e) => filter({ ...f, status: e.target.checked ? "inactive" : undefined })} /><span>Inactive</span></label>
        <span className="spacer" />
        <ExportButton module="clients" path="/clients/export" query={filterQuery(f)} filename={t("exportFile")} label={t("export")} />
      </div>
      <div className="row"><span className="hint num">{t("files", { count: total, n: num(total) })}</span></div>
      {failed ? <Note kind="warn">{failed}</Note> : (
        <Table head={[t("head.name"), t("kind"), t("head.phones"), t("head.units"), t("head.deals"), t("head.lastContact")]} empty={t("empty")} onRow={(i) => setOpen(list[i]!.id)}
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
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("prev")}</button>
          <span className="hint">{page} / {pages}</span>
          <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("next")}</button>
        </div>
      )}
      <Note>{t("note")}</Note>
      {open && <ClientDrawer ids={list.map((p) => p.id)} id={open} file={file.data} error={file.error} onGo={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
