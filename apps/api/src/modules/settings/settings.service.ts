import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { LIST_DEFAULTS, LIST_GROUPS, LOCKED_VALUES, ListEditors, SETTINGS, type HolidayInput, type HolidayView, type ImportDone, type ListKey, type SettingKey, type Settings } from "@places/contracts";
import { LEAD_STAGES, asListValues, canChangeList, isQualifiedAfter, listActions, listChangeProblem } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { BusinessTimeService } from "../../core/business-time/business-time.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import type { ParsedSheet } from "../../core/http/import";

/** What a setting is until the admin changes it (the seed writes the client's real lists). */
const LIST_KEYS = Object.keys(LIST_DEFAULTS) as ListKey[];
const isList = (key: SettingKey): key is ListKey => (LIST_KEYS as string[]).includes(key);
const DEFAULTS: Settings = {
  ...(Object.fromEntries(LIST_KEYS.map((k) => [k, LIST_DEFAULTS[k].map((value) => ({ value, active: true }))])) as Pick<Settings, ListKey>),
  leaveTypes: [{ name: "سنوية", days: 21 }],
  whatsappDailyLimit: 250,
  notificationsFrom: "notifications@places.com",
  leadLogRoles: [], // only the admin until the admin picks more (1.25)
  listEditors: {}, // every list with «master: edit» until the admin sets it up (#186)
};

/** M-13: the lists and rules the system is built on, editable without a developer. Every change is audited. */
@Injectable()
export class SettingsService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly time: BusinessTimeService) {}

  async all(): Promise<Settings> {
    const rows = await this.db.setting.findMany({ where: { key: { in: Object.keys(SETTINGS) } } });
    // a list written before values could be switched off is read as all active (the migration converts them too)
    return { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, isList(r.key as SettingKey) ? asListValues(r.value) : r.value])) } as Settings;
  }

  /**
   * The «الإعدادات» screens' save. A list: by the roles / people set for it and for what the save does (add, or
   * switch off / back on), «master: edit» until it's set up (#186). Who those are: «access: edit». The rest: «master: edit».
   */
  async change(me: CurrentUser, key: SettingKey, value: unknown) {
    if (key === "listEditors") {
      if (!me.grants.can("access", "edit")) throw new ForbiddenException("مين يعدّل القوايم بيتحدد من الأدوار والصلاحيات");
      await this.checkNames(ListEditors.parse(value));
      return this.set(me, key, value, "access");
    }
    if (isList(key)) {
      const s = await this.all();
      const after = SETTINGS[key].parse(value);
      const who = { id: me.id, roles: me.roles, masterEdit: me.grants.can("master", "edit") };
      const acts = listActions(s[key], after);
      const allowed = acts.length ? acts.every((a) => canChangeList(s.listEditors[key], a, who))
        : canChangeList(s.listEditors[key], "add", who) || canChangeList(s.listEditors[key], "off", who);
      if (!allowed) throw new ForbiddenException(`مش مسموحلك ${acts.includes("add") && !canChangeList(s.listEditors[key], "add", who) ? "تضيف في" : "توقّف أو ترجّع قيم في"} «${listLabel(key)}»`);
      return this.set(me, key, after);
    }
    if (!me.grants.can("master", "edit")) throw new ForbiddenException("التعديل لـ Super Admin أو مدير القسم");
    return this.set(me, key, value);
  }

  /**
   * For the «مين يعدّل» picker: the roles, the people still working here, and the roles with «master: edit» (who a
   * list not set up yet belongs to, shown as its starting point).
   */
  async listEditorOptions() {
    const [roles, people] = await Promise.all([
      this.db.role.findMany({ select: { key: true, label: true, permissions: { where: { module: "master" }, select: { actions: true } } }, orderBy: { label: "asc" } }),
      this.db.employee.findMany({ where: { user: { status: { not: "DISABLED" } } }, select: { userId: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      roles: roles.map((r) => ({ key: r.key, label: r.label })),
      people: people.map((p) => ({ id: p.userId, name: p.name })),
      masterEdit: roles.filter((r) => r.permissions.some((p) => p.actions.includes("edit"))).map((r) => r.key),
    };
  }

  private async checkNames(editors: ListEditors) {
    const { roles, people } = await this.listEditorOptions();
    const known = new Set([...roles.map((r) => r.key), ...people.map((p) => p.id)]);
    if (Object.values(editors).some((e) => [...e.add, ...e.off].some((x) => !known.has(x)))) throw new BadRequestException("فيه دور أو شخص مش موجود");
  }

  /** `module`: where the change was made, for the audit log (the Logs roles are set from a lead, under «access»). */
  async set(me: CurrentUser, key: SettingKey, value: unknown, module = "master") {
    const parsed = SETTINGS[key].parse(value);
    const before = (await this.db.setting.findUnique({ where: { key } }))?.value ?? DEFAULTS[key];
    if (isList(key)) {
      // M-13 2.1: values are switched off, never removed; the ones the system posts on stay on
      const problem = listChangeProblem(asListValues(before), parsed as Settings[ListKey], LOCKED_VALUES[key]);
      if (problem) throw new BadRequestException(problem);
    }
    await this.db.$transaction(async (tx) => {
      await tx.setting.upsert({ where: { key }, create: { key, value: parsed }, update: { value: parsed } });
      await this.audit.record({ module, entity: "Setting", entityId: key, action: "update", userId: me.id, before, after: parsed }, tx);
    });
    return parsed;
  }

  /** Read-only: the stages and which ones make a lead Qualified come from the requirements (domain), not settings. */
  stages() {
    return LEAD_STAGES.map((s) => ({ stage: s, qualified: isQualifiedAfter(false, s) }));
  }

  /** The official holidays, earliest first, as «من … لحد …» (1.29). */
  async holidays(): Promise<HolidayView[]> {
    const rows = await this.db.holiday.findMany({ orderBy: [{ from: "asc" }, { to: "asc" }] });
    return rows.map((h) => ({ id: h.id, from: isoDay(h.from), to: isoDay(h.to), label: h.label }));
  }

  /** `module`: added from M-13 («master») or from «قواعد الليدز» («settings»), for the audit log. */
  async addHoliday(me: CurrentUser, h: HolidayInput, module = "master"): Promise<HolidayView> {
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.holiday.create({ data: { from: asDate(h.from), to: asDate(h.to), label: h.label } });
      await this.audit.record({ module, entity: "Holiday", entityId: created.id, action: "create", userId: me.id, after: h }, tx);
      return created;
    });
    this.time.invalidate();
    return { id: row.id, ...h };
  }

  /** All or nothing: a sheet with errors is fixed and uploaded again, so half a calendar never goes in. The same range twice keeps one row. */
  async importHolidays(me: CurrentUser, sheet: ParsedSheet<{ from: string; to?: string | undefined; label: string }>): Promise<ImportDone> {
    if (sheet.errors.length) throw new BadRequestException(`الشيت فيه ${sheet.errors.length} خطأ · صلّحهم وارفعه تاني`);
    if (!sheet.rows.length) throw new BadRequestException("الشيت مفيهوش صفوف");
    await this.db.$transaction(async (tx) => {
      for (const { data: h } of sheet.rows) {
        const range = { from: asDate(h.from), to: asDate(h.to || h.from) }; // «لحد» empty = one day
        const same = await tx.holiday.findFirst({ where: range });
        if (same) await tx.holiday.update({ where: { id: same.id }, data: { label: h.label } });
        else await tx.holiday.create({ data: { ...range, label: h.label } });
      }
      await this.audit.record({ module: "master", entity: "Holiday", entityId: "import", action: "import", userId: me.id, after: { rows: sheet.rows.length } }, tx);
    });
    this.time.invalidate();
    return { imported: sheet.rows.length };
  }

  async removeHoliday(me: CurrentUser, id: string, module = "master") {
    await this.db.$transaction(async (tx) => {
      const h = await tx.holiday.findUnique({ where: { id } });
      if (!h) throw new NotFoundException("الإجازة دي مش موجودة");
      await tx.holiday.delete({ where: { id } });
      await this.audit.record({ module, entity: "Holiday", entityId: id, action: "delete", userId: me.id, before: { from: isoDay(h.from), to: isoDay(h.to), label: h.label } }, tx);
    });
    this.time.invalidate();
  }
}

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const LIST_LABELS = new Map<string, string>(LIST_GROUPS.flatMap((g) => g.lists.map(([k, label]) => [k, label] as const)));
const listLabel = (key: ListKey): string => LIST_LABELS.get(key) ?? key;
