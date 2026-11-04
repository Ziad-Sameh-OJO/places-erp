---
name: build-module
description: The Places ERP layered recipe for implementing a task — domain rule + test, one Prisma migration, Zod contracts, NestJS controller/service/repository, e2e test, Next.js feature — with the project's clean-code rules. Use while writing code for any task in this repo.
---

# Build a task, layer by layer

Copy the reference module, don't invent a new shape:
`apps/api/src/modules/access/*` · `packages/contracts/src/access.ts` · `apps/api/test/access.e2e.test.ts` · `apps/web/src/features/access/*`.

## Order (one step at a time, each one compiling)

1. **Domain** — `packages/domain/src/<area>.ts`, exported from `index.ts`.
   Pure functions or small single-purpose classes. No I/O, no framework, no `new Date()` (take `now`), money as `Piasters` + `allocate()`.
   Runs as TS on Node 24: imports end in `.ts`, no `enum`, no constructor parameter properties.
   Test in `packages/domain/test/<area>.test.ts` (`node:test`) with **the client's own numbers** from the requirements. Cite the requirement (`M-01 2.3`) in the test name or a comment.
   `pnpm --filter @places/domain test`
2. **Schema** — `packages/db/prisma/schema.prisma` (right Postgres schema: `access`, `sales`, `inventory`, `marketing`, `hr`, `ops`, `finance`, `kpi`, `system`).
   **One** migration per PR: `pnpm --filter @places/db migrate:dev --name <name>`. Never edit a merged migration. Unique rules as `@@unique`, filter columns get `@@index`, soft delete with `archivedAt`. Money `Decimal(14,2)`, time UTC.
3. **Contracts** — `packages/contracts/src/<module>.ts`: Zod input schemas + `z.infer` types, filters extend `Page`, money as `Money` (decimal string). Arabic validation messages.
4. **API** — `apps/api/src/modules/<module>/`:
   - `*.controller.ts`: HTTP only. Every route has `@Requires("<module>", "<action>")` (or `@SignedIn()` for personal routes). Input through `new ZodPipe(Schema)`. `@Me()` for the current user. No logic.
   - `*.service.ts`: the use case. Calls the domain rule, opens `this.db.$transaction`, writes, and calls `audit.record({...}, tx)` **inside the same transaction** for every create/update/delete/reassign/money change. Notifications via `NotificationsService.notify({ event, text, link, userIds })` (new events in `packages/domain/src/notifications.ts`). Arabic error messages (`BadRequestException("…")`).
   - `*.repository.ts`: Prisma queries only, no decisions. Data scope inside the query with `ownedBy(me)` — never filter after fetching.
   - Other modules only through their **service**, never their repository.
   - Register the module in `apps/api/src/app.module.ts`.
5. **e2e** — `apps/api/test/<module>.e2e.test.ts` with `helpers.ts` (`session`, `call`): an allowed account **and** a forbidden one (403), plus the real flow. Clean up what the test creates in `after()`. Seeded people are in `packages/db/prisma/seed-data/people.json`.
6. **UI** — `apps/web/src/features/<module>/` + a thin page in `apps/web/src/app/(app)/<module>/page.tsx`, add to `apps/web/src/lib/nav.ts`.
   React Query (`useQuery`, `api.get/post` from `@/lib/api`), shared pieces from `@/components/ui`, `useMe().can()` to hide what the user can't do (comfort only — the server decides). Same look and wording as `demo/design-2`. Check desktop and 375px.
   A feature never imports another feature.

## Clean code (team agreement)
- Small functions, one job each; name things by what they mean in the business (`pullOverdueLead`, not `process`).
- Keep lines readable: no five-statement one-liners; split long JSX into small components and data hooks into `use-*.ts`.
- No `any` (`unknown` + Zod), no business logic in controllers or components, no magic numbers — name them and cite the requirement.
- English code and comments; comments say **why** and cite the requirement. Every user-visible string in Egyptian Arabic, as in the demo.
- No secrets, no real people's data outside `prisma/seed-data`.

When the code is in, run the `verify` skill.
