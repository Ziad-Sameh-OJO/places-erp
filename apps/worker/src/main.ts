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

const connection = { url: env.REDIS_URL };

const JOBS: Array<{ name: string; pattern: string; processor: Processor }> = [
  { name: "lead-sla", pattern: "* * * * *", processor: leadSlaTick }, // every minute (M-01 2.4)
  { name: "visit-alarm", pattern: "* * * * *", processor: () => visitAlarmTick() }, // every minute (M-01 3.3 · 1.9)
  // next: no-answer-rotation (T-07), contracts (T-16), kpis (T-23)… one processor file each, same shape as lead-sla.ts
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
