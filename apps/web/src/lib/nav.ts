import type { IconName } from "@places/ui";
import { MODULE_LABEL as DOMAIN_MODULE_LABEL, type ModuleKey } from "@places/domain";
import type nav from "@/i18n/messages/ar/nav.json";

/**
 * The side menu, from the demo: requirements code, icon, section. Only modules that are built are listed. The words
 * (label, short, sub, section) are in the messages: nav.modules.<key> and nav.sections.<section>.
 */
export type NavSection = "" | "sales" | "ops" | "admin" | "system";
/** A page in the menu: one with words in nav.modules — a module, or «companies» (the companies sheet, 1.20). */
export type NavKey = keyof typeof nav.modules & (ModuleKey | "companies");
export const NAV: Record<NavKey, { code: string; icon: IconName; section: NavSection }> = {
  home: { code: "Today", icon: "home", section: "" },
  leads: { code: "M-01", icon: "users", section: "sales" },
  settings: { code: "Routing", icon: "route", section: "sales" },
  deals: { code: "M-02", icon: "handshake", section: "sales" },
  clients: { code: "M-10", icon: "id", section: "sales" },
  contracts: { code: "M-11", icon: "file", section: "sales" },
  inventory: { code: "M-03", icon: "building", section: "ops" },
  companies: { code: "M-01", icon: "board", section: "ops" }, // «شيت الشركات» under the units (client, 11 Nov)
  notactive: { code: "M-03", icon: "layers", section: "ops" },
  tasks: { code: "Tasks", icon: "check", section: "ops" },
  marketing: { code: "M-04", icon: "megaphone", section: "ops" },
  finance: { code: "M-07", icon: "wallet", section: "admin" },
  procurement: { code: "M-08", icon: "cart", section: "admin" },
  hr: { code: "M-05", icon: "id", section: "admin" },
  reports: { code: "M-12", icon: "chart", section: "admin" },
  kpis: { code: "M-12", icon: "trend", section: "admin" },
  tickets: { code: "M-06", icon: "ticket", section: "admin" },
  access: { code: "M-09", icon: "lock", section: "system" },
  master: { code: "M-13", icon: "filter", section: "system" },
  integrations: { code: "M-14", icon: "bolt", section: "system" },
};
export const SECTIONS: NavSection[] = ["", "sales", "ops", "admin", "system"];
// the labels live in @places/domain so the API's Excel reports use the same words
export const MODULE_LABEL: Record<string, string> = DOMAIN_MODULE_LABEL;
