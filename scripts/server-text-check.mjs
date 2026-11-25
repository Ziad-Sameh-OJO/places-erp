// Every Arabic text the server can send (API, worker, domain, contracts' Zod messages) has its English in the catalog
// (packages/contracts/src/i18n): without it an English reader sees Arabic on the page. `${…}` parts are filled with a
// sample word, so a template's pair («{name} بعت …») is found. Run by `pnpm lint`.
// Left out: what is Arabic on purpose — the Arabic documents (PDF / HTML, the claim and receipt wording, numbers in
// words), the letters the name matching normalizes, and a line marked `// ar-only` (with the reason) or `// i18n-part` (a piece of a longer message that has its pair).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { translate } from "../packages/contracts/src/i18n/index.ts";

const ROOTS = ["apps/api/src", "apps/worker/src", "packages/domain/src", "packages/contracts/src"];
const SKIP_FILES = new Set([
  "packages/domain/src/claims.ts", // the claim / receipt letters and the amount in Arabic words: printed in Arabic
  "packages/domain/src/company-names.ts", // Arabic letters folded for matching company names
  "packages/domain/src/attendance.ts", // Arabic letters folded for matching fingerprint names
  "packages/domain/src/table-sort.ts", // Arabic digits for sorting
]);
const AR = /[؀-ۿ]/;
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!/^(node_modules|dist|i18n|documents)$/.test(e.name)) walk(p); }
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) files.push(p);
  }
};
ROOTS.forEach(walk);

/**
 * The string literals of a file that aren't inside another one's `${…}`: [text, line]. A template's `${…}` becomes «X»;
 * a string nested in it is a piece of the whole message (whose pair is checked), so it isn't listed on its own.
 */
function literals(src) {
  const out = [];
  let i = 0, line = 1;
  const quoted = (q) => { let s = ""; i++; while (i < src.length && src[i] !== q) { if (src[i] === "\\") { s += src[i] + src[i + 1]; i += 2; continue; } if (src[i] === "\n") break; s += src[i++]; } i++; return s; };
  const template = () => {
    let s = ""; i++;
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { s += src[i] + src[i + 1]; i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") { i += 2; skipExpr(); s += "X"; continue; }
      if (src[i] === "\n") line++;
      s += src[i++];
    }
    i++; return s;
  };
  const skipExpr = () => { // up to the matching «}», past nested strings and templates
    let depth = 1;
    while (i < src.length && depth) {
      const c = src[i];
      if (c === '"' || c === "'") quoted(c);
      else if (c === "`") template();
      else { if (c === "{") depth++; else if (c === "}") depth--; else if (c === "\n") line++; i++; }
    }
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); for (const ch of src.slice(i, e)) if (ch === "\n") line++; i = e + 2; continue; }
    if (c === '"' || c === "'") { const at = line; out.push([quoted(c), at]); continue; }
    if (c === "`") { const at = line; out.push([template(), at]); continue; }
    if (c === "\n") line++;
    i++;
  }
  return out;
}

/** A `${…}` is often an optional piece («${ip ? ` من ${ip}` : ""}»): the sample with each «X» kept or left out (≤ 64). */
function variants(sample) {
  const parts = sample.split("X");
  if (parts.length > 7) return [sample];
  const out = [];
  for (let mask = 0; mask < 1 << (parts.length - 1); mask++) out.push(parts.reduce((s, p, k) => (k ? s + (mask & (1 << (k - 1)) ? "" : "X") + p : p), ""));
  return out;
}

const missing = [];
for (const f of files) {
  const rel = relative(process.cwd(), f).split(sep).join("/");
  if (SKIP_FILES.has(rel)) continue;
  const src = readFileSync(f, "utf8").split("\n").map((l) => (/\/\/\s*(ar-only|i18n-part)\b/.test(l) ? "" : l)).join("\n");
  for (const [raw, line] of literals(src)) {
    if (!AR.test(raw) || /</.test(raw)) continue; // an HTML document (a PDF, a sheet) is Arabic by design
    const sample = raw.replace(/\\n/g, "\n");
    if (sample.replace(/[^؀-ۿ]/g, "").length < 3) continue; // a joiner («، »), a letter, a unit («م»)
    if (/\{[؀-ۿ_]+\}/.test(sample)) continue; // a document template's Arabic fields ({الشركة})
    if (variants(sample).some((v) => { const en = translate(v, "en"); return en !== v && !AR.test(en); })) continue;
    missing.push(`${rel}:${line}: ${sample.replace(/\n/g, "\\n").slice(0, 110)}`);
  }
}
if (missing.length) {
  console.error(`${missing.length} Arabic text(s) the server sends have no English in packages/contracts/src/i18n:`);
  for (const x of missing) console.error("  " + x);
  console.error("Add the pair to the area's catalog file, or mark a line `// ar-only: <why>` (Arabic on purpose) or `// i18n-part: <message>` (a piece of a message whose pair is there).");
  process.exit(1);
}
console.log("server text: every Arabic message the server sends has its English");
