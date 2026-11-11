"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { HotUnitOption } from "@places/contracts";
import { Chip, Icon } from "@/components/ui";
import { api } from "@/lib/api";
import { num, short } from "@/lib/format";
import { serverText } from "@/lib/server-text";
import { useTranslations } from "next-intl";
import { TYPE_TONE, type UnitTypeName } from "../inventory/unit-bits";

/**
 * M-04 2.1 step 7 · the Broadcast's Hot Inventory picker: a search over the inventory sheet (code, project, area or
 * space) whose results read like the sheet's rows (cover, code, type, project · area, floor, finishing, space, price),
 * picked with a click or the keyboard; the picked units stay as cards under it.
 */
export function HotUnitPicker({ picked, onChange }: { picked: HotUnitOption[]; onChange: (units: HotUnitOption[]) => void }) {
  const t = useTranslations("marketing.broadcast.new.picker");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => { const id = setTimeout(() => setTerm(q.trim()), 250); return () => clearTimeout(id); }, [q]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const res = useQuery({ queryKey: ["hot-units", term], queryFn: () => api.get<HotUnitOption[]>(`/marketing/broadcasts/hot-units?q=${encodeURIComponent(term)}`), enabled: open });
  const units = res.data ?? [];
  useEffect(() => setActive(0), [term]);

  const isPicked = (id: string) => picked.some((p) => p.id === id);
  const toggle = (u: HotUnitOption) => onChange(isPicked(u.id) ? picked.filter((p) => p.id !== u.id) : [...picked, u]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") e.preventDefault(); // never sends the Broadcast form from the search box
    if (e.key === "Escape") return setOpen(false);
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { e.preventDefault(); return setOpen(true); }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(units.length - 1, i + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    if (e.key === "Enter" && units[active]) toggle(units[active]!);
  };

  return (
    <div className="hot-picker" ref={box}>
      <div className={`hot-search ${open ? "on" : ""}`}>
        <Icon name="search" />
        <input type="search" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label={t("label")}
          placeholder={t("placeholder")} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
        {picked.length > 0 && <Chip tone="acc">{t("pickedCount", { n: picked.length })}</Chip>}
      </div>

      {picked.length > 0 && (
        <div className="hot-tray">
          {picked.map((u) => (
            <div key={u.id} className="hot-card">
              <Thumb u={u} sm />
              <div><span className="mono">{u.code}</span><small><Parts items={[u.project, u.space ? t("meters", { space: num(u.space) }) : ""]} /></small></div>
              <button type="button" className="hot-x" onClick={() => toggle(u)} aria-label={t("remove", { code: u.code })}><Icon name="x" /></button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => onChange([])}>{t("clear")}</button>
        </div>
      )}

      {open && (
        <div className="hot-pop" role="listbox" id={listId} aria-multiselectable="true">
          <div className="hot-pop-head">
            <span>{res.isFetching ? t("searching") : t("results", { n: units.length })}</span>
            <span className="hint">{t("keys")}</span>
          </div>
          {!res.isFetching && units.length === 0 && (
            <div className="hot-empty"><Icon name="building" /><b>{term ? t("noMatch", { q: term }) : t("noUnits")}</b><small>{t("emptyHint")}</small></div>
          )}
          {units.map((u, i) => {
            const on = isPicked(u.id);
            return (
              <div key={u.id} role="option" aria-selected={on} className={`hot-row ${on ? "picked" : ""} ${i === active ? "active" : ""}`}
                onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => toggle(u)}>
                <Thumb u={u} />
                <div className="hot-main">
                  <div className="hot-top"><span className="mono">{u.code}</span><b>{u.project || "—"}</b></div>
                  <small><Parts items={[u.area && serverText(u.area), u.floor && t("floor", { floor: u.floor }), u.condition && serverText(u.condition)]} /></small>
                  <div className="row">
                    <Chip tone={TYPE_TONE[u.type as UnitTypeName] ?? ""}>{u.type}</Chip>
                    {u.divisible && <Chip tone="info">{t("divisible")}</Chip>}
                  </div>
                </div>
                <div className="hot-figs">
                  <b className="num">{u.space ? t("meters", { space: num(u.space) }) : "—"}</b>
                  {u.totalPrice && <span className="num">{short(u.totalPrice)}</span>}
                  {u.pricePerSqm && <small className="num">{t("perMeter", { price: short(u.pricePerSqm) })}</small>}
                </div>
                <span className={`hot-check ${on ? "on" : ""}`} aria-hidden="true">{on && <Icon name="check" />}</span>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

/** Mixed Arabic / English pieces (area, «دور G», "Fully finished") each in its own direction, joined by « · ». */
function Parts({ items }: { items: Array<string | null | false | undefined> }) {
  const shown = items.filter((x): x is string => !!x);
  if (!shown.length) return <>—</>;
  return <>{shown.map((x, i) => <span key={i}>{i > 0 && " · "}<bdi>{x}</bdi></span>)}</>;
}

function Thumb({ u, sm }: { u: HotUnitOption; sm?: boolean }) {
  return (
    <div className={`hot-thumb u-${u.type} ${sm ? "sm" : ""}`}>
      {u.photo ? <img src={u.photo} alt="" loading="lazy" /> : <Icon name="image" />}
      {!sm && u.photoCount > 1 && <span className="num">{u.photoCount}</span>}
    </div>
  );
}
