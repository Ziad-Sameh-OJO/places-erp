/**
 * Seed: the real organisation from the client's files — the 18 roles and their permission matrix, the 36 people
 * (KPI file + the 4 Team Leaders and their 18 salespeople, teams A–D), and the M-13 lists (areas, channels…).
 * Safe to run again: everything is an upsert, and settings the admin already changed are left alone.
 *
 * Accounts are created INVITED (no password) and get an activation email. Only in development, when
 * SEED_DEV_PASSWORD is set in .env, they are created ACTIVE with that password so the team can sign in locally.
 */
import { readFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import { prisma } from "../src/index.ts";

interface SeedRole { key: string; label: string; tier: string; scope: "own" | "team" | "dept" | "all"; permissions: Record<string, string[]> }
interface SeedPerson { ref: string; name: string; email: string; department: string; roles: string[]; teamLeader?: string; manager?: string; team?: string }

const load = <T>(file: string): T => JSON.parse(readFileSync(new URL(`./seed-data/${file}`, import.meta.url), "utf8"));

async function main() {
  const roles = load<SeedRole[]>("roles.json");
  const people = load<SeedPerson[]>("people.json");
  const devPassword = process.env.NODE_ENV !== "production" ? process.env.SEED_DEV_PASSWORD : undefined;
  const passwordHash = devPassword ? await hash(devPassword, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }) : null;

  const roleIds = new Map<string, string>();
  for (const r of roles) {
    const data = { label: r.label, tier: r.tier, scope: r.scope.toUpperCase() as "OWN" | "TEAM" | "DEPT" | "ALL", builtIn: true };
    const existing = await prisma.role.findUnique({ where: { key: r.key } });
    // a role that already exists keeps whatever the admin changed in its matrix
    const role = existing ?? (await prisma.role.create({ data: { key: r.key, ...data,
      permissions: { create: Object.entries(r.permissions).map(([module, actions]) => ({ module, actions })) } } }));
    roleIds.set(r.key, role.id);
  }

  const employeeIds = new Map<string, string>();
  for (const p of people) {
    const account = passwordHash ? { status: "ACTIVE" as const, passwordHash } : {};
    const known = await prisma.user.findUnique({ where: { email: p.email } });
    const user = known
      ? await prisma.user.update({ where: { id: known.id }, data: account })
      : await prisma.user.create({ data: { email: p.email, ...account, roles: { create: p.roles.map((key, i) => ({ roleId: roleIds.get(key)!, primary: i === 0 })) } } });
    const jobTitle = roles.find((r) => r.key === p.roles[0])?.label ?? p.roles[0]!;
    // salary, target and commission are entered by HR / management in the app, not seeded
    const emp = await prisma.employee.upsert({
      where: { userId: user.id },
      create: { userId: user.id, name: p.name, jobTitle, department: p.department, salary: 0, team: p.team ?? null },
      update: {},
    });
    employeeIds.set(p.ref, emp.id);
  }
  // second pass, the org structure (M-09 7.2, KPI file): a salesperson's TL, and everyone's direct manager —
  // `manager` in people.json, or the TL for salespeople. Only empty fields are filled: changes made in the app stay.
  const ref = (r: string) => employeeIds.get(r) ?? (() => { throw new Error(`people.json: unknown ref ${r}`); })();
  for (const p of people) {
    const id = ref(p.ref);
    if (p.teamLeader) await prisma.employee.updateMany({ where: { id, teamLeaderId: null }, data: { teamLeaderId: ref(p.teamLeader) } });
    const boss = p.manager ?? p.teamLeader;
    if (boss) await prisma.employee.updateMany({ where: { id, managerId: null }, data: { managerId: ref(boss) } });
  }
  const settings = load<Record<string, unknown>>("settings.json");
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: value as object }, update: {} });
  }
  console.log(`seed: ${Object.keys(settings).length} settings · ${roles.length} roles · ${people.length} people · ${passwordHash ? "ACTIVE with the dev password" : "INVITED"}`);
}

main().finally(() => prisma.$disconnect());
