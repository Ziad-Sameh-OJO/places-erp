import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends in this area (see translate.ts for the {placeholder} form). */
export default [
  // office-assets.service.ts
  ["الأصل ده مش موجود في السجل", "This asset isn't in the register"],
  ["الصف ده مش موجود في الجدول", "This row isn't in the table"],
  // purchases.controller.ts (statuses, Excel export)
  ["اتسوّى · مستني المالية", "Settled · waiting for finance"],
  ["اترحّل في المالية", "Posted in finance"],
  ["الطلبات.xlsx", "Requests.xlsx"],
  ["الطلب", "Request"],
  ["الحاجة", "Item"],
  ["المبلغ", "Amount"],
  ["البند", "Account"],
  ["المورد", "Vendor"],
  ["الحالة", "Status"],
  ["طلبه", "Requested by"],
  ["اتطلب", "Requested on"],
  ["وافق / رفض", "Approved / rejected by"],
  ["الطلبات", "Requests"],
  // purchases.service.ts
  ["الطلب ده مش موجود", "This request doesn't exist"],
  ["اختار البند من شجرة الحسابات (مصروف فرعي)", "Pick the account from the chart of accounts (expense sub-account)"],
  ["طلب شراء جديد: {item} · {amount}", "New purchase request: {item} · {amount}"],
  ["الطلب ده اتاخد فيه قرار قبل كده", "A decision was already made on this request"],
  ["الطلب اتغير · افتحه تاني", "The request changed · open it again"],
  ["{item}: اتوافق عليه · جاهز للصرف", "{item}: approved · ready to be paid"],
  ["{item}: اترفض · {reason}", "{item}: rejected · {reason}"],
  ["الطلب لازم يكون اتوافق عليه الأول", "The request has to be approved first"],
  ["اختار الخزنة أو البنك اللي اتدفع منه", "Pick the cash box or bank it was paid from"],
  ["{item}: المبلغ اتغير وقت الدفع · محتاج موافقة تاني", "{item}: the amount changed at payment · needs approval again"],
  ["طلب شراء {no} ({item}) اتسوّى بـ {amount} · مستني تصرفه من الخزنة", "Purchase request {no} ({item}) was settled for {amount} · waiting for you to pay it from the cash box"],
  ["الطلب ده اترحّل قبل كده", "This request was already posted"],
  ["الطلب لسه مااتسوّاش", "The request hasn't been settled yet"],
  ["المالية رحّلت {no} ({item}) · {move}", "Finance posted {no} ({item}) · {move}"],
  ["الملف مش موجود", "The file doesn't exist"],
] satisfies Pair[];
