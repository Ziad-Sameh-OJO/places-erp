import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { RotationView } from "@places/contracts";
import { dayRotation, localDate } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { AttendanceService } from "../hr/attendance.service";
import { LeavesService } from "../hr/leaves.service";
import { LeadsRepository } from "./leads.repository";

type Db = PrismaClient | Prisma.TransactionClient;
/** The day's order by hand lives in its own Setting, so tomorrow starts automatic again by itself. */
const key = (day: string) => `rotationOrder:${day}`;

/**
 * 1.23 · «ترتيب الروتيشن النهارده»: automatic by who started first (the fingerprint, or the Visit time — 7.3), nobody yet
 * last, on approved leave out (1.15). Whoever may edit the routing settings reorders it for today only, or puts it back
 * to automatic; audited. LeadRouter (1.13) takes each area's pool in this order.
 */
@Injectable()
export class RotationService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly audit: AuditService,
    private readonly attendance: AttendanceService,
    private readonly leaves: LeavesService,
  ) {}

  private async manual(day: string, tx: Db = this.db) {
    return ((await tx.setting.findUnique({ where: { key: key(day) } }))?.value ?? null) as string[] | null;
  }

  /** These people in today's order. */
  async order(ids: string[], tx: Db = this.db): Promise<string[]> {
    if (ids.length < 2) return ids;
    const day = localDate(new Date());
    const [starts, manual] = await Promise.all([this.attendance.dayStarts(ids, day, tx), this.manual(day, tx)]);
    return dayRotation(ids, new Map([...starts].flatMap(([id, s]) => (s.start ? [[id, s.start] as const] : []))), manual);
  }

  async view(): Promise<RotationView> {
    const day = localDate(new Date());
    const [people, onLeave, manual] = await Promise.all([this.repo.routingPeople(), this.leaves.employeesOnLeave(day), this.manual(day)]);
    const working = people.filter((p) => !onLeave.has(p.id));
    const starts = await this.attendance.dayStarts(working.map((p) => p.id), day);
    const order = dayRotation(working.map((p) => p.id), new Map([...starts].flatMap(([id, s]) => (s.start ? [[id, s.start] as const] : []))), manual);
    const byId = new Map(working.map((p) => [p.id, p.name]));
    return { day, manual: !!manual, people: order.map((id) => ({ id, name: byId.get(id) ?? "", start: starts.get(id)?.start ?? null, visit: starts.get(id)?.visit ?? null })) };
  }

  /** The arrows: today's order by hand. */
  async set(me: CurrentUser, ids: string[]): Promise<RotationView> {
    const day = localDate(new Date());
    const names = new Map((await this.repo.routingPeople()).map((p) => [p.id, p.name]));
    if (new Set(ids).size !== ids.length || ids.some((id) => !names.has(id))) throw new BadRequestException("الترتيب فيه حد مش من السيلز");
    await this.db.$transaction(async (tx) => {
      const before = await this.manual(day, tx);
      await tx.setting.upsert({ where: { key: key(day) }, create: { key: key(day), value: ids }, update: { value: ids } });
      await this.audit.record({ module: "settings", entity: "RotationOrder", entityId: day, action: "update", userId: me.id, before: { ids: before }, after: { ids, names: ids.map((id) => names.get(id)) } }, tx);
    });
    return this.view();
  }

  /** «رجّعه أوتوماتيك بالبصمة». */
  async reset(me: CurrentUser): Promise<RotationView> {
    const day = localDate(new Date());
    await this.db.$transaction(async (tx) => {
      const before = await this.manual(day, tx);
      if (!before) return;
      await tx.setting.delete({ where: { key: key(day) } });
      await this.audit.record({ module: "settings", entity: "RotationOrder", entityId: day, action: "reset", userId: me.id, before: { ids: before }, after: { ids: null } }, tx);
    });
    return this.view();
  }
}
