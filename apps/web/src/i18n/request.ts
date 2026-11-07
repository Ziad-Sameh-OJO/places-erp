import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./config";
import { messages } from "./messages";

/** No /en in the URLs: the language is the person's cookie, so links in notifications and emails stay the same. */
export default getRequestConfig(async () => {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(v) ? v : DEFAULT_LOCALE;
  return { locale, messages: messages[locale], timeZone: "Africa/Cairo" };
});
