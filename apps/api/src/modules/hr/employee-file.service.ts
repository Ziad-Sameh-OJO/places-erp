import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@places/db";
import type { EmployeeFileDocs, EmployeeTimelineItem, NewEmployeeDocument, OneOnOneCoverage, OneOnOneRange, OneOnOneReportRow } from "@places/contracts";
import { DEFAULT_DOC_TYPES, answersSummary, lastWeekOfMonth, localDate, missingDocs, monthLabel, penaltyMonth } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { FilesService } from "../../core/files/files.service";
import { DocumentsService, esc, layout } from "../../core/documents/documents.service";
import type { Tx } from "./hr.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const TYPES = "employeeDocTypes";
const ENTITY = "EmployeeDocument";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const PENALTY_STATUS: Record<string, string> = { approved: "اتوافق عليه", pending: "مستني موافقة الـ HR", rejected: "اترفض" };
/** Every salesperson gets one 1-to-1 a month (HR, 15 Nov): the coverage counts the active people with the role «sales». */
const SALES = { user: { status: { not: "DISABLED" as const }, roles: { some: { role: { key: "sales" } } } } };

/**
 * M-05 · the employee file (HR, 15 Nov): the papers HR uploads (the required ones are the setting `employeeDocTypes`),
 * each 1-to-1's PDF sheet, the timeline (papers, 1-to-1s, penalties), and the 1-to-1 coverage and report. Only HR and
 * the admins (scope «all») see any of it: not the employee, not sales, not a Team Leader. Uploads, downloads and deletes
 * are audited.
 */
@Injectable()
export class EmployeeFileService {
  private readonly log = new Logger("employee-file");
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly files: FilesService, private readonly documents: DocumentsService) {}

  private only(me: CurrentUser) {
    if (me.grants.scope !== "all") throw new ForbiddenException("ملف الموظف للـ HR بس");
  }

  private async employee(id: string, tx: Tx | PrismaClient = this.db) {
    const e = await tx.employee.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!e) throw new NotFoundException("الموظف مش موجود");
    return e;
  }

  private async names(ids: (string | null)[]) {
    const rows = await this.db.employee.findMany({ where: { userId: { in: ids.filter((x): x is string => !!x) } }, select: { userId: true, name: true } });
    return new Map(rows.map((e) => [e.userId, e.name]));
  }

  async docTypes(): Promise<string[]> {
    const s = await this.db.setting.findUnique({ where: { key: TYPES } });
    return (s?.value as string[] | null) ?? [...DEFAULT_DOC_TYPES];
  }

  async setDocTypes(me: CurrentUser, types: string[], run: Run) {
    this.only(me);
    const unique = [...new Set(types)];
    return run(async (tx) => {
      const before = await this.docTypes();
      await tx.setting.upsert({ where: { key: TYPES }, create: { key: TYPES, value: unique }, update: { value: unique } });
      await this.audit.record({ module: "hr", entity: "Setting", entityId: TYPES, action: "update", userId: me.id, before: { types: before }, after: { types: unique } }, tx);
      return { types: unique };
    });
  }

  /** «ورق ناقص» per employee for the list. */
  async missingCounts(me: CurrentUser): Promise<Record<string, number>> {
    this.only(me);
    const [types, emps, docs] = await Promise.all([
      this.docTypes(),
      this.db.employee.findMany({ where: { user: { status: { not: "DISABLED" } } }, select: { id: true } }),
      this.db.employeeDocument.findMany({ where: { kind: "upload", docType: { not: null } }, select: { employeeId: true, docType: true } }),
    ]);
    return Object.fromEntries(emps.map((e) => [e.id, missingDocs(types, docs.filter((d) => d.employeeId === e.id).map((d) => d.docType)).length]));
  }

  async file(me: CurrentUser, employeeId: string): Promise<EmployeeFileDocs> {
    this.only(me);
    await this.employee(employeeId);
    const [types, docs, ones, penalties, approvals] = await Promise.all([
      this.docTypes(),
      this.db.employeeDocument.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" } }),
      this.db.oneOnOne.findMany({ where: { employeeId }, orderBy: { heldOn: "desc" } }),
      this.db.penalty.findMany({ where: { employeeId }, orderBy: { day: "desc" } }),
      this.db.deductionApproval.findMany({ select: { month: true, at: true } }),
    ]);
    const approvedAt = new Map(approvals.map((a) => [a.month, a.at]));
    // 7.9: a penalty approved after its month's deductions were goes with a later month's; say which
    const lands = (p: (typeof penalties)[number]) => { const m = p.status === "approved" && Number(p.deductionDays) ? penaltyMonth(iso(p.day), p.decidedAt, approvedAt) : null; return m && m !== iso(p.day).slice(0, 7) ? `بيتخصم مع خصومات ${monthLabel(m)}` : null; };
    const by = await this.names([...docs.map((d) => d.byUserId), ...ones.map((o) => o.byUserId), ...penalties.map((p) => p.byUserId)]);
    const sheet = new Map(docs.filter((d) => d.kind === "one_on_one" && d.refId).map((d) => [d.refId!, d.id]));
    const timeline: EmployeeTimelineItem[] = [
      ...docs.filter((d) => d.kind !== "one_on_one").map((d) => ({ kind: d.kind, day: iso(d.createdAt), title: d.title, sub: [d.docType, by.get(d.byUserId)].filter(Boolean).join(" · "), docId: d.fileId ? d.id : null })),
      ...ones.map((o) => ({ kind: "one_on_one", day: iso(o.heldOn), title: `1-to-1 ${monthLabel(iso(o.heldOn).slice(0, 7))}`,
        sub: [by.get(o.byUserId ?? ""), o.hrAction && `حل الـ HR: ${o.hrAction}${o.hrActionDone ? " ✓" : ""}`].filter(Boolean).join(" · "), docId: sheet.get(o.id) ?? null })),
      ...penalties.map((p) => ({ kind: "penalty", day: iso(p.day), title: p.text,
        sub: [Number(p.deductionDays) ? `خصم ${Number(p.deductionDays)} يوم` : "من غير خصم", PENALTY_STATUS[p.status] ?? p.status, lands(p)].filter(Boolean).join(" · "), docId: null })),
    ].sort((a, b) => b.day.localeCompare(a.day));
    const uploaded = docs.filter((d) => d.kind === "upload");
    return {
      required: types.map((type) => ({ type, docId: uploaded.find((d) => d.docType === type)?.id ?? null })),
      missing: missingDocs(types, uploaded.map((d) => d.docType)).length,
      documents: docs.map((d) => ({ id: d.id, kind: d.kind, title: d.title, docType: d.docType, month: d.month, hasFile: !!d.fileId, by: by.get(d.byUserId) ?? "", at: d.createdAt.toISOString() })),
      timeline,
    };
  }

  async upload(me: CurrentUser, employeeId: string, p: NewEmployeeDocument, run: Run) {
    this.only(me);
    return run(async (tx) => {
      const e = await this.employee(employeeId, tx);
      const d = await tx.employeeDocument.create({ data: { employeeId, kind: "upload", title: p.title, docType: p.docType || null, fileId: p.fileId, byUserId: me.id } });
      await this.files.attach(me, [p.fileId], ENTITY, d.id, tx);
      await this.audit.record({ module: "hr", entity: ENTITY, entityId: d.id, action: "create", userId: me.id, after: { employee: e.name, title: p.title, docType: p.docType ?? null } }, tx);
      return { id: d.id };
    });
  }

  async downloadUrl(me: CurrentUser, id: string) {
    this.only(me);
    const d = await this.db.employeeDocument.findUnique({ where: { id } });
    if (!d?.fileId) throw new NotFoundException("الملف مش موجود");
    const link = await this.files.downloadUrl(d.fileId);
    await this.audit.record({ module: "hr", entity: ENTITY, entityId: id, action: "download", userId: me.id, after: { title: d.title } });
    return link;
  }

  /** Only an uploaded paper: a 1-to-1's sheet stays as long as its 1-to-1. */
  async remove(me: CurrentUser, id: string, run: Run) {
    this.only(me);
    const cleanup = await run(async (tx) => {
      const d = await tx.employeeDocument.findUnique({ where: { id } });
      if (!d) throw new NotFoundException("الملف مش موجود");
      if (d.kind !== "upload") throw new BadRequestException("الورقة دي بتتعمل من النظام ومينفعش تتمسح");
      const gone = d.fileId ? await this.files.remove(d.fileId, ENTITY, id, tx) : null;
      await tx.employeeDocument.delete({ where: { id } });
      await this.audit.record({ module: "hr", entity: ENTITY, entityId: id, action: "delete", userId: me.id, before: { employeeId: d.employeeId, title: d.title, docType: d.docType } }, tx);
      return gone;
    });
    await cleanup?.();
    return { id };
  }

  /**
   * Each saved 1-to-1 → a PDF sheet in the file («1-to-1 نوفمبر 2026»): the date, the questions and answers, «حل الـ HR»
   * and its date. Best effort: the 1-to-1 is saved even when printing fails (Chromium or storage down) — it's logged.
   */
  async oneOnOneSheet(me: CurrentUser, oneOnOneId: string) {
    try {
      const o = await this.db.oneOnOne.findUniqueOrThrow({ where: { id: oneOnOneId }, include: { employee: { select: { name: true } } } });
      const day = iso(o.heldOn), month = day.slice(0, 7), title = `1-to-1 ${monthLabel(month)}`;
      const heldBy = (await this.names([o.byUserId])).get(o.byUserId ?? "") ?? "";
      const answers = Object.entries(o.answers as Record<string, string>);
      const html = layout(title, `<h1>${esc(title)} · ${esc(o.employee.name)}</h1>
<table><tr><th>التاريخ</th><td><span class="num">${esc(day)}</span></td><th>اللي عمله</th><td>${esc(heldBy)}</td></tr></table>
<h2>الأسئلة والإجابات</h2>
<table>${answers.map(([q, a]) => `<tr><th style="width:40%">${esc(q)}</th><td>${esc(a || "—")}</td></tr>`).join("")}</table>
<h2>حل الـ HR</h2>
<table><tr><th>الحل</th><td>${esc(o.hrAction ?? "—")}</td><th>ميعاده</th><td><span class="num">${esc(o.hrActionDue ? iso(o.hrActionDue) : "—")}</span></td></tr></table>`);
      const id = randomUUID();
      const file = await this.files.store(me, { name: `${title} - ${o.employee.name}.pdf`, mime: "application/pdf", body: await this.documents.pdf(html), entity: ENTITY, entityId: id });
      await this.db.$transaction(async (tx) => {
        await tx.employeeDocument.create({ data: { id, employeeId: o.employeeId, kind: "one_on_one", title, fileId: file.id, month, refId: o.id, byUserId: me.id } });
        await this.audit.record({ module: "hr", entity: ENTITY, entityId: id, action: "create", userId: me.id, after: { employee: o.employee.name, title, oneOnOne: o.id } }, tx);
      });
    } catch (e) {
      this.log.warn(`1-to-1 ${oneOnOneId}: no PDF sheet (${(e as Error).message})`);
    }
  }

  /** Every salesperson this month: done (its date) or not yet. */
  async coverage(me: CurrentUser, month = localDate(new Date()).slice(0, 7)): Promise<OneOnOneCoverage> {
    this.only(me);
    const from = new Date(`${month}-01T00:00:00Z`), to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const emps = await this.db.employee.findMany({ where: SALES, select: { id: true, name: true, oneOnOnes: { where: { heldOn: { gte: from, lt: to } }, orderBy: { heldOn: "desc" }, take: 1, select: { heldOn: true } } }, orderBy: { name: "asc" } });
    return { month, items: emps.map((e) => ({ employeeId: e.id, name: e.name, heldOn: e.oneOnOnes[0] ? iso(e.oneOnOnes[0].heldOn) : null })) };
  }

  /** HR's «مهامي النهارده» in the month's last week: the salespeople still without a 1-to-1. */
  async left(me: CurrentUser): Promise<string[]> {
    const today = localDate(new Date());
    if (!lastWeekOfMonth(today)) return [];
    return (await this.coverage(me, today.slice(0, 7))).items.filter((i) => !i.heldOn).map((i) => i.name);
  }

  async report(me: CurrentUser, r: OneOnOneRange): Promise<OneOnOneReportRow[]> {
    this.only(me);
    const rows = await this.db.oneOnOne.findMany({ where: { heldOn: { gte: new Date(`${r.from}T00:00:00Z`), lte: new Date(`${r.to}T00:00:00Z`) } }, include: { employee: { select: { name: true } } }, orderBy: [{ heldOn: "desc" }, { createdAt: "desc" }] });
    const by = await this.names(rows.map((o) => o.byUserId));
    return rows.map((o) => ({ id: o.id, employeeId: o.employeeId, name: o.employee.name, heldOn: iso(o.heldOn), by: by.get(o.byUserId ?? "") ?? "", summary: answersSummary(o.answers as Record<string, string>),
      hrAction: o.hrAction, hrActionDue: o.hrActionDue ? iso(o.hrActionDue) : null, hrActionDone: o.hrActionDone }));
  }
}
