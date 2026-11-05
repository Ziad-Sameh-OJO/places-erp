/**
 * @places/domain — the business rules of Places ERP as pure functions and small classes.
 * No framework, no database, no I/O: everything here is deterministic and unit-tested, and the API, the worker
 * and the web app all call the same rules. If a rule from the requirements changes, it changes here first.
 */
export * from "./money.ts";
export * from "./business-time.ts";
export * from "./leads.ts";
export * from "./calls.ts";
export * from "./units.ts";
export * from "./lists.ts";
export * from "./ledger.ts";
export * from "./vouchers.ts";
export * from "./lead-rules.ts";
export * from "./commission.ts";
export * from "./team-leader.ts";
export * from "./attendance.ts";
export * from "./leaves.ts";
export * from "./kpi.ts";
export * from "./ideal-employee.ts";
export * from "./permissions.ts";
export * from "./notifications.ts";
export * from "./office-assets.ts";
export * from "./tickets.ts";
export * from "./procurement.ts";
export * from "./claims.ts";
export * from "./reports.ts";
export * from "./targets.ts";
