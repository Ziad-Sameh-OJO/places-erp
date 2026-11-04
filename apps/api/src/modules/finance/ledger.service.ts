import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AccountLedger, AccountNode, ChartView, EntryView, JournalFilters, JournalView, NewAccount, OpeningBalances } from "@places/contracts";
import {
  RETAINED_EARNINGS, YEAR_RESULT, balanceOf, entryProblem, fromDecimal, localDate, natureOf, nextChildCode, openingLines, rollUp,
  toDecimal, type EntryLine, type Nature, type Piasters,
} from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LedgerRepository, type AccountRow, type Tx } from "./ledger.repository";

const NO_ACCOUNT = "الحساب مش موجود";
const dec = (v: { toFixed(n: number): string } | null | undefined): Piasters => (v ? fromDecimal(v.toFixed(2)) : 0);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
/** Codes the system keeps: retained earnings and the year's result take no sub-accounts and no manual lines. */
const SYSTEM_CODES = new Set([RETAINED_EARNINGS, YEAR_RESULT]);

export interface PostInput {
  date: string; // YYYY-MM-DD (Cairo day)
  nature: string; // صرف نقدية · توريد نقدية · رصيد افتتاحي · قيد يدوي …
  source: string; // opening · manual · voucher …
  sourceId?: string | null;
  memo: string;
  lines: EntryLine[];
}

/**
 * M-07 · the general ledger (9.1 + 9.5): the chart with live balances, sub-accounts, the journal, and the one engine
 * every movement posts through (vouchers, manual entries, payroll — 9.2, 9.13, 9.14). Every change is audited in its
 * own transaction.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly repo: LedgerRepository, private readonly audit: AuditService) {}

  /** Posts one balanced entry inside the caller's transaction (M-07 9.5): refused unless debit = credit. */
  async post(me: CurrentUser, input: PostInput, tx: Tx): Promise<{ id: string; no: string }> {
    const problem = entryProblem(input.lines);
    if (problem) throw new BadRequestException(problem);
    if (input.date > localDate(new Date())) throw new BadRequestException("مينفعش تاريخ بعد النهارده");
    const accounts = new Map((await this.repo.accounts(tx)).map((a) => [a.id, a]));
    const parents = new Set([...accounts.values()].map((a) => a.parentId).filter(Boolean));
    for (const l of input.lines) {
      const a = accounts.get(l.accountId);
      if (!a) throw new BadRequestException(NO_ACCOUNT);
      if (parents.has(a.id)) throw new BadRequestException(`«${a.name}» حساب رئيسي · القيد بيتعمل على الحسابات الفرعية`);
      if (a.code === YEAR_RESULT) throw new BadRequestException("أرباح وخسائر العام بتتحسب لوحدها من الإيرادات والمصروفات");
    }
    const e = await this.repo.createEntry(
      { date: new Date(`${input.date}T00:00:00Z`), nature: input.nature, source: input.source, sourceId: input.sourceId ?? null, memo: input.memo, createdById: me.id },
      input.lines.map((l) => ({ accountId: l.accountId, debit: toDecimal(l.debit), credit: toDecimal(l.credit) })), tx,
    );
    await this.audit.record({ module: "finance", entity: "JournalEntry", entityId: e.id, action: "post", userId: me.id,
      after: { no: e.no, date: input.date, nature: input.nature, memo: input.memo, lines: input.lines.map((l) => ({ accountId: l.accountId, debit: toDecimal(l.debit), credit: toDecimal(l.credit) })) } }, tx);
    return { id: e.id, no: `JV-${e.no}` };
  }

  /** Live balances for every account (each account in its own direction, parents = sum of children) + the year's result in 34. */
  async balances(tx?: Tx): Promise<{ accounts: AccountRow[]; balance: Map<string, Piasters> }> {
    const [accounts, sums] = await Promise.all([this.repo.accounts(tx), this.repo.sums(tx)]);
    const own = new Map(sums.map((s) => [s.accountId, { debit: dec(s._sum.debit), credit: dec(s._sum.credit) }]));
    const balance = rollUp(accounts.map((a) => ({ id: a.id, parentId: a.parentId, nature: a.nature as Nature })), own);
    // 34 «أرباح وخسائر العام» = revenue − expenses (no closing entries during the year), carried up to equity
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const result = (balance.get(byCode.get("4")?.id ?? "") ?? 0) - (balance.get(byCode.get("5")?.id ?? "") ?? 0);
    for (let a = byCode.get(YEAR_RESULT); a; a = a.parentId ? accounts.find((x) => x.id === a!.parentId) : undefined) balance.set(a.id, (balance.get(a.id) ?? 0) + result);
    return { accounts, balance };
  }

  async chart(): Promise<ChartView> {
    const [{ accounts, balance }, sums] = await Promise.all([this.balances(), this.repo.sums()]);
    const moved = new Set(sums.map((s) => s.accountId));
    const kids = new Map<string | null, AccountRow[]>();
    for (const a of accounts) kids.set(a.parentId, [...(kids.get(a.parentId) ?? []), a]);
    const node = (a: AccountRow): AccountNode => {
      const children = (kids.get(a.id) ?? []).map(node);
      return { id: a.id, code: a.code, name: a.name, nature: a.nature as Nature, kind: a.kind, fixed: a.fixed, balance: toDecimal(balance.get(a.id) ?? 0),
        removable: !a.fixed && !children.length && !moved.has(a.id), children };
    };
    const roots = (kids.get(null) ?? []).map(node);
    const root = (code: string) => balance.get(accounts.find((a) => a.code === code)?.id ?? "") ?? 0;
    return { roots, check: { assets: toDecimal(root("1")), liabilities: toDecimal(root("2")), equity: toDecimal(root("3")), balanced: root("1") === root("2") + root("3") } };
  }

  /** «حساب جديد في الشجرة» (M-07, 4 Nov): the code from the parent; a leaf's movements move to «(عام)»; an opening balance posts its entry. */
  async addAccount(me: CurrentUser, input: NewAccount, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>) {
    return run(async (tx) => {
      const parent = await this.repo.account(input.parentId, tx);
      if (!parent) throw new NotFoundException(NO_ACCOUNT);
      if (SYSTEM_CODES.has(parent.code)) throw new BadRequestException("مينفعش حسابات فرعية تحت الحساب ده · السيستم بيحسبه");
      const nature = natureOf(parent.code);
      const codes = await this.repo.childCodes(parent.id, tx);
      // the leaf's own movements go to «<name> (عام)» so the parent stays the sum of its children
      if (!parent._count.children && parent._count.lines) {
        const general = await this.repo.createAccount({ code: nextChildCode(parent.code, codes), name: `${parent.name} (عام)`, parentId: parent.id, nature, kind: parent.kind }, tx);
        await this.repo.moveLines(parent.id, general.id, tx);
        codes.push(general.code);
      }
      const kind = input.kind ?? (parent.code.startsWith("111") ? "treasury" : parent.code.startsWith("112") ? "bank" : null);
      const account = await this.repo.createAccount({ code: nextChildCode(parent.code, codes), name: input.name, parentId: parent.id, nature, kind }, tx);
      await this.audit.record({ module: "finance", entity: "Account", entityId: account.id, action: "create", userId: me.id, after: { code: account.code, name: account.name, parent: parent.code } }, tx);
      const amount = input.opening ? fromDecimal(input.opening) : 0;
      if (amount) {
        const counter = input.counterId ? await this.repo.account(input.counterId, tx) : await this.repo.accountByCode(RETAINED_EARNINGS, tx);
        if (!counter) throw new BadRequestException(NO_ACCOUNT);
        const debitNew = nature === "dr";
        await this.post(me, { date: input.date ?? localDate(new Date()), nature: "رصيد افتتاحي", source: "opening", sourceId: account.id, memo: `رصيد افتتاحي · ${account.name}`,
          lines: [{ accountId: account.id, debit: debitNew ? amount : 0, credit: debitNew ? 0 : amount }, { accountId: counter.id, debit: debitNew ? 0 : amount, credit: debitNew ? amount : 0 }] }, tx);
      }
      return { id: account.id, code: account.code, name: account.name };
    });
  }

  /** A new account can be removed while it has no movements and no sub-accounts (M-07, 4 Nov). */
  async removeAccount(me: CurrentUser, id: string, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>) {
    return run(async (tx) => {
      const a = await this.repo.account(id, tx);
      if (!a) throw new NotFoundException(NO_ACCOUNT);
      if (a.fixed) throw new BadRequestException("ده حساب من الشجرة الأساسية · مينفعش يتمسح");
      if (a._count.lines || a._count.children) throw new BadRequestException("الحساب عليه قيود أو تحته حسابات · مينفعش يتمسح");
      await this.repo.archiveAccount(id, tx);
      await this.audit.record({ module: "finance", entity: "Account", entityId: id, action: "archive", userId: me.id, before: { code: a.code, name: a.name } }, tx);
      return { id, code: a.code };
    });
  }

  /** The opening balances on the start date (9.5): one entry, the difference against retained earnings; only once. */
  async opening(me: CurrentUser, input: OpeningBalances, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>) {
    return run(async (tx) => {
      const accounts = await this.repo.accounts(tx);
      const byId = new Map(accounts.map((a) => [a.id, a]));
      const retained = accounts.find((a) => a.code === RETAINED_EARNINGS);
      if (!retained) throw new BadRequestException(NO_ACCOUNT);
      const rows = input.lines.map((l) => {
        const a = byId.get(l.accountId);
        if (!a) throw new BadRequestException(NO_ACCOUNT);
        return { accountId: a.id, nature: a.nature as Nature, amount: fromDecimal(l.amount) };
      });
      return this.post(me, { date: input.date, nature: "رصيد افتتاحي", source: "opening", memo: "الأرصدة الافتتاحية", lines: openingLines(rows, retained.id) }, tx);
    });
  }

  async ledger(id: string): Promise<AccountLedger> {
    const [{ accounts, balance }, lines] = await Promise.all([this.balances(), this.repo.accountLines(id)]);
    const a = accounts.find((x) => x.id === id);
    if (!a) throw new NotFoundException(NO_ACCOUNT);
    let running = 0;
    return {
      account: { id: a.id, code: a.code, name: a.name, path: this.path(a, accounts), nature: a.nature as Nature },
      balance: toDecimal(balance.get(a.id) ?? 0),
      lines: lines.map((l) => {
        running += balanceOf(a.nature as Nature, dec(l.debit), dec(l.credit));
        return { entryId: l.entryId, no: `JV-${l.entry.no}`, date: dayOf(l.entry.date), nature: l.entry.nature, memo: l.entry.memo, debit: toDecimal(dec(l.debit)), credit: toDecimal(dec(l.credit)), balance: toDecimal(running) };
      }),
    };
  }

  async journal(f: JournalFilters): Promise<JournalView> {
    const [rows, total, sums] = await this.repo.entries(f);
    const accounts = await this.repo.accounts();
    const names = new Map((await this.repo.names([...new Set(rows.map((r) => r.createdById))])).map((n) => [n.userId, n.name]));
    const debit = dec(sums._sum.debit), credit = dec(sums._sum.credit);
    return { items: rows.map((r) => this.view(r, accounts, names)), total, page: f.page, pageSize: f.pageSize, totals: { debit: toDecimal(debit), credit: toDecimal(credit), balanced: debit === credit } };
  }

  async entry(id: string): Promise<EntryView> {
    const r = await this.repo.entry(id);
    if (!r) throw new NotFoundException("القيد مش موجود");
    const names = new Map((await this.repo.names([r.createdById])).map((n) => [n.userId, n.name]));
    return this.view(r, await this.repo.accounts(), names);
  }

  private view(r: NonNullable<Awaited<ReturnType<LedgerRepository["entry"]>>>, accounts: AccountRow[], names: Map<string, string>): EntryView {
    const lines = r.lines.map((l) => {
      const a = accounts.find((x) => x.id === l.accountId);
      return { accountId: l.accountId, code: a?.code ?? "", name: a?.name ?? "", path: a ? this.path(a, accounts) : [], debit: toDecimal(dec(l.debit)), credit: toDecimal(dec(l.credit)) };
    });
    return { id: r.id, no: `JV-${r.no}`, date: dayOf(r.date), nature: r.nature, source: r.source, sourceId: r.sourceId, memo: r.memo, by: names.get(r.createdById) ?? "",
      lines, debit: toDecimal(r.lines.reduce((s, l) => s + dec(l.debit), 0)), credit: toDecimal(r.lines.reduce((s, l) => s + dec(l.credit), 0)) };
  }

  /** «الأصول ← الاصول المتداولة ← الخزينة ← خزينة رئيسية». */
  private path(a: AccountRow, accounts: AccountRow[]): string[] {
    const out: string[] = [];
    for (let x: AccountRow | undefined = a; x; x = x.parentId ? accounts.find((y) => y.id === x!.parentId) : undefined) out.unshift(x.name);
    return out;
  }
}
