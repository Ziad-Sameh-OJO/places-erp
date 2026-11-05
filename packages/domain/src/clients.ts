/**
 * M-10 · clients and owners: one file per person, found by their number. A lead that reaches Done Deal makes (or joins)
 * a client file, an owner's first unit makes (or joins) an owner file, and the same person can be both (M-10 3.1 «النوع»).
 */
import type { Piasters } from "./money.ts";
import type { DealStatus } from "./commission.ts";

export const CLIENT_KINDS = ["client", "owner", "both"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];
/** What made the person a file: a deal (client) or a unit (owner). */
export type ClientRole = "client" | "owner";

/** Egypt's country code: +20 1x… / 0020 1x… / 20 1x… are the same mobile as 01x… */
const EG_MOBILE_ABROAD = /^(?:00)?20(1[0-25]\d{8})$/;
const DIGITS = /^\d{7,15}$/;

/**
 * The number as it is stored and compared (M-10 3.1: «الأرقام … بتمنع التكرار», «الموبايل unique بعد ما يتنضّف»):
 * spaces, dashes, brackets and a leading + dropped; an Egyptian mobile written with the country code becomes 01x…
 * Returns null when what's left isn't a phone number (7 to 15 digits).
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.trim().replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!DIGITS.test(digits)) return null;
  const abroad = EG_MOBILE_ABROAD.exec(digits);
  return abroad ? `0${abroad[1]}` : digits;
}

/** The file's kind after the person gets another role: a client who becomes an owner (or the reverse) is «both». */
export function withRole(kind: ClientKind | null, role: ClientRole): ClientKind {
  if (kind === null || kind === role) return role;
  return "both";
}

/** The kind of a file merged from two (M-10 2.2): both roles survive. */
export function mergedKind(a: ClientKind, b: ClientKind): ClientKind {
  return a === b ? a : "both";
}

/** A deal as one party sees it: what that party owes Places on it and what they paid (their side's collections). */
export interface PartyDeal {
  readonly status: DealStatus;
  readonly due: Piasters;
  readonly paid: Piasters;
}

/** Rejected and cancelled deals owe nothing (M-02 Q12). */
const NOTHING_DUE: ReadonlySet<DealStatus> = new Set(["Rejected", "Cancelled"]);

/**
 * M-10 3.2 «إجمالي اللي العميل دفعه، واللي عليه»: over the file's deals, what they paid and what's left. A client owes
 * the client commission and an owner the owner commission, each against their own side's collections; an overpaid
 * deal doesn't lower what's left on another one.
 */
export function partyBalance(deals: readonly PartyDeal[]): { paid: Piasters; remaining: Piasters } {
  let paid = 0;
  let left = 0;
  for (const d of deals) {
    if (NOTHING_DUE.has(d.status)) continue;
    paid += d.paid;
    left += Math.max(0, d.due - d.paid);
  }
  return { paid, remaining: left };
}
