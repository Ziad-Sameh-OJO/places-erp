/** M-14 · the events the system notifies about, who gets them by default, and on which channels. */
export type Channel = "app" | "push" | "email";

export interface NotificationEvent {
  readonly key: string;
  readonly label: string;
  /** who receives it, in words (the code resolves the actual people: the lead's owner, the TL, a role…) */
  readonly to: string;
  readonly toRoles: readonly string[];
  readonly channels: readonly Channel[];
  /** important ones stay until read and reach the email even if the person turned email off */
  readonly important: boolean;
}

export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  { key: "lead.assigned", label: "ليد جديد", to: "السيلز المسؤول", toRoles: [], channels: ["app", "push"], important: false },
  { key: "lead.sla_warn", label: "SLA ساعتين ونص", to: "Team Leader", toRoles: ["tl"], channels: ["app", "push", "email"], important: true },
  { key: "lead.pulled", label: "سحب ليد (3 ساعات)", to: "الأوبريشن · Sales Director", toRoles: ["ops", "salesdir"], channels: ["app", "push", "email"], important: true },
  { key: "lead.no_answer", label: "No Answer كل 4 ساعات", to: "السيلز المسؤول", toRoles: [], channels: ["app", "push"], important: false },
  { key: "lead.visit_due", label: "Alarm ميعاد Visit / Meeting", to: "السيلز المسؤول", toRoles: [], channels: ["app", "push"], important: true }, // M-01 3.3 · 1.9
  { key: "lead.visit_not_done", label: "Visit / Meeting معملهاش", to: "الـ HR (من قواعد الليدز)", toRoles: [], channels: ["app", "email"], important: false }, // 1.9 · the lead rules' visit.notDone
  { key: "lead.visit_postpone", label: "طلب تأجيل Visit / Meeting", to: "الـ Team Leader (من قواعد الليدز)", toRoles: [], channels: ["app", "push"], important: false }, // 1.24 · visit.postpone
  { key: "lead.visit_postponed", label: "قرار تأجيل Visit / Meeting", to: "السيلز · الأوبريشن · الـ HR", toRoles: [], channels: ["app"], important: false }, // 1.24 · visit.postponeInfo
  { key: "lead.new_lead", label: "New Lead من Telesales", to: "الأوبريشن", toRoles: ["ops"], channels: ["app", "push"], important: false }, // M-01 2.3 · 1.17
  { key: "lead.draft_admin", label: "Not Interested / Cancellation راح الـ Draft Admin", to: "الأوبريشن (من قواعد الليدز)", toRoles: ["ops"], channels: ["app"], important: false }, // 1.27
  { key: "lead.draft_admin_alarm", label: "Alarm يومي: الـ Draft Admin مستني قرار", to: "الأوبريشن (من قواعد الليدز)", toRoles: ["ops"], channels: ["app"], important: true }, // 1.27
  { key: "lead.duplicate", label: "عميل مكرر", to: "الأوبريشن", toRoles: ["ops"], channels: ["app", "push"], important: false }, // M-01 Q7
  { key: "client.merge", label: "اقتراح دمج ملفين بنفس الموبايل", to: "الأوبريشن", toRoles: ["ops", "opshead"], channels: ["app", "push"], important: false }, // M-10 2.2
  { key: "client.deletion", label: "عميل طالب يمسح بياناته", to: "الإدارة", toRoles: ["admin"], channels: ["app", "email"], important: true }, // M-10 2.3
  { key: "lead.bulk", label: "إدخال جماعي", to: "الأوبريشن", toRoles: ["ops"], channels: ["app", "push"], important: false }, // 1.19: a sheet waits for approval
  { key: "lead.bulk_decided", label: "قرار الإدخال الجماعي", to: "اللي بعت الشيت", toRoles: [], channels: ["app", "push"], important: false }, // 1.19: approved or rejected with its reason
  { key: "lead.new_company", label: "شركة جديدة في ليد", to: "Telesales", toRoles: ["telesales"], channels: ["app", "push"], important: false }, // M-01 2.1 · 6.1 (1.20)
  { key: "lead.tl_note", label: "ملاحظة الـ Team Leader على ليد", to: "السيلز المسؤول", toRoles: [], channels: ["app", "push"], important: false }, // M-01 · 1.33
  { key: "deal.done", label: "Done Deal جديدة / Alarm", to: "الـ Office Manager", toRoles: ["officemgr"], channels: ["app", "push", "email"], important: true },
  // M-02 Q9 · 4 Nov meeting: on approval the accountant is told to collect the commission; a rejection goes back to the salesperson
  { key: "deal.approved", label: "صفقة اتوافق عليها · حصّل عمولة", to: "المحاسب · سيلز الصفقة", toRoles: ["accountant"], channels: ["app", "push"], important: false },
  { key: "deal.marketing", label: "Done Deal للتسويق (الخانات المسموحة)", to: "التسويق", toRoles: ["marketing"], channels: ["app", "push"], important: false }, // M-02 2.1 (7) · Q26
  { key: "deal.rejected", label: "صفقة اترفضت", to: "سيلز الصفقة", toRoles: [], channels: ["app", "push"], important: false },
  { key: "deal.seller", label: "اتسجّلت Seller في الصفقة", to: "الـ Seller", toRoles: [], channels: ["app", "push"], important: false }, // M-02 2.1 (9): after Manar's approval
  { key: "deal.papers", label: "أوراق صفقة فيها خطأ", to: "الـ Office Manager", toRoles: ["officemgr"], channels: ["app", "push"], important: false }, // M-02 3.1 · demo dealPapers
  { key: "deal.tcr", label: "ورقة TCR اتعملت بعد تحصيل · امضي عليها", to: "سيلز الصفقة", toRoles: [], channels: ["app", "push"], important: false }, // M-02 2.3 · 5.12
  { key: "hr.excuse", label: "Excuse / الخامس", to: "الـ HR · الإدارة", toRoles: ["hr", "admin"], channels: ["app", "push", "email"], important: true },
  { key: "hr.forgot_fingerprint", label: "نسي البصمة", to: "الـ HR", toRoles: ["hr"], channels: ["app"], important: false }, // M-05 · 7.3
  { key: "hr.leave_request", label: "طلب إجازة", to: "الـ Team Leader ثم الـ HR", toRoles: [], channels: ["app", "push"], important: false }, // M-05 7.5
  { key: "hr.leave_decided", label: "رد على طلب إجازتك", to: "صاحب الطلب", toRoles: [], channels: ["app", "push"], important: false },
  { key: "hr.leave_escalated", label: "طلب إجازة متأخر الرد عليه (48 ساعة)", to: "الـ HR · الإدارة", toRoles: ["hr", "admin"], channels: ["app", "email"], important: true },
  { key: "hr.penalty", label: "جزاء مقترح من Team Leader", to: "الـ HR", toRoles: ["hr"], channels: ["app"], important: false }, // M-05 7.7
  { key: "hr.action_due", label: "ميعاد «حل الـ HR» من الـ 1-to-1", to: "الـ HR", toRoles: ["hr"], channels: ["app", "email"], important: true }, // M-05 7.8
  { key: "hr.deductions_approved", label: "الـ HR اعتمدت خصومات الشهر", to: "المحاسب", toRoles: ["accountant"], channels: ["app"], important: false }, // M-05 7.9
  { key: "procurement.request", label: "طلب شراء", to: "المعتمدين", toRoles: ["approver"], channels: ["app", "push", "email"], important: false },
  { key: "procurement.reminder", label: "تذكير بطلب شراء مستني موافقة", to: "المعتمدين", toRoles: ["approver"], channels: ["app", "push"], important: false }, // M-08 2.4
  { key: "procurement.decided", label: "طلب شراء اتوافق / اترفض / اترحّل", to: "صاحب الطلب", toRoles: [], channels: ["app", "push"], important: false },
  { key: "procurement.settled", label: "طلب شراء اتسوّى · مستني الصرف", to: "المحاسب", toRoles: ["accountant"], channels: ["app", "email"], important: false },
  { key: "unit.new", label: "وحدة جديدة (Live Alert)", to: "التسويق", toRoles: ["marketing"], channels: ["app", "push"], important: false }, // M-03 7.1
  { key: "task.new", label: "مهمة جديدة ليك", to: "المسؤول عن المهمة", toRoles: [], channels: ["app", "push"], important: false }, // M-04 2.1 step 4
  { key: "task.changed", label: "مهمة اتغيّرت (حالة / Undo / تعديل)", to: "المسؤول عن المهمة · اللي إدّاها", toRoles: [], channels: ["app"], important: false }, // 4.1
  { key: "notactive.in_inventory", label: "رقم في شيت Not Active موجود في الانفنتوري", to: "مدير الانفنتوري", toRoles: ["inventory"], channels: ["app", "push"], important: true }, // M-03 1.1 · 2.3
  { key: "notactive.task", label: "أرقام Not Active اتبعتتلك", to: "اللي اتبعتله", toRoles: [], channels: ["app", "push"], important: false }, // M-03 1.1
  { key: "notactive.done", label: "وحدة جديدة من شيت Not Active", to: "مدير الانفنتوري", toRoles: ["inventory"], channels: ["app", "push"], important: true }, // M-03 1.1 · 7.1
  { key: "unit.published", label: "وحدة اتنشرت للسيلز", to: "التسويق · السيلز", toRoles: ["marketing", "sales"], channels: ["app"], important: false }, // M-03 2.2 (15)
  { key: "inventory.team_task", label: "مهمة من منار", to: "اللي المهمة ليه", toRoles: [], channels: ["app", "push"], important: false }, // M-03 3.1 · 2.16
  { key: "inventory.report_sent", label: "التقرير اليومي للانفنتوري", to: "اللي بيستلموه في «التقارير ومواعيدها»", toRoles: [], channels: ["app", "email"], important: false }, // M-03 3.1 · 2.18
  { key: "unit.close", label: "Done Deal على وحدة · أكّد القفل", to: "منار (Rent) · رندا (Resale / Income)", toRoles: ["inventory", "resale"], channels: ["app", "push"], important: true }, // M-03 Q16
  { key: "task.review", label: "Retouch اترفع · مستني موافقتك", to: "الانفنتوري (منار)", toRoles: ["inventory"], channels: ["app", "push"], important: false }, // M-04 2.2 · 4.3
  { key: "task.delivered", label: "تصوير خلص / Retouch اتوافق عليه", to: "الانفنتوري · التسويق", toRoles: ["inventory", "marketing"], channels: ["app"], important: false }, // 4.3
  { key: "marketing.broadcast", label: "رسالة Broadcast جديدة · ابعتها ودوس Done", to: "السيلز", toRoles: ["sales"], channels: ["app", "push"], important: false }, // M-04 2.1 steps 7-8
  { key: "marketing.company_profile", label: "Company Profile جديد", to: "كل الموظفين", toRoles: [], channels: ["app", "push"], important: false }, // M-04 · Q26: each Update reaches everyone (client, 11 Nov)
  { key: "marketing.post_reminder", label: "Reminder بوست", to: "التسويق", toRoles: ["marketing"], channels: ["app", "push"], important: false },
  { key: "finance.budget", label: "بند قرّب يخلص أو عدّى البادجت", to: "المحاسب", toRoles: ["accountant"], channels: ["app", "email"], important: false }, // M-07 9.2 / 9.9
  { key: "finance.bill_due", label: "ميعاد فاتورة ثابتة", to: "المحاسب", toRoles: ["accountant"], channels: ["app", "email"], important: false }, // M-07 9.16
  { key: "finance.payroll_due", label: "ميعاد صرف المرتبات", to: "المحاسب", toRoles: ["accountant"], channels: ["app", "email"], important: false }, // M-07 9.14
  { key: "finance.payslip", label: "اتصرف مرتبك", to: "صاحب المرتب", toRoles: [], channels: ["app"], important: false }, // M-07 9.14
  { key: "finance.commission_due", label: "عمولات سيلز مستحقة (صفقة اتحصّلت بالكامل)", to: "المحاسب", toRoles: ["accountant"], channels: ["app"], important: false }, // M-07 9.15
  { key: "finance.commission_paid", label: "اتصرفتلك عمولة", to: "السيلز", toRoles: [], channels: ["app", "push"], important: false }, // M-07 9.15
  { key: "finance.claim", label: "مطالبة / فاتورة إلكترونية / إيصال مطلوب", to: "المحاسب", toRoles: ["accountant"], channels: ["app", "email"], important: false }, // M-07 9.17
  { key: "finance.claim_ready", label: "مطالبتك اتعملت / اترفضت / إيصالها جاهز", to: "اللي طلب المطالبة", toRoles: [], channels: ["app", "push"], important: false }, // M-07 9.17
  { key: "contract.value", label: "تغيير قيمة عقد مستني موافقة", to: "الإدارة", toRoles: ["admin"], channels: ["app", "email"], important: false }, // M-11 2.2
  { key: "contract.renewal", label: "تجديد عقد (90/60/30)", to: "السيلز · المالية", toRoles: ["accountant"], channels: ["app", "email"], important: false },
  // M-11 2.1 step 3 · 2.4 · 7.1 and M-02 2.4 (the sales manager hears when collected < due after the day)
  { key: "contract.installment_due", label: "قسط ميعاده بعد 3 أيام", to: "السيلز · المالية", toRoles: ["accountant"], channels: ["app"], important: false },
  { key: "contract.installment_late", label: "قسط اتأخر", to: "السيلز · المالية · مدير المبيعات", toRoles: ["accountant", "salesdir"], channels: ["app", "email"], important: true },
  { key: "contract.installment_escalated", label: "قسط متأخر 7 أيام · تصعيد", to: "الإدارة", toRoles: ["admin"], channels: ["app", "email"], important: true },
  { key: "ticket.new", label: "تذكرة جديدة / اتحوّلت لقسمك", to: "القسم المسؤول", toRoles: [], channels: ["app", "push"], important: false }, // M-06 2.1
  { key: "ticket.late", label: "تذكرة اتأخرت · تصعيد", to: "مدير القسم · نانسي للنزاعات", toRoles: [], channels: ["app", "push", "email"], important: true }, // M-06 2.4
  { key: "list.sent", label: "الـ List جاهزة", to: "الـ Team Leader اللي طلبها", toRoles: [], channels: ["app", "push"], important: false }, // 2.32 · M-12 Marwa
  { key: "kpi.changed", label: "تغيير في الـ KPIs", to: "مسؤول الـ KPIs", toRoles: [], channels: ["app"], important: false }, // 11.14: never about money
  { key: "report.sent", label: "تقرير متجدول اتبعت", to: "مستلمين التقرير", toRoles: [], channels: ["app"], important: false }, // 11.10
  { key: "report.remind", label: "تذكير بتسليم تقرير", to: "اللي بيسلّمه", toRoles: [], channels: ["app"], important: false }, // 11.10
  { key: "report.late", label: "تقرير ماتسلّمش في ميعاده", to: "اللي متحدد في التقرير · المتابع", toRoles: [], channels: ["app"], important: true }, // 11.10
  { key: "report.handed", label: "حد سلّم تقرير", to: "مستلمين التقرير", toRoles: [], channels: ["app"], important: false }, // 11.10
  { key: "target.behind", label: "سيلز تحت معدل التارجت", to: "الـ Team Leader بتاعه", toRoles: [], channels: ["app"], important: false }, // 11.8
  { key: "target.change", label: "تغيير تارجت مستني موافقة", to: "الإدارة · الـ Office Manager", toRoles: ["admin", "officemgr"], channels: ["app"], important: false }, // 11.8
  // 11.6 (M-12 2.1 · 2.3): mid-quarter items under target; the closed result's plan / warning; under 50% twice → HR
  { key: "kpi.mid_quarter", label: "بنود تحت المستهدف في نص الربع", to: "الموظف والمتابع", toRoles: [], channels: ["app", "push"], important: true },
  { key: "kpi.result", label: "نتيجة الربع: خطة تحسين أو إنذار", to: "الموظف والمتابع", toRoles: [], channels: ["app", "email"], important: true },
  { key: "kpi.hr_review", label: "KPI تحت الـ Threshold ربعين ورا بعض", to: "الـ HR", toRoles: ["hr"], channels: ["app", "email"], important: true },
  { key: "kpi.activity", label: "نتيجة Farming / Approach", to: "المتابع · الأوبريشن", toRoles: ["ops"], channels: ["app"], important: false }, // 11.13
  // M-09 2.2 · 7.1: the leaver's direct manager is asked; the asker and whoever gets the work hear the decision
  { key: "access.handover", label: "نقل شغل موظف ماشي", to: "المدير المباشر · اللي طلب النقل · اللي استلم الشغل", toRoles: [], channels: ["app"], important: true },
  { key: "access.changed", label: "تغيير في حسابك أو صلاحياتك", to: "صاحب الحساب", toRoles: [], channels: ["app", "email"], important: true },
  // M-09 6.1: the Super Admin hears of any permission change and of any strange sign-in
  { key: "access.permissions", label: "تغيير في الصلاحيات", to: "Super Admin", toRoles: ["admin"], channels: ["app", "email"], important: true },
  { key: "access.suspicious", label: "دخول غريب", to: "Super Admin", toRoles: ["admin"], channels: ["app", "push", "email"], important: true },
  // M-14 2.3 · 7.1: an email that didn't go out; never by email (that's what's failing), the notification stays in the system
  { key: "mail.failed", label: "إيميل مارجعش", to: "Super Admin", toRoles: ["admin"], channels: ["app"], important: true },
];

/**
 * M-14 2.4 · 3.3: the email queue. The worker sends within a minute; a failed send is tried again a few minutes later
 * (SMTP hiccups pass), and after the last try it is «الإيميل فشل» and the Super Admin is told. The tries and the
 * wait are technical, not a business rule.
 */
export const MAIL_MAX_ATTEMPTS = 3;
export const MAIL_RETRY_MINUTES = 5;
export type MailStatus = "queued" | "sent" | "read" | "failed";
export const MAIL_STATUS_LABEL: Record<MailStatus, string> = { queued: "مستني", sent: "اتبعت", read: "اتقرا", failed: "الإيميل فشل" };

/** After a send failed on try `attempts` (1, 2…): try again later, or give up and tell the Super Admin. */
export function afterMailFailure(attempts: number, now: Date): { status: "queued"; nextAttemptAt: Date } | { status: "failed" } {
  if (attempts >= MAIL_MAX_ATTEMPTS) return { status: "failed" };
  return { status: "queued", nextAttemptAt: new Date(now.getTime() + MAIL_RETRY_MINUTES * 60_000) };
}

/** The send log's state (M-14 3.3): a sent email whose in-app copy was opened is «اتقرا». */
export const mailStatus = (status: string, notificationReadAt: Date | null): MailStatus =>
  status === "sent" && notificationReadAt ? "read" : (status as MailStatus);

export const eventByKey = (key: string): NotificationEvent | undefined => NOTIFICATION_EVENTS.find((e) => e.key === key);

/** The bell's type filter (M-14 5.3): the event's name; one from before types were kept has none. */
export const eventLabel = (key: string | null): string => (key && eventByKey(key)?.label) || "أخرى";

/**
 * The channels one person actually gets for an event: the rule's channels, minus email when the person turned
 * email off — unless the notification is important (Alarm, pulled lead, the 5th excuse…).
 */
export function channelsFor(ruleChannels: readonly Channel[], person: { emailNotifications: boolean }, important: boolean): Channel[] {
  return ruleChannels.filter((c) => c !== "email" || person.emailNotifications || important);
}

/** An event's channels now: the admin's saved rule (M-14 «قواعد الإشعارات») when there is one, else the default. */
export const eventChannels = (e: NotificationEvent, saved: readonly string[] | null | undefined): Channel[] =>
  [...((saved ?? e.channels) as readonly Channel[])];

/**
 * M-14 (51) · 12.10: who of these people also gets the notification on their phone — the channels (the event's
 * rule, or a lead rule's «ch») through each person's preferences. The API's notify() and the worker's jobs both
 * decide with this, so a job's Alarm reaches the phone exactly when the same event from the API would.
 */
export function pushRecipients(channels: readonly Channel[], people: readonly { id: string; emailNotifications: boolean }[], important: boolean): string[] {
  return people.filter((p) => channelsFor(channels, p, important).includes("push")).map((p) => p.id);
}
