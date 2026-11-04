"use client";
import type { ReactNode } from "react";
import type { UnitRow } from "@places/contracts";
import { Avatar, Chip, Icon } from "@/components/ui";
import { amount, day, money, num } from "@/lib/format";

export type UnitTypeName = UnitRow["type"];
export const TYPE_TONE: Record<UnitTypeName, "info" | "acc" | "ok" | "warn"> = { Rent: "info", Resale: "acc", Income: "ok", Primary: "warn" };
export const TypeChip = ({ type }: { type: UnitTypeName }) => <Chip tone={TYPE_TONE[type]}>{type}</Chip>;

type Col = readonly [key: string, label: string];
/**
 * The demo's sheet columns per type (M-03 3.1: each type keeps its own sheet's columns and names); «all» is the
 * mixed list and the rented / sold sheet. Pictures and the agreement come with the unit's files (2.4).
 */
export const COLS: Record<UnitTypeName | "all", readonly Col[]> = {
  Rent: [["project", "Project"], ["code", "Code"], ["ownerName", "Contact"], ["ownerPhone", "Number"], ["space", "Gross area"], ["condition", "Conditions"], ["pricePerSqm", "Price / sqm"], ["total", "Total price"], ["maintenance", "Maintenance"], ["floor", "Floor"], ["commission", "Commission"], ["agent", "Agent"], ["building", "Build num"], ["parking", "Parking"], ["location", "Location"], ["lastUpdate", "Last update"]],
  Resale: [["project", "اسم المبنى"], ["code", "الكود"], ["ownerName", "اسم الأونر"], ["ownerPhone", "الرقم"], ["space", "المساحة"], ["floor", "الدور"], ["condition", "التشطيب"], ["pricePerSqm", "السعر للمتر"], ["total", "إجمالي السعر"], ["paymentMethod", "طريقة الدفع"], ["agent", "Agent"], ["maintenance", "صيانة"], ["building", "رقم المبنى"], ["parking", "Parking"], ["commission", "Commission"], ["delivery", "Delivery date"], ["lastUpdate", "Last update"]],
  Income: [["project", "اسم المبنى"], ["code", "الكود"], ["ownerName", "الاسم"], ["ownerPhone", "الرقم"], ["link", "اللينك"], ["space", "Area"], ["floor", "Floor"], ["pricePerSqm", "Sale / m"], ["total", "Sale total"], ["leasePerSqm", "Lease / m"], ["monthly", "Monthly rent"], ["annual", "Annual rent"], ["yield", "Yield %"], ["contract", "Contract"], ["start", "Start"], ["end", "End"], ["escalation", "Escalation"], ["paymentMethod", "Payment"], ["building", "Building"], ["serviceUsd", "Service $/m"], ["tenant", "Tenant"], ["parking", "Parking"], ["commission", "Commission"], ["note", "Note"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
  // Primary's own columns weren't sent yet: it shows the common ones
  Primary: [["code", "Code"], ["project", "Project"], ["area", "Area"], ["space", "Space"], ["condition", "Condition"], ["pricePerSqm", "Price / sqm"], ["total", "Total"], ["floor", "Floor"], ["building", "Build num"], ["parking", "Parking"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
  all: [["code", "Code"], ["type", "Type"], ["project", "Project"], ["area", "Area"], ["space", "Space"], ["condition", "Condition"], ["total", "Total"], ["divisible", "تتقسم؟"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
};
const OWNER_KEYS = new Set(["ownerName", "ownerPhone"]);

/** The columns this person sees: the owners' name and number only for the people who keep the inventory (API too). */
export const columnsFor = (type: UnitTypeName | "all", insider: boolean) => COLS[type].filter(([k]) => insider || !OWNER_KEYS.has(k));

const text = (v: unknown): ReactNode => (v == null || v === "" ? "—" : String(v));

/** One cell, as the demo's cell(): money grouped, late updates in red, the map link, Income's figures. */
export function cell(u: UnitRow, key: string): ReactNode {
  const d = u.details;
  switch (key) {
    case "code": return <><span className="mono">{u.code}</span>{u.pdfStatus === "draft" && <> <Chip tone="warn">PDF draft</Chip></>}</>;
    case "type": return <TypeChip type={u.type} />;
    case "space": return <span className="num">{num(u.space)}</span>;
    case "pricePerSqm": case "leasePerSqm": return <span className="num">{amount(u[key])}</span>;
    case "total": return <span className="num">{money(u.totalPrice)}</span>;
    case "monthly": return <span className="num">{money(u.income?.monthlyRent ?? null)}</span>;
    case "annual": return <span className="num">{money(u.income?.annualRent ?? null)}</span>;
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
    case "ownerPhone": return u.ownerPhone ? <span className="mono">{u.ownerPhone}</span> : "—";
    default: return text((u as unknown as Record<string, unknown>)[key]);
  }
}

/** The demo's chips on a unit: type, open / closed, PDF, second type, divisible, late update. */
export function UnitChips({ u }: { u: UnitRow }) {
  return (
    <>
      <TypeChip type={u.type} />
      {u.status !== "available" ? <Chip tone="bad">{u.status === "sold" ? "Sold" : "Rented"}</Chip> : <Chip tone="ok">متاحة</Chip>}
      {u.pdfStatus === "draft" ? <Chip tone="warn">PDF مستني Confirm</Chip> : <Chip tone="ok">PDF منشور للسيلز</Chip>}
      {u.alsoType && (u.alsoStatus && u.alsoStatus !== "available"
        ? <Chip tone="bad">{u.alsoType} اتقفلت</Chip>
        : <Chip tone="acc">متاحة كمان {u.alsoType}</Chip>)}
      {u.divisible && <Chip tone="info">{u.minSplit ? `تتقسم · من ${num(u.minSplit)} م` : "تتقسم"}</Chip>}
      {u.stale && <Chip tone="bad">محتاجة ابديت</Chip>}
    </>
  );
}
