import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends in this area (see translate.ts for the {placeholder} form). */
export default [
  // tickets.service.ts
  ["التذكرة دي مش موجودة أو مش من حقك تشوفها", "This ticket doesn't exist or you aren't allowed to see it"],
  ["الطلب ده بيتقرر من شاشته (الـ Excuse من الـ HR، والـ List من الانفنتوري)", "This request is decided from its own screen (the Excuse from HR, the List from the Inventory)"],
  ["اختار القسم", "Pick the department"],
  ["القسم ده مش في قايمة أقسام التذاكر", "This department isn't in the ticket departments list"],
  ["اتفتحت", "Opened"],
  ["تذكرة جديدة لقسمك: {title}", "New ticket for your department: {title}"],
  ["نوع التذكرة مش موجود", "The ticket type doesn't exist"],
  ["الرد للقسم المسؤول ولصاحب التذكرة بس", "Only the responsible department and the ticket's owner can reply"],
  ["الحالة بيغيّرها القسم المسؤول", "The responsible department changes the status"],
  ["التذكرة اتغيّرت دلوقتي · افتحها تاني", "The ticket just changed · open it again"],
  ["الحالة بقت {status}", "Status is now {status}"],
  ["التحويل للقسم المسؤول بس", "Only the responsible department can transfer it"],
  ["التذكرة في القسم ده أصلاً", "The ticket is already in this department"],
  ["اتحوّلت من {from} لـ {to}", "Transferred from {from} to {to}"],
  ["تذكرة اتحوّلت لقسمك: {title}", "A ticket was transferred to your department: {title}"],
  ["القسم اللي نفّذ الطلب هو اللي يقفل التذكرة", "The department that did the request closes the ticket"],
  ["خلّص الطلب الأول (Resolved) وبعدين اقفلها", "Finish the request first (Resolved), then close it"],
  ["قسم {department} نفّذ الطلب وقفل التذكرة", "The {department} department did the request and closed the ticket"],
  ["التذكرة دي اتقفلت", "This ticket is closed"],
] satisfies Pair[];
