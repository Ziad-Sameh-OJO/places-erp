"use client";
import { OperationsQueue } from "@/features/leads/duplicates";
import { LeadsList } from "@/features/leads/leads-list";

/** M-01 · العملاء المحتملين: Operations' queue on top (1.5), then the list / Kanban (1.6). */
export default function LeadsPage() {
  return (
    <>
      <OperationsQueue />
      <LeadsList />
    </>
  );
}
