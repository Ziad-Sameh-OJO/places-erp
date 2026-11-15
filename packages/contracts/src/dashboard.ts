import { z } from "zod";
import { DASHBOARD_LAYOUTS } from "@places/domain";

/**
 * 14.1–14.3 · the dashboards. Read only: every number comes from the module that owns it, in the caller's scope, and
 * links to that module's page with the filter already set. Money is a decimal string; a section the person may not
 * see is null.
 */
export const DashboardLayout = z.enum(DASHBOARD_LAYOUTS);
export type DashboardLayout = z.infer<typeof DashboardLayout>;
export interface DashboardLayoutView { layout: DashboardLayout; /** 14.1: the first page after signing in */ landing: "/dashboard" | "/" }

/** A target bar: achieved out of goal; percent null = no goal set. */
export interface TargetBar { goal: string; achieved: string; percent: number | null }
export interface StageCount { stage: string; count: number }
export interface DashPerson { employeeId: string; userId: string; name: string; percent: number | null; achieved: string }
export interface DashTeam { tlId: string; tl: string; team: string | null; percent: number | null; members: DashPerson[] }

export interface CompanyDashboard {
  /** Cairo day, the quarter (`2026-Q4`), the year */
  day: string; quarter: string; year: string;
  today: {
    leads: number; interested: number; visits: number; meetings: number; doneDeals: number; units: number;
    /** «مين اتسحب منه ليد»: the names only */
    pulled: string[];
    /** «مين جه متأخر من غير Excuse»: null = may not see attendance */
    late: string[] | null;
    /** the day's expenses and the money that came in: null = may not see finance */
    paid: string | null; received: string | null;
  };
  stages: StageCount[];
  /** null = may not see the inventory */
  inventory: { rent: number; sale: number; types: { type: string; count: number }[] } | null;
  targets: { quarter: TargetBar; year: TargetBar };
  activity: { quarter: { visits: number; meetings: number }; year: { visits: number; meetings: number } };
  teams: DashTeam[];
  sales: { top: DashPerson[]; topAchiever: DashPerson | null; ideal: { employeeId: string; name: string } | null };
  finance: {
    balance: string; advances: string; receivables: string; incomeMonth: string;
    custody: { userId: string | null; name: string; balance: string }[];
    broken: { accountId: string; name: string; budget: string; spent: string; pct: number }[];
  } | null;
  marketing: { live: { id: string; name: string; channel: string }[]; off: { id: string; name: string; channel: string }[] } | null;
}

/** The smaller dashboard of a role (14.1): the person's own numbers, in his scope. */
export interface MyDashboard {
  day: string;
  today: { leads: number; visits: number; meetings: number };
  stages: StageCount[];
  /** null = not a salesperson (no target of his own) */
  targets: { month: TargetBar; quarter: TargetBar } | null;
}

/** 14.2 · a click on a person: his Showings, Meetings and target for the week, the month and the quarter. */
export interface PersonPerformance {
  employeeId: string; name: string; team: string | null;
  periods: { key: "week" | "month" | "quarter"; from: string; to: string; visits: number; meetings: number; target: TargetBar | null }[];
}
