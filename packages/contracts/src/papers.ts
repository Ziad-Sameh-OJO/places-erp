import { z } from "zod";
import { TEMPLATE_MODES } from "@places/domain";
import { Id } from "./common.ts";

/**
 * «المستندات» (client, 25 Nov): Word templates the manager uploads and sets up (who issues them, «بلّغ بس» or «لازم
 * موافقة», who approves, who is told, the stamp), and the documents people issue from them by filling the blanks.
 */

/** A blank the system found, as the manager named it; `skip` = not a field («مش خانة», an ellipsis that's punctuation). */
export const TemplateFieldInput = z.object({ id: z.number().int().positive(), label: z.string().trim().min(1, "اكتب اسم الخانة").max(80, "الاسم طويل"), skip: z.boolean().default(false) });
export type TemplateFieldInput = z.infer<typeof TemplateFieldInput>;

const People = z.array(Id).max(200);
/** Upload: the .docx and its name; the fields come from the file. */
export const NewTemplate = z.object({ name: z.string().trim().min(2, "اكتب اسم المستند").max(80, "الاسم طويل"), fileId: Id });
export type NewTemplate = z.infer<typeof NewTemplate>;
export const TemplateSettings = z.object({
  name: z.string().trim().min(2, "اكتب اسم المستند").max(80, "الاسم طويل"),
  fields: z.array(TemplateFieldInput).max(200),
  seeRoles: z.array(z.string().max(40)).max(40), seeUserIds: People,
  mode: z.enum(TEMPLATE_MODES),
  approverIds: People, notifyIds: People,
  stamp: z.boolean(),
  active: z.boolean(),
}).refine((t) => t.mode !== "approve" || t.approverIds.length > 0, { path: ["approverIds"], message: "اختار مين يوافق" });
export type TemplateSettings = z.infer<typeof TemplateSettings>;

export interface TemplateField { id: number; label: string; context: string; named: boolean; skip: boolean }
/** What someone issuing a document sees: the fields to fill, and whether it waits for an approval. */
export interface TemplateCard { id: string; name: string; mode: (typeof TEMPLATE_MODES)[number]; fields: Array<{ id: number; label: string }> }
/** The manager's view of a template: everything it's set to, the marks the file has. */
export interface TemplateView extends Omit<TemplateCard, "fields"> {
  fields: TemplateField[];
  file: { id: string; name: string };
  seeRoles: string[]; seeUserIds: string[]; approverIds: string[]; notifyIds: string[];
  stamp: boolean; active: boolean;
  marks: { stamp: boolean; signature: boolean };
  issued: number;
  updatedAt: string;
}
/** The setup form's choices: the roles, and the people by name. */
export interface PaperOptions { roles: Array<{ key: string; name: string }>; people: Array<{ id: string; name: string }> }

/** Issue a document: a value per field id; an empty one keeps its dots in the file (to fill by pen). */
export const IssueDocument = z.object({
  templateId: Id,
  values: z.record(z.string().regex(/^\d+$/), z.string().trim().max(2000, "النص طويل")).refine((v) => Object.keys(v).length <= 200),
});
export type IssueDocument = z.infer<typeof IssueDocument>;
export const DecideDocument = z.object({ approve: z.boolean(), note: z.string().trim().max(500, "الملاحظة طويلة").optional() })
  .refine((d) => d.approve || !!d.note, { path: ["note"], message: "اكتب سبب الرفض" });
export type DecideDocument = z.infer<typeof DecideDocument>;

export const PAPER_STATUSES = ["pending", "approved", "rejected", "ready"] as const;
export interface PaperRow {
  id: string; code: string; template: { id: string; name: string };
  by: { id: string; name: string };
  /** by field id («استخدمه تاني» fills the same field again; two fields may share a label) */
  values: Array<{ id: number; label: string; value: string }>;
  status: (typeof PAPER_STATUSES)[number];
  /** the file may be downloaded (ready or approved) */
  canDownload: boolean;
  decidedBy: string | null; decidedAt: string | null; note: string | null;
  createdAt: string;
}
