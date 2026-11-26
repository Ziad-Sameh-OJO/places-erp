import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { WarningSettings, type NewWarning, type TodayLine, type WarningSettingsView, type WarningView } from "@places/contracts";
import { DEFAULT_WARNING_RULES, DEFAULT_WARNING_TEMPLATE, fillWarning, localDate } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { DocumentsService, esc, layout } from "../../core/documents/documents.service";
import { FilesService } from "../../core/files/files.service";
import type { Tx } from "./hr.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const RULES = "warningRules", TEMPLATE = "warningTemplate";
type Row = { id: string; employeeId: string; month: string; reason: string; type: string; status: string; issuedAt: Date | null; byUserId: string | null; fileId: string | null };

/**
 * M-05 · warnings (HR 15 Nov). The worker's daily `warning-check` flags who reached one of HR's rules this month (a
 * «due» row, once per person · rule · month) and it shows in HR's «مهامي النهارده»; HR issues it — a PDF from HR's
 * template with the type in its blank — or dismisses it. HR can also write one by hand. HR only; everything audited.
 */
@Injectable()
export class WarningsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly docs: DocumentsService, private readonly files: FilesService) {}

  /** Everyone's warnings: HR with the whole company in scope (an «hr: edit» exception on a team account stays out). */
  hrOnly(me: CurrentUser) {
    if (me.grants.scope !== "all") throw new ForbiddenException("الإنذارات للـ HR");
  }

  async settings(): Promise<WarningSettingsView> {
    const [r, t] = await Promise.all([RULES, TEMPLATE].map((key) => this.db.setting.findUnique({ where: { key } })));
    // a setting saved by hand that no longer parses falls back to the defaults rather than breaking the screen
    const saved = WarningSettings.safeParse({ rules: r?.value ?? DEFAULT_WARNING_RULES, template: t?.value ?? DEFAULT_WARNING_TEMPLATE });
    return saved.success ? saved.data : { rules: DEFAULT_WARNING_RULES, template: DEFAULT_WARNING_TEMPLATE };
  }

  async setSettings(me: CurrentUser, s: WarningSettings, run: Run): Promise<WarningSettingsView> {
    this.hrOnly(me);
    const before = await this.settings();
    return run(async (tx) => {
      for (const [key, value] of [[RULES, s.rules], [TEMPLATE, s.template]] as const) await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
      await this.audit.record({ module: "hr", entity: "Setting", entityId: RULES, action: "update", userId: me.id, before: { ...before }, after: { ...s } }, tx);
      return s;
    });
  }

  private async view(rows: Row[]): Promise<WarningView[]> {
    const [emps, by] = await Promise.all([
      this.db.employee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, name: true } }),
      this.db.employee.findMany({ where: { userId: { in: rows.map((r) => r.byUserId ?? "") } }, select: { userId: true, name: true } }),
    ]);
    return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, name: emps.find((e) => e.id === r.employeeId)?.name ?? "", month: r.month, reason: r.reason, type: r.type,
      status: r.status as WarningView["status"], issuedAt: r.issuedAt?.toISOString() ?? null, by: by.find((e) => e.userId === r.byUserId)?.name ?? "", hasPdf: !!r.fileId }));
  }

  /** The waiting ones first, then the latest; one person's when `employeeId` is given (his file). */
  async list(me: CurrentUser, employeeId?: string): Promise<WarningView[]> {
    this.hrOnly(me);
    const rows = await this.db.warning.findMany({ where: employeeId ? { employeeId } : {}, orderBy: [{ createdAt: "desc" }], take: 300 });
    return this.view([...rows.filter((r) => r.status === "due"), ...rows.filter((r) => r.status !== "due")]);
  }

  /** A warning HR writes by hand: issued at once. */
  async create(me: CurrentUser, w: NewWarning, run: Run): Promise<WarningView> {
    this.hrOnly(me);
    const e = await this.db.employee.findUnique({ where: { id: w.employeeId }, select: { id: true } });
    if (!e) throw new NotFoundException("الموظف مش موجود");
    const row = await run(async (tx) => {
      const r = await tx.warning.create({ data: { employeeId: e.id, month: localDate(new Date()).slice(0, 7), reason: w.reason, type: w.type } });
      await this.audit.record({ module: "hr", entity: "Warning", entityId: r.id, action: "create", userId: me.id, after: { employeeId: e.id, reason: w.reason, type: w.type } }, tx);
      return r;
    });
    return this.issue(me, row.id, w.type, run);
  }

  /** HR issues a «due» warning: the PDF from the template (kept in files), then the row says who and when. */
  async issue(me: CurrentUser, id: string, type: string, run: Run): Promise<WarningView> {
    this.hrOnly(me);
    const r = await this.db.warning.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("الإنذار مش موجود");
    if (r.status !== "due") throw new BadRequestException("الإنذار ده اتقرر قبل كده");
    const e = await this.db.employee.findUniqueOrThrow({ where: { id: r.employeeId }, select: { name: true, jobTitle: true, department: true } });
    const now = new Date(), { template } = await this.settings();
    const html = layout("إنذار", `<h1>إنذار</h1>
<table><tr><th>التاريخ</th><td><span class="num">${esc(localDate(now))}</span></td></tr><tr><th>الموظف</th><td>${esc(e.name)}</td></tr><tr><th>الوظيفة</th><td>${esc(e.jobTitle)} · ${esc(e.department)}</td></tr><tr><th>السبب</th><td>${esc(r.reason)}</td></tr><tr><th>نوع الإنذار</th><td>${esc(type)}</td></tr></table>
<p>${esc(fillWarning(template, type)).replace(/\n/g, "<br>")}</p>
<table style="margin-top:36pt"><tr><th>توقيع الموظف بالاستلام</th><th>الموارد البشرية</th></tr><tr><td style="height:48pt"></td><td></td></tr></table>`);
    const file = await this.docs.save(me, `إنذار ${e.name} ${localDate(now)}.pdf`, html, { entity: "Warning", entityId: id });
    const out = await run(async (tx) => {
      const claimed = await tx.warning.updateMany({ where: { id, status: "due" }, data: { status: "issued", type, issuedAt: now, byUserId: me.id, fileId: file.id } });
      if (!claimed.count) throw new BadRequestException("الإنذار ده اتقرر قبل كده");
      await this.audit.record({ module: "hr", entity: "Warning", entityId: id, action: "issue", userId: me.id, before: { status: r.status }, after: { status: "issued", type, reason: r.reason, fileId: file.id } }, tx);
      return tx.warning.findUniqueOrThrow({ where: { id } });
    });
    return (await this.view([out]))[0]!;
  }

  async dismiss(me: CurrentUser, id: string, run: Run): Promise<WarningView> {
    this.hrOnly(me);
    const out = await run(async (tx) => {
      const r = await tx.warning.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("الإنذار مش موجود");
      if (r.status !== "due") throw new BadRequestException("الإنذار ده اتقرر قبل كده");
      // only from «due»: a dismiss racing an «issue» mustn't overwrite the warning that was just issued
      const n = await tx.warning.updateMany({ where: { id, status: "due" }, data: { status: "dismissed", byUserId: me.id } });
      if (!n.count) throw new BadRequestException("الإنذار ده اتقرر قبل كده");
      const o = await tx.warning.findUniqueOrThrow({ where: { id } });
      await this.audit.record({ module: "hr", entity: "Warning", entityId: id, action: "dismiss", userId: me.id, before: { status: r.status }, after: { status: "dismissed", reason: r.reason } }, tx);
      return o;
    });
    return (await this.view([out]))[0]!;
  }

  async pdf(me: CurrentUser, id: string) {
    this.hrOnly(me);
    const r = await this.db.warning.findUnique({ where: { id }, select: { fileId: true } });
    if (!r?.fileId) throw new NotFoundException("مفيش PDF للإنذار ده");
    return this.files.downloadUrl(r.fileId);
  }

  /** HR's «مهامي النهارده»: this month's flagged warnings waiting for a decision. */
  async todayLines(): Promise<TodayLine[]> {
    const rows = await this.db.warning.findMany({ where: { status: "due", month: localDate(new Date()).slice(0, 7) }, orderBy: { createdAt: "asc" } });
    return (await this.view(rows)).map((w) => ({ kind: "warningDue", tone: "warn", id: w.id, values: { name: w.name, reason: w.reason } }));
  }
}

