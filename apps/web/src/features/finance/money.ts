import { money as shown, short as shortShown } from "@/lib/format";

/**
 * M-09: the API blanks a hidden amount to "" (the accounts and procurement field permissions): it shows as «—»,
 * like a missing one, never as «0».
 */
export const money = (s: string | null) => (s === "" ? "—" : shown(s));
export const short = (s: string | null) => (s === "" ? "—" : shortShown(s));
