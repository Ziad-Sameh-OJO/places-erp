/**
 * M-10 · clients and owners: one file per person, found by their number. A lead that reaches Done Deal makes (or joins)
 * a client file, an owner's first unit makes (or joins) an owner file, and the same person can be both (M-10 3.1 «النوع»).
 */
import type { Piasters } from "./money.ts";
import type { DealStatus } from "./commission.ts";
import type { Grants } from "./permissions.ts";
import { keepsInventory } from "./units.ts";

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

/**
 * M-10 4.1: owners' numbers are for the people who keep the inventory (Manar and Randa, M-03 1.2) and for Operations,
 * who merge files by number (M-10 2.2) — never for sales. A file that is an owner (or both) shows its numbers only to them.
 */
export const seesOwnerNumbers = (g: Pick<Grants, "can">): boolean => keepsInventory(g) || g.can("clients", "approve");
export const showsNumbers = (kind: ClientKind, g: Pick<Grants, "can">): boolean => kind === "client" || seesOwnerNumbers(g);

/**
 * M-10 3.3: a file goes Inactive after a year without dealing with them (no contact, deal or unit update since).
 * The cut-off is the same calendar day a year back, so 5 Nov 2026 makes everything before 5 Nov 2025 Inactive.
 */
export function inactiveBefore(now: Date): Date {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d;
}
export const isInactive = (lastContactAt: Date, now: Date): boolean => lastContactAt < inactiveBefore(now);

/** The file's kind after the person gets another role: a client who becomes an owner (or the reverse) is «both». */
export function withRole(kind: ClientKind | null, role: ClientRole): ClientKind {
  if (kind === null || kind === role) return role;
  return "both";
}

/** The kind of a file merged from two (M-10 2.2): both roles survive. */
export function mergedKind(a: ClientKind, b: ClientKind): ClientKind {
  return a === b ? a : "both";
}

export interface MergeSide {
  readonly kind: ClientKind;
  readonly status: "active" | "inactive";
  readonly company: string | null;
  readonly preferredContact: string | null;
  readonly lastContactAt: Date;
}

/**
 * M-10 2.2: the file kept after Operations approves a merge. It keeps its own name; what it lacks it takes from the
 * other file; both roles survive; it's Active if either was, and its last contact is the later of the two.
 */
export function mergedFile(keep: MergeSide, drop: MergeSide): MergeSide {
  return {
    kind: mergedKind(keep.kind, drop.kind),
    status: keep.status === "active" || drop.status === "active" ? "active" : "inactive",
    company: keep.company ?? drop.company,
    preferredContact: keep.preferredContact ?? drop.preferredContact,
    lastContactAt: keep.lastContactAt > drop.lastContactAt ? keep.lastContactAt : drop.lastContactAt,
  };
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
