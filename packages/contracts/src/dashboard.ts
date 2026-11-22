import { z } from "zod";
import { DASHBOARD_LAYOUTS, DASH_PERIODS } from "@places/domain";
import { PeriodQuery } from "./period.ts";

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

/** Ahmed Islam's one-page dashboard: the period picked; a quarter takes the shared year + quarter picker (14.12). */
export const AhmedQuery = PeriodQuery.extend({
  period: z.enum(DASH_PERIODS).default("today"),
  /** the target card's month ("2026-11"); its year is the year gauge's. Default: this month, or the picked quarter's last */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "الشهر غلط").optional(),
})
  .refine((q) => !q.year === !q.quarter, { message: "اختار السنة والربع مع بعض", path: ["quarter"] });
export type AhmedQuery = z.infer<typeof AhmedQuery>;

/** A number of the period and the same number for the previous comparable one (the arrow). Money as a decimal string. */
export interface Compared<T = number> { now: T; before: T }
export interface FunnelStep { stage: string; count: number; /** % of this stage's count the next stage has; null = last or nothing */ next: number | null }
export interface PacedBar extends TargetBar {
  /** «المفروض نكون هنا النهارده»; "" = hidden or no goal */
  expected: string;
  /** «محتاجين X في اليوم»; null = reached, ended, hidden or no goal */
  perDay: string | null;
}
/** A chart point: its start instant, its Cairo days (both included, for the list's filter); now null = still to come, before null = the previous period is shorter */
export interface TrendPoint { at: string; from: string; to: string; now: number | null; before: number | null }
export interface AhmedPerson extends DashPerson { visits: number; meetings: number; deals: number }
export interface AhmedTeam { tlId: string; tl: string; team: string | null; percent: number | null; visits: number; meetings: number; deals: number; members: AhmedPerson[] }
/** «محتاج انتباهك»: each line a count and the list behind it; a line the person may not see is left out. */
export interface AttentionLine { key: "sla" | "approval" | "nearClose" | "installments" | "budget" | "units"; count: number; href: string }

export interface AhmedDashboard {
  period: (typeof DASH_PERIODS)[number];
  /** Cairo days of the period so far (both included), the teams' quarter, the target card's month and its year */
  from: string; to: string; quarter: string; month: string; year: string;
  strip: {
    visits: Compared; meetings: Compared; doneDeals: Compared; leads: Compared; units: Compared;
    /** the commission that came in (the deals' payments); null = may not see finance */
    collected: Compared<string> | null;
  };
  funnel: FunnelStep[];
  /** New leads by hour / day / week of the whole period, each with the same point of the previous period */
  trend: { unit: "hour" | "day" | "week"; points: TrendPoint[] };
  /** The period's new leads by channel, most first (they add up to strip.leads.now) */
  channels: { channel: string; leads: number }[];
  /** The deals' payments against the commission of the deals closed, by day or week; null = may not see finance */
  collections: { unit: "day" | "week"; points: { from: string; to: string; collected: string; expected: string }[] } | null;
  /** what the company must make in the year, and in the month picked on the card */
  targets: { year: PacedBar; month: PacedBar };
  teams: AhmedTeam[];
  attention: AttentionLine[];
  /** the Near to Close line's days (setting dashboardStaleNearClose) */
  staleDays: number;
  /** null = may not see the contracts' installments */
  money: { collected: string; due: string; receivables: string | null; nextWeek: { count: number; amount: string } } | null;
  inventory: { rent: number; sale: number; types: { type: string; count: number }[]; newThisWeek: number; closedThisMonth: number } | null;
  marketing: {
    today: { channel: string; leads: number }[];
    /** the period's spend ÷ its Qualified leads (14.13); null = nothing to divide or hidden */
    costPerQualified: string | null;
    live: { id: string; name: string }[]; off: { id: string; name: string }[];
  } | null;
}
