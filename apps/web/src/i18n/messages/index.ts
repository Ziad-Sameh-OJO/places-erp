import ar_common from "./ar/common.json";
import ar_nav from "./ar/nav.json";
import ar_ui from "./ar/ui.json";
import ar_auth from "./ar/auth.json";
import ar_pages from "./ar/pages.json";
import ar_access from "./ar/access.json";
import ar_clients from "./ar/clients.json";
import ar_contracts from "./ar/contracts.json";
import ar_deals from "./ar/deals.json";
import ar_finance from "./ar/finance.json";
import ar_hr from "./ar/hr.json";
import ar_imports from "./ar/imports.json";
import ar_inventory from "./ar/inventory.json";
import ar_kpis from "./ar/kpis.json";
import ar_leadRules from "./ar/leadRules.json";
import ar_leads from "./ar/leads.json";
import ar_marketing from "./ar/marketing.json";
import ar_notifications from "./ar/notifications.json";
import ar_procurement from "./ar/procurement.json";
import ar_reports from "./ar/reports.json";
import ar_settings from "./ar/settings.json";
import ar_tasks from "./ar/tasks.json";
import ar_tickets from "./ar/tickets.json";
import en_common from "./en/common.json";
import en_nav from "./en/nav.json";
import en_ui from "./en/ui.json";
import en_auth from "./en/auth.json";
import en_pages from "./en/pages.json";
import en_access from "./en/access.json";
import en_clients from "./en/clients.json";
import en_contracts from "./en/contracts.json";
import en_deals from "./en/deals.json";
import en_finance from "./en/finance.json";
import en_hr from "./en/hr.json";
import en_imports from "./en/imports.json";
import en_inventory from "./en/inventory.json";
import en_kpis from "./en/kpis.json";
import en_leadRules from "./en/leadRules.json";
import en_leads from "./en/leads.json";
import en_marketing from "./en/marketing.json";
import en_notifications from "./en/notifications.json";
import en_procurement from "./en/procurement.json";
import en_reports from "./en/reports.json";
import en_settings from "./en/settings.json";
import en_tasks from "./en/tasks.json";
import en_tickets from "./en/tickets.json";

/**
 * One file per area: common, nav, ui (components/), auth, pages (thin pages under app/), then one per feature folder
 * (features/lead-rules → leadRules). Arabic is the source, word for word from the demo; English must have the same
 * keys — `typeof ar` makes a missing one a type error, scripts/i18n-check.mjs an extra one.
 */
const ar = { common: ar_common, nav: ar_nav, ui: ar_ui, auth: ar_auth, pages: ar_pages, access: ar_access, clients: ar_clients, contracts: ar_contracts, deals: ar_deals, finance: ar_finance, hr: ar_hr, imports: ar_imports, inventory: ar_inventory, kpis: ar_kpis, leadRules: ar_leadRules, leads: ar_leads, marketing: ar_marketing, notifications: ar_notifications, procurement: ar_procurement, reports: ar_reports, settings: ar_settings, tasks: ar_tasks, tickets: ar_tickets };
const en: typeof ar = { common: en_common, nav: en_nav, ui: en_ui, auth: en_auth, pages: en_pages, access: en_access, clients: en_clients, contracts: en_contracts, deals: en_deals, finance: en_finance, hr: en_hr, imports: en_imports, inventory: en_inventory, kpis: en_kpis, leadRules: en_leadRules, leads: en_leads, marketing: en_marketing, notifications: en_notifications, procurement: en_procurement, reports: en_reports, settings: en_settings, tasks: en_tasks, tickets: en_tickets };
export const messages = { ar, en };
