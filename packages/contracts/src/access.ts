import { z } from "zod";
import { ACTIONS, MODULES } from "@places/domain";
import { CalendarDay, Id, Page } from "./common.ts";

/** M-09: at least 10 characters with letters and digits. */
export const Password = z.string().min(10, "10 حروف على الأقل").max(200)
  .refine((p) => /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p), "لازم حروف وأرقام");

export const Scope = z.enum(["own", "team", "dept", "all"]);
export const Tier = z.enum(["Super Admin", "Office Manager", "Operations Head", "Sales Director", "Team Leaders", "Executive Staff", "Department Head"]);
/** One module's actions; any action implies view, so the server normalises it. Empty = no access. */
export const ModuleActions = z.array(z.enum(ACTIONS)).max(ACTIONS.length);
export const Matrix = z.record(z.enum(MODULES), ModuleActions);
export type Matrix = z.infer<typeof Matrix>;

export const UserInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  department: z.string().trim().min(1).max(60),
  role: Id,                        // primary role key
  extraRoles: z.array(Id).max(5).default([]),
  teamLeaderId: Id.nullish(),      // Employee id of the TL (sales)
  managerId: Id.nullish(),         // Employee id of the direct manager (M-09 3.1); empty = the TL
  endDate: z.coerce.date().nullish(), // last working day: the account stops by itself
  otpRequired: z.boolean().default(false),
});
export type UserInput = z.infer<typeof UserInput>;

export const UserFilters = Page.extend({
  q: z.string().max(80).optional(),
  status: z.enum(["INVITED", "ACTIVE", "LOCKED", "DISABLED"]).optional(),
  role: Id.optional(),
  department: z.string().trim().max(60).optional(), // M-09 5.2: search by department
});
export type UserFilters = z.infer<typeof UserFilters>;

/** Per-person exceptions: a module set here replaces what the person's roles give; null removes the exception. */
export const Overrides = z.record(z.enum(MODULES), ModuleActions.nullable());
export type Overrides = z.infer<typeof Overrides>;

export const RoleInput = z.object({
  label: z.string().trim().min(2).max(60),
  tier: Tier,
  scope: Scope,
  behavesLike: Id.optional(), // a new role works like a built-in one (home page, inboxes)
  copyFrom: Id.optional(),    // start with another role's matrix
});
export type RoleInput = z.infer<typeof RoleInput>;
export const RoleUpdate = RoleInput.omit({ copyFrom: true, behavesLike: true }).partial();
export type RoleUpdate = z.infer<typeof RoleUpdate>;

/** M-09 5.2: the log by module, by who did it (a User id) and by Cairo calendar days, both ends included. */
export const AuditFilters = Page.extend({
  module: z.string().max(30).optional(), entityId: Id.optional(), userId: Id.optional(), from: CalendarDay.optional(), to: CalendarDay.optional(),
});
export type AuditFilters = z.infer<typeof AuditFilters>;

export const Login = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
export const Otp = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/) });
export const SetPassword = z.object({ token: z.string().min(20).max(100), password: Password });
export const Forgot = z.object({ email: z.string().trim().toLowerCase().email() });
export const ChangePassword = z.object({ current: z.string().min(1).max(200), next: Password });
