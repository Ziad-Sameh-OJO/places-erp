"use client";
import { useEffect, useRef } from "react";

/** «?new=…» in the address: what the global «جديد» menu (0.16) asked the page to open. */
export const newParam = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("new"));

/**
 * Opens a page's own form when the address says `?new=<value>` (0.16 · demo shell.js «اعمل حاجة جديدة»), once,
 * then takes it out of the address so a reload or «back» doesn't open it again. `enabled`: the person may create here
 * (the API still refuses otherwise); the page waits for it when it's known only after `me` loads.
 */
export function useNewParam(value: string, open: () => void, enabled = true) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !enabled || newParam() !== value) return;
    done.current = true;
    open();
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [value, open, enabled]);
}
