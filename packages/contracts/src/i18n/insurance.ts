import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends about employees' insurance (M-05, HR 15 Nov). */
export default [
  ["جهات التأمين", "Insurance providers"],
  ["التأمينات الاجتماعية", "Social insurance"],
  ["تأمين موظف اتضاف أو اتعدّل", "An employee's insurance was added or changed"],
  ["اتضاف تأمين لـ {name}: {amount} في الشهر", "Insurance added for {name}: {amount} a month"],
  ["اتعدّل تأمين {name}: {amount} في الشهر", "{name}'s insurance changed: {amount} a month"],
  ["اتوقف تأمين {name}", "{name}'s insurance stopped"],
  ["اكتب جهة التأمين", "Enter the insurance provider"],
  ["اكتب متأمن عليه من إمتى", "Enter since when they're insured"],
  ["اسم الجهة طويل", "The provider's name is too long"],
  ["الملاحظة طويلة", "The note is too long"],
  ["المبلغ مايبقاش بالسالب", "The amount can't be negative"],
  ["كفاية 20 ملف في المرة", "20 files at a time at most"],
  ["حساب التأمينات المستحقة (21105) مش موجود في الشجرة", "The accrued insurance account (21105) isn't in the chart"],
] satisfies Pair[];
