# M-10 · العملاء والملاك

One file per client and owner, linking leads, units, deals, contracts and every interaction.

Pattern: copy `modules/leads` — `clients.controller.ts` (HTTP + @Requires), `clients.service.ts` (use cases, transactions, audit), `clients.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
