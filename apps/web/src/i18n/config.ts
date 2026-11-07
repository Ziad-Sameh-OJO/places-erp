/** The two languages a person can pick (Arabic is the default, as in the demo); the choice lives in a cookie. */
export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);
export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
