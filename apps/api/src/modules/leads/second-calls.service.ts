import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { SecondCallDone, SecondCallRow } from "@places/contracts";
import { dayStart, kpiPeriodStart, localDate, secondCallExcluded, type MetricParams } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SecondCallsRepository } from "./second-calls.repository";

type Verification = { called: boolean; sent: boolean; note: string; at: string };
const doneOf = (v: Prisma.JsonValue): Verification | null =>
  v && typeof v === "object" && !Array.isArray(v) && typeof v.at === "string"
    ? { called: v.called === true, sent: v.sent === true, note: typeof v.note === "string" ? v.note : "", at: v.at } : null;

/**
 * 11.15 «مكالمات التحقق (Second Calls)» (demo leads.js / kpis.js `secondCallsFor`): Operations calls every lead that came in
 * today, except the ones a salesperson entered himself and the excluded Channels (the KPI item's «excl»), and records
 * «Second Call Done» with a required note. A lead of a past day of the quarter still not done stays on the list as late.
 * The daily KPI job (kpi-refresh `secondCalls`) reads the same `verification`.
 */
@Injectable()
export class SecondCallsService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: SecondCallsRepository,
    private readonly audit: AuditService,
  ) {}

  private async window(now: Date) {
    const date = localDate(now);
    // the calendar quarter of today (a KPI quarter opened ahead, or closed, doesn't move the window)
    const quarter = `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
    const params = (await this.repo.itemParams(quarter)) as MetricParams;
    return { today: dayStart(date), from: kpiPeriodStart("quarter", now, quarter), excluded: secondCallExcluded(params) };
  }

  async list(me: CurrentUser, now = new Date()): Promise<SecondCallRow[]> {
    const hideChannel = me.fields.hidden("leads").has("channel"); // M-09
    const w = await this.window(now);
    const rows = await this.repo.list(w.from, w.today, w.excluded);
    const names = new Map((await this.repo.employeeNames(rows.flatMap((l) => (l.assignedToId ? [l.assignedToId] : [])))).map((e) => [e.id, e.name]));
    const late = (l: (typeof rows)[number]) => l.createdAt < w.today;
    return rows.sort((a, b) => Number(late(b)) - Number(late(a))).map((l) => ({
      id: l.id, code: l.code, name: l.name, channel: hideChannel ? "" : l.channel, sales: l.assignedToId ? names.get(l.assignedToId) ?? null : null,
      createdAt: l.createdAt.toISOString(), late: late(l), done: doneOf(l.verification),
    }));
  }

  async done(me: CurrentUser, id: string, input: SecondCallDone, now = new Date()) {
    const w = await this.window(now);
    await this.db.$transaction(async (tx) => {
      await this.repo.lock(tx, id);
      const lead = await this.repo.one(tx, id, w.from, w.excluded);
      if (!lead) throw new NotFoundException("الليد ده مش في مكالمات التحقق");
      if (doneOf(lead.verification)) throw new ConflictException("الـ Second Call اتعملت خلاص");
      const verification = { called: input.called, sent: input.sent, note: input.note, byUserId: me.id, at: now.toISOString() };
      const text = `Second Call Done · ${input.called ? "السيلز كلّمه" : "السيلز مكلّموش"} · ${input.sent ? "بعتله اللي محتاجه" : "مبعتلوش"} · ${input.note}`;
      await this.repo.done(tx, id, verification, text, me.id);
      await this.audit.record({ module: "leads", entity: "Lead", entityId: id, action: "second-call", userId: me.id, before: null, after: verification }, tx);
    });
    return { ok: true };
  }
}
