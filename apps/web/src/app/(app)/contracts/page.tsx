"use client";
import { Suspense } from "react";
import { ContractsView } from "@/features/contracts/contracts-view";

/** M-11 · العقود والتحصيل (6.2). Suspense: it reads the link's «?open=». */
export default function ContractsPage() {
  return <Suspense><ContractsView /></Suspense>;
}
