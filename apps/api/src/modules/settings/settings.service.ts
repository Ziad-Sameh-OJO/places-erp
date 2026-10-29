import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { SETTINGS, type HolidayInput, type ImportDone, type SettingKey, type Settings } from "@places/contracts";
import { DEFAULT_SLA, LEAD_STAGES, isQualifiedAfter } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import type { ParsedSheet } from "../../core/http/import";

/** What a setting is until the admin changes it (the seed writes the client's real lists). */
const DEFAULTS: Settings = {
  areas: [], channels: [], companyCategories: [], vendors: [],
  leaveTypes: [{ name: "سنوية", days: 21 }],
  whatsappDailyLimit: 250,
  notificationsFrom: "notifications@places.com",
  slaRules: { ...DEFAULT_SLA },
};

/** M-13: the lists and rules the system is built on, editable without a developer. Every change is audited. */
@Injectable()
export class SettingsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly time: BusinessTimeService) {}

  async all(): Promise<Settings> {
    const rows = await this.db.setting.findMany({ where: { key: { in: Object.keys(SETTINGS) } } });
    return { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Settings;
  }

  async set(me: CurrentUser, key: SettingKey, value: unknown) {
    const parsed = SETTINGS[key].parse(value);
    const before = (await this.db.setting.findUnique({ where: { key } }))?.value ?? DEFAULTS[key];
    await this.db.$transaction(async (tx) => {
      await tx.setting.upsert({ where: { key }, create: { key, value: parsed }, update: { value: parsed } });
      await this.audit.record({ module: "master", entity: "Setting", entityId: key, action: "update", userId: me.id, before, after: parsed }, tx);
    });
    return parsed;
  }

  /** Read-only: the stages and which ones make a lead Qualified come from the requirements (domain), not settings. */
  stages() {
    return LEAD_STAGES.map((s) => ({ stage: s, qualified: isQualifiedAfter(false, s) }));
  }

  holidays() {
    return this.db.holiday.findMany({ orderBy: { day: "asc" } });
  }

  async addHoliday(me: CurrentUser, h: HolidayInput) {
    const day = new Date(`${h.day}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) throw new BadRequestException("تاريخ غلط");
    await this.db.$transaction(async (tx) => {
      await tx.holiday.upsert({ where: { day }, create: { day, label: h.label }, update: { label: h.label } });
      await this.audit.record({ module: "master", entity: "Holiday", entityId: h.day, action: "create", userId: me.id, after: h }, tx);
    });
    this.time.invalidate();
  }

  /** All or nothing: a sheet with errors is fixed and uploaded again, so half a calendar never goes in. */
  async importHolidays(me: CurrentUser, sheet: ParsedSheet<HolidayInput>): Promise<ImportDone> {
    if (sheet.errors.length) throw new BadRequestException(`الشيت فيه ${sheet.errors.length} خطأ · صلّحهم وارفعه تاني`);
    if (!sheet.rows.length) throw new BadRequestException("الشيت مفيهوش صفوف");
    await this.db.$transaction(async (tx) => {
      for (const { data: h } of sheet.rows) {
        const day = new Date(`${h.day}T00:00:00Z`);
        await tx.holiday.upsert({ where: { day }, create: { day, label: h.label }, update: { label: h.label } });
      }
      await this.audit.record({ module: "master", entity: "Holiday", entityId: "import", action: "import", userId: me.id, after: { rows: sheet.rows.length } }, tx);
    });
    this.time.invalidate();
    return { imported: sheet.rows.length };
  }

  async removeHoliday(me: CurrentUser, day: string) {
    await this.db.$transaction(async (tx) => {
      await tx.holiday.deleteMany({ where: { day: new Date(`${day}T00:00:00Z`) } });
      await this.audit.record({ module: "master", entity: "Holiday", entityId: day, action: "delete", userId: me.id }, tx);
    });
    this.time.invalidate();
  }
}
