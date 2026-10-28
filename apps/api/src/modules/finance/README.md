# M-07 · المالية

Chart of accounts, income statement, balance sheet, cost centers, payroll after deductions, treasuries and banks, month / quarter close.

Pattern: copy `modules/leads` — `finance.controller.ts` (HTTP + @Requires), `finance.service.ts` (use cases, transactions, audit), `finance.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
