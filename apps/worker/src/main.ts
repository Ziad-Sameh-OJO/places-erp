/**
 * The worker: runs the time-based rules so the API stays fast. Every job is idempotent (safe to run twice) because
 * BullMQ retries on failure. Repeatable jobs are (re)scheduled here at start-up, in Cairo time.
 * A job is listed in JOBS only once its processor exists, so nothing piles up in a queue nobody reads.
 */
import { Queue, Worker, type Processor } from "bullmq";
import { prisma } from "@places/db";
import { env } from "./env.ts";
import { leadSlaTick } from "./processors/lead-sla.ts";
import { visitAlarmTick } from "./processors/visit-alarm.ts";
import { recurringBillsTick } from "./processors/recurring-bills.ts";
import { payrollDueTick } from "./processors/payroll-due.ts";
import { leaveChaseTick } from "./processors/leave-chase.ts";
import { hrActionAlarmTick } from "./processors/hr-action-alarm.ts";
import { ticketSlaTick } from "./processors/ticket-sla.ts";
import { procurementReminderTick } from "./processors/procurement-reminder.ts";
import { staleUploadsTick } from "./processors/stale-uploads.ts";
import { kpiRefreshTick } from "./processors/kpi-refresh.ts";

const connection = { url: env.REDIS_URL };

const JOBS: Array<{ name: string; pattern: string; processor: Processor }> = [
  { name: "lead-sla", pattern: "* * * * *", processor: leadSlaTick }, // every minute (M-01 2.4)
  { name: "visit-alarm", pattern: "* * * * *", processor: () => visitAlarmTick() }, // every minute (M-01 3.3 · 1.9)
  { name: "recurring-bills", pattern: "0 11 * * *", processor: recurringBillsTick }, // daily at the start of work (M-07 9.16)
  { name: "payroll-due", pattern: "5 11 * * *", processor: payrollDueTick }, // daily: pay day reached and not paid (M-07 9.14)
  { name: "ticket-sla", pattern: "*/5 * * * *", processor: () => ticketSlaTick() }, // every 5 minutes: SLAs are hours long (M-06 2.4)
  { name: "procurement-reminder", pattern: "*/15 * * * *", processor: () => procurementReminderTick() }, // M-08 2.4
  // next: no-answer-rotation (T-07), contracts (T-16)… one processor file each, same shape as lead-sla.ts
  { name: "leave-chase", pattern: "15 * * * *", processor: leaveChaseTick }, // hourly: remind at 24h, escalate at 48h (M-05 7.5)
  { name: "hr-action-alarm", pattern: "0 11 * * *", processor: hrActionAlarmTick }, // daily: «حل الـ HR» due today (M-05 7.8)
  { name: "kpi-refresh", pattern: "30 19 * * *", processor: () => kpiRefreshTick() }, // daily after work: the automatic KPI items (M-12 · 11.5)
  { name: "stale-uploads", pattern: "0 4 * * *", processor: () => staleUploadsTick() }, // daily at night: uploads never completed (#209)
];

const queues: Queue[] = [];
const workers: Worker[] = [];
for (const job of JOBS) {
  const queue = new Queue(job.name, { connection });
  await queue.upsertJobScheduler(`${job.name}-schedule`, { pattern: job.pattern, tz: "Africa/Cairo" });
  const worker = new Worker(job.name, job.processor, { connection, concurrency: 1 });
  worker.on("failed", (j, err) => console.error(`worker: ${job.name} failed (attempt ${j?.attemptsMade ?? "?"}):`, err.message));
  queues.push(queue); workers.push(worker);
  console.log(`worker: registered ${job.name} (${job.pattern}, Africa/Cairo)`);
}
console.log(`worker: up · ${JOBS.length} job(s) registered`);

async function shutdown(signal: string) {
  console.log(`worker: ${signal} · finishing running jobs…`);
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(queues.map((q) => q.close()));
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
