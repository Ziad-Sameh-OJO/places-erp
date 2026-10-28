# M-05 · الموارد البشرية

Employees, fingerprint (device agent or sheet), attendance rules (attendanceDay), Weekly Delay, Excuses, leave approvals TL → HR, 1-to-1, penalties, deductions to finance, ideal employee (idealEmployee).

Pattern: copy `modules/leads` — `hr.controller.ts` (HTTP + @Requires), `hr.service.ts` (use cases, transactions, audit), `hr.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
