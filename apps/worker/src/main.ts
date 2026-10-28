/**
 * The worker: runs the time-based rules so the API stays fast. Every job is idempotent (safe to run twice) because
 * BullMQ retries on failure, and repeatable jobs are scheduled here, once, at start-up.
 */
import { Queue, Worker } from "bullmq";
import { leadSlaTick } from "./processors/lead-sla.ts";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

const schedule: Array<[name: string, pattern: string]> = [
  ["lead-sla", "* * * * *"],             // every minute
  ["no-answer-rotation", "0 11 * * 0-4,6"], // start of each working day (Cairo)
  ["contracts", "0 9 * * *"],
  ["kpis", "30 2 * * *"],
];

for (const [name, pattern] of schedule) {
  await new Queue(name, { connection }).upsertJobScheduler(`${name}-schedule`, { pattern, tz: "Africa/Cairo" });
}

new Worker("lead-sla", leadSlaTick, { connection, concurrency: 1 });
// new Worker("no-answer-rotation", …), new Worker("contracts", …) — one processor file each, same shape as lead-sla.ts

console.log("worker: up");
