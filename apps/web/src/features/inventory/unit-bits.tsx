"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { UnitDetail, UnitRow } from "@places/contracts";
import { locationUrl } from "@places/domain";
import { Avatar, Chip, Icon } from "@/components/ui";
import { amount, day, moneyExact, num } from "@/lib/format";
import type inventory from "@/i18n/messages/ar/inventory.json";
import { UnitFolder } from "./unit-photos";
import { UnitLayoutFolder } from "./unit-layout";
import { serverText } from "@/lib/server-text";

export type UnitTypeName = UnitRow["type"];
export const TYPE_TONE: Record<UnitTypeName, "info" | "acc" | "ok" | "warn"> = { Rent: "info", Resale: "acc", Income: "ok", Primary: "warn" };
export const TypeChip = ({ type }: { type: UnitTypeName }) => <Chip tone={TYPE_TONE[type]}>{type}</Chip>;

/** The inventory namespace's translator, for the helpers here that build a sheet's words. */
export type InventoryT = ReturnType<typeof useTranslations<"inventory">>;
/** A column named in the client's own English stays a literal; one the client named in Arabic is a key in inventory.cols. */
export type ColWord = keyof typeof inventory.cols;
type Col = readonly [key: string, label: string | { w: ColWord }];
export const w = (k: ColWord) => ({ w: k });
const RENT: readonly Col[] = [
  ["project", "Project"], ["code", "Code"], ["photos", "Pic & Info"], ["space", "Area"], ["condition", "Conditions"], ["pricePerSqm", "Price/Sqm"], ["total", "Total Price"],
  ["maintenance", "Maintenance"], ["floor", "Floor"], ["commission", "Commission"], ["building", "Building Number"], ["parking", "Parking Slots"], ["location", "Location"],
  ["layout", "Layout file"], ["pic", "PIC"], ["resale", "Resale"], ["comment", "Comment"], ["ownerName", "Contact"], ["ownerPhone", "Number"], ["agent", "Agent"], ["lastUpdate", "Last update"],
];
/**
 * The demo's sheet columns per type (M-03 3.1: each type keeps its own sheet's columns and names); «all» is the
 * mixed list and the rented / sold sheet. «Pic / info» counts the unit's photos (2.4); Income's «Agreement» opens its file (2.31).
 */
export const COLS: Record<UnitTypeName | "all" | "closed", readonly Col[]> = {
  // 2.21 · the client's Rent sheet (Book7) column for column, then the system's own columns
  Rent: RENT,
  Resale: [["project", w("buildingName")], ["code", w("code")], ["ownerName", w("ownerName")], ["ownerPhone", w("number")], ["space", w("space")], ["floor", w("floor")], ["condition", w("finishing")], ["pricePerSqm", w("pricePerSqm")], ["total", w("totalPrice")], ["paymentMethod", w("paymentMethod")], ["agent", "Agent"], ["maintenance", w("maintenance")], ["building", w("buildingNumber")], ["parking", "Parking"], ["commission", "Commission"], ["delivery", "Delivery date"], ["photos", "Pictures"], ["lastUpdate", "Last update"]],
  Income: [["project", w("buildingName")], ["code", w("code")], ["ownerName", w("name")], ["ownerPhone", w("number")], ["link", w("link")], ["space", "Area"], ["floor", "Floor"], ["pricePerSqm", "Sale / m"], ["total", "Sale total"], ["leasePerSqm", "Lease / m"], ["monthly", "Monthly rent"], ["annual", "Annual rent"], ["yield", "Yield %"], ["contract", "Contract"], ["start", "Start"], ["end", "End"], ["escalation", "Escalation"], ["paymentMethod", "Payment"], ["building", "Building"], ["serviceUsd", "Service $/m"], ["tenant", "Tenant"], ["parking", "Parking"], ["commission", "Commission"], ["agreement", "Agreement"], ["note", "Note"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
  // Primary's own columns weren't sent yet: it shows the common ones
  Primary: [["code", "Code"], ["project", "Project"], ["area", "Area"], ["space", "Space"], ["condition", "Condition"], ["pricePerSqm", "Price / sqm"], ["total", "Total"], ["floor", "Floor"], ["building", "Build num"], ["parking", "Parking"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
  // the rented / sold sheet (M-03 5.2): which side closed, when and by which deal
  closed: [["code", "Code"], ["closedAs", w("closedAs")], ["closedAt", w("date")], ["deal", "Done Deal"], ["project", "Project"], ["area", "Area"], ["space", "Space"], ["total", "Total"], ["agent", "Agent"], ["stillOpen", w("stillOpen")]],
  all: [RENT[0]!, RENT[1]!, ["type", "Type"], ...RENT.slice(2)],
};
const OWNER_KEYS = new Set(["ownerName", "ownerPhone", "deal"]);

/** The columns this person sees: the owners' name and number only for the people who keep the inventory (API too). */
/** `hidden`: the fields the person's role doesn't see (M-09 field permissions). */
export const columnsFor = (type: UnitTypeName | "all" | "closed", insider: boolean, t: InventoryT, hidden: ReadonlySet<string> = new Set()): [key: string, label: string][] =>
  COLS[type].filter(([k]) => (insider || !OWNER_KEYS.has(k)) && !hidden.has(k)).map(([k, l]) => [k, typeof l === "string" ? l : t(`cols.${l.w}`)]);

// English values sit in <bdi> so «1,5 Month» keeps its order in the RTL table
const text = (v: unknown): ReactNode => (v == null || v === "" ? "—" : <bdi>{String(v)}</bdi>);
const yesNo = (v: boolean) => <Chip tone={v ? "ok" : ""}>{v ? "Yes" : "No"}</Chip>;

/** One cell, as the demo's cell(): money grouped, late updates in red, the map link, Income's figures. */
export function cell(u: UnitRow, key: string, t: InventoryT): ReactNode {
  const d = u.details;
  switch (key) {
    case "code": return <><span className="mono">{u.code}</span>{u.pdfStatus === "draft" && <> <Chip tone="warn">PDF draft</Chip></>}{u.missing.length > 0 && <> <Chip tone="bad">{t("cell.missing", { count: u.missing.length })}</Chip></>}</>;
    case "type": return <TypeChip type={u.type} />;
    case "space": return !u.space ? "—" : <bdi className="num">{u.divisible && u.minSplit ? `${num(u.minSplit)} UP TO ${num(u.space)}` : num(u.space)}</bdi>;
    case "area": case "condition": return u[key] ? serverText(u[key]) : "—"; // list values: the default ones have English names
    case "layout": return <UnitLayoutFolder u={u} label={<><Icon name="file" />{u.layoutCount ? t("cell.files", { count: u.layoutCount }) : t("cell.empty")}</>} />; // 2.35: opens the Layout folder
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
    case "lastUpdate": return u.stale ? <Chip tone="bad">{t("cell.late", { day: day(u.lastOwnerUpdateAt) })}</Chip> : day(u.lastOwnerUpdateAt);
    case "divisible": return u.divisible ? <Chip tone="info">{u.minSplit ? t("cell.yesFrom", { min: num(u.minSplit) }) : t("cell.yes")}</Chip> : "—";
    case "location": return <LocationLink location={u.location} />;
    case "delivery": return typeof d.delivery === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.delivery) ? day(d.delivery) : text(d.delivery);
    case "contract": return text(d.contractDuration);
    case "start": return day(d.startsOn as string | undefined);
    case "end": return day(d.endsOn as string | undefined);
    case "escalation": return d.escalationPct != null ? <span className="num">{d.escalationPct}%</span> : "—";
    case "serviceUsd": return d.serviceChargeUsd != null ? <span className="num">{amount(String(d.serviceChargeUsd))}</span> : "—";
    case "link": case "tenant": case "note": return text(d[key]);
    case "agreement": return <AgreementLink u={u} t={t} />;
    case "photos": return <UnitFolder u={u} label={<><Icon name="folder" />{u.photoCount ? t("cell.files", { count: u.photoCount }) : t("cell.empty")}</>} />; // 2.22: opens the folder
    case "ownerPhone": return u.ownerPhone ? <span className="mono">{u.ownerPhone}</span> : "—";
    case "closedAs": return closedSides(u).map((c) => <Chip key={c.type} tone="bad">{c.type} · {c.status === "sold" ? "Sold" : "Rented"}</Chip>);
    case "closedAt": return u.closings.length ? day(u.closings.at(-1)!.at) : "—";
    case "deal": return u.closings.length ? <span className="mono">{u.closings.map((c) => c.dealCode).filter(Boolean).join(" · ") || "—"}</span> : "—";
    case "stillOpen": return u.alsoType && u.status !== "available" && u.alsoStatus === "available" ? <Chip tone="acc">{u.alsoType}</Chip>
      : u.alsoType && u.alsoStatus !== "available" && u.status === "available" ? <Chip tone="acc">{u.type}</Chip> : "—";
    default: return text((u as unknown as Record<string, unknown>)[key]);
  }
}

/**
 * 2.34 · the Google Maps link itself (demo `locLink`): shortened in the sheet, whole in the drawer; an old «lat, lng»
 * opens as a search for the point (domain locationUrl). A new tab, never the app's.
 */
export function LocationLink({ location, full }: { location: string | null; full?: boolean }) {
  const url = locationUrl(location);
  if (!url) return <>—</>;
  const bare = url.replace(/^https?:\/\/(www\.)?/, "");
  const shown = full ? url : bare.slice(0, 26) + (url.length > 34 ? "…" : "");
  return <a className="lnk loc-lnk" href={url} target="_blank" rel="noopener noreferrer" dir="ltr" title={url} onClick={(e) => e.stopPropagation()}><Icon name="pin" />{shown}</a>;
}

/** 2.31 · an Income unit's Agreement: the API checks who may open it and sends them to the file. */
export const AgreementLink = ({ u, t }: { u: UnitRow; t: InventoryT }) => (u.agreement
  ? <a className="lnk" href={`/api/v1/inventory/units/${u.id}/agreement`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="file" />{t("cell.openFile")}</a>
  : <>—</>);

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
  const t = useTranslations("inventory.chips");
  return (
    <>
      <TypeChip type={u.type} />
      {u.status !== "available" ? <Chip tone="bad">{u.status === "sold" ? "Sold" : "Rented"}</Chip> : <Chip tone="ok">{t("available")}</Chip>}
      {u.pdfStatus === "draft" ? <Chip tone="warn">{t("pdfDraft")}</Chip> : <Chip tone="ok">{t("pdfPublished")}</Chip>}
      {u.locks?.some((l) => l.status === "pending") && <Chip tone="warn">{t("lockPending")}</Chip>}
      {u.alsoType && (u.alsoStatus && u.alsoStatus !== "available"
        ? <Chip tone="bad">{t("alsoClosed", { type: u.alsoType })}</Chip>
        : <Chip tone="acc">{t("alsoAvailable", { type: u.alsoType })}</Chip>)}
      {u.divisible && <Chip tone="info">{u.minSplit ? t("divisibleFrom", { min: num(u.minSplit) }) : t("divisible")}</Chip>}
      {u.stale && <Chip tone="bad">{t("stale")}</Chip>}
    </>
  );
}
