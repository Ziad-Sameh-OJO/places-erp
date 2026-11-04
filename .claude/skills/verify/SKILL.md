---
name: verify
description: Run the full Places ERP definition-of-done checks (lint, typecheck, unit tests, build, API e2e) and report them honestly, handling the usual local snags (a running dev server locking Prisma, the DB port, no MinIO/Redis, little RAM). Use before saying a task is done, before a PR, or after merging branches.
---

# Verify (CLAUDE.md step 7)

Run from the repo root. Report every result faithfully — failures with their output. Never run two of these at once, and never switch branches while a check is running (it changes the files under the check).

## 0. Preconditions
- **`pnpm dev` must be stopped** if the schema changed: on Windows the running API locks `query_engine-windows.dll.node`, so `prisma generate` fails with `EPERM`. Ask the user to Ctrl+C it and not restart it until you're done. A running `nest --watch` also does **not** reload changes in `packages/contracts` — test against a fresh `pnpm --filter @places/api build`.
- **Database up** on the port in `DATABASE_URL` (`.env`). `pnpm db:local` reads that port, so a Postgres already installed on 5432 can stay (point `DATABASE_URL` at e.g. 5433). If it's down, ask the user to run `pnpm db:local` in its own tab.
- Low-RAM machines: `npx turbo run typecheck --concurrency=1` instead of `pnpm typecheck` (parallel tsc runs out of memory, exit 134).

## 1. Static checks
```bash
pnpm --filter @places/db generate
pnpm --filter @places/db migrate:deploy     # apply any new migration
pnpm lint
pnpm typecheck                              # or: npx turbo run typecheck --concurrency=1
pnpm test                                   # domain unit tests
```

## 2. API e2e (needs the API running)
```bash
(cd apps/api && npx playwright-core install --only-shell chromium)   # once: Chromium for PDFs
pnpm --filter @places/api build
```
Start it in the background — with a small pool, like CI, so connection starvation shows up locally:
`cd apps/api && DATABASE_URL="<url>?connection_limit=3" node --env-file=../../.env dist/main.js`.
Wait for `curl -s -o /dev/null http://localhost:4000/api/v1/auth/me`, then run the suite **twice** (the second run catches tests that leave data or state behind):
```bash
pnpm --filter @places/api test:e2e
```
Stop the API afterwards (it holds port 4000).

## 3. Known gaps without Docker
- No MinIO → the file-storage e2e tests (`files`, saving PDFs in `documents`) **skip**; CI runs them. Say so in the report.
- No Redis → the worker can't start locally; CI checks it.
- The access e2e (forgot password / OTP) has been seen failing intermittently when the whole suite runs; it passes alone and in CI. Re-run before blaming your change, and say so.

## 4. UI (for any task with a screen)
Drive it in Chromium with `playwright-core` (installed above) at 1366 and 375 px: the real flow, an error path (the form must keep what was typed), keyboard (Enter, Esc), no horizontal overflow, no console errors. Seed temporary data with a recognisable prefix and delete it afterwards.

## 5. Report
A table: lint · typecheck · unit (n/n) · e2e (pass / fail / skipped and why) · migrations applied · browser checks. Then tell the user they can start `pnpm dev` again.
