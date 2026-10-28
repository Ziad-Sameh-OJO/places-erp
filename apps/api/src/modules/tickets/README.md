# M-06 · التذاكر الداخلية

Tickets between departments with SLA per type (dispute 48h, HR letter 24h, purchase 48h), escalation, audit trail, Excuse tickets to the TL then HR.

Pattern: copy `modules/leads` — `tickets.controller.ts` (HTTP + @Requires), `tickets.service.ts` (use cases, transactions, audit), `tickets.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
