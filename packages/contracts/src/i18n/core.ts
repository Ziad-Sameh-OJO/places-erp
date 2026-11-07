import type { Pair } from "./translate.ts";

/** English for the Arabic text the server sends in this area (see translate.ts for the {placeholder} form). */
export default [
  // the web's own fallbacks (apps/web/src/lib/api.ts)
  ["حصل خطأ في السيستم · جرّب تاني كمان شوية", "Something went wrong in the system · try again in a little while"],
  ["مفيش اتصال بالسيستم · اتأكد من النت وجرّب تاني", "Can't reach the system · check your connection and try again"],
] satisfies Pair[];
