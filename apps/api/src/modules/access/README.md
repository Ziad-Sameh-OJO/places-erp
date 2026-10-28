# M-09 · المستخدمين والصلاحيات

Users, invites, roles (create / copy / delete), the permission matrix, per-person overrides, account lock / unlock, last working day, audit log viewer.

Pattern: copy `modules/leads` — `access.controller.ts` (HTTP + @Requires), `access.service.ts` (use cases, transactions, audit), `access.repository.ts` (Prisma only). Rules go in `packages/domain`, schemas in `packages/contracts`.
