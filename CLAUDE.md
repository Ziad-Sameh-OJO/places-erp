# Places ERP — instructions for AI assistants

ERP/CRM for **Places** (Egyptian real-estate brokerage), built by RECA TECH. Arabic RTL, mobile-first.
The developer talking to you usually writes Egyptian Arabic: answer in the language they use.

## Before writing code for a task
Tasks come as a number from `docs/tasks.md` (e.g. `1.6`) and a card from `docs/roadmap.md` (e.g. `T-03`; same text in the GitHub issue).
1. Read the card: its goal, steps, «اقرا» sources, and «موجود بالفعل» (what already exists — reuse it).
2. Read the module's section in `docs/requirements/requirements.md` (questions are numbered, e.g. `M-01 2.3`) and the sources the card lists.
3. Open the matching demo file in `demo/design-2/js/modules/` — it is the approved flow, wording and look.
4. If the requirements don't settle a business rule: **stop and ask**. Never invent one. Open questions get the `needs-client` label.

Requirements win over the demo when they disagree; say so in the PR.

## Where things are
| Path | What |
|---|---|
| `packages/domain` | All business rules: pure TS, no framework, no I/O, fully unit-tested |
| `packages/db` | Prisma schema (one Postgres schema per area), migrations, seed (real people from `prisma/seed-data`) |
| `packages/contracts` | Zod schemas shared by API (validation) and web (types/forms) |
| `packages/ui` | The demo's CSS (`app.css`, `mobile.css`, `theme.css` = design-2) and icons |
| `apps/api` | NestJS. `core/` = auth, authz, audit, notifications, mail, business-time. `modules/<name>` = one per requirement module |
| `apps/web` | Next.js App Router. `features/<module>` + thin pages in `app/(app)/<module>`; shared UI in `components/ui.tsx` |
| `apps/worker` | BullMQ jobs (SLA pulls, rotations, reminders) |
| `demo/` | Reference only — the client-approved prototype. **Don't edit.** |
| `docs/requirements/` | Requirements + every client source. `requirements.md` is **generated** from `requirements.json` (`python3 scripts/requirements_md.py`) — don't hand-edit |
| `docs/roadmap.md` | **Generated** from `scripts/roadmap.py` — edit the script, then `python3 scripts/roadmap.py --issues` |

Reference implementation to copy: `apps/api/src/modules/access` + `apps/web/src/features/access` (+ `apps/api/test/access.e2e.test.ts`).

## Order of work (every task)
1. Rule in `packages/domain/src` + test in `packages/domain/test` using the client's own numbers from the requirements.
2. Schema change → **one** migration per PR: `pnpm db:migrate --name <name>`. Never edit a merged migration.
3. Zod schemas in `packages/contracts/src/<module>.ts`.
4. API module: controller (HTTP + validation only) → service (use case, transaction, audit, notify) → repository (Prisma only). Register it in `app.module.ts`.
5. e2e test in `apps/api/test/<module>.e2e.test.ts`: an allowed account **and** a forbidden one, plus the real flow.
6. UI in `apps/web/src/features/<module>`, matching demo design-2, add the page to `lib/nav.ts`. Check desktop and phone (375px).
7. Before saying it's done:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @places/api test:e2e
   ```

## Rules that are easy to get wrong
- **Authorization is deny-by-default.** Every endpoint needs `@Requires(module, action)`; personal endpoints use `@SignedIn()`; only sign-in pages use `@Public()`. Data scope (own/team/dept/all) goes into the query (`ownedBy()`), not filtered afterwards. Hiding a button in the UI is comfort, never security.
- **Audit everything** that creates, updates, deletes, reassigns or changes money: `audit.record(…, tx)` inside the **same transaction** as the change.
- **Money:** integer piasters in the domain (`Piasters`, `allocate()`), `Decimal(14,2)` in the DB, decimal string on the wire. Never floats.
- **Time:** UTC in the DB. Working hours (11:00–19:00 Cairo, Friday off, official holidays) only through `business-time.ts` / `BusinessTimeService`. No `new Date()` inside domain functions — pass `now` in.
- **Notifications:** `NotificationsService.notify({ event, text, link, userIds })`; new event types go in `packages/domain/src/notifications.ts`.
- **Modules talk through services**, never another module's repository.
- **Domain package** runs as TypeScript directly on Node 24: imports end in `.ts`, erasable syntax only (no `enum`, no constructor parameter properties).
- **Validation errors:** the API and `@places/contracts` load two copies of zod, so detect `ZodError` by name (already done in `AllExceptionsFilter`), never `instanceof`.
- **No `any`** (use `unknown` + Zod), no business logic in controllers or React components.
- **Language:** code, identifiers and comments in English; every user-visible string in Egyptian Arabic, same wording as the demo. Comments explain *why*, and cite the requirement (`M-05 2.4`).
- **Secrets** only in `.env` (never committed). Real employee/client data never goes into issues, logs, screenshots or test fixtures outside `prisma/seed-data`.

## Running it
Node 24 (`.nvmrc`), pnpm via `corepack enable`.
```bash
pnpm install
pnpm db:local          # Postgres without Docker (or: pnpm infra:up)
pnpm files:local       # file storage: a MinIO you installed (or: pnpm infra:up)
pnpm db:migrate && pnpm db:seed
pnpm dev               # web :3000 · api :4000
```
Seeded accounts: the emails in `packages/db/prisma/seed-data/people.json`, password = `SEED_DEV_PASSWORD` in `.env`. Without `SMTP_URL`, every email the app sends (activation, reset, OTP) is written to `.local/outbox/`.

## Git
Branch `feature/M-01-short-name` (or `fix/…`, `chore/…`) from `main`. Conventional Commits (`feat(leads): …`). One task = one small PR with `Closes #<issue>`. CI must be green. Squash merge.
