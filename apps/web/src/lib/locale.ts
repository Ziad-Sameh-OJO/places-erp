"use client";
import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

/**
 * The page's language for the plain helpers that aren't React hooks (lib/format.ts, serverText): set once at the top of
 * the tree, during render, so the first paint already formats in the right language.
 */
let current: Locale = DEFAULT_LOCALE;
export const currentLocale = () => current;
export function LocaleSync() {
  current = useLocale();
  return null;
}
