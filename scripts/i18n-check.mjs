// Every language has exactly the same message keys as Arabic (the source): a word missing in English shows as its key,
// an extra one is dead. And every message parses as ICU: a literal «{{الختم}}» must be quoted ('{{الختم}}'), or the
// page shows INVALID_MESSAGE. Run by `pnpm lint`.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// the parser next-intl itself uses (next-intl → use-intl → intl-messageformat), so the check can't drift from the page
const from = (req, pkg) => createRequire(req.resolve(pkg));
const { IntlMessageFormat } = from(from(createRequire(join(process.cwd(), "apps/web/package.json")), "next-intl"), "use-intl")("intl-messageformat");

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
for (const lang of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  for (const f of readdirSync(join(dir, lang)).filter((x) => x.endsWith(".json"))) {
    const walk = (o, p = "") => Object.entries(o).forEach(([k, v]) => {
      if (v && typeof v === "object") return walk(v, `${p}${k}.`);
      try { new IntlMessageFormat(String(v), lang); } catch (e) { console.error(`${lang}/${f}: ${p}${k} doesn't parse (${e.message})`); bad++; }
    });
    walk(JSON.parse(readFileSync(join(dir, lang, f), "utf8")));
  }
}
if (bad) process.exit(1);
console.log("i18n: every language has the same keys, and every message parses");
