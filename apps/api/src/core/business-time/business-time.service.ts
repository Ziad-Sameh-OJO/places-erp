import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import { DEFAULT_LEAD_RULES, PLACES_CALENDAR, type LeadRules, type WorkCalendar, calendarOf, holidayDays, localDate } from "@places/domain";
import { PRISMA } from "../database/database.module";

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The working calendar: the hours and weekdays off from «قواعد الليدز» (1.29) and the official holidays as ranges
 * «من … لحد …» (M-13). Cached for a minute; invalidated when either changes so the SLA clock sees it at once.
 */
@Injectable()
export class BusinessTimeService {
  private cache: { at: number; cal: WorkCalendar } | null = null;
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async calendar(): Promise<WorkCalendar> {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.cal;
    const [ranges, rules] = await Promise.all([
      this.db.holiday.findMany({ select: { from: true, to: true } }),
      this.db.setting.findUnique({ where: { key: "leadRules" } }),
    ]);
    const work = (rules?.value as LeadRules | null)?.work ?? DEFAULT_LEAD_RULES.work;
    const cal = { ...calendarOf({ ...DEFAULT_LEAD_RULES, work }, PLACES_CALENDAR), holidays: holidayDays(ranges.map((r) => ({ from: day(r.from), to: day(r.to) }))) };
    this.cache = { at: Date.now(), cal };
    return cal;
  }

  /** Called when the holidays or the working hours change, so the SLA clock sees them at once. */
  invalidate() {
    this.cache = null;
  }

  async isHolidayToday(now = new Date()) {
    return (await this.calendar()).holidays.has(localDate(now));
  }
}
