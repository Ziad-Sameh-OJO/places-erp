"use client";
import { Suspense } from "react";
import { PapersPage } from "@/features/papers/papers-page";

/** «المستندات» (client, 25 Nov): everyone signed in; each template says who may issue it. Suspense: it reads the link's «?tab=». */
export default function Papers() {
  return <Suspense><PapersPage /></Suspense>;
}
