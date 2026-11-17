import type { NavKey } from "@/lib/nav";
import type tour from "@/i18n/messages/ar/tour.json";

/**
 * The guided tour (#580), from the demo's «جولة سريعة للكلاينت» (demo/design-2/js/shell.js, TOUR), same sections and
 * words. The demo signed in as each person in turn; here nobody can act as someone else, so the tour is the signed-in
 * person's: a step shows only when they open its page (`page`). `sel` = what to light up, the first one on screen wins;
 * none on screen lights the whole page. The demo's last section (its own control panel) became a closing step.
 */
export type TourSection = "start" | "leads" | "deals" | "inventory" | "tasks" | "clients" | "hr" | "tickets" | "finance" | "reports" | "kpis" | "admin" | "end";
export interface TourStep { key: keyof typeof tour.steps; sec: TourSection; page: NavKey; sel?: string }

const VIEW = "#view";
const TABS = "#view .tabs";
const TABLE = "#view table";
const TOOLBAR = "#view .toolbar";

export const TOUR: TourStep[] = [
  { key: "me", sec: "start", page: "home", sel: ".me-card, .tabbar .tb:last-child" },
  { key: "menu", sec: "start", page: "home", sel: "#nav, .tabbar" },
  { key: "inbox", sec: "start", page: "home", sel: ".inbox" },
  { key: "search", sec: "start", page: "home", sel: ".search-pill" },
  { key: "create", sec: "start", page: "home", sel: ".create-btn, .fab" },
  { key: "bell", sec: "start", page: "home", sel: ".top-actions .round:last-child" },

  { key: "leadNew", sec: "leads", page: "leads", sel: TOOLBAR },
  { key: "leadVerify", sec: "leads", page: "leads", sel: TABS },
  { key: "leadFilters", sec: "leads", page: "leads", sel: TOOLBAR },
  { key: "leadTable", sec: "leads", page: "leads", sel: `${TABLE}, #view .board` },
  { key: "leadFile", sec: "leads", page: "leads", sel: TABLE },
  { key: "leadTl", sec: "leads", page: "leads", sel: TABLE },
  { key: "companies", sec: "leads", page: "companies", sel: TABLE },
  { key: "routing", sec: "leads", page: "settings", sel: "#view .card" },

  { key: "dealNew", sec: "deals", page: "deals", sel: TOOLBAR },
  { key: "dealReview", sec: "deals", page: "deals", sel: TABS },
  { key: "dealSheet", sec: "deals", page: "deals", sel: TABLE },
  { key: "dealMoney", sec: "deals", page: "deals", sel: TABLE },
  { key: "dealAchv", sec: "deals", page: "deals", sel: TABS },

  { key: "units", sec: "inventory", page: "inventory", sel: TABS },
  { key: "unitsMode", sec: "inventory", page: "inventory", sel: TOOLBAR },
  { key: "unitsDaily", sec: "inventory", page: "inventory", sel: TOOLBAR },
  { key: "unitFile", sec: "inventory", page: "inventory", sel: TABLE },
  { key: "notActive", sec: "inventory", page: "notactive", sel: TABS },
  { key: "notActiveDone", sec: "inventory", page: "notactive", sel: TABLE },

  { key: "tasks", sec: "tasks", page: "tasks", sel: TABS },
  { key: "tasksPhoto", sec: "tasks", page: "tasks", sel: VIEW },
  { key: "mkDash", sec: "tasks", page: "marketing", sel: TABS },
  { key: "mkCampaigns", sec: "tasks", page: "marketing", sel: TABS },
  { key: "mkContent", sec: "tasks", page: "marketing", sel: TABS },
  { key: "mkBroadcast", sec: "tasks", page: "marketing", sel: TABS },

  { key: "clients", sec: "clients", page: "clients", sel: TABLE },
  { key: "contracts", sec: "clients", page: "contracts", sel: VIEW },

  { key: "hrAttendance", sec: "hr", page: "hr", sel: TABS },
  { key: "hrDelay", sec: "hr", page: "hr", sel: TABS },
  { key: "hrPeople", sec: "hr", page: "hr", sel: TABS },
  { key: "hrLeaves", sec: "hr", page: "hr", sel: TABS },
  { key: "hrIdeal", sec: "hr", page: "hr", sel: TABS },
  { key: "hrRules", sec: "hr", page: "hr", sel: TABS },

  { key: "tickets", sec: "tickets", page: "tickets", sel: VIEW },
  { key: "purchase", sec: "tickets", page: "procurement", sel: TOOLBAR },
  { key: "custody", sec: "tickets", page: "procurement", sel: TABS },
  { key: "budget", sec: "tickets", page: "procurement", sel: TABS },

  { key: "fnDash", sec: "finance", page: "finance", sel: TABS },
  { key: "fnStatements", sec: "finance", page: "finance", sel: TABS },
  { key: "fnCost", sec: "finance", page: "finance", sel: TABS },
  { key: "fnPayroll", sec: "finance", page: "finance", sel: TABS },
  { key: "fnTree", sec: "finance", page: "finance", sel: TABS },

  { key: "rpTargets", sec: "reports", page: "reports", sel: TABS },
  { key: "rpTeams", sec: "reports", page: "reports", sel: TABS },
  { key: "rpSheet", sec: "reports", page: "reports", sel: TABS },
  { key: "rpScheduled", sec: "reports", page: "reports", sel: TABS },

  { key: "kpiCard", sec: "kpis", page: "kpis", sel: "#view table.kpi-items, #view .kpi-cards" },
  { key: "kpiTeam", sec: "kpis", page: "kpis", sel: "#view .kpi-cards, #view .tabs" },
  { key: "kpiManage", sec: "kpis", page: "kpis", sel: TABS },
  { key: "kpiCompany", sec: "kpis", page: "kpis", sel: TABS },
  { key: "kpiBands", sec: "kpis", page: "kpis", sel: TABS },

  { key: "roles", sec: "admin", page: "access", sel: TABS },
  { key: "perms", sec: "admin", page: "access", sel: "#view table.perm, #view .tabs" },
  { key: "users", sec: "admin", page: "access", sel: TABS },
  { key: "audit", sec: "admin", page: "access", sel: TABS },
  { key: "master", sec: "admin", page: "master", sel: TABS },
  { key: "notify", sec: "admin", page: "integrations", sel: VIEW },

  { key: "end", sec: "end", page: "home", sel: ".tour-start, .tabbar .tb:last-child" },
];

export const pageHref = (page: NavKey) => (page === "home" ? "/" : `/${page}`);
