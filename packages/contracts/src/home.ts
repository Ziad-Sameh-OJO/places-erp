/**
 * 0.18 · «مهامي النهارده» (demo home.js): one line from a module's `GET /home/<module>`, already in the caller's scope and
 * only what they may act on. The web words it as `home.today.<kind>` (title, sub, button) with `values`.
 */
export const TODAY_KINDS = [
  "task", "retouch", // tasks
  "ticket", // tickets
  "dealReview", "dealSeller", "tcrSign", // deals
  "contractEnding", // contracts
  "purchaseApprove", "purchasePay", // procurement
  "leaveTl", "leaveHr", "excuseTl", "excuseHr", "forgot", "hrAction", // hr
  "postToday", "broadcastApprove", // marketing
] as const;
export type TodayKind = (typeof TODAY_KINDS)[number];

export interface TodayLine {
  kind: TodayKind;
  /** «bad» = late (on top) · «warn» = waiting for a decision · "" = due today */
  tone: "bad" | "warn" | "";
  /** the record the line opens */
  id: string;
  /** the words' values: names, codes, days (YYYY-MM-DD), times (ISO), money as a decimal string («amount») */
  values: Record<string, string | number>;
}
