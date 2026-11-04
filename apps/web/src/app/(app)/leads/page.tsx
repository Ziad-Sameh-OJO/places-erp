"use client";
import { OperationsQueue } from "@/features/leads/duplicates";

/** M-01 · العملاء المحتملين. For now Operations' queue (1.5); the list, filters and Kanban come with 1.6. */
export default function LeadsPage() {
  return <OperationsQueue />;
}
