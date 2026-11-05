import { z } from "zod";
import { CalendarDay, Id, Money } from "./common.ts";

/** 12.12 · the stamp and signature, the entities (logo + bank) and the document templates (Settings). */

export interface EntityView { id: string; name: string; logo: string | null; bank: string; accountName: string; accountNo: string; iban: string }
export const EntityPatch = z.object({
  bank: z.string().trim().max(100), accountName: z.string().trim().max(150), accountNo: z.string().trim().max(50), iban: z.string().trim().max(50),
  /** a freshly uploaded image (0.9) */
  logoFileId: Id.optional(),
});
export type EntityPatch = z.infer<typeof EntityPatch>;

export const DocTemplateInput = z.object({
  title: z.string().trim().min(1, "اكتب العنوان").max(100),
  body: z.string().trim().min(1, "اكتب النص").max(3000),
  closing: z.string().trim().max(1000),
});
export type DocTemplateInput = z.infer<typeof DocTemplateInput>;
export interface DocTemplateView extends DocTemplateInput { kind: "claim" | "receipt"; custom: boolean }

export const StampInput = z.object({ kind: z.enum(["stamp", "signature"]), fileId: Id.nullable() });
export type StampInput = z.infer<typeof StampInput>;
/** links to show the images (5 minutes), and who changed them last */
export interface StampView { stamp: string | null; signature: string | null; by: string | null; at: string | null }

export interface DocumentsSetup { entities: EntityView[]; templates: DocTemplateView[]; stamp: StampView }

/** M-07 9.17 · claims. */

export const NewClaim = z.object({
  company: z.string().trim().min(1, "اكتب اسم الشركة").max(200),
  unit: z.string().trim().min(1, "اكتب الوحدة").max(50),
  unitInfo: z.string().trim().min(1, "اكتب بيانات الوحدة").max(500),
  amount: Money.refine((m) => Number(m) > 0, "المبلغ لازم يبقى أكبر من صفر"),
  side: z.enum(["client", "owner"]),
  kind: z.string().trim().min(1, "اكتب نوع العمولة").max(100),
  entityId: Id,
  note: z.string().trim().max(500).optional(),
});
export type NewClaim = z.infer<typeof NewClaim>;

export const RejectClaim = z.object({ why: z.string().trim().min(1, "اكتب سبب الرفض").max(500) });
export const ClaimEinvoice = z.object({ no: z.string().trim().min(1, "اكتب رقم الفاتورة الإلكترونية").max(50), date: CalendarDay });
export type ClaimEinvoice = z.infer<typeof ClaimEinvoice>;
/** «اتحصّلت · اعمل الإيصال»: the receive voucher (9.11) on the claim's amount. */
export const CollectClaim = z.object({ toId: Id, accountId: Id, date: CalendarDay.optional() });
export type CollectClaim = z.infer<typeof CollectClaim>;
export const ClaimFilter = z.object({ status: z.enum(["open", "requested", "approved", "paid", "all"]).default("open") });

export interface ClaimView {
  id: string; no: string; company: string; unit: string; unitInfo: string; amount: string; side: "client" | "owner"; kind: string;
  entity: { id: string; name: string }; note: string | null; status: "requested" | "issued" | "approved" | "einvoice" | "paid" | "rejected"; label: string;
  why: string | null; by: { id: string; name: string }; at: string; receiptAsked: boolean;
  einvoice: { no: string; date: string } | null; receiptNo: string | null; move: { id: string; no: string } | null;
}
/** the claims, the commission revenue lines (41…) a collection is credited to, and who a claim can go out under */
export interface ClaimsView { items: ClaimView[]; incomes: { id: string; code: string; name: string }[]; entities: { id: string; name: string }[] }
