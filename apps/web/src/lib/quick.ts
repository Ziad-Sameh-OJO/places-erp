"use client";
/**
 * The side menu's «المفضلة» and «فتحتها مؤخراً» (0.14, demo shell.js): pages starred from the header and the last
 * records opened in a drawer. Kept in this browser only, per person; nothing goes to the API.
 */
import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import type { IconName } from "@places/ui";
import type { ModuleKey } from "@places/domain";
import { useMe } from "./me";

/** The drawers that record themselves, with the link that opens them again (the notifications' links). */
export const RECENT = {
  lead: { module: "leads", icon: "users", href: (id: string) => `/leads?open=${id}` },
  unit: { module: "inventory", icon: "building", href: (id: string) => `/inventory?unit=${id}` },
  deal: { module: "deals", icon: "handshake", href: (id: string) => `/deals?open=${id}` },
  client: { module: "clients", icon: "id", href: (id: string) => `/clients?open=${id}` },
  contract: { module: "contracts", icon: "file", href: (id: string) => `/contracts?open=${id}` },
  ticket: { module: "tickets", icon: "ticket", href: (id: string) => `/tickets?id=${id}` },
  purchase: { module: "procurement", icon: "cart", href: (id: string) => `/procurement?open=${id}` },
} satisfies Record<string, { module: ModuleKey; icon: IconName; href: (id: string) => string }>;
export type RecentKind = keyof typeof RECENT;

const Quick = z.object({
  favs: z.array(z.string()).catch([]),
  recent: z.array(z.object({ kind: z.enum(Object.keys(RECENT) as [RecentKind, ...RecentKind[]]), id: z.string(), label: z.string() })).catch([]),
});
export type QuickState = z.infer<typeof Quick>;
const EMPTY: QuickState = { favs: [], recent: [] };
const MAX_RECENT = 6; // as in the demo

let owner = "";
let state = EMPTY;
const listeners = new Set<() => void>();
const storeKey = (who: string) => `places-quick:${who}`;

function read(who: string): QuickState {
  if (who !== owner) {
    owner = who;
    // private windows and blocked storage throw: the menu just starts empty
    try { state = Quick.parse(JSON.parse(localStorage.getItem(storeKey(who)) ?? "{}")); } catch { state = EMPTY; }
  }
  return state;
}
function write(who: string, next: QuickState) {
  read(who);
  state = next;
  try { localStorage.setItem(storeKey(who), JSON.stringify(next)); } catch { /* kept for this visit only */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** This person's favourites and recents; empty until they're known. */
export function useQuick(who: string | undefined): QuickState {
  return useSyncExternalStore(subscribe, () => (who ? read(who) : EMPTY), () => EMPTY);
}

/** Stars or un-stars a page; true when it was added. */
export function toggleFav(who: string, page: string): boolean {
  const { favs, recent } = read(who);
  const added = !favs.includes(page);
  write(who, { recent, favs: added ? [...favs, page] : favs.filter((f) => f !== page) });
  return added;
}

/** A drawer records itself once its record (and so its label) is loaded. */
export function useRecent(kind: RecentKind, id: string, label: string | undefined) {
  const who = useMe().me?.id;
  useEffect(() => {
    if (!who || !label) return;
    const { favs, recent } = read(who);
    write(who, { favs, recent: [{ kind, id, label }, ...recent.filter((r) => r.kind !== kind || r.id !== id)].slice(0, MAX_RECENT) });
  }, [who, kind, id, label]);
}
