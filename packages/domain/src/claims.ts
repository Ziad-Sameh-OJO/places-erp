/**
 * M-07 · claims, the e-invoice and the cash receipt (9.17), and the document templates they print from (12.12).
 * Accountant's meeting, 4 Nov: the amount in Arabic words, the template words filled in, the claim's states.
 */
import type { Piasters } from "./money.ts";

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

const below1000 = (n: number): string => {
  const h = Math.floor(n / 100), r = n % 100;
  const t = r < 20 ? ONES[r]! : ONES[r % 10] ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]!;
  return [HUNDREDS[h], t].filter(Boolean).join(" و");
};
const scale = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n <= 10 ? `${below1000(n)} ${few}` : `${below1000(n)} ${many}`;

/** A whole number in Arabic words (up to 999,999,999,999): 100000 → «مائة ألف». */
export function numberWords(n: number): string {
  if (!n) return "صفر";
  const b = Math.floor(n / 1e9), m = Math.floor((n % 1e9) / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000;
  return [b && scale(b, "مليار", "ملياران", "مليارات", "مليار"), m && scale(m, "مليون", "مليونان", "ملايين", "مليون"), k && scale(k, "ألف", "ألفان", "آلاف", "ألف"), r && below1000(r)]
    .filter(Boolean).join(" و");
}

/** The amount as it's written on a claim or a receipt: «فقط مائة ألف جنيه مصري لا غير» (piasters, if any, after the pounds). */
export function amountInWords(p: Piasters): string {
  const pounds = Math.trunc(p / 100), piasters = p % 100;
  return `فقط ${numberWords(pounds)} جنيه مصري${piasters ? ` و${numberWords(piasters)} قرش` : ""} لا غير`;
}

/** The words a template fills in by itself (12.12). */
export const TEMPLATE_WORDS = ["الشركة", "الوحدة", "بيانات_الوحدة", "المبلغ", "المبلغ_بالحروف", "نوع_العمولة", "رقم_المطالبة", "التاريخ", "طريقة_الدفع", "رقم_العقد", "القسط"] as const;
export type TemplateWord = (typeof TEMPLATE_WORDS)[number];

/** {الشركة} → its value; an unknown word stays as written so a typo shows on the preview. */
export const fillTemplate = (text: string, values: Partial<Record<TemplateWord, string>>): string =>
  text.replace(/\{([^}]+)\}/g, (m, k: string) => values[k as TemplateWord] ?? m);

/** The claim and its cash receipt (9.17), and the receipt of a contract installment's payment (M-11 2.1 step 4 · 6.7). */
export const DOC_KINDS = ["claim", "receipt", "installment"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export interface DocText { title: string; body: string; closing: string }
/** The demo's wording until the admin edits it («رجّع الافتراضي» goes back to this). */
export const DOC_DEFAULTS: Record<DocKind, DocText> = {
  claim: {
    title: "مطالبة مالية",
    body: "السادة / {الشركة}\nتحية طيبة وبعد،\nنتشرف بمطالبة سيادتكم بسداد مبلغ {المبلغ} ({المبلغ_بالحروف}) قيمة {نوع_العمولة} عن الوحدة {الوحدة}.\nبيانات الوحدة: {بيانات_الوحدة}.",
    closing: "برجاء اعتماد المطالبة وإفادتنا لإصدار الفاتورة الإلكترونية.\nوتفضلوا بقبول فائق الاحترام،\nPlaces · الإدارة المالية",
  },
  receipt: {
    title: "إيصال استلام نقدية",
    body: "استلمنا من السادة / {الشركة} مبلغ {المبلغ} ({المبلغ_بالحروف})\nوذلك مقابل {نوع_العمولة} عن الوحدة {الوحدة} ({بيانات_الوحدة}).\nطريقة الدفع: {طريقة_الدفع} · بموجب المطالبة رقم {رقم_المطالبة}.",
    closing: "وهذا إيصال منا بذلك،\nPlaces · الإدارة المالية",
  },
  installment: {
    title: "إيصال استلام",
    body: "استلمنا من السادة / {الشركة} مبلغ {المبلغ} ({المبلغ_بالحروف})\nوذلك من {القسط} من العقد رقم {رقم_العقد} عن الوحدة {الوحدة}.",
    closing: "وهذا إيصال منا بذلك،\nPlaces · الإدارة المالية",
  },
};

export const CLAIM_STATUSES = ["requested", "issued", "approved", "einvoice", "paid", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  requested: "مستنية اعتماد المالية", issued: "المطالبة اتبعتت · مستنية العميل", approved: "العميل اعتمد · ارفع الفاتورة الإلكترونية",
  einvoice: "الفاتورة الإلكترونية اترفعت · مستنية الدفع", paid: "اتحصّلت · الإيصال جاهز", rejected: "اترفضت",
};

export type ClaimStep = "issue" | "reject" | "clientApproved" | "askReceipt" | "einvoice" | "collect";
/** From which states each step may be taken (the demo's buttons). */
const FROM: Record<ClaimStep, readonly ClaimStatus[]> = {
  issue: ["requested"], reject: ["requested"], clientApproved: ["issued"],
  askReceipt: ["issued", "approved", "einvoice"], einvoice: ["issued", "approved"], collect: ["issued", "approved", "einvoice"],
};
const TO: Partial<Record<ClaimStep, ClaimStatus>> = { issue: "issued", reject: "rejected", clientApproved: "approved", einvoice: "einvoice", collect: "paid" };

/** The state after a step, or the reason it can't be taken now. */
export function claimStep(status: ClaimStatus, step: ClaimStep): { status: ClaimStatus } | { problem: string } {
  if (!FROM[step].includes(status)) return { problem: `المطالبة دي «${CLAIM_STATUS_LABEL[status]}»` };
  return { status: TO[step] ?? status };
}

/** «طريقة الدفع» on the receipt, from where the money landed. */
export const PAY_METHOD: Record<string, string> = { treasury: "نقدي", bank: "تحويل بنكي", wallet: "محفظة إلكترونية" };
