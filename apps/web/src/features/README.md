# features

One folder per business module, mirroring `apps/api/src/modules`: `leads/`, `deals/`, `inventory/`, `marketing/`,
`hr/`, `tickets/`, `finance/`, `procurement/`, `access/`, `clients/`, `contracts/`, `kpis/`, `settings/`.
Inside each: components, hooks (`use-*.ts`, React Query), and forms (zod schemas from `@places/contracts`).
A feature may import from `@places/ui`, `@places/contracts`, `@places/domain` and `@/lib` — never from another feature.
