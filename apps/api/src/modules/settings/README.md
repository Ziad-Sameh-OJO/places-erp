# M-13 · الإعدادات

Areas and their routing, channels, stages, company categories, holidays, SLA rules, deduction tiers, approval limits, KPI templates.

Pattern: copy `modules/leads` — `settings.controller.ts` (HTTP + @Requires), `settings.service.ts` (use cases, transactions, audit), `settings.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
