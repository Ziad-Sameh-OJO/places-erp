import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { PLACES_CALENDAR, type WorkCalendar, localDate } from "@places/domain";
import { PRISMA } from "../database/database.module";

/** The working calendar with the official holidays from settings (M-13), cached for a minute. */
@Injectable()
export class BusinessTimeService {
  private cache: { at: number; cal: WorkCalendar } | null = null;
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  async calendar(): Promise<WorkCalendar> {
    if (this.cache && Date.now() - this.cache.at < 60_000) return this.cache.cal;
    const days = await this.db.holiday.findMany({ select: { day: true } });
    const cal = { ...PLACES_CALENDAR, holidays: new Set(days.map((d) => d.day.toISOString().slice(0, 10))) };
    this.cache = { at: Date.now(), cal };
    return cal;
  }

  async isHolidayToday(now = new Date()) {
    return (await this.calendar()).holidays.has(localDate(now));
  }
}
