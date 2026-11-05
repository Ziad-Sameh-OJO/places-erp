import { z } from "zod";
import { MAX_UNIT_PHOTOS, UNIT_TYPES, areaRangeProblem, fromDecimal, unitFiguresFit, type UnitStatus, type UnitType } from "@places/domain";
import { CalendarDay, Id, Money, Page } from "./common.ts";
import type { ListItem } from "./settings.ts";

/** M-03 · the inventory: one unit's sheet per type (sources/inventory-unit-fields.md, M-03 3.1), the list's filters. */


const text = (max: number, tooLong: string) => z.string({ invalid_type_error: `${tooLong.split(" ")[0]} كلام` }).trim().max(max, tooLong);
/** An empty field from the form is «not filled», not an empty string in the sheet. */
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
const required = (max: number, missing: string) => z.string({ required_error: missing, invalid_type_error: missing }).trim().min(1, missing).max(max, `${missing} · طويل`);
/** The owner's number as they gave it: a mobile, a landline or a number abroad (7 to 15 digits). */
const Phone = z.string({ required_error: "اكتب الرقم", invalid_type_error: "الرقم غلط" }).transform((s) => s.replace(/[\s\-()]/g, "")).pipe(z.string().regex(/^\+?\d{7,15}$/, "الرقم غلط"));
/** A price per m²: up to 10 digits of pounds (a few extra zeros typed by mistake are refused, not stored). */
const PRICE = /^\d{1,10}(\.\d{1,2})?$/;
const Price = (missing: string) => z.string({ required_error: missing, invalid_type_error: missing }).pipe(Money)
  .refine((m) => !m.startsWith("-"), "السعر مايبقاش بالسالب").refine((m) => PRICE.test(m), "السعر كبير أوي").refine((m) => Number(m) > 0, missing);
const Location = z.string().trim().regex(/^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/, "اللوكيشن «خط العرض, خط الطول» من الخريطة");

/** What every type has (the demo's form top): the agent is who brought the unit → Seller on the deal (M-02). */
const Common = {
  project: required(160, "اكتب الـ Project / اسم المبنى"),
  area: required(80, "اختار الـ Area"),
  space: z.number({ required_error: "اكتب المساحة", invalid_type_error: "المساحة رقم" }).int("المساحة رقم صحيح").positive("المساحة لازم تبقى أكبر من صفر").max(1_000_000, "المساحة كبيرة أوي"),
  condition: required(80, "اختار التشطيب"), // from «الإعدادات ← القوايم ← التشطيب» (12.7); the API checks it's on the list
  floor: optional(text(40, "الدور طويل")),
  building: required(40, "اكتب رقم المبنى"),
  parking: z.number({ invalid_type_error: "الـ Parking رقم" }).int("الـ Parking رقم صحيح").min(0, "الـ Parking مايبقاش بالسالب").max(10_000, "الـ Parking كبير أوي").default(0),
  agentId: z.string({ required_error: "اختار الـ Agent", invalid_type_error: "اختار الـ Agent" }).min(1, "اختار الـ Agent").max(40),
  maintenance: optional(text(80, "الصيانة طويلة")),
  commission: optional(text(80, "الـ Commission طويل")),
  location: optional(Location),
  /** «last update» with the owner; today when it's left empty */
  lastOwnerUpdateAt: optional(CalendarDay),
  /** when it came from the owner / WhatsApp (KPI: entered within 24h) */
  receivedAt: optional(z.string().datetime({ offset: true, message: "وقت الاستلام غلط" })),
  divisible: z.boolean({ invalid_type_error: "تنفع تتقسم؟ اه أو لا" }).default(false),
  minSplit: optional(z.number({ invalid_type_error: "أقل مساحة رقم" }).int("أقل مساحة رقم صحيح").positive("أقل مساحة لازم تبقى أكبر من صفر")),
  splitNote: optional(text(500, "كومنت التقسيم طويل")),
  /** the area tab Manar puts it in (M-03 3.2); empty = by its area */
  areaTabId: optional(z.string({ invalid_type_error: "اختار تاب المساحة" }).max(40)),
  /** «متاحة كمان كـ (نوع تاني)» (Q17): on the Rent and the Resale sheet at once; empty = one type only */
  alsoType: optional(z.enum(["Rent", "Resale"], { errorMap: () => ({ message: "النوع التاني Rent أو Resale" }) })),
};

/** RENT (M-03 3.1): contact, number, price per sqm and the agent are required. */
const Rent = z.object({
  type: z.literal("Rent"),
  ...Common,
  ownerName: required(120, "اكتب الـ Contact"),
  ownerPhone: Phone,
  pricePerSqm: Price("اكتب الـ Price per sqm"),
});
/** RESALE: the demo's required fields (owner, number, price per m²). */
const Resale = z.object({
  type: z.literal("Resale"),
  ...Common,
  ownerName: required(120, "اكتب اسم الأونر"),
  ownerPhone: Phone,
  pricePerSqm: Price("اكتب السعر للمتر"),
  paymentMethod: optional(text(80, "طريقة الدفع طويلة")),
  delivery: optional(text(40, "الـ Delivery date طويل")), // a date, or «فوري»
});
/** INCOME: sale and lease prices per m² (the monthly / annual rent and the yield are computed, 2.3). */
const Income = z.object({
  type: z.literal("Income"),
  ...Common,
  ownerName: required(120, "اكتب الاسم"),
  ownerPhone: optional(Phone),
  pricePerSqm: Price("اكتب الـ Sale price per meter"),
  leasePerSqm: Price("اكتب الـ Lease price per meter"),
  link: optional(text(300, "اللينك طويل")),
  contractDuration: optional(text(40, "مدة العقد طويلة")), // number and text («5 سنين»)
  startsOn: optional(CalendarDay),
  endsOn: optional(CalendarDay),
  escalationPct: optional(z.number({ invalid_type_error: "الـ Escalation رقم" }).min(0, "الـ Escalation مايبقاش بالسالب").max(100, "الـ Escalation نسبة لحد 100")),
  paymentMethod: optional(text(80, "طريقة الدفع طويلة")),
  serviceChargeUsd: optional(Money.refine((m) => !m.startsWith("-"), "الـ Service charge مايبقاش بالسالب")),
  tenant: optional(text(120, "اسم المستأجر طويل")),
  note: optional(text(2000, "الـ Note طويلة")),
});
/** PRIMARY: in the client's KPIs, but its own columns weren't sent yet (needs-client) — the common ones only. */
const Primary = z.object({
  type: z.literal("Primary"),
  ...Common,
  ownerName: optional(text(120, "الاسم طويل")),
  ownerPhone: optional(Phone),
  pricePerSqm: optional(Price("اكتب السعر للمتر")),
  paymentMethod: optional(text(80, "طريقة الدفع طويلة")),
});

/** The unit form (create and edit send the whole sheet). */
export const UnitInput = z.discriminatedUnion("type", [Rent, Resale, Income, Primary], { errorMap: () => ({ message: "اختار الـ Type: Rent أو Resale أو Income أو Primary" }) })
  .refine((u) => unitFiguresFit({
    pricePerSqm: u.pricePerSqm ? fromDecimal(u.pricePerSqm) : null, leasePerSqm: u.type === "Income" ? fromDecimal(u.leasePerSqm) : null, area: u.space,
  }), { path: ["pricePerSqm"], message: "الإجمالي كبير أوي · راجع السعر والمساحة" })
  .refine((u) => u.alsoType !== u.type, { path: ["alsoType"], message: "النوع التاني لازم يبقى غير الـ Type" })
  .refine((u) => !u.minSplit || u.minSplit < u.space, { path: ["minSplit"], message: "أقل مساحة للتقسيم لازم تبقى أصغر من مساحة الوحدة" })
  .refine((u) => u.type !== "Income" || !u.startsOn || !u.endsOn || u.startsOn <= u.endsOn, { path: ["endsOn"], message: "الـ End date قبل الـ Start date" });
export type UnitInput = z.infer<typeof UnitInput>;

const QueryBool = z.enum(["true", "false"]).transform((v) => v === "true");
const QueryInt = z.coerce.number().int().min(0).max(1_000_000);
/** «closed» = the rented / sold sheet (M-03 5.2): rented or sold, or one side of a dual unit closed. */
export const UnitView = z.enum(["available", "closed"]);

/** The list's filters (the demo's toolbar + 2.2: type, area, space, price, status). */
export const UnitFilters = Page.extend({
  q: z.string().trim().max(80).optional(),
  view: UnitView.default("available"),
  type: z.enum(UNIT_TYPES).optional(),
  area: z.string().max(80).optional(),
  condition: z.string().max(80).optional(),
  agentId: Id.optional(),
  minSpace: QueryInt.optional(),
  maxSpace: QueryInt.optional(),
  minPrice: Money.refine((m) => !m.startsWith("-"), "السعر مايبقاش بالسالب").optional(), // on the total price (Rent: a month's rent · the others: the sale price)
  maxPrice: Money.refine((m) => !m.startsWith("-"), "السعر مايبقاش بالسالب").optional(),
  stale: QueryBool.optional(), // «محتاجة ابديت»: last update older than a month
  divisible: QueryBool.optional(), // «تنفع تتقسم»
  tabId: Id.optional(), // an area tab (2.5)
  /** the rented / sold sheet (M-03 5.2): closed between these Cairo days, both included */
  closedFrom: CalendarDay.optional(),
  closedTo: CalendarDay.optional(),
})
  .refine((f) => f.minSpace == null || f.maxSpace == null || f.minSpace <= f.maxSpace, { path: ["maxSpace"], message: "أقصى مساحة أصغر من أقل مساحة" })
  .refine((f) => f.minPrice == null || f.maxPrice == null || Number(f.minPrice) <= Number(f.maxPrice), { path: ["maxPrice"], message: "أقصى سعر أصغر من أقل سعر" })
  .refine((f) => !f.closedFrom || !f.closedTo || f.closedFrom <= f.closedTo, { path: ["closedTo"], message: "«لحد» قبل «من»" });
export type UnitFilters = z.infer<typeof UnitFilters>;

export interface Person { id: string; name: string }

/** A row of the list. Owner name and number only reach people who edit the inventory (the owners' sheet is Manar's). */
export interface UnitRow {
  id: string; code: string; type: UnitType; alsoType: UnitType | null; status: UnitStatus; alsoStatus: UnitStatus | null;
  project: string; area: string; space: number; condition: string; floor: string | null; building: string | null; parking: number;
  ownerName: string | null; ownerPhone: string | null;
  pricePerSqm: string | null; totalPrice: string | null; leasePerSqm: string | null;
  maintenance: string | null; commission: string | null; paymentMethod: string | null;
  divisible: boolean; minSplit: number | null; location: string | null; areaTabId: string | null;
  agent: Person | null; lastOwnerUpdateAt: string; stale: boolean; pdfStatus: "draft" | "confirmed"; createdAt: string;
  /** the columns only one type has (Resale delivery, Income contract…) */
  details: Record<string, string | number | null>;
  /** Income: monthly / annual rent and yield (2.3) */
  income: { monthlyRent: string; annualRent: string; yieldPct: number | null } | null;
  /** the main photo (2.4): a short link, null when it has none; and how many it has («Pic / info») */
  photo: string | null;
  photoCount: number;
  /** its closed sides (Q16 · 2.9): which type, Rented / Sold, when; the deal's code for the inventory team only */
  closings: UnitClosing[];
}
export interface UnitClosing { type: UnitType; status: "rented" | "sold"; at: string; dealCode: string | null }
export interface UnitDetail extends UnitRow {
  splitNote: string | null; receivedAt: string | null; enteredAt: string; createdBy: Person | null; updatedAt: string;
  /** when the photos first went up on the unit (Sara's KPI: within 24h of entering it, 2.16), and whether that was on time */
  mediaUploadedAt: string | null; mediaOnTime: boolean | null;
  /** the Done Deals on it (Q16): waiting for Manar / Randa to confirm, or closed by them */
  locks: UnitLockView[];
}

/** A Done Deal on one side of a unit (Q16 · Q17). `canConfirm`: this person is the one who confirms it (Manar Rent, Randa the rest). */
export interface UnitLockView {
  dealId: string; dealCode: string; type: UnitType; status: "pending" | "locked"; requestedAt: string; lockedAt: string | null; canConfirm: boolean;
}

/** The demo's KPI tiles over the inventory the person can see. */
export interface UnitSummary { available: number; pdfDraft: number; stale: number; divisible: number }
/** The type tabs' counts (الكل · Rent · Resale · Income · Primary · Rented / Sold) under the current filters. */
export interface UnitTabCounts { all: number; Rent: number; Resale: number; Income: number; Primary: number; closed: number }
/** The lists from the settings (12.7): a form offers the active values, a filter all of them (old records keep switched-off ones). */
export interface UnitOptions { areas: ListItem[]; conditions: ListItem[]; agents: Person[]; paymentMethods: ListItem[] }
export interface CreatedUnit { id: string; code: string }

/** An area tab (M-03 7.2): «من» and «لحد» in m², «لحد» empty = and above. */
export const AreaTabInput = z.object({
  min: z.number({ required_error: "اكتب «من»", invalid_type_error: "«من» رقم" }),
  max: z.number({ invalid_type_error: "«لحد» رقم" }).nullable().default(null),
}).superRefine((t, ctx) => { const problem = areaRangeProblem(t); if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["max"] }); });
export type AreaTabInput = z.infer<typeof AreaTabInput>;
/** A tab with its name («101 to 200») and how many available units are in it under the list's filters. */
export interface AreaTabView { id: string; label: string; min: number; max: number | null; count: number }

/** 2.4 · photos uploaded with core/files, added to a unit (appended after the ones it has). */
export const UnitPhotosInput = z.object({
  fileIds: z.array(Id, { required_error: "اختار الصور" }).min(1, "اختار الصور").max(MAX_UNIT_PHOTOS, `لحد ${MAX_UNIT_PHOTOS} صورة`),
});
export type UnitPhotosInput = z.infer<typeof UnitPhotosInput>;
/** The unit's photos in the new order: the first one is the main photo. */
export const UnitPhotoOrder = z.object({ fileIds: z.array(Id).max(MAX_UNIT_PHOTOS) });
export type UnitPhotoOrder = z.infer<typeof UnitPhotoOrder>;
/** One photo with a short link (5 minutes); `main` = the first one. */
export interface UnitPhotoView { id: string; name: string; url: string; main: boolean }

/** 2.16 · a task Manar gives Randa, Sara or Marwa for today (at most 30 each, M-03 3.1). */
export const TeamTaskInput = z.object({
  toUserId: Id.refine(Boolean, "اختار لمين"),
  title: z.string({ required_error: "اكتب المهمة" }).trim().min(1, "اكتب المهمة").max(300, "المهمة طويلة"),
  unitId: optional(Id),
});
export type TeamTaskInput = z.infer<typeof TeamTaskInput>;
/** Someone on Manar's team with how many tasks she gave them today, and how many more she can. */
export interface TeamMember { id: string; name: string; today: number; room: number }
export interface TeamTaskView {
  id: string; title: string; unit: { id: string; code: string } | null; to: Person; by: Person;
  dueOn: string; status: "todo" | "done"; doneAt: string | null; createdAt: string;
}

/** 2.18 · a day's inventory report (M-03 3.1): the system's four numbers and Manar's approval. */
export interface InventoryReportView {
  day: string; newUnits: number; updated: number; closed: number; unconfirmed: number;
  generatedAt: string; approvedAt: string | null; approvedBy: Person | null;
}
export const ReportDay = z.object({ day: CalendarDay.optional() });
export type ReportDay = z.infer<typeof ReportDay>;
