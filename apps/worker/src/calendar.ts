/**
 * The one working calendar every job uses (CLAUDE.md «Time»): the work hours and days off from «قواعد الليدز».work
 * (1.29) and the official holidays («من … لحد …»), never the hard-coded PLACES_CALENDAR, so a Saturday the admin
 * turns off rests every job too.
 */
import { type LeadRules, type WorkCalendar, PLACES_CALENDAR, calendarOf, isWorkingDay, localDate } from "@places/domain";
import { leadRules, officialHolidays } from "./leads.ts";

/** `rules`: the saved «قواعد الليدز» unless given (a job that already holds them, or an e2e pinning them). */
export async function workCalendar(rules?: LeadRules): Promise<WorkCalendar> {
  const [r, holidays] = await Promise.all([rules ?? leadRules(), officialHolidays()]);
  return { ...calendarOf(r, PLACES_CALENDAR), holidays };
}

/**
 * The Cairo day of `now` when it's a working day, else null: a daily job rests on a day off (Friday, a holiday) and
 * nothing is lost, because each one sends what came due «from its day on» (billState, renewalAlert, actionAlarm…) at
 * its next run, the next working day.
 */
export async function workingDay(now: Date, rules?: LeadRules): Promise<string | null> {
  const cal = await workCalendar(rules);
  const today = localDate(now, cal);
  return isWorkingDay(today, cal) ? today : null;
}
