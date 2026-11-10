import { z } from "zod";
import { MAX_UNIT_PHOTOS, UNIT_TYPES, areaRangeProblem, fromDecimal, unitFiguresFit, type UnitStatus, type UnitType } from "@places/domain";
import { CalendarDay, Id, Money, Page } from "./common.ts";
import type { ListItem } from "./settings.ts";

/** M-03 · the inventory: one unit's sheet per type (sources/inventory-unit-fields.md, M-03 3.1), the list's filters. */


const text = (max: number, tooLong: string) => z.string({ invalid_type_error: `${tooLong.split(" ")[0]} كلام` }).trim().max(max, tooLong);
/** An empty field from the form is «not filled», not an empty string in the sheet. */
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
/** 2.21 · nothing is required: an empty text column is stored as "" and counted as missing (domain missingFields). */
const blank = (max: number, tooLong: string) => z.preprocess((v) => (v === null ? undefined : v), text(max, tooLong).default(""));
/** The owner's number as they gave it: a mobile, a landline or a number abroad (7 to 15 digits). */
const Phone = z.string({ required_error: "اكتب الرقم", invalid_type_error: "الرقم غلط" }).transform((s) => s.replace(/[\s\-()]/g, "")).pipe(z.string().regex(/^\+?\d{7,15}$/, "الرقم غلط"));
/** A price per m²: up to 10 digits of pounds (a few extra zeros typed by mistake are refused, not stored). */
const PRICE = /^\d{1,10}(\.\d{1,2})?$/;
const Price = (missing: string) => z.string({ required_error: missing, invalid_type_error: missing }).pipe(Money)
  .refine((m) => !m.startsWith("-"), "السعر مايبقاش بالسالب").refine((m) => PRICE.test(m), "السعر كبير أوي").refine((m) => Number(m) > 0, missing);
const Location = z.string().trim().regex(/^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/, "اللوكيشن «خط العرض, خط الطول» من الخريطة");

/** What every type has (the demo's form top): the agent is who brought the unit → Seller on the deal (M-02). */
const Common = {
  project: blank(160, "الـ Project طويل"),
  area: blank(80, "الـ Area طويلة"),
  // 0 = not filled yet (2.21)
  space: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.number({ invalid_type_error: "المساحة رقم" }).int("المساحة رقم صحيح").min(0, "المساحة مايبقاش بالسالب").max(1_000_000, "المساحة كبيرة أوي").default(0)),
  condition: blank(80, "التشطيب طويل"), // from «الإعدادات ← القوايم ← التشطيب» (12.7); the API checks it's on the list
  floor: optional(text(40, "الدور طويل")),
  building: optional(text(40, "رقم المبنى طويل")),
  parking: z.number({ invalid_type_error: "الـ Parking رقم" }).int("الـ Parking رقم صحيح").min(0, "الـ Parking مايبقاش بالسالب").max(10_000, "الـ Parking كبير أوي").default(0),
  agentId: optional(z.string({ invalid_type_error: "اختار الـ Agent" }).max(40)),
  maintenance: optional(text(80, "الصيانة طويلة")),
  commission: optional(text(80, "الـ Commission طويل")),
  location: optional(Location),
  /** Book7 «Layout» Yes / No and «Comment» (2.21) */
  layout: z.boolean({ invalid_type_error: "الـ Layout اه أو لا" }).default(false),
  comment: optional(text(2000, "الـ Comment طويل")),
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

/** RENT (Book7, 2.21): nothing required; the rent terms the client's PDF shows (stored in `details`). */
const Rent = z.object({
  type: z.literal("Rent"),
  ...Common,
  ownerName: optional(text(120, "الـ Contact طويل")),
  ownerPhone: optional(Phone),
  pricePerSqm: optional(Price("اكتب الـ Price per sqm")),
  delivery: optional(text(40, "الـ Delivery date طويل")), // «Ready to move» or a date
  upfront: optional(text(40, "الـ Upfront rent طويل")),
  security: optional(text(40, "الـ Security deposit طويل")),
  payment: optional(text(40, "الـ Payment طويل")), // «Quarterly»: how the rent is paid, not the sale payment plans list
  term: optional(text(40, "الـ Term طويل")),
  grace: optional(text(40, "الـ Grace period طويل")),
  escalationPct: optional(z.number({ invalid_type_error: "الـ Annual increase رقم" }).min(0, "الـ Annual increase مايبقاش بالسالب").max(100, "الـ Annual increase نسبة لحد 100")),
});
/** RESALE: nothing required either (2.21). */
const Resale = z.object({
  type: z.literal("Resale"),
  ...Common,
  ownerName: optional(text(120, "اسم الأونر طويل")),
  ownerPhone: optional(Phone),
  pricePerSqm: optional(Price("اكتب السعر للمتر")),
  paymentMethod: optional(text(80, "طريقة الدفع طويلة")),
  delivery: optional(text(40, "الـ Delivery date طويل")), // a date, or «فوري»
});
/** INCOME: sale and lease prices per m² (the monthly / annual rent and the yield are computed, 2.3). */
const Income = z.object({
  type: z.literal("Income"),
  ...Common,
  ownerName: optional(text(120, "الاسم طويل")),
  ownerPhone: optional(Phone),
  pricePerSqm: optional(Price("اكتب الـ Sale price per meter")),
  leasePerSqm: optional(Price("اكتب الـ Lease price per meter")),
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
    pricePerSqm: u.pricePerSqm ? fromDecimal(u.pricePerSqm) : null, leasePerSqm: u.type === "Income" && u.leasePerSqm ? fromDecimal(u.leasePerSqm) : null, area: u.space,
  }), { path: ["pricePerSqm"], message: "الإجمالي كبير أوي · راجع السعر والمساحة" })
  .refine((u) => u.alsoType !== u.type, { path: ["alsoType"], message: "النوع التاني لازم يبقى غير الـ Type" })
  .refine((u) => !u.minSplit || !u.space || u.minSplit < u.space, { path: ["minSplit"], message: "أقل مساحة للتقسيم لازم تبقى أصغر من مساحة الوحدة" })
  .refine((u) => u.type !== "Income" || !u.startsOn || !u.endsOn || u.startsOn <= u.endsOn, { path: ["endsOn"], message: "الـ End date قبل الـ Start date" });
export type UnitInput = z.infer<typeof UnitInput>;

/** 2.29 · «ابديت مع المالك النهارده» from the unit's drawer: today, with an optional word on what the owner said. */
export const OwnerUpdateInput = z.object({ comment: z.string().trim().max(1000, "الكومنت طويل").optional() });
export type OwnerUpdateInput = z.infer<typeof OwnerUpdateInput>;

/** 4.13 · marketing's «Website Ads» switch on a unit: Yes = the ad is on the website. */
export const WebsiteAdInput = z.object({ posted: z.boolean({ required_error: "Website Ads: Yes أو No", invalid_type_error: "Website Ads: Yes أو No" }) });
export type WebsiteAdInput = z.infer<typeof WebsiteAdInput>;

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
  missing: QueryBool.optional(), // «ناقصها بيانات» (2.20)
  tabId: Id.optional(), // an area tab (2.5)
  websiteAd: z.enum(["yes", "no"]).optional(), // 4.13 «Website Ads»: marketing's filter (ignored for anyone else)
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
  maintenance: string | null; commission: string | null; paymentMethod: string | null; layout: boolean; comment: string | null;
  divisible: boolean; minSplit: number | null; location: string | null; areaTabId: string | null;
  agent: Person | null; lastOwnerUpdateAt: string; stale: boolean; pdfStatus: "draft" | "confirmed"; createdAt: string;
  /** 4.13 «Website Ads», marketing's only (absent for anyone else): when and by whom it was marked posted; null = No */
  websiteAd?: { at: string; by: Person | null } | null;
  /** the columns only one type has (Resale delivery, Income contract…) */
  details: Record<string, string | number | null>;
  /** Income: monthly / annual rent and yield (2.3) */
  income: { monthlyRent: string; annualRent: string; yieldPct: number | null } | null;
  /** the main photo (2.4): a short link, null when it has none; and how many it has («Pic / info») */
  photo: string | null;
  photoCount: number;
  /** its closed sides (Q16 · 2.9): which type, Rented / Sold, when; the deal's code for the inventory team only */
  closings: UnitClosing[];
  /** 2.20 · the names of its empty columns (domain missingFields): «ناقص N» until they are filled */
  missing: string[];
  /** 2.31 · an Income unit's Agreement file is up (opened at GET /inventory/units/:id/agreement) */
  agreement: boolean;
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
export interface UnitSummary { available: number; pdfDraft: number; stale: number; divisible: number; missing: number }
/** 2.20 · «مهامي النهارده»: the first units missing data for this person (Manar Rent, Randa the rest), and how many in all. */
export interface MissingUnitsToday { units: { id: string; code: string; missing: string[] }[]; total: number }
/** The type tabs' counts (الكل · Rent · Resale · Income · Primary · Rented / Sold) under the current filters. */
export interface UnitTabCounts { all: number; Rent: number; Resale: number; Income: number; Primary: number; closed: number }
/** The lists from the settings (12.7): a form offers the active values, a filter all of them (old records keep switched-off ones). */
export interface UnitOptions { areas: ListItem[]; conditions: ListItem[]; agents: Person[]; paymentMethods: ListItem[] }
export interface CreatedUnit { id: string; code: string }
/** 2.25 · the PDF's cover and specs page, each a whole HTML page (1280 × 720), for the PDF tab's small preview */
export interface UnitPdfPreview { pages: string[] }

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
/** 2.31 · an Income unit's Agreement: one PDF the editor uploaded through core/files */
export const UnitAgreementInput = z.object({ fileId: Id });
export type UnitAgreementInput = z.infer<typeof UnitAgreementInput>;
/** The unit's photos in the new order: the first one is the main photo. */
/** M-03 6.1 «list of options as pdf»: the picked units in one file for a client — the full deck or the slide, PDF or PowerPoint. */
export const MAX_LIST_UNITS = 20;
export const ListOfOptionsInput = z.object({
  unitIds: z.array(Id, { required_error: "اختار الوحدات" }).min(1, "اختار الوحدات").max(MAX_LIST_UNITS, `لحد ${MAX_LIST_UNITS} وحدة في الـ List`)
    .refine((ids) => new Set(ids).size === ids.length, "الوحدة متكررة في الـ List"),
  kind: z.enum(["pdf", "slide"], { errorMap: () => ({ message: "اختار كامل أو مختصر" }) }),
  format: z.enum(["pdf", "pptx"], { errorMap: () => ({ message: "اختار PDF أو PowerPoint" }) }),
  client: optional(text(120, "اسم العميل طويل")),
});
export type ListOfOptionsInput = z.infer<typeof ListOfOptionsInput>;
export const UnitPhotoOrder = z.object({ fileIds: z.array(Id).max(MAX_UNIT_PHOTOS) });
export type UnitPhotoOrder = z.infer<typeof UnitPhotoOrder>;
/** One file of the folder with a short link (5 minutes); `main` = the first image (the PDF's cover), never a `pdf`. 2.22: `download` saves it instead of opening it; `by`/`at` = who uploaded it, when. */
export interface UnitPhotoView { id: string; name: string; url: string; download: string; pdf: boolean; main: boolean; by: string | null; at: string }

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

/** 2.32 · a Team Leader's «اطلب List من الانفنتوري» (demo invwork.js listReqs): what they want, in words. */
export const ListRequestInput = z.object({
  text: z.string({ required_error: "اكتب عايز List إيه" }).trim().min(3, "اكتب عايز List إيه").max(500, "الطلب طويل · 500 حرف بالكتير"),
});
export type ListRequestInput = z.infer<typeof ListRequestInput>;
/** Marwa's «جهّز وابعت»: the open, confirmed units of the List. `sendAnyway` after the «مش مؤكدة» warning. */
export const SendListInput = z.object({
  unitIds: z.array(Id, { required_error: "اختار الوحدات" }).min(1, "اختار الوحدات").max(MAX_LIST_UNITS, `لحد ${MAX_LIST_UNITS} وحدة في الـ List`)
    .refine((ids) => new Set(ids).size === ids.length, "الوحدة متكررة في الـ List"),
  sendAnyway: z.boolean().default(false),
});
export type SendListInput = z.infer<typeof SendListInput>;
export interface ListRequestRow {
  id: string; text: string; by: Person; createdAt: string; ticketCode: string | null;
  /** sent: when, by whom, the units' codes and how many weren't confirmed */
  doneAt: string | null; doneBy: Person | null; units: string[]; unconfirmed: number;
}
/** The requests the person sees (a TL: their own · the inventory team: all), and what they may do. */
export interface ListRequests { items: ListRequestRow[]; canAsk: boolean; canSend: boolean }
