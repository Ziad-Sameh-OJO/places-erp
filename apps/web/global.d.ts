import type { Locale } from "./src/i18n/config";
import type { messages } from "./src/i18n/messages";

// typed keys: t("nav.modules.leads.label") is checked against the Arabic messages
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages.ar;
  }
}
