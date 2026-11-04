import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { FilesService } from "../files/files.service";
import type { CurrentUser } from "../auth/current-user.decorator";

/** Text and attributes going into a template. Everything from the database passes through this. */
export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** IBM Plex Sans Arabic (Arabic + Latin, 400 and 700) inlined as data URLs: the PDF never waits on the network. */
const FONT_CSS = (() => {
  const dir = dirname(createRequire(__filename).resolve("@fontsource/ibm-plex-sans-arabic/package.json"));
  return ["400", "700"].map((w) => readFileSync(join(dir, `${w}.css`), "utf8"))
    .join("\n")
    .split("\n\n")
    .filter((block) => /-(arabic|latin)-\d+-normal \*\//.test(block))
    .map((block) => block.replace(/src: url\(\.\/files\/([^)]+\.woff2)\)[^;]*;/, (_, f: string) => `src: url(data:font/woff2;base64,${readFileSync(join(dir, "files", f)).toString("base64")}) format('woff2');`))
    .join("\n\n");
})();

const LOGO = `<svg viewBox="0 0 512 512" width="22" height="22"><rect width="512" height="512" rx="112" fill="#0037ff"/><path d="M168 380V132h120a84 84 0 0 1 0 168H168" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/><circle cx="372" cy="372" r="34" fill="#fff"/></svg>`;

/** The base page every PDF uses: A4, right to left, the Places font. `body` is HTML built with esc(). */
export function layout(title: string, body: string) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
${FONT_CSS}
* { box-sizing: border-box; }
body { margin: 0; font-family: "IBM Plex Sans Arabic", sans-serif; font-size: 12pt; color: #0b1220; line-height: 1.6; }
h1 { font-size: 18pt; margin: 0 0 12pt; } h2 { font-size: 14pt; margin: 16pt 0 8pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0; } th, td { border: 1px solid #d5dbe6; padding: 5pt 8pt; text-align: start; }
th { background: #f1f4f9; font-weight: 700; } .num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
</style></head><body>${body}</body></html>`;
}

// Chromium's header and footer live outside the page: they don't see its fonts, so they carry their own copy.
const HEADER = `<style>${FONT_CSS}</style><div style="width:100%;margin:0 14mm;display:flex;align-items:center;gap:6px;direction:rtl;font-family:'IBM Plex Sans Arabic';font-size:9pt;color:#0b1220">${LOGO}<b>Places</b><span style="color:#6b7489">· عقارات</span></div>`;
const footer = (printedAt: string) => `<style>${FONT_CSS}</style><div style="width:100%;margin:0 14mm;display:flex;justify-content:space-between;direction:rtl;font-family:'IBM Plex Sans Arabic';font-size:8pt;color:#6b7489"><span>صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></span><span>${esc(printedAt)}</span></div>`;

/**
 * HTML → PDF with headless Chromium (ADR-0005: PDF libraries break Arabic shaping and RTL; a browser gets them right
 * and lets PDFs share the app's design). One browser for the whole API, a fresh page per document.
 */
@Injectable()
export class DocumentsService implements OnModuleDestroy {
  private browser: Promise<Browser> | null = null;

  constructor(private readonly files: FilesService) {}

  async pdf(html: string, now = new Date()): Promise<Buffer> {
    this.browser ??= chromium.launch();
    const page = await (await this.browser).newPage();
    try {
      // a PDF never fetches anything (fonts and logo are inline): a value that slipped past esc() can't reach the network
      await page.route("**/*", (r) => r.abort());
      await page.setContent(html, { waitUntil: "load" });
      const printedAt = now.toLocaleString("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", dateStyle: "long", timeStyle: "short" });
      return await page.pdf({
        format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: HEADER, footerTemplate: footer(printedAt),
        margin: { top: "22mm", bottom: "18mm", left: "14mm", right: "14mm" },
      });
    } finally {
      await page.close();
    }
  }

  /** Renders and keeps it in storage; returns a short download link. */
  async save(me: CurrentUser, name: string, html: string, attach?: { entity: string; entityId: string }) {
    return this.files.store(me, { name, mime: "application/pdf", body: await this.pdf(html), ...attach });
  }

  async onModuleDestroy() {
    if (this.browser) await (await this.browser).close();
  }
}
