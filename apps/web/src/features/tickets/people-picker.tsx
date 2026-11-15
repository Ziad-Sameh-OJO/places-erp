"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui";
import { serverText } from "@/lib/server-text";
import { useTicketOptions } from "./use-tickets";

/** 15 Nov · a ticket to named people: search by name, grouped by department; the picked ones show above (× removes). */
export function PeoplePicker({ value, onChange, exclude = [] }: { value: string[]; onChange: (ids: string[]) => void; exclude?: string[] }) {
  const tr = useTranslations("tickets.people");
  const people = useTicketOptions().data?.people ?? [];
  const [q, setQ] = useState("");
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "—";
  const needle = q.trim().toLowerCase();
  const groups = new Map<string, typeof people>();
  for (const p of people) {
    if (value.includes(p.id) || exclude.includes(p.id) || (needle && !p.name.toLowerCase().includes(needle))) continue;
    const d = p.department ?? "—";
    groups.set(d, [...(groups.get(d) ?? []), p]);
  }
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      {value.length > 0 && (
        <div className="row">
          {value.map((id) => <button type="button" key={id} className="btn sm" onClick={() => onChange(value.filter((v) => v !== id))} aria-label={tr("remove", { name: name(id) })}>{name(id)}<Icon name="x" /></button>)}
        </div>
      )}
      <label className="search"><Icon name="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("search")} aria-label={tr("search")} /></label>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {groups.size ? [...groups].map(([d, list]) => (
          <div key={d}>
            <small className="hint">{serverText(d)}</small>
            <div className="row">
              {list.map((p) => <button type="button" key={p.id} className="btn ghost sm" onClick={() => { onChange([...value, p.id]); setQ(""); }}><Icon name="plus" />{p.name}</button>)}
            </div>
          </div>
        )) : <p className="hint">{tr("none")}</p>}
      </div>
    </div>
  );
}
