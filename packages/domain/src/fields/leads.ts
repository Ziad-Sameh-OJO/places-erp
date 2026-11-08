import type { FieldDef } from "../fields.ts";

/**
 * M-01 · the lead's fields as the list, the drawer and the new-lead form show them. The code, the name, the stage and
 * the salesperson are the lead's identity (the SLA, the rotation and the Kanban run on them). Mobile, Area, Type and
 * Channel are what CreateLead can't be saved without.
 */
export const leads: readonly FieldDef[] = [
  { key: "code", label: "Code", locked: true },
  { key: "name", label: "الاسم", locked: true },
  { key: "stage", label: "Stage", locked: true },
  { key: "assignedTo", label: "Sales", locked: true },
  { key: "phones", label: "الموبايل", required: true },
  { key: "company", label: "الشركة", covers: ["companyCategory"] },
  { key: "area", label: "Area", required: true },
  { key: "type", label: "Type", required: true },
  { key: "space", label: "Space" },
  { key: "condition", label: "Condition" },
  { key: "budget", label: "Budget" },
  { key: "channel", label: "Channel", required: true },
  { key: "campaign", label: "Campaign", covers: ["campaignId", "post"] },
  { key: "note", label: "Note" },
];
