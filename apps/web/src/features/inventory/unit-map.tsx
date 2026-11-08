"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { Map as LeafletMap } from "leaflet";
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

/** A Leaflet map on one point. Leaflet touches `window` when loaded, so it's loaded in the browser only. */
function MapView({ at: [lat, lng] }: { at: [number, number] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: LeafletMap | undefined, gone = false;
    void import("leaflet").then((L) => {
      if (gone || !box.current) return;
      map = L.map(box.current, { scrollWheelZoom: false }).setView([lat, lng], 16);
      map.attributionControl.setPrefix(false); // OpenStreetMap's credit is the one its tiles require
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      L.circleMarker([lat, lng], { radius: 9, weight: 3, color: "#fff", fillColor: "#e5372b", fillOpacity: 1 }).addTo(map);
    });
    return () => { gone = true; map?.remove(); };
  }, [lat, lng]);
  return <div className="map live" ref={box} dir="ltr" />;
}
