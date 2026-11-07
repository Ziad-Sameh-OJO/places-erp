import { translate } from "@places/contracts";
import { currentLocale } from "./locale";

/**
 * Text the server made (an error, a notification, a domain label or status) in the reader's language: the shared
 * catalog in @places/contracts/i18n. The screens' own words come from next-intl's messages instead.
 */
export const serverText = (s: string) => translate(s, currentLocale());
