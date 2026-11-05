# documents
PDF from HTML with Playwright (ADR-0005: correct Arabic shaping and RTL): TCR, unit PDF & slide, the quarterly
employee sheet, invoices/receipts. Excel in and out lives in `core/http` (`excel.ts`, `import.ts`).

- `layout(title, body)`: the base A4 page (RTL, IBM Plex Sans Arabic inlined, table styles). Build `body` with `esc()`
  for every value; numbers that must stay left-to-right go in `<span class="num">` (the number only, not «ج.م»).
- `DocumentsService.pdf(html)` → Buffer, with the header (logo), the footer (page X of Y, printed at, Cairo time) and, at the end, the Super Admin's signature and stamp (12.12, setting `stamp`, inline images). `sendPdf(res, name, pdf)` shows it.
- `DocumentsService.save(me, name, html, attach?)` → stored in `core/files`, returns a 5-minute link.
- `GET /documents/sample` (preview) and `POST /documents/sample` (saved), `master: edit`, to check the look.

Locally Chromium comes from `cd apps/api && npx playwright-core install --only-shell chromium` (once).
