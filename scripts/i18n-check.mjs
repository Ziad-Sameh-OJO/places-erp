// Every language has exactly the same message keys as Arabic (the source): a word missing in English shows as its key,
// an extra one is dead. Run by `pnpm lint`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "apps/web/src/i18n/messages";
const keys = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
const load = (lang) => Object.fromEntries(readdirSync(join(dir, lang)).filter((f) => f.endsWith(".json")).map((f) => [f, new Set(keys(JSON.parse(readFileSync(join(dir, lang, f), "utf8"))))]));
const ar = load("ar");
let bad = 0;
for (const lang of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "ar").map((d) => d.name)) {
  const other = load(lang);
  for (const f of new Set([...Object.keys(ar), ...Object.keys(other)])) {
    const a = ar[f] ?? new Set(), b = other[f] ?? new Set();
    for (const k of a) if (!b.has(k)) { console.error(`${lang}/${f}: missing ${k}`); bad++; }
    for (const k of b) if (!a.has(k)) { console.error(`${lang}/${f}: not in ar: ${k}`); bad++; }
  }
}
if (bad) process.exit(1);
console.log("i18n: every language has the same keys");
