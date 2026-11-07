import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends in this area (see translate.ts for the {placeholder} form). */
export default [
  // contracts.service.ts
  ["العقد ده مش موجود", "This contract doesn't exist"],
  ["القسط ده مش موجود", "This installment doesn't exist"],
  ["القسط اتعدّل دلوقتي، جرّب تاني", "The installment just changed, try again"],
  ["الدفعة دي مش موجودة", "This payment doesn't exist"],
  ["القسط {n} من {count}", "Installment {n} of {count}"],
  ["العقد ده مش شغال", "This contract isn't active"],
  ["دي نفس قيمة العقد", "That's the same contract value"],
  ["طلب تغيير قيمة العقد {code} ({company}) من {from} لـ {to} · {reason}", "Request to change contract {code} ({company}) value from {from} to {to} · {reason}"],
  ["مفيش طلب تغيير قيمة على العقد ده", "There's no value change request on this contract"],
  ["الموافقة لحد غير اللي طلب التغيير", "Someone other than the requester must approve"],
  ["الصفقة دي مش موجودة أو لسه ماتوافقش عليها", "This deal doesn't exist or isn't approved yet"],
  ["الصفقة دي ليها عقد بالفعل", "This deal already has a contract"],
  ["ملف العقد لازم يبقى PDF", "The contract file must be a PDF"],
] satisfies Pair[];
