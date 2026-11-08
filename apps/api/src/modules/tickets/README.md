# M-06 · التذاكر الداخلية

Tickets between departments. The types, the department each one goes to and its SLA are data in `@places/domain` (`TICKET_TYPES`): a plain request (24 working hours, 4 if high), HR Letter (HR, 24h), dispute (الإدارة, settled in 48h, Nancy told), List request (Inventory, 24h — opened from the leads page and settled when the inventory team sends the units, 2.32), purchase / maintenance (Accounts, 48h). The Excuse (TL then HR, 7.4) and the List request are system types: opened and settled by their own screens.

- `tickets.controller.ts` HTTP + `@Requires` · `tickets.service.ts` use cases, transactions, audit, notifications · `tickets.repository.ts` Prisma only.
- Who sees what (M-06 4.1): the tickets I opened and my department's; «tickets: approve» sees all. The department the ticket is with replies, transfers and closes it (7.2 · 35).
- The SLA escalation runs every few minutes in `apps/worker/src/processors/ticket-sla.ts`; the response report is `GET /tickets/report`.
