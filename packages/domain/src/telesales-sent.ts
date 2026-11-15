/**
 * M-01 · Telesales' «اللي بعتيها» (client, 11 Nov): the leads she entered that went to a salesperson. She sees that
 * she sent them and to whom — never what the salesperson does with them — except one thing: a lead that is in No
 * Answer now shows as such (to call it again herself), and leaves that list the moment it gets any other action.
 */

export type SentRange = "today" | "all";

/** «No Answer»: the lead's state now is No Answer — any other action moves it out (back to plain «اتبعتت»). */
export const sentNoAnswer = (stage: string): boolean => stage === "NO_ANSWER";

/** A lead she sent: entered by her, and with someone else (or waiting for Operations) — not one she kept. */
export const isSentByTelesales = (lead: { createdById: string; ownedByTelesales: boolean; assignedToId: string | null }, me: { userId: string; employeeId: string | null }): boolean =>
  lead.createdById === me.userId && !lead.ownedByTelesales && (lead.assignedToId === null || lead.assignedToId !== me.employeeId);
