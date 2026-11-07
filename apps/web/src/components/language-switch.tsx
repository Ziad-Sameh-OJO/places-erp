"use client";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_COOKIE } from "@/i18n/config";

/**
 * عربي ⇄ English for this person on this device. A full reload, so the page's direction (rtl / ltr) and every server-
 * rendered word switch together; a year's cookie, like the session's «remember me».
 */
export function LanguageSwitch({ className = "icon-btn lang-btn" }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common.language");
  const next = locale === "ar" ? "en" : "ar";
  return (
    <button className={className} lang={next} aria-label={t("label")} title={t("label")} onClick={() => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      window.location.reload();
    }}>{t("switchTo")}</button>
  );
}
