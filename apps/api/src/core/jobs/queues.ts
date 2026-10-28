/** Queue names and payloads shared by the API (producer) and apps/worker (consumer). */
export const QUEUES = {
  leadSla: "lead-sla",            // every minute: warn the TL at 2h30, pull at 3h (24h on holidays)
  noAnswer: "no-answer-rotation", // daily at the start of work + reminders every 4 hours
  contracts: "contracts",         // renewal reminders 90/60/30 days, overdue installments
  reports: "scheduled-reports",   // the reports people subscribed to
  kpis: "kpis",                   // nightly KPI refresh, quarter close
  mail: "mail",                   // every outgoing email, retried with backoff
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
