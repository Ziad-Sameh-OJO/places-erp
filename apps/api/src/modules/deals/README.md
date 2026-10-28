# M-02 · الصفقات والتحصيل

Done Deals, Office Manager review, Seller approval by Manar, collections from owner/client, TCR with its serial and signatures, achievements. Rules: splitDeal, collectionStatus, transactionsOf (packages/domain/commission.ts).

Pattern: copy `modules/leads` — `deals.controller.ts` (HTTP + @Requires), `deals.service.ts` (use cases, transactions, audit), `deals.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
