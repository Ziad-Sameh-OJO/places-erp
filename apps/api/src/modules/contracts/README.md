# M-11 · العقود والتحصيل

Contracts, installments, renewal reminders 90/60/30, aging, receipts.

Pattern: copy `modules/leads` — `contracts.controller.ts` (HTTP + @Requires), `contracts.service.ts` (use cases, transactions, audit), `contracts.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
