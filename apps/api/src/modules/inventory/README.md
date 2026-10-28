# M-03 · مخزون الوحدات

Units (Rent · Resale · Income, dual type), area tabs, PDF & slide with Manar's confirm, closing a unit, Excel import, Not Active sheets (merge without duplicates, Marwa's classification), list requests, Manar's daily report and team tasks.

Pattern: copy `modules/leads` — `inventory.controller.ts` (HTTP + @Requires), `inventory.service.ts` (use cases, transactions, audit), `inventory.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
