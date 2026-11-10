import { ForbiddenException } from "@nestjs/common";
import type { DealDetail, DealRow, DealSheet, DealSheetRow } from "@places/contracts";
import { FIELDS, type DealType } from "@places/domain";

/**
 * M-09 field permissions on the deals: a hidden field's value never leaves the API — blank in every row (its kind
 * kept), gone from the collections, TCRs and the split. The screens leave its column, row and input out.
 */
export function hideRow<T extends Omit<DealRow, "tcrs">>(r: T, hidden: ReadonlySet<string>): T {
  if (!hidden.size) return r;
  const h = (k: string) => hidden.has(k);
  return {
    ...r,
    type: h("type") ? ("" as DealType) : r.type, space: h("space") ? 0 : r.space, location: h("location") ? "" : r.location,
    commissionOwner: h("commissionOwner") ? "" : r.commissionOwner, commissionClient: h("commissionClient") ? "" : r.commissionClient,
    note: h("note") ? null : r.note, targetBase: h("targetBase") ? null : r.targetBase,
    execDueAt: h("execDueAt") ? null : r.execDueAt, executedAt: h("executedAt") ? null : r.executedAt,
    papersOk: h("papersOk") ? null : r.papersOk, papersNote: h("papersNote") ? null : r.papersNote,
  };
}

export function hideSheetRow(r: DealSheetRow, hidden: ReadonlySet<string>): DealSheetRow {
  if (!hidden.size) return r;
  const h = (k: string) => hidden.has(k);
  return {
    ...hideRow(r, hidden), source: h("source") ? "" : r.source,
    collectedOwner: h("collectedOwner") ? "" : r.collectedOwner, collectedClient: h("collectedClient") ? "" : r.collectedClient,
    collected: h("collected") ? "" : r.collected, remaining: h("remaining") ? "" : r.remaining,
    payments: h("payments") ? r.payments.map((p) => ({ ...p, amount: "" })) : r.payments,
    shares: h("shares") ? [] : r.shares,
  };
}

export function hideDetail(d: DealDetail, hidden: ReadonlySet<string>): DealDetail {
  if (!hidden.size) return d;
  return { ...hideRow(d, hidden), source: hidden.has("source") ? "" : d.source, tcrs: hidden.has("payments") ? d.tcrs.map((t) => ({ ...t, amount: "", edited: null })) : d.tcrs };
}

export function hideTotals(t: DealSheet["totals"], hidden: ReadonlySet<string>): DealSheet["totals"] {
  const h = (k: string) => hidden.has(k);
  return { ...t, expected: h("expected") ? "" : t.expected, collected: h("collected") ? "" : t.collected, remaining: h("remaining") ? "" : t.remaining, commission: h("commission") ? "" : t.commission };
}

/** A save on a single field the person may not change (hidden or read only) is refused: it would set its value. */
export function mayChange(fixed: ReadonlySet<string>, key: string) {
  if (!fixed.has(key)) return;
  const label = FIELDS.deals?.find((f) => f.key === key)?.label ?? key;
  throw new ForbiddenException(`مش مسموحلك تغيّر «${label}» في الصفقات`);
}
