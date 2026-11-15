import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { FunDayInput, FunDayPlan, FunDayView } from "@places/contracts";
import { FUN_DAYS_ON_HOME, FUN_DAY_STARTERS, funDayText, localDate, starterDate } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { FilesService } from "../../core/files/files.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { SettingsService } from "../settings/settings.service";
import { FunDaysRepository, forDepartment } from "./fun-days.repository";

const ENTITY = "CompanyEvent";
const LINK = "/events";
type Row = Awaited<ReturnType<FunDaysRepository["events"]>>[number];

const day = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const yearRange = (y: number) => ({ gte: asDate(`${y}-01-01`), lt: asDate(`${y + 1}-01-01`) });

/**
 * M-05 · «الترفيه والاحتفالات» (HR, 15 Nov): HR plans the year's fun days (create / edit / cancel, audited); everyone
 * sees the ones that are for them and is told when one is published. The reminders are the worker's (fun-day-reminders).
 */
@Injectable()
export class FunDaysService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: FunDaysRepository,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
  ) {}

  /** Everyone: the year's events that are for them (not cancelled). */
  async mine(me: CurrentUser, year = this.thisYear()): Promise<FunDayView[]> {
    return this.views(await this.repo.events({ AND: [forDepartment(me.department), { cancelledAt: null, date: yearRange(year) }] }));
  }

  /** «جاي قريب» on the home page: the next few from today. */
  async upcoming(me: CurrentUser): Promise<FunDayView[]> {
    const today = asDate(localDate(new Date()));
    return this.views(await this.repo.events({ AND: [forDepartment(me.department), { cancelledAt: null, date: { gte: today } }] }, FUN_DAYS_ON_HOME));
  }

  /** HR's plan: every event of the year, the starters, the official holidays and the departments. */
  async plan(year = this.thisYear()): Promise<FunDayPlan> {
    const [rows, holidays, deps] = await Promise.all([this.repo.events({ date: yearRange(year) }), this.settings.holidays(), this.repo.departments()]);
    const ofYear = holidays.filter((h) => h.from.startsWith(`${year}-`) || h.to.startsWith(`${year}-`));
    return {
      year,
      events: await this.views(rows),
      starters: FUN_DAY_STARTERS.map((s) => ({ key: s.key, title: s.title, date: starterDate(s, year, ofYear) })),
      holidays: ofYear.map((h) => ({ from: h.from, to: h.to, label: h.label })),
      departments: deps.map((d) => d.department),
    };
  }

  async create(me: CurrentUser, input: FunDayInput): Promise<FunDayView> {
    if (input.imageFileId) await this.mustBeImage(input.imageFileId);
    const row = await this.db.$transaction(async (tx) => {
      const e = await tx.companyEvent.create({ data: { ...this.fields(input), createdById: me.id } });
      if (input.imageFileId) await this.files.attach(me, [input.imageFileId], ENTITY, e.id, tx);
      await this.audit.record({ module: "hr", entity: ENTITY, entityId: e.id, action: "create", userId: me.id, after: input }, tx);
      return e;
    });
    await this.announce(me, row);
    return (await this.views([row]))[0]!;
  }

  /** A new date tells everyone again and its reminders start over; other changes are quiet. */
  async update(me: CurrentUser, id: string, input: FunDayInput): Promise<FunDayView> {
    const { row, moved } = await this.db.$transaction(async (tx) => {
      const before = await tx.companyEvent.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("الاحتفال ده مش موجود");
      if (before.cancelledAt) throw new BadRequestException("الاحتفال ده اتلغى");
      const moved = day(before.date) !== input.date;
      if (input.imageFileId && input.imageFileId !== before.imageFileId) await this.mustBeImage(input.imageFileId);
      if (input.imageFileId && input.imageFileId !== before.imageFileId) await this.files.attach(me, [input.imageFileId], ENTITY, id, tx);
      const row = await tx.companyEvent.update({ where: { id }, data: { ...this.fields(input), ...(moved ? { notifiedAt: new Date(), dayBeforeSentAt: null, morningSentAt: null } : {}) } });
      await this.audit.record({ module: "hr", entity: ENTITY, entityId: id, action: "update", userId: me.id, before: this.plain(before), after: input }, tx);
      return { row, moved };
    });
    if (moved) await this.announce(me, row);
    return (await this.views([row]))[0]!;
  }

  async cancel(me: CurrentUser, id: string) {
    await this.db.$transaction(async (tx) => {
      const e = await tx.companyEvent.findUnique({ where: { id } });
      if (!e) throw new NotFoundException("الاحتفال ده مش موجود");
      if (e.cancelledAt) return;
      await tx.companyEvent.update({ where: { id }, data: { cancelledAt: new Date() } });
      await this.audit.record({ module: "hr", entity: ENTITY, entityId: id, action: "cancel", userId: me.id, before: this.plain(e) }, tx);
    });
  }

  /** «يوم <التاريخ>: <العنوان>» to everyone it's for, but the one who published it. */
  private async announce(me: CurrentUser, e: Row) {
    const to = (await this.repo.invited(e.departments)).map((u) => u.id).filter((id) => id !== me.id);
    if (to.length) await this.notifications.notify({ event: "hr.fun_day", text: funDayText({ ...e, date: day(e.date) }), link: `${LINK}?open=${e.id}`, userIds: to });
  }

  private async mustBeImage(fileId: string) {
    const [f] = await this.files.names([fileId]);
    if (!f?.mime.startsWith("image/")) throw new BadRequestException("الصورة لازم تكون صورة (JPG / PNG)");
  }

  private fields(i: FunDayInput) {
    return { title: i.title, date: asDate(i.date), time: i.time ?? null, place: i.place || null, description: i.description, imageFileId: i.imageFileId ?? null, departments: [...new Set(i.departments)] };
  }

  private plain(e: Row) {
    return { title: e.title, date: day(e.date), time: e.time, place: e.place, description: e.description, imageFileId: e.imageFileId, departments: e.departments };
  }

  private thisYear() {
    return Number(localDate(new Date()).slice(0, 4));
  }

  private views(rows: Row[]): Promise<FunDayView[]> {
    return Promise.all(rows.map(async (e) => ({
      id: e.id, title: e.title, date: day(e.date), time: e.time, place: e.place, description: e.description, departments: e.departments,
      imageFileId: e.imageFileId, cancelled: !!e.cancelledAt,
      image: e.imageFileId ? await this.files.downloadUrl(e.imageFileId).then((l) => l.url, () => null) : null,
    })));
  }
}
