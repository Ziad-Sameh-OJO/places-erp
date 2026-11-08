import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends in this area (see translate.ts for the {placeholder} form). */
export default [
  // client-merges.service.ts
  ["طلب الدمج ده مش موجود أو اتقرر قبل كده", "This merge request doesn't exist or was already decided"],
  ["الرقم غلط", "Wrong number"],
  ["الملف ده مش موجود أو مش معاك", "This file doesn't exist or isn't yours"],
  ["مفيش ملف بالرقم ده", "No file has this number"],
  ["الرقم ده على نفس الملف", "This number is on the same file"],
  ["فيه طلب دمج للملفين دول مستني الأوبريشن", "There's already a merge request for these two files waiting for Operations"],
  ["نفس الموبايل {phone}", "Same mobile {phone}"],
  ["اقتراح دمج ملف {name} مع ملف تاني بنفس الموبايل · مستني الأوبريشن", "Suggested merge of {name}'s file with another file with the same mobile · waiting for Operations"],
  ["واحد من الملفين اتدمج أو اتشال · ارفض الطلب ده", "One of the two files was merged or removed · reject this request"],
  // clients.controller.ts (kinds, Excel export)
  ["عميل", "Client"],
  ["مالك", "Owner"],
  ["عميل + مالك", "Client + Owner"],
  ["العملاء والملاك.xlsx", "Clients and owners.xlsx"],
  ["الاسم", "Name"],
  ["الشركة", "Company"],
  ["الأرقام", "Numbers"],
  ["النوع", "Type"],
  ["الوحدات", "Units"],
  ["الصفقات", "Deals"],
  ["الحالة", "Status"],
  ["آخر تواصل", "Last contact"],
  ["العملاء والملاك", "Clients and owners"],
  // clients.service.ts
  ["ابديت مع المالك", "Update with the owner"],
  ["صفقة {code} على {unit}", "Deal {code} on {unit}"],
  ["اختار نوع التواصل من القايمة", "Pick the contact type from the list"],
  ["طلب مسح البيانات اتبعت للإدارة قبل كده", "The data deletion request was already sent to management"],
  ["{client} طالب يمسح بياناته (حماية البيانات) · {reason} · من {name}", "{client} asks to delete their data (data protection) · {reason} · by {name}"],
  ["نفس الشخص: {name} · أرقامه على ملفين", "Same person: {name} · their numbers are on two files"],
  // M-09 field permissions (domain fields/clients.ts)
  ["الاسم", "Name"],
  ["الشركة", "Company"],
  ["دفع · عليه", "Paid · Owes"],
  ["العقود", "Contracts"],
  ["موافق على التواصل التسويقي", "Agrees to marketing contact"],
  ["طلب مسح البيانات", "Data deletion request"],
  ["التاريخ كله", "Full history"],
  ["الحقل ده مقفول عليك", "This field is locked for you"],
] satisfies Pair[];
