"use client";
import type { ReactNode } from "react";
import type { UnitDetail, UnitRow } from "@places/contracts";
import { Avatar, Chip, Icon } from "@/components/ui";
import { amount, day, moneyExact, num } from "@/lib/format";

export type UnitTypeName = UnitRow["type"];
export const TYPE_TONE: Record<UnitTypeName, "info" | "acc" | "ok" | "warn"> = { Rent: "info", Resale: "acc", Income: "ok", Primary: "warn" };
export const TypeChip = ({ type }: { type: UnitTypeName }) => <Chip tone={TYPE_TONE[type]}>{type}</Chip>;

type Col = readonly [key: string, label: string];
const RENT: readonly Col[] = [
  ["project", "Project"], ["code", "Code"], ["photos", "Pic & Info"], ["space", "Area"], ["condition", "Conditions"], ["pricePerSqm", "Price/Sqm"], ["total", "Total Price"],
  ["maintenance", "Maintenance"], ["floor", "Floor"], ["commission", "Commission"], ["building", "Building Number"], ["parking", "Parking Slots"], ["location", "Location"],
  ["layout", "Layout"], ["pic", "PIC"], ["resale", "Resale"], ["comment", "Comment"], ["ownerName", "Contact"], ["ownerPhone", "Number"], ["agent", "Agent"], ["lastUpdate", "Last update"],
];
/**
 * The demo's sheet columns per type (M-03 3.1: each type keeps its own sheet's columns and names); «all» is the
 * mixed list and the rented / sold sheet. «Pic / info» counts the unit's photos (2.4); the agreement comes later.
 */
export const COLS: Record<UnitTypeName | "all" | "closed", readonly Col[]> = {
  // 2.21 · the client's Rent sheet (Book7) column for column, then the system's own columns
  Rent: RENT,
  Resale: [["project", "اسم المبنى"], ["code", "الكود"], ["ownerName", "اسم الأونر"], ["ownerPhone", "الرقم"], ["space", "المساحة"], ["floor", "الدور"], ["condition", "التشطيب"], ["pricePerSqm", "السعر للمتر"], ["total", "إجمالي السعر"], ["paymentMethod", "طريقة الدفع"], ["agent", "Agent"], ["maintenance", "صيانة"], ["building", "رقم المبنى"], ["parking", "Parking"], ["commission", "Commission"], ["delivery", "Delivery date"], ["photos", "Pictures"], ["lastUpdate", "Last update"]],
  Income: [["project", "اسم المبنى"], ["code", "الكود"], ["ownerName", "الاسم"], ["ownerPhone", "الرقم"], ["link", "اللينك"], ["space", "Area"], ["floor", "Floor"], ["pricePerSqm", "Sale / m"], ["total", "Sale total"], ["leasePerSqm", "Lease / m"], ["monthly", "Monthly rent"], ["annual", "Annual rent"], ["yield", "Yield %"], ["contract", "Contract"], ["start", "Start"], ["end", "End"], ["escalation", "Escalation"], ["paymentMethod", "Payment"], ["building", "Building"], ["serviceUsd", "Service $/m"], ["tenant", "Tenant"], ["parking", "Parking"], ["commission", "Commission"], ["note", "Note"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
  // Primary's own columns weren't sent yet: it shows the common ones
  Primary: [["code", "Code"], ["project", "Project"], ["area", "Area"], ["space", "Space"], ["condition", "Condition"], ["pricePerSqm", "Price / sqm"], ["total", "Total"], ["floor", "Floor"], ["building", "Build num"], ["parking", "Parking"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
  // the rented / sold sheet (M-03 5.2): which side closed, when and by which deal
  closed: [["code", "Code"], ["closedAs", "اتقفلت"], ["closedAt", "التاريخ"], ["deal", "Done Deal"], ["project", "Project"], ["area", "Area"], ["space", "Space"], ["total", "Total"], ["agent", "Agent"], ["stillOpen", "لسه متاحة"]],
  all: [RENT[0]!, RENT[1]!, ["type", "Type"], ...RENT.slice(2)],
};
const OWNER_KEYS = new Set(["ownerName", "ownerPhone", "deal"]);

/** The columns this person sees: the owners' name and number only for the people who keep the inventory (API too). */
export const columnsFor = (type: UnitTypeName | "all" | "closed", insider: boolean) => COLS[type].filter(([k]) => insider || !OWNER_KEYS.has(k));

// English values sit in <bdi> so «1,5 Month» keeps its order in the RTL table
const text = (v: unknown): ReactNode => (v == null || v === "" ? "—" : <bdi>{String(v)}</bdi>);
const yesNo = (v: boolean) => <Chip tone={v ? "ok" : ""}>{v ? "Yes" : "No"}</Chip>;

/** One cell, as the demo's cell(): money grouped, late updates in red, the map link, Income's figures. */
export function cell(u: UnitRow, key: string): ReactNode {
  const d = u.details;
  switch (key) {
    case "code": return <><span className="mono">{u.code}</span>{u.pdfStatus === "draft" && <> <Chip tone="warn">PDF draft</Chip></>}{u.missing.length > 0 && <> <Chip tone="bad">ناقص {u.missing.length}</Chip></>}</>;
    case "type": return <TypeChip type={u.type} />;
    case "space": return !u.space ? "—" : <bdi className="num">{u.divisible && u.minSplit ? `${num(u.minSplit)} UP TO ${num(u.space)}` : num(u.space)}</bdi>;
    case "layout": return yesNo(u.layout);
    case "pic": return yesNo(u.photoCount > 0);
    case "resale": return yesNo(u.type === "Resale" || u.alsoType === "Resale");
    case "comment": return text(u.comment);
    case "pricePerSqm": case "leasePerSqm": return <span className="num">{amount(u[key])}</span>;
    case "total": return <span className="num">{moneyExact(u.totalPrice)}</span>;
    case "monthly": return <span className="num">{moneyExact(u.income?.monthlyRent ?? null)}</span>;
    case "annual": return <span className="num">{moneyExact(u.income?.annualRent ?? null)}</span>;
    case "yield": return u.income?.yieldPct != null ? <b className="num">{u.income.yieldPct.toFixed(1)}%</b> : "—";
    case "parking": return <span className="num">{num(u.parking)}</span>;
    case "agent": return u.agent ? <span className="who"><Avatar id={u.agent.id} name={u.agent.name} sm /><span>{u.agent.name}</span></span> : "—";
    case "lastUpdate": return u.stale ? <Chip tone="bad">متأخر · {day(u.lastOwnerUpdateAt)}</Chip> : day(u.lastOwnerUpdateAt);
    case "divisible": return u.divisible ? <Chip tone="info">{u.minSplit ? `اه · من ${num(u.minSplit)} م` : "اه"}</Chip> : "—";
    case "location": return u.location
      ? <a className="lnk" href={`https://maps.google.com/?q=${encodeURIComponent(u.location)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="pin" />خريطة</a>
      : "—";
    case "delivery": return typeof d.delivery === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.delivery) ? day(d.delivery) : text(d.delivery);
    case "contract": return text(d.contractDuration);
    case "start": return day(d.startsOn as string | undefined);
    case "end": return day(d.endsOn as string | undefined);
    case "escalation": return d.escalationPct != null ? <span className="num">{d.escalationPct}%</span> : "—";
    case "serviceUsd": return d.serviceChargeUsd != null ? <span className="num">{amount(String(d.serviceChargeUsd))}</span> : "—";
    case "link": case "tenant": case "note": return text(d[key]);
    case "photos": return u.photoCount ? <span className="lnk"><Icon name="image" />{num(u.photoCount)} صورة</span> : "—";
    case "ownerPhone": return u.ownerPhone ? <span className="mono">{u.ownerPhone}</span> : "—";
    case "closedAs": return closedSides(u).map((c) => <Chip key={c.type} tone="bad">{c.type} · {c.status === "sold" ? "Sold" : "Rented"}</Chip>);
    case "closedAt": return u.closings.length ? day(u.closings.at(-1)!.at) : "—";
    case "deal": return u.closings.length ? <span className="mono">{u.closings.map((c) => c.dealCode).filter(Boolean).join(" · ") || "—"}</span> : "—";
    case "stillOpen": return u.alsoType && u.status !== "available" && u.alsoStatus === "available" ? <Chip tone="acc">{u.alsoType}</Chip>
      : u.alsoType && u.alsoStatus !== "available" && u.status === "available" ? <Chip tone="acc">{u.type}</Chip> : "—";
    default: return text((u as unknown as Record<string, unknown>)[key]);
  }
}

/** The closed sides: from the confirmed deals, or the unit's own state for one closed before the deals were in (2.9). */
function closedSides(u: UnitRow): { type: UnitTypeName; status: "rented" | "sold" }[] {
  if (u.closings.length) return u.closings;
  const sides: { type: UnitTypeName; status: "rented" | "sold" }[] = [];
  if (u.status !== "available") sides.push({ type: u.type, status: u.status });
  if (u.alsoType && u.alsoStatus && u.alsoStatus !== "available") sides.push({ type: u.alsoType, status: u.alsoStatus });
  return sides;
}

/** The demo's chips on a unit: type, open / closed, PDF, second type, divisible, late update. */
export function UnitChips({ u }: { u: UnitRow & Partial<Pick<UnitDetail, "locks">> }) {
  return (
    <>
      <TypeChip type={u.type} />
      {u.status !== "available" ? <Chip tone="bad">{u.status === "sold" ? "Sold" : "Rented"}</Chip> : <Chip tone="ok">متاحة</Chip>}
      {u.pdfStatus === "draft" ? <Chip tone="warn">PDF مستني Confirm</Chip> : <Chip tone="ok">PDF منشور للسيلز</Chip>}
      {u.locks?.some((l) => l.status === "pending") && <Chip tone="warn">مستنية تأكيد القفل</Chip>}
      {u.alsoType && (u.alsoStatus && u.alsoStatus !== "available"
        ? <Chip tone="bad">{u.alsoType} اتقفلت</Chip>
        : <Chip tone="acc">متاحة كمان {u.alsoType}</Chip>)}
      {u.divisible && <Chip tone="info">{u.minSplit ? `تتقسم · من ${num(u.minSplit)} م` : "تتقسم"}</Chip>}
      {u.stale && <Chip tone="bad">محتاجة ابديت</Chip>}
    </>
  );
}
