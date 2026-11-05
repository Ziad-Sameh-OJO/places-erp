import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AccountLedger, AccountNode, ChartView, EntrySaved, EntryView, IncomeView, JournalFilters, JournalView, ManualEntry, MoveEffect, NewAccount, OpeningBalances, PeriodView } from "@places/contracts";
import {
  PERIOD_STATUS_LABEL, RETAINED_EARNINGS, incomeStatement, YEAR_RESULT, balanceOf, closedProblem, entryProblem, monthLabel, monthOf, periodStatus, fromDecimal, localDate, natureOf, nextChildCode, openingLines, reversalLines, rollUp,
  toDecimal, type EntryLine, type Nature, type PeriodStatus, type Piasters,
} from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { LedgerRepository, type AccountRow, type Tx } from "./ledger.repository";

const NO_ACCOUNT = "الحساب مش موجود";
const dec = (v: { toFixed(n: number): string } | null | undefined): Piasters => (v ? fromDecimal(v.toFixed(2)) : 0);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
/** Codes the system keeps: retained earnings and the year's result take no sub-accounts and no manual lines. */
const SYSTEM_CODES = new Set([RETAINED_EARNINGS, YEAR_RESULT]);
/** JV-12 for an automatic entry, JV-M12 for a manual one (9.13). */
const entryNo = (no: number, source: string) => (source === "manual" ? `JV-M${no}` : `JV-${no}`);

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
    // opening balances sit on the start date; everything else needs an open month (9.8)
    if (input.source !== "opening") {
      const closed = closedProblem(input.date, localDate(new Date()), await this.closed(tx));
      if (closed) throw new BadRequestException(closed);
    }
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
    return { id: e.id, no: entryNo(e.no, input.source) };
  }

  /**
   * 9.6 · Q12: undo everything a source posted (a cancelled deal's revenue and commissions) with one reversing entry
   * each, dated today. Idempotent: an entry that already has its reversal is skipped.
   */
  async reverse(me: CurrentUser, source: string, sourceId: string, memo: string, tx: Tx): Promise<string[]> {
    const { entries, reversed } = await this.repo.posted(source, sourceId, tx);
    const nos: string[] = [];
    for (const e of entries.filter((x) => !reversed.has(x.id))) {
      const lines = reversalLines(e.lines.map((l) => ({ accountId: l.accountId, debit: dec(l.debit), credit: dec(l.credit) })));
      nos.push((await this.post(me, { date: localDate(new Date()), nature: `عكس ${e.nature}`, source: "reversal", sourceId: e.id, memo: `${memo} · عكس ${entryNo(e.no, e.source)}`, lines }, tx)).no);
    }
    return nos;
  }

  private async closed(tx?: Tx): Promise<Map<string, PeriodStatus>> {
    return new Map((await this.repo.closedMonths(tx)).map((p) => [p.month, p.status as PeriodStatus]));
  }

  /**
   * 9.7 · قايمة الدخل: «الشهر ده» (entries dated this month) or «من أول السنة», from the chart's leaves, in the stages
   * revenue → direct → selling → admin → other → net (= 4 − 5 = account 34 for the year).
   */
  async income(range: "month" | "year"): Promise<IncomeView> {
    const today = localDate(new Date()), from = range === "month" ? `${monthOf(today)}-01` : `${today.slice(0, 4)}-01-01`;
    const [accounts, sums] = await Promise.all([this.repo.accounts(), this.repo.sumsSince(new Date(`${from}T00:00:00Z`))]);
    const parents = new Set(accounts.map((a) => a.parentId));
    const moved = new Map(sums.map((s) => [s.accountId, s]));
    const leaves = accounts.filter((a) => /^[45]/.test(a.code) && !parents.has(a.id)).map((a) => {
      const m = moved.get(a.id);
      return { id: a.id, code: a.code, name: a.name, value: m ? balanceOf(a.nature as Nature, dec(m._sum.debit), dec(m._sum.credit)) : 0 };
    });
    const st = incomeStatement(leaves, accounts.filter((a) => a.code.length === 2 && a.code.startsWith("5")));
    const ids = new Map(accounts.map((a) => [a.code, a.id]));
    const v = (l: { code: string; name: string; value: Piasters }) => ({ id: ids.get(l.code) ?? "", code: l.code, name: l.name, value: toDecimal(l.value) });
    return {
      range, from, label: range === "month" ? monthLabel(monthOf(today)) : `من أول ${today.slice(0, 4)}`,
      revenue: toDecimal(st.revenue), direct: toDecimal(st.direct), gross: toDecimal(st.gross), selling: toDecimal(st.selling), contribution: toDecimal(st.contribution),
      admin: toDecimal(st.admin), other: toDecimal(st.other), net: toDecimal(st.net),
      lines: { revenue: st.lines.revenue.map(v), direct: st.lines.direct.map(v), selling: st.lines.selling.map(v), admin: st.lines.admin.map(v), other: st.lines.other.map((o) => ({ head: v(o.head), lines: o.lines.map(v) })) },
    };
  }

  /** The last six months and their status (9.8): the open one follows today. */
  async periods(): Promise<PeriodView[]> {
    const today = localDate(new Date()), closed = await this.closed();
    const months: string[] = [];
    for (let d = new Date(`${monthOf(today)}-01T00:00:00Z`), i = 0; i < 6; i++, d.setUTCMonth(d.getUTCMonth() - 1)) months.push(d.toISOString().slice(0, 7));
    return months.reverse().map((m) => { const st = periodStatus(m, today, closed); return { month: m, label: monthLabel(m), status: st, statusLabel: PERIOD_STATUS_LABEL[st] }; });
  }

  /** «اقفل الشهر» / «اقفل الربع» (9.8): closes the current month by hand; nothing posts in it after that. */
  async closePeriod(me: CurrentUser, kind: "month" | "quarter", run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>) {
    return run(async (tx) => {
      const month = monthOf(localDate(new Date()));
      const before = periodStatus(month, localDate(new Date()), await this.closed(tx));
      if (before === kind || before === "quarter") throw new BadRequestException(`${monthLabel(month)} ${PERIOD_STATUS_LABEL[before]} قبل كده`);
      await this.repo.closeMonth(month, kind, me.id, tx);
      await this.audit.record({ module: "finance", entity: "FinancePeriod", entityId: month, action: "close", userId: me.id, before: { status: before }, after: { status: kind } }, tx);
      return { month, label: monthLabel(month), status: kind, statusLabel: PERIOD_STATUS_LABEL[kind] };
    });
  }

  /** 9.13 · «قيد يومية جديد»: nature «قيد يدوي», numbered JV-M…, with «الأثر على شجرة الحسابات». */
  async manual(me: CurrentUser, input: ManualEntry, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>): Promise<EntrySaved> {
    const id = await run(async (tx) => {
      const before = (await this.balances(tx)).balance;
      const e = await this.post(me, { date: input.date, nature: "قيد يدوي", source: "manual", memo: input.memo, lines: this.lines(input) }, tx);
      return { id: e.id, before };
    });
    return { entry: await this.entry(id.id), effect: await this.effect(input, id.before) };
  }

  /** M-07 (43): editing a manual entry after it posted — only someone with finance «approve», in an open month, audited before → after. */
  async editManual(me: CurrentUser, id: string, input: ManualEntry, run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>): Promise<EntrySaved> {
    const before = await run(async (tx) => {
      const old = await this.repo.entry(id);
      if (!old) throw new NotFoundException("القيد مش موجود");
      if (old.source !== "manual") throw new BadRequestException("القيود الأوتوماتيك بتتعدّل من السند بتاعها · اعمل قيد تسوية");
      const today = localDate(new Date()), closed = await this.closed(tx);
      const shut = closedProblem(dayOf(old.date), today, closed);
      if (shut) throw new BadRequestException(shut);
      const lines = this.lines(input);
      const problem = entryProblem(lines);
      if (problem) throw new BadRequestException(problem);
      const shut2 = closedProblem(input.date, today, closed);
      if (shut2) throw new BadRequestException(shut2);
      if (input.date > today) throw new BadRequestException("مينفعش تاريخ بعد النهارده");
      const accounts = await this.repo.accounts(tx), parents = new Set(accounts.map((a) => a.parentId));
      for (const l of lines) {
        const a = accounts.find((x) => x.id === l.accountId);
        if (!a) throw new BadRequestException(NO_ACCOUNT);
        if (parents.has(a.id) || a.code === YEAR_RESULT) throw new BadRequestException(`«${a.name}» مينفعش يتقيد عليه`);
      }
      const balances = (await this.balances(tx)).balance;
      await this.repo.replaceEntry(id, { date: new Date(`${input.date}T00:00:00Z`), memo: input.memo }, lines.map((l) => ({ accountId: l.accountId, debit: toDecimal(l.debit), credit: toDecimal(l.credit) })), tx);
      await this.audit.record({ module: "finance", entity: "JournalEntry", entityId: id, action: "update", userId: me.id,
        before: { date: dayOf(old.date), memo: old.memo, lines: old.lines.map((l) => ({ accountId: l.accountId, debit: l.debit.toFixed(2), credit: l.credit.toFixed(2) })) },
        after: { date: input.date, memo: input.memo, lines: input.lines } }, tx);
      return balances;
    });
    return { entry: await this.entry(id), effect: await this.effect(input, before) };
  }

  private lines(input: ManualEntry): EntryLine[] {
    return input.lines.map((l) => ({ accountId: l.accountId, debit: fromDecimal(l.debit || "0"), credit: fromDecimal(l.credit || "0") }));
  }

  private async effect(input: ManualEntry, before: Map<string, Piasters>): Promise<MoveEffect[]> {
    const { accounts, balance } = await this.balances();
    return [...new Set(input.lines.map((l) => l.accountId))].map((id) => {
      const a = accounts.find((x) => x.id === id)!;
      return { code: a.code, name: a.name, before: toDecimal(before.get(id) ?? 0), after: toDecimal(balance.get(id) ?? 0) };
    });
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

  /**
   * A person's own account under 131 (سلف موظفين) or 134 (عهد), opened with their first advance / custody
   * (docs/requirements/sources/chart-of-accounts.md: «حساب لكل موظف بيتفتح لوحده مع أول سلفة»).
   */
  async holderAccount(me: CurrentUser, parentCode: string, holder: { userId: string; name: string }, tx: Tx): Promise<AccountRow> {
    const parent = await this.repo.accountByCode(parentCode, tx);
    if (!parent) throw new BadRequestException(NO_ACCOUNT);
    const found = await this.repo.holderAccount(parent.id, holder.userId, tx);
    return found ?? this.subAccount(me, parentCode, holder.name, tx, holder.userId);
  }

  /** A sub-account opened by the system inside the caller's transaction (a person's 131/134, a new budget line under 52/53). */
  async subAccount(me: CurrentUser, parentCode: string, name: string, tx: Tx, holderId?: string): Promise<AccountRow> {
    const parent = await this.repo.accountByCode(parentCode, tx);
    if (!parent) throw new BadRequestException(NO_ACCOUNT);
    const account = await this.repo.createAccount({ code: nextChildCode(parent.code, await this.repo.childCodes(parent.id, tx)), name, parentId: parent.id, nature: parent.nature, kind: null, ...(holderId ? { holderId } : {}) }, tx);
    await this.audit.record({ module: "finance", entity: "Account", entityId: account.id, action: "create", userId: me.id, after: { code: account.code, name: account.name, parent: parent.code } }, tx);
    return account;
  }

  /**
   * 9.12 (4 Nov): a client's own account under 113 (113001…) or a salesperson's under 21103, opened by the system
   * the first time it's needed; the code is given once and kept, so the order follows the oldest deal.
   */
  async partyAccount(me: CurrentUser, parentCode: string, party: { type: "client" | "sales"; id: string; name: string }, tx: Tx): Promise<AccountRow> {
    const found = await this.repo.partyAccount(party.type, party.id, tx);
    if (found) return found;
    // two deals collected at once would both take the next free code (or open the same person twice): one at a time
    await this.repo.lockChildren(parentCode, tx);
    const opened = await this.repo.partyAccount(party.type, party.id, tx);
    if (opened) return opened;
    const parent = await this.repo.accountByCode(parentCode, tx);
    if (!parent) throw new BadRequestException(NO_ACCOUNT);
    const code = nextChildCode(parent.code, await this.repo.childCodes(parent.id, tx), party.type === "client" ? 3 : 2);
    const account = await this.repo.createAccount({ code, name: party.name, parentId: parent.id, nature: parent.nature, kind: null, partyType: party.type, partyId: party.id }, tx);
    await this.audit.record({ module: "finance", entity: "Account", entityId: account.id, action: "create", userId: me.id, after: { code, name: account.name, parent: parent.code, party: party.type } }, tx);
    return account;
  }

  /** What entries from one source already put on an account, credit − debit (5.8: the TL's commission posted for a month). */
  async creditedBy(accountId: string, source: string, sourceId: string, tx: Tx): Promise<Piasters> {
    const s = await this.repo.sourceSums(accountId, source, sourceId, tx);
    return dec(s._sum.credit) - dec(s._sum.debit);
  }

  /** The petty-cash ceilings finance set on cash accounts (M-08 3.1 «سقف العهدة»), as decimal strings. */
  async caps(): Promise<Map<string, string>> {
    return new Map((await this.repo.caps()).map((a) => [a.id, a.cap!.toFixed(2)]));
  }

  /** «سقف العهدة» on a safe (Q47: Mokhtar's own safe he pays from). Only a cash account can carry one. */
  async setCap(me: CurrentUser, accountId: string, cap: string, tx: Tx) {
    const a = await this.repo.account(accountId, tx);
    if (!a || !a.kind) throw new BadRequestException("السقف بيتحط على خزنة أو بنك");
    const before = (await this.repo.caps(tx)).find((x) => x.id === accountId)?.cap?.toFixed(2) ?? null;
    await this.repo.setCap(accountId, cap, tx);
    await this.audit.record({ module: "finance", entity: "Account", entityId: accountId, action: "update", userId: me.id, before: { cap: before }, after: { code: a.code, cap } }, tx);
  }

  /** Marks an entry with the voucher that made it (so the journal links back to its voucher). */
  linkEntry(entryId: string, sourceId: string, tx: Tx) {
    return this.repo.setEntrySource(entryId, sourceId, tx);
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
        return { entryId: l.entryId, no: entryNo(l.entry.no, l.entry.source), date: dayOf(l.entry.date), nature: l.entry.nature, memo: l.entry.memo, debit: toDecimal(dec(l.debit)), credit: toDecimal(dec(l.credit)), balance: toDecimal(running) };
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
    return { id: r.id, no: entryNo(r.no, r.source), date: dayOf(r.date), nature: r.nature, source: r.source, sourceId: r.sourceId, memo: r.memo, by: names.get(r.createdById) ?? "",
      lines, debit: toDecimal(r.lines.reduce((s, l) => s + dec(l.debit), 0)), credit: toDecimal(r.lines.reduce((s, l) => s + dec(l.credit), 0)) };
  }

  /** «الأصول ← الاصول المتداولة ← الخزينة ← خزينة رئيسية». */
  private path(a: AccountRow, accounts: AccountRow[]): string[] {
    const out: string[] = [];
    for (let x: AccountRow | undefined = a; x; x = x.parentId ? accounts.find((y) => y.id === x!.parentId) : undefined) out.unshift(x.name);
    return out;
  }
}
