import { z } from "zod";

/** M-08 3.1 · the office assets register and the office boys' rota (task 10.4). Wording from the demo. */
const required = (max: number, missing: string) =>
  z.string({ required_error: missing, invalid_type_error: missing }).trim().min(1, missing).max(max, `${missing} · طويل`);

/** «أصل جديد» + «المكان»; «محتاج صيانة» is changed on the asset afterwards (a new one is «سليم», as in the demo). */
export const OfficeAssetInput = z.object({
  name: required(120, "اكتب اسم الأصل"),
  place: z.string({ invalid_type_error: "المكان كلام" }).trim().max(80, "المكان · طويل").default(""),
  needsRepair: z.boolean({ invalid_type_error: "الحالة سليم أو محتاج صيانة" }).default(false),
});
export type OfficeAssetInput = z.infer<typeof OfficeAssetInput>;

export interface OfficeAssetView { id: string; name: string; place: string; needsRepair: boolean }
/** The register with its last monthly review («اتراجع …» / «ماتراجعش»). */
export interface OfficeAssetsRegister {
  items: OfficeAssetView[];
  lastReview: { at: string; by: string } | null;
  reviewedThisMonth: boolean;
}

/** One row of «جدول الـ Office Boys»: المنطقة · المسؤول · المواعيد. */
export const OfficeBoyShiftInput = z.object({
  area: required(80, "اكتب المنطقة"),
  name: required(60, "اكتب اسم المسؤول"),
  slots: required(120, "اكتب المواعيد"),
});
export type OfficeBoyShiftInput = z.infer<typeof OfficeBoyShiftInput>;
export interface OfficeBoyShiftView extends OfficeBoyShiftInput { id: string }
