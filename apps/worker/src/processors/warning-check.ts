/**
 * M-05 · warnings (HR 15 Nov): every working day, who reached one of HR's rules (`warningRules`) this Cairo month gets a
 * «due» warning — a line in HR's «مهامي النهارده». Idempotent: one row per person · rule · month (unique), so a second
 * run (or a retry) adds nothing, and a warning HR issued or dismissed isn't flagged again that month.
 */
import { prisma } from "@places/db";
import { warningHits, warningRulesOf, type MonthCounts } from "@places/domain";
import { workingDay } from "../calendar.ts";

/** Returns how many new warnings it flagged. */
export async function warningCheckTick(now = new Date()): Promise<number> {
  const today = await workingDay(now);
  if (!today) return 0;
  const rules = warningRulesOf((await prisma.setting.findUnique({ where: { key: "warningRules" } }))?.value);
  if (!rules.some((r) => r.min > 0)) return 0;
  const month = today.slice(0, 7);
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  const day = { gte: new Date(`${month}-01T00:00:00Z`), lt: next }; // the days are calendar dates (@db.Date)
  const [people, excuses, absences, late, penalties] = await Promise.all([
    prisma.employee.findMany({ where: { user: { status: "ACTIVE" } }, select: { id: true } }),
    prisma.excuseRequest.groupBy({ by: ["employeeId"], where: { day, status: { not: "rejected" } }, _count: { _all: true } }),
    prisma.attendanceDay.groupBy({ by: ["employeeId"], where: { day, kind: "ABSENT" }, _count: { _all: true } }),
    prisma.attendanceDay.groupBy({ by: ["employeeId"], where: { day, lateMinutes: { gt: 0 }, deduction: { gt: 0 } }, _count: { _all: true } }),
    prisma.penalty.groupBy({ by: ["employeeId"], where: { day, status: "approved" }, _count: { _all: true } }),
  ]);
  const count = (rows: { employeeId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.employeeId, r._count._all]));
  const c = { excuses: count(excuses), absences: count(absences), lateDeductions: count(late), penalties: count(penalties) };
  const data = people.flatMap((p) => {
    const counts: MonthCounts = { excuses: c.excuses.get(p.id) ?? 0, absences: c.absences.get(p.id) ?? 0, lateDeductions: c.lateDeductions.get(p.id) ?? 0, penalties: c.penalties.get(p.id) ?? 0 };
    return warningHits(rules, counts).map((h) => ({ employeeId: p.id, month, rule: h.rule.id, reason: h.reason, type: h.rule.type }));
  });
  return data.length ? (await prisma.warning.createMany({ data, skipDuplicates: true })).count : 0;
}
