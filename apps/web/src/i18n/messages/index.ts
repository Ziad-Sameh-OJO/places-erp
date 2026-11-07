import arCommon from "./ar/common.json";
import arNav from "./ar/nav.json";
import enCommon from "./en/common.json";
import enNav from "./en/nav.json";

/**
 * One file per area (common, nav, then one per feature folder). Arabic is the source, word for word from the demo;
 * English must have the same keys — `typeof ar` makes a missing one a type error, scripts/i18n-check.mjs an extra one.
 */
const ar = { common: arCommon, nav: arNav };
const en: typeof ar = { common: enCommon, nav: enNav };
export const messages = { ar, en };
