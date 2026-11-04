/**
 * Finance e2e files run in parallel: each one opens its own accounts (prefixed with its run id) so balances it checks
 * aren't moved by another file. `cleanFinance` removes them with every entry, voucher and audit row they made.
 */
import { prisma } from "@places/db";
import { call } from "./helpers.ts";

export interface Node { id: string; code: string; name: string; balance: string; removable: boolean; children: Node[] }
export const find = (nodes: Node[], code: string): Node | undefined => { for (const n of nodes) { if (n.code === code) return n; const c = find(n.children, code); if (c) return c; } return undefined; };
export const cents = (s: string) => Math.round(Number(s) * 100);
export const chart = async (cookie: string) => (await call("/finance/accounts", { cookie })).body.roots as Node[];
const byId = (nodes: Node[], id: string): Node | undefined => { for (const n of nodes) { if (n.id === id) return n; const c = byId(n.children, id); if (c) return c; } return undefined; };
/** An account's live balance in piasters, by id. */
export const balance = async (cookie: string, id: string) => cents(byId(await chart(cookie), id)!.balance);

/** A fresh sub-account under `parentCode` (with an optional opening balance against retained earnings). */
export async function fresh(cookie: string, prefix: string, parentCode: string, name: string, opening?: string) {
  const parent = find(await chart(cookie), parentCode)!;
  const r = await call("/finance/accounts", { method: "POST", cookie, body: { parentId: parent.id, name: `${prefix} ${name}`, ...(opening ? { opening, date: "2026-11-01" } : {}) } });
  if (r.status !== 201) throw new Error(`fresh ${parentCode}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { id: string; code: string; name: string };
}

/** `holders`: also the 131 / 134 person accounts opened since `since` (only the file that opens them passes it). */
export async function cleanFinance(prefix: string, since: Date, holders = false) {
  const accounts = (await prisma.account.findMany({ where: { OR: [{ name: { startsWith: prefix } }, ...(holders ? [{ holderId: { not: null }, createdAt: { gte: since } }] : [])] }, select: { id: true } })).map((a) => a.id);
  const entries = (await prisma.journalEntry.findMany({ where: { OR: [{ memo: { contains: prefix } }, { lines: { some: { accountId: { in: accounts } } } }] }, select: { id: true } })).map((e) => e.id);
  const moves = (await prisma.treasuryMove.findMany({ where: { entryId: { in: entries } }, select: { id: true } })).map((m) => m.id);
  const bills = (await prisma.recurringBill.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } })).map((b) => b.id);
  const budgets = (await prisma.budgetLine.findMany({ where: { accountId: { in: accounts } }, select: { id: true } })).map((b) => b.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...accounts, ...entries, ...moves, ...bills, ...budgets] } } });
  await prisma.recurringBill.deleteMany({ where: { id: { in: bills } } });
  await prisma.treasuryMove.deleteMany({ where: { id: { in: moves } } });
  await prisma.journalEntry.deleteMany({ where: { id: { in: entries } } });
  await prisma.budgetLine.deleteMany({ where: { id: { in: budgets } } });
  await prisma.account.deleteMany({ where: { id: { in: accounts } } });
  await prisma.notification.deleteMany({ where: { text: { contains: prefix }, createdAt: { gte: since } } });
}
