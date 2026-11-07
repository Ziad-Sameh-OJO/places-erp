import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends in this area (see translate.ts for the {placeholder} form). */
export default [
  // documents-setup.service.ts (the claim/receipt PDFs themselves are printed in Arabic)
  ["الختم والإمضا بيرفعهم الـ Super Admin بس", "Only the Super Admin uploads the stamp and signature"],
  ["ارفع صورة PNG أو JPG", "Upload a PNG or JPG image"],
  ["بيانات البنك واللوجو بيعدّلهم الـ Super Admin بس", "Only the Super Admin edits the bank details and logo"],
  ["الجهة مش موجودة", "This entity doesn't exist"],
  ["تحويل بنكي", "Bank transfer"],
  ["التاريخ", "Date"],
  ["الفاتورة الإلكترونية", "E-invoice"],
  ["رقم المطالبة", "Claim no."],
  ["رقم العقد", "Contract no."],
  ["البنك", "Bank"],
  ["اسم الحساب", "Account name"],
  ["رقم الحساب", "Account no."],
  // settings.controller.ts (holidays template, PDF preview sample)
  ["من", "From"],
  ["لحد", "To"],
  ["الإجازة", "Holiday"],
  ["قالب الإجازات الرسمية.xlsx", "Official holidays template.xlsx"],
  ["شركة النيل للتكنولوجيا", "Nile Technology Company"],
  ["Mivida Business Park · مبنى B4 · الدور 2 · 95 م² · متشطب", "Mivida Business Park · Building B4 · Floor 2 · 95 m² · Finished"],
  ["عمولة تأجير", "Rent commission"],
  ["القسط 1 من 12", "Installment 1 of 12"],
  ["{title} · معاينة.pdf", "{title} · preview.pdf"],
  // settings.service.ts
  ["سنوية", "Annual"],
  ["مين يعدّل القوايم بيتحدد من الأدوار والصلاحيات", "Who edits the lists is set in Roles & permissions"],
  ["مش مسموحلك تضيف في «{list}»", "You aren't allowed to add to «{list}»"],
  ["مش مسموحلك توقّف أو ترجّع قيم في «{list}»", "You aren't allowed to turn off or restore values in «{list}»"],
  ["الإعداد ده لـ Super Admin بس", "This setting is for the Super Admin only"],
  ["الإعداد ده بيتعدّل من الأدوار والصلاحيات", "This setting is changed from Roles & permissions"],
  ["التعديل لـ Super Admin أو مدير القسم", "Only the Super Admin or the department manager can change it"],
  ["فيه دور أو شخص مش موجود", "A role or person doesn't exist"],
  ["الشيت فيه {count} خطأ · صلّحهم وارفعه تاني", "The sheet has {count} errors · fix them and upload it again"],
  ["الشيت مفيهوش صفوف", "The sheet has no rows"],
  ["الإجازة دي مش موجودة", "This holiday doesn't exist"],
] satisfies Pair[];
