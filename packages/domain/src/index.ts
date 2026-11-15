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
export * from "./unit-import.ts";
export * from "./lists.ts";
export * from "./ledger.ts";
export * from "./vouchers.ts";
export * from "./lead-rules.ts";
export * from "./commission.ts";
export * from "./deals.ts";
export * from "./deal-sheet.ts";
export * from "./contracts.ts";
export * from "./team-leader.ts";
export * from "./attendance.ts";
export * from "./leaves.ts";
export * from "./kpi.ts";
export * from "./kpi-sheet.ts";
export * from "./ideal-employee.ts";
export * from "./permissions.ts";
export * from "./fields.ts";
export * from "./notifications.ts";
export * from "./office-assets.ts";
export * from "./tickets.ts";
export * from "./procurement.ts";
export * from "./claims.ts";
export * from "./reports.ts";
export * from "./targets.ts";
export * from "./recommendations.ts";
export * from "./my-day.ts";
export * from "./tasks.ts";
export * from "./not-active.ts";
export * from "./clients.ts";
export * from "./bulk.ts";
export * from "./task-sla.ts";
export * from "./companies.ts";
export * from "./campaigns.ts";
export * from "./posts.ts";
export * from "./broadcasts.ts";
export * from "./company-profile.ts";
export * from "./telesales-sent.ts";
export * from "./lead-tags.ts";
export * from "./table-sort.ts";
export * from "./kpi-today.ts";
