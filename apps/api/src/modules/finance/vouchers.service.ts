import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { BudgetPatch, BudgetView, CashView, MoveEffect, MoveFilters, MoveSaved, MoveView, MovesView, NewMove } from "@places/contracts";
import {
  ADVANCES_PARENT, BUDGET_PERIODS, CUSTODY_PARENT, OTHER_REVENUE, VOUCHER_LABEL, budgetCrossed, budgetLevel, formatEGP, fromDecimal, localDate,
  periodStart, toDecimal, voucherLines, voucherProblem, type BudgetPeriod, type Piasters, type VoucherKind, type VoucherSides,
} from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { LedgerService } from "./ledger.service";
import type { AccountRow, Tx } from "./ledger.repository";
import { VouchersRepository, type MoveRow } from "./vouchers.repository";

const CASH_KINDS = new Set(["treasury", "bank", "wallet"]);
const dec = (v: { toFixed(n: number): string } | null | undefined): Piasters => (v ? fromDecimal(v.toFixed(2)) : 0);
const day = (s: string) => new Date(`${s}T00:00:00Z`);
type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

/** The procurement chain's posting (10.2 → 9.3 `recordExpense`): a settled purchase becomes a payment voucher. */
export interface ExpenseInput { date?: string; fromId: string; accountId: string; amount: string; party: string; ref?: string; memo: string }

/**
 * M-07 · treasury vouchers (9.2 · 9.3 · 9.11) and the budget. Every voucher posts one balanced entry through
 * LedgerService.post() in the same transaction, is audited, and a payment that crosses its line's alert or budget
 * notifies the accountant (9.9).
 */
@Injectable()
export class VouchersService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly repo: VouchersRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** «الخزن والحركات» + «العهد والسلف» and the lists the voucher form needs. */
  async cash(): Promise<CashView> {
    const [{ accounts, balance }, custody, advances, people, budgets, today] = await Promise.all([
      this.ledger.balances(), this.repo.holders(CUSTODY_PARENT), this.repo.holders(ADVANCES_PARENT), this.repo.people(), this.repo.budgets(), this.repo.movesOn(day(localDate(new Date()))),
    ]);
    const parents = new Set(accounts.map((a) => a.parentId));
    const leaves = accounts.filter((a) => !parents.has(a.id));
    const bal = (id: string) => toDecimal(balance.get(id) ?? 0);
    const spent = await this.spent(budgets.map((b) => ({ accountId: b.accountId!, period: b.period as BudgetPeriod })));
    const left = (id: string) => { const b = budgets.find((x) => x.accountId === id && x.active && dec(x.budget)); return b ? toDecimal(dec(b.budget) - (spent.get(id) ?? 0)) : null; };
    const holder = (h: { id: string; code: string; name: string; holderId: string | null }) => ({ accountId: h.id, code: h.code, userId: h.holderId, name: h.name, balance: bal(h.id) });
    const sum = (k: string) => toDecimal(today.filter((m) => m.kind === k).reduce((s, m) => s + dec(m.amount), 0));
    return {
      accounts: leaves.filter((a) => a.kind && CASH_KINDS.has(a.kind)).map((a) => ({ id: a.id, code: a.code, name: a.name, kind: a.kind!, balance: bal(a.id) })),
      custody: custody.map(holder), advances: advances.map(holder),
      today: { count: today.length, paid: sum("pay"), received: sum("receive") },
      expenses: leaves.filter((a) => a.code.startsWith("5")).map((a) => ({ id: a.id, code: a.code, name: a.name, left: left(a.id) })),
      revenues: leaves.filter((a) => a.code.startsWith(OTHER_REVENUE)).map((a) => ({ id: a.id, code: a.code, name: a.name })),
      people,
    };
  }

  async create(me: CurrentUser, input: NewMove, run: Run): Promise<MoveSaved> {
    let crossed: { line: string; text: string } | null = null;
    const saved = await run(async (tx) => {
      const r = await this.save(me, input, tx);
      crossed = r.crossed;
      return r.saved;
    });
    const c = crossed as { line: string; text: string } | null;
    if (c) await this.notifications.notify({ event: "finance.budget", text: c.text, link: "/finance" });
    return { ...saved, budget: c?.text ?? null };
  }

  /** 10.2 → finance: a settled purchase posts as a payment voucher inside the caller's transaction. */
  async recordExpense(me: CurrentUser, e: ExpenseInput, tx: Tx) {
    return (await this.save(me, { kind: "pay", fromId: e.fromId, accountId: e.accountId, amount: e.amount, party: e.party, memo: e.memo, ...(e.date ? { date: e.date } : {}), ...(e.ref ? { ref: e.ref } : {}) }, tx)).saved;
  }

  private async save(me: CurrentUser, input: NewMove, tx: Tx): Promise<{ saved: Omit<MoveSaved, "budget">; crossed: { line: string; text: string } | null }> {
    const kind = input.kind as VoucherKind;
    const date = input.date ?? localDate(new Date());
    if (date > localDate(new Date())) throw new BadRequestException("مينفعش تاريخ بعد النهارده");
    const { accounts, balance } = await this.ledger.balances(tx);
    const parents = new Set(accounts.map((a) => a.parentId));
    const leaf = (id: string | undefined, label: string, ok: (a: AccountRow) => boolean): AccountRow => {
      const a = id ? accounts.find((x) => x.id === id) : undefined;
      if (!a) throw new BadRequestException(`اختار ${label}`);
      if (parents.has(a.id) || !ok(a)) throw new BadRequestException(`«${a.name}» مينفعش يبقى ${label}`);
      return a;
    };
    const cash = (id: string | undefined, label: string) => leaf(id, label, (a) => !!a.kind && CASH_KINDS.has(a.kind));
    const amount = input.amount ? fromDecimal(input.amount) : 0;

    let from: AccountRow | undefined, to: AccountRow | undefined, account: AccountRow | undefined, expense: AccountRow | undefined;
    let party = input.party?.trim() ?? "", partyId: string | undefined;
    if (kind === "pay") { from = cash(input.fromId, "الخزنة / البنك"); account = leaf(input.accountId, "نوع المصروف", (a) => a.code.startsWith("5")); }
    if (kind === "receive") { to = cash(input.toId, "الخزنة / البنك"); account = leaf(input.accountId, "المصدر", (a) => a.code.startsWith(OTHER_REVENUE)); }
    if (kind === "transfer") { from = cash(input.fromId, "الخزنة اللي هيتحوّل منها"); to = cash(input.toId, "الخزنة اللي هيتحوّل لها"); party = party || "تحويل داخلي"; }
    if (kind === "advance" || kind === "custody") {
      from = cash(input.fromId, "الخزنة / البنك");
      const person = input.partyId ? await this.repo.person(input.partyId, tx) : null;
      if (!person) throw new BadRequestException(kind === "advance" ? "اختار الموظف" : "اختار العهدة مع مين");
      account = await this.ledger.holderAccount(me, kind === "advance" ? ADVANCES_PARENT : CUSTODY_PARENT, person, tx);
      party = person.name; partyId = person.userId;
    }
    const spent = input.spent ? fromDecimal(input.spent) : 0, returned = input.returned ? fromDecimal(input.returned) : 0;
    if (kind === "settle") {
      account = leaf(input.accountId, "العهدة", (a) => accounts.find((p) => p.id === a.parentId)?.code === CUSTODY_PARENT);
      if (spent) expense = leaf(input.expenseId, "البند اللي اتصرف عليه", (a) => a.code.startsWith("5"));
      if (returned) to = cash(input.toId, "الخزنة اللي رجعلها");
      party = account.name;
    }
    if (!party) throw new BadRequestException("اكتب اسم اللي هيستلم الفلوس");

    const sides: VoucherSides = { amount, spent, returned, ...(from ? { from: from.id } : {}), ...(to ? { to: to.id } : {}), ...(account ? { account: account.id } : {}), ...(expense ? { expense: expense.id } : {}) };
    const problem = voucherProblem(kind, sides, { ...(from ? { from: balance.get(from.id) ?? 0, fromName: from.name } : {}), ...(kind === "settle" && account ? { custody: balance.get(account.id) ?? 0 } : {}) });
    if (problem) throw new BadRequestException(problem);
    const total = kind === "settle" ? spent + returned : amount;

    // the budget before this voucher (only payments and the spent part of a settlement touch an expense line)
    const line = kind === "pay" ? account : expense;
    const bud = line ? await this.repo.budgetOf(line.id, tx) : null;
    const budBefore = bud && bud.active && dec(bud.budget) ? (await this.spent([{ accountId: line!.id, period: bud.period as BudgetPeriod }], tx)).get(line!.id) ?? 0 : null;

    const entry = await this.ledger.post(me, { date, nature: VOUCHER_LABEL[kind], source: "voucher", memo: input.memo, lines: voucherLines(kind, sides) }, tx);
    const move = await this.repo.createMove({
      kind, date: day(date), fromId: from?.id ?? null, toId: to?.id ?? null, accountId: account?.id ?? null, expenseId: expense?.id ?? null,
      amount: toDecimal(total), spent: kind === "settle" ? toDecimal(spent) : null, returned: kind === "settle" ? toDecimal(returned) : null,
      party, partyId: partyId ?? null, ref: input.ref || null, memo: input.memo, entryId: entry.id, createdById: me.id,
    }, tx);
    await this.ledger.linkEntry(entry.id, move.id, tx);
    await this.audit.record({ module: "finance", entity: "TreasuryMove", entityId: move.id, action: "create", userId: me.id,
      after: { no: `MV-${move.no}`, kind, date, amount: toDecimal(total), from: from?.code, to: to?.code, account: account?.code, party, entry: entry.no } }, tx);

    // «الأثر على شجرة الحسابات»: before → after for every account the entry touched
    const after = (await this.ledger.balances(tx)).balance;
    const touched = [from, to, account, expense].filter((a): a is AccountRow => !!a);
    const effect: MoveEffect[] = touched.map((a) => ({ code: a.code, name: a.name, before: toDecimal(balance.get(a.id) ?? 0), after: toDecimal(after.get(a.id) ?? 0) }));

    let crossed: { line: string; text: string } | null = null;
    if (bud && budBefore !== null && line) {
      const b = dec(bud.budget), now = budBefore + (kind === "pay" ? amount : spent);
      const c = budgetCrossed(budBefore, now, b, bud.alert);
      if (c === "over") crossed = { line: line.name, text: `بند «${line.name}» عدّى البادجت: اتصرف ${formatEGP(now)} من ${formatEGP(b)}` };
      if (c === "alert") crossed = { line: line.name, text: `بند «${line.name}» وصل ${Math.round((now * 100) / b)}% من البادجت · فاضل ${formatEGP(b - now)}` };
    }
    return { saved: { move: this.view(move, entry.no, me.name), effect }, crossed };
  }

  async list(f: MoveFilters): Promise<MovesView> {
    const [rows, total] = await this.repo.moves(f);
    return { items: await this.views(rows), total, page: f.page, pageSize: f.pageSize };
  }

  async get(id: string): Promise<MoveView> {
    const m = await this.repo.move(id);
    if (!m) throw new NotFoundException("الحركة مش موجودة");
    return (await this.views([m]))[0]!;
  }

  private async views(rows: MoveRow[]): Promise<MoveView[]> {
    const [nos, names] = await Promise.all([this.repo.entryNo(rows.map((r) => r.entryId)), this.ledgerNames(rows.map((r) => r.createdById))]);
    return rows.map((r) => this.view(r, `JV-${nos.find((n) => n.id === r.entryId)?.no ?? ""}`, names.get(r.createdById) ?? ""));
  }

  private async ledgerNames(ids: string[]) {
    return new Map((await this.repo.people()).filter((p) => ids.includes(p.userId)).map((p) => [p.userId, p.name]));
  }

  private view(m: MoveRow, entryNo: string, by: string): MoveView {
    const k = m.kind as VoucherKind;
    return {
      id: m.id, no: `MV-${m.no}`, kind: k, label: VOUCHER_LABEL[k] ?? k, date: m.date.toISOString().slice(0, 10), amount: toDecimal(dec(m.amount)),
      spent: m.spent ? toDecimal(dec(m.spent)) : null, returned: m.returned ? toDecimal(dec(m.returned)) : null,
      from: m.from, to: m.to, account: m.account, party: m.party, ref: m.ref, memo: m.memo, by, entry: { id: m.entryId, no: entryNo },
    };
  }

  /* ---- the budget (9.2) ---- */

  /** What each line spent inside its own period (an expense's balance moves = debit − credit). */
  private async spent(lines: { accountId: string; period: BudgetPeriod }[], tx?: Tx): Promise<Map<string, Piasters>> {
    const today = localDate(new Date()), out = new Map<string, Piasters>();
    for (const period of BUDGET_PERIODS) {
      const ids = lines.filter((l) => l.period === period).map((l) => l.accountId);
      if (!ids.length) continue;
      for (const s of await this.repo.sumsSince(ids, day(periodStart(period, today)), tx)) out.set(s.accountId, dec(s._sum.debit) - dec(s._sum.credit));
    }
    return out;
  }

  async budget(): Promise<BudgetView> {
    const [{ accounts }, lines] = await Promise.all([this.ledger.balances(), this.repo.budgets()]);
    const parents = new Set(accounts.map((a) => a.parentId));
    const leaves = accounts.filter((a) => a.code.startsWith("5") && !parents.has(a.id));
    const spent = await this.spent(leaves.map((a) => ({ accountId: a.id, period: (lines.find((l) => l.accountId === a.id)?.period ?? "month") as BudgetPeriod })));
    const group = (code: string) => accounts.find((a) => a.code === code.slice(0, 2))?.name ?? "";
    const rows = leaves.map((a) => {
      const l = lines.find((x) => x.accountId === a.id), b = l ? dec(l.budget) : 0, sp = spent.get(a.id) ?? 0, on = l?.active ?? true;
      return { accountId: a.id, code: a.code, name: a.name, group: group(a.code), budget: b ? toDecimal(b) : null, period: l?.period ?? "month", alert: l?.alert ?? 80, active: on,
        spent: toDecimal(sp), left: b ? toDecimal(b - sp) : null, pct: b ? Math.round((sp * 100) / b) : 0, level: on ? budgetLevel(sp, b, l?.alert ?? 80) : ("" as const) };
    });
    const live = rows.filter((r) => r.active && r.budget);
    const tb = live.reduce((s, r) => s + fromDecimal(r.budget!), 0), ts = live.reduce((s, r) => s + fromDecimal(r.spent), 0);
    return { rows, totals: { budget: toDecimal(tb), spent: toDecimal(ts), left: toDecimal(tb - ts), alerts: live.filter((r) => r.level === "warn" || r.level === "bad").length } };
  }

  async setBudget(me: CurrentUser, accountId: string, patch: BudgetPatch, run: Run) {
    return run(async (tx) => {
      const { accounts } = await this.ledger.balances(tx);
      const a = accounts.find((x) => x.id === accountId);
      if (!a || !a.code.startsWith("5") || accounts.some((x) => x.parentId === a.id)) throw new BadRequestException("البادجت بيتحط على حساب مصروف فرعي");
      if (patch.budget && fromDecimal(patch.budget) < 0) throw new BadRequestException("البادجت مايبقاش بالسالب");
      const before = await this.repo.budgetOf(a.id, tx);
      const data = { ...(patch.budget !== undefined ? { budget: patch.budget } : {}), ...(patch.period ? { period: patch.period } : {}), ...(patch.alert ? { alert: patch.alert } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) };
      const kind = a.code.startsWith("52") ? "admin" : a.code.startsWith("53") ? "selling" : "other";
      const saved = await this.repo.upsertBudget(a.id, `${a.code} · ${a.name}`, kind, data, tx);
      await this.audit.record({ module: "finance", entity: "BudgetLine", entityId: saved.id, action: before ? "update" : "create", userId: me.id,
        before: before ? { budget: toDecimal(dec(before.budget)), period: before.period, alert: before.alert, active: before.active } : null,
        after: { account: a.code, budget: toDecimal(dec(saved.budget)), period: saved.period, alert: saved.alert, active: saved.active } }, tx);
      return { accountId: a.id };
    });
  }
}
