"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { UnitDetail } from "@places/contracts";
import { Icon } from "@/components/ui";

/** «30.02, 31.48» (the only shape the API takes, contracts `Location`) → [lat, lng]. */
export function parseLocation(v: string | null | undefined): [number, number] | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(v ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * 2.26 · the demo's «الموقع» tab (inventory.js:164): the unit's place on a map, and «افتح في Google Maps». The map is
 * OpenStreetMap through Leaflet: no paid key. Without a location, the demo's empty card «مفيش لوكيشن».
 */
export function UnitLocationTab({ u }: { u: UnitDetail }) {
  const t = useTranslations("inventory.location");
  const at = parseLocation(u.location);
  if (!at) return <div className="map"><Icon name="pin" /><b>{u.project}</b><small className="mono">{t("none")}</small></div>;
  return (
    <>
      <MapView at={at} />
      <div className="row">
        <Icon name="pin" /><b>{u.project}</b><small className="mono"><bdi>{u.location}</bdi></small>
        <span className="spacer" />
        <a className="btn ghost sm" href={`https://maps.google.com/?q=${encodeURIComponent(u.location ?? "")}`} target="_blank" rel="noopener noreferrer">{t("google")}</a>
      </div>
    </>
  );
}

// where the picker opens on a unit with no location yet: New Cairo, where most of the client's units are
const START: [number, number] = [30.03, 31.47];
const DOT = { radius: 9, weight: 3, color: "#fff", fillColor: "#e5372b", fillOpacity: 1 } as const;

/**
 * A Leaflet map with the unit's point. Leaflet touches `window` when loaded, so it's loaded in the browser only.
 * `onPick` (2.27, the unit form): a click puts the point there and hands back «30.02, 31.48», the API's shape.
 */
export function MapView({ at, onPick }: { at: [number, number] | null; onPick?: (location: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const live = useRef<{ L: typeof import("leaflet"); map: LeafletMap; dot?: CircleMarker } | null>(null);
  const first = useRef(at), pick = useRef(onPick);
  const [ready, setReady] = useState(false);
  useEffect(() => { pick.current = onPick; });
  useEffect(() => {
    let gone = false;
    void import("leaflet").then((L) => {
      if (gone || !box.current) return;
      const map = L.map(box.current, { scrollWheelZoom: false }).setView(first.current ?? START, first.current ? 16 : 12);
      map.attributionControl.setPrefix(false); // OpenStreetMap's credit is the one its tiles require
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      map.on("click", (e) => { const p = e.latlng.wrap(); pick.current?.(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`); });
      live.current = { L, map };
      setReady(true);
    });
    return () => { gone = true; live.current?.map.remove(); live.current = null; };
  }, []);
  const [lat, lng] = at ?? [NaN, NaN], picking = !!onPick;
  useEffect(() => {
    const m = live.current;
    if (!m) return;
    if (Number.isNaN(lat)) { m.dot?.remove(); delete m.dot; return; }
    if (m.dot) m.dot.setLatLng([lat, lng]);
    else m.dot = m.L.circleMarker([lat, lng], DOT).addTo(m.map);
    // the drawer follows the unit (prev / next); the picker only moves to a point typed outside the view
    if (!picking) m.map.setView([lat, lng], 16);
    else if (!m.map.getBounds().contains([lat, lng])) m.map.setView([lat, lng], 16);
  }, [ready, lat, lng, picking]);
  return <div className={`map live${onPick ? " pick" : ""}`} ref={box} dir="ltr" />;
}
