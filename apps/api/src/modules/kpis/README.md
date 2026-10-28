# M-12 · التقارير والتارجت والـ KPIs

Targets, Team Leaders' tiers, quarterly employee sheet, KPI cards (cardScore, payoutDelta), bands, follower approval, quarter close, scheduled reports.

Pattern: copy `modules/leads` — `kpis.controller.ts` (HTTP + @Requires), `kpis.service.ts` (use cases, transactions, audit), `kpis.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
