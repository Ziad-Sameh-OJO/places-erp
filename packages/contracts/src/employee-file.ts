import { z } from "zod";
import { CalendarDay } from "./common.ts";

/* ---- M-05 · the employee file (HR, 15 Nov): papers, the required list, the timeline; the 1-to-1 coverage and report ---- */
export const NewEmployeeDocument = z.object({
  fileId: z.string().min(1, "ارفع الملف الأول"),
  title: z.string().trim().min(2, "اكتب اسم الورقة").max(150),
  docType: z.string().trim().max(100).optional(),
});
export type NewEmployeeDocument = z.infer<typeof NewEmployeeDocument>;
export const EmployeeDocTypes = z.object({ types: z.array(z.string().trim().min(2).max(100)).max(40) });

export interface EmployeeDocumentView { id: string; kind: string; title: string; docType: string | null; month: string | null; hasFile: boolean; by: string; at: string }
/** One timeline line: an uploaded paper, a 1-to-1 (its month, its sheet if there is one), a penalty. Newest first. */
export interface EmployeeTimelineItem { kind: string; day: string; title: string; sub: string; docId: string | null }
export interface EmployeeFileDocs {
  required: { type: string; docId: string | null }[];
  missing: number;
  documents: EmployeeDocumentView[];
  timeline: EmployeeTimelineItem[];
}

export interface OneOnOneCoverage { month: string; items: { employeeId: string; name: string; heldOn: string | null }[] }

export const OneOnOneRange = z.object({ from: CalendarDay, to: CalendarDay }).refine((r) => r.from <= r.to, "«من» لازم تبقى قبل «لحد»");
export type OneOnOneRange = z.infer<typeof OneOnOneRange>;
export interface OneOnOneReportRow { id: string; employeeId: string; name: string; heldOn: string; by: string; summary: string; hrAction: string | null; hrActionDue: string | null; hrActionDone: boolean }
