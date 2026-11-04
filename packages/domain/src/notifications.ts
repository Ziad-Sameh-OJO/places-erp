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
  { key: "lead.duplicate", label: "عميل مكرر", to: "الأوبريشن", toRoles: ["ops"], channels: ["app", "push"], important: false }, // M-01 Q7
  { key: "deal.done", label: "Done Deal جديدة / Alarm", to: "الـ Office Manager", toRoles: ["officemgr"], channels: ["app", "push", "email"], important: true },
  { key: "hr.excuse", label: "Excuse / الخامس", to: "الـ HR · الإدارة", toRoles: ["hr", "admin"], channels: ["app", "push", "email"], important: true },
  { key: "hr.leave_request", label: "طلب إجازة", to: "الـ Team Leader ثم الـ HR", toRoles: [], channels: ["app", "push"], important: false }, // M-05 7.5
  { key: "hr.leave_decided", label: "رد على طلب إجازتك", to: "صاحب الطلب", toRoles: [], channels: ["app", "push"], important: false },
  { key: "hr.leave_escalated", label: "طلب إجازة متأخر الرد عليه (48 ساعة)", to: "الـ HR · الإدارة", toRoles: ["hr", "admin"], channels: ["app", "email"], important: true },
  { key: "hr.penalty", label: "جزاء مقترح من Team Leader", to: "الـ HR", toRoles: ["hr"], channels: ["app"], important: false }, // M-05 7.7
  { key: "hr.action_due", label: "ميعاد «حل الـ HR» من الـ 1-to-1", to: "الـ HR", toRoles: ["hr"], channels: ["app", "email"], important: true }, // M-05 7.8
  { key: "procurement.request", label: "طلب شراء", to: "المعتمدين", toRoles: ["approver"], channels: ["app", "push", "email"], important: false },
  { key: "unit.new", label: "وحدة جديدة (Live Alert)", to: "التسويق", toRoles: ["marketing"], channels: ["app", "push"], important: false }, // M-03 7.1
  { key: "marketing.post_reminder", label: "Reminder بوست", to: "التسويق", toRoles: ["marketing"], channels: ["app", "push"], important: false },
  { key: "finance.budget", label: "بند قرّب يخلص أو عدّى البادجت", to: "المحاسب", toRoles: ["accountant"], channels: ["app", "email"], important: false }, // M-07 9.2 / 9.9
  { key: "finance.bill_due", label: "ميعاد فاتورة ثابتة", to: "المحاسب", toRoles: ["accountant"], channels: ["app", "email"], important: false }, // M-07 9.16
  { key: "contract.renewal", label: "تجديد عقد (90/60/30)", to: "السيلز · المالية", toRoles: ["accountant"], channels: ["app", "email"], important: false },
  { key: "ticket.new", label: "تذكرة جديدة / اتحوّلت لقسمك", to: "القسم المسؤول", toRoles: [], channels: ["app", "push"], important: false }, // M-06 2.1
  { key: "ticket.late", label: "تذكرة اتأخرت · تصعيد", to: "مدير القسم · نانسي للنزاعات", toRoles: [], channels: ["app", "push", "email"], important: true }, // M-06 2.4
  { key: "access.changed", label: "تغيير في حسابك أو صلاحياتك", to: "صاحب الحساب", toRoles: [], channels: ["app", "email"], important: true },
];

export const eventByKey = (key: string): NotificationEvent | undefined => NOTIFICATION_EVENTS.find((e) => e.key === key);

/**
 * The channels one person actually gets for an event: the rule's channels, minus email when the person turned
 * email off — unless the notification is important (Alarm, pulled lead, the 5th excuse…).
 */
export function channelsFor(ruleChannels: readonly Channel[], person: { emailNotifications: boolean }, important: boolean): Channel[] {
  return ruleChannels.filter((c) => c !== "email" || person.emailNotifications || important);
}
