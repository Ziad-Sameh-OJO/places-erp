import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { InsuranceFilters, InsuranceRow, InsuranceSave, InsuranceView } from "@places/contracts";
import { formatEGP, fromDecimal, insuranceDue, toDecimal, type Piasters } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { FilesService } from "../../core/files/files.service";
import { HrService } from "./hr.service";
import type { Tx } from "./hr.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
type Db = Prisma.EmployeeInsuranceGetPayload<object>;
const ENTITY = "EmployeeInsurance";
const dec = (v: { toFixed(n: number): string } | null | undefined): Piasters => (v ? fromDecimal(v.toFixed(2)) : 0);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** What the audit trail keeps of a row: the values HR sees, the file count. */
const snap = (r: Db) => ({ insured: r.insured, since: day(r.since), provider: r.provider, monthly: toDecimal(dec(r.monthly)), companyShare: r.companyShare ? toDecimal(dec(r.companyShare)) : null, note: r.note, files: r.files.length });

/**
 * M-05 · «التأمينات» (HR, 15 Nov): HR records each employee's insurance (hr: edit, audited), Finance hears of every
 * change and sees the list read-only (finance: view), and payroll deducts the monthly amount (9.14 · monthly()).
 */
@Injectable()
export class InsuranceService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly hr: HrService, private readonly audit: AuditService,
    private readonly notifications: NotificationsService, private readonly files: FilesService) {}

  /** Everyone active in `where`, with their insurance (or none recorded yet). */
  private async rows(where: Prisma.EmployeeWhereInput, f: InsuranceFilters): Promise<InsuranceView> {
    const people = await this.db.employee.findMany({ where: { AND: [where, { user: { status: "ACTIVE" } }] }, select: { userId: true, name: true, department: true, jobTitle: true }, orderBy: { name: "asc" } });
    const ins = await this.db.employeeInsurance.findMany({ where: { userId: { in: people.map((p) => p.userId) } } });
    const names = await this.files.names(ins.flatMap((i) => i.files));
    const items: InsuranceRow[] = people.map((p) => {
      const i = ins.find((x) => x.userId === p.userId);
      return { ...p, insured: !!i?.insured, recorded: !!i, since: day(i?.since ?? null), provider: i?.provider ?? "", monthly: toDecimal(dec(i?.monthly)),
        companyShare: i?.companyShare ? toDecimal(dec(i.companyShare)) : null, note: i?.note ?? null,
        files: (i?.files ?? []).map((id) => ({ id, name: names.find((n) => n.id === id)?.name ?? "" })), updatedAt: i ? i.updatedAt.toISOString() : null };
    }).filter((r) => !f.insured || r.insured === (f.insured === "yes"));
    const on = items.filter((r) => r.insured);
    return { items, totals: { insured: on.length, monthly: toDecimal(on.reduce((s, r) => s + fromDecimal(r.monthly), 0)), companyShare: toDecimal(on.reduce((s, r) => s + fromDecimal(r.companyShare ?? "0"), 0)) } };
  }

  list(me: CurrentUser, f: InsuranceFilters) {
    return this.rows(this.hr.scope(me), f);
  }

  /** Finance's read-only view: the insured people, company-wide (payroll covers everyone). */
  async forFinance(): Promise<InsuranceView> {
    const v = await this.rows({}, { insured: "yes" });
    return { ...v, items: v.items.map((r) => ({ ...r, files: [], note: null })) };
  }

  private async employee(me: CurrentUser, userId: string) {
    const e = await this.db.employee.findFirst({ where: { AND: [{ userId }, this.hr.scope(me)] }, select: { name: true } });
    if (!e) throw new NotFoundException("الموظف مش موجود");
    return e;
  }

  async save(me: CurrentUser, userId: string, input: InsuranceSave, run: Run): Promise<InsuranceRow> {
    const e = await this.employee(me, userId);
    const { before } = await run(async (tx) => {
      const before = await tx.employeeInsurance.findUnique({ where: { userId } });
      const added = input.files.filter((id) => !before?.files.includes(id));
      const data = { insured: input.insured, since: input.since ? new Date(`${input.since}T00:00:00Z`) : null, provider: input.provider, monthly: input.monthly,
        companyShare: input.companyShare, note: input.note || null, files: [...(before?.files ?? []), ...new Set(added)], updatedById: me.id };
      const row = await tx.employeeInsurance.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      await this.files.attach(me, added, ENTITY, row.id, tx);
      await this.audit.record({ module: "hr", entity: ENTITY, entityId: row.id, action: before ? "update" : "create", userId: me.id, before: before ? snap(before) : null, after: { name: e.name, ...snap(row) } }, tx);
      return { before };
    });
    // Finance hears of every insurance added or changed, and of one stopped (HR, 15 Nov)
    const amount = formatEGP(fromDecimal(input.monthly));
    const text = input.insured ? (before?.insured ? `اتعدّل تأمين ${e.name}: ${amount} في الشهر` : `اتضاف تأمين لـ ${e.name}: ${amount} في الشهر`) : before?.insured ? `اتوقف تأمين ${e.name}` : null;
    if (text) await this.notifications.notify({ event: "hr.insurance", link: "/finance?tab=payroll", text });
    return (await this.rows({ userId }, {})).items[0]!;
  }

  async removeFile(me: CurrentUser, userId: string, fileId: string, run: Run) {
    await this.employee(me, userId);
    const cleanup = await run(async (tx) => {
      const row = await tx.employeeInsurance.findUnique({ where: { userId } });
      if (!row?.files.includes(fileId)) throw new NotFoundException("الملف مش موجود");
      const done = await this.files.remove(fileId, ENTITY, row.id, tx);
      await tx.employeeInsurance.update({ where: { id: row.id }, data: { files: row.files.filter((f) => f !== fileId), updatedById: me.id } });
      await this.audit.record({ module: "hr", entity: ENTITY, entityId: row.id, action: "update", userId: me.id, before: { files: row.files.length }, after: { files: row.files.length - 1, removed: fileId } }, tx);
      return done;
    });
    await cleanup();
  }

  async fileUrl(me: CurrentUser, userId: string, fileId: string) {
    await this.employee(me, userId);
    const row = await this.db.employeeInsurance.findUnique({ where: { userId }, select: { files: true } });
    if (!row?.files.includes(fileId)) throw new NotFoundException("الملف مش موجود");
    return this.files.downloadUrl(fileId);
  }

  /** Payroll (9.14): each insured person's deduction for `month`. */
  async monthly(month: string, tx: Tx | PrismaClient = this.db): Promise<Map<string, Piasters>> {
    const rows = await tx.employeeInsurance.findMany({ where: { insured: true }, select: { userId: true, insured: true, since: true, monthly: true } });
    return new Map(rows.map((r) => [r.userId, insuranceDue({ insured: r.insured, since: day(r.since), monthly: dec(r.monthly) }, month)]));
  }
}
