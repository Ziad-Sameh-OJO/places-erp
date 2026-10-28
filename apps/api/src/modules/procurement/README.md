# M-08 · المشتريات

Purchase requests, approval limit (≤50,000 any approver, above: Ahmed or Safwat), receipts over 10,000, payment from a treasury, budget lines, petty-cash ceiling, office assets.

Pattern: copy `modules/leads` — `procurement.controller.ts` (HTTP + @Requires), `procurement.service.ts` (use cases, transactions, audit), `procurement.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
