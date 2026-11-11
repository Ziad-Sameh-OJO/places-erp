/**
 * M-01 · Tags on a lead (client, 11 Nov): two salespeople or more working the same deal tag each other on the lead.
 * A tag waits (Pending) for the Team Leader's approval; approved, the tagged salesperson sees the lead and works on it
 * with its owner, who stays its owner.
 */
export const TAG_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type TagStatus = (typeof TAG_STATUSES)[number];
export const MAX_TAGS = 5;

export interface TagPerson { employeeId: string; teamLeaderId: string | null; isTl: boolean }

/**
 * Who approves tagging `tagged`, asked by `by`: the asker's Team Leader. A Team Leader asking approves his own team at
 * once; someone from another team waits for that team's Team Leader. No Team Leader = whoever approves leads (null).
 */
export function tagApprover(by: TagPerson, tagged: TagPerson): { approverId: string | null; approved: boolean } {
  if (by.isTl) return tagged.teamLeaderId === by.employeeId ? { approverId: by.employeeId, approved: true } : { approverId: tagged.teamLeaderId, approved: false };
  return { approverId: by.teamLeaderId, approved: false };
}

/** What's wrong with tagging these on the lead: the owner and the asker aren't tagged; at most 5. */
export function tagProblem(ownerId: string | null, byEmployeeId: string | null, taggedIds: readonly string[]): string | null {
  if (!taggedIds.length) return "اختار السيلز اللي شغالين معاك";
  if (new Set(taggedIds).size > MAX_TAGS) return `أقصى عدد ${MAX_TAGS} سيلز`;
  if (byEmployeeId && taggedIds.includes(byEmployeeId)) return "مينفعش تعمل Tag لنفسك";
  if (ownerId && taggedIds.includes(ownerId)) return "صاحب الليد شغال عليها أصلاً";
  return null;
}
