/**
 * Seed: the real organisation from the client's files — the 18 roles and their permission matrix, the 36 people
 * (KPI file + the 4 Team Leaders and their 18 salespeople, teams A–D). Safe to run again: everything is an upsert.
 *
 * Accounts are created INVITED (no password) and get an activation email. Only in development, when
 * SEED_DEV_PASSWORD is set in .env, they are created ACTIVE with that password so the team can sign in locally.
 */
import { readFileSync } from "node:fs";
import { hash } from "@node-rs/argon2";
import { prisma } from "../src/index.ts";

interface SeedRole { key: string; label: string; tier: string; scope: "own" | "team" | "dept" | "all"; permissions: Record<string, string[]> }
interface SeedPerson { ref: string; name: string; email: string; department: string; roles: string[]; teamLeader?: string; team?: string }

const load = <T>(file: string): T => JSON.parse(readFileSync(new URL(`./seed-data/${file}`, import.meta.url), "utf8"));

async function main() {
  const roles = load<SeedRole[]>("roles.json");
  const people = load<SeedPerson[]>("people.json");
  const devPassword = process.env.NODE_ENV !== "production" ? process.env.SEED_DEV_PASSWORD : undefined;
  const passwordHash = devPassword ? await hash(devPassword, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }) : null;

  const roleIds = new Map<string, string>();
  for (const r of roles) {
    const data = { label: r.label, tier: r.tier, scope: r.scope.toUpperCase() as "OWN" | "TEAM" | "DEPT" | "ALL" };
    const role = await prisma.role.upsert({ where: { key: r.key }, create: { key: r.key, ...data }, update: data });
    roleIds.set(r.key, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: Object.entries(r.permissions).map(([module, actions]) => ({ roleId: role.id, module, actions })) });
  }

  const employeeIds = new Map<string, string>();
  for (const p of people) {
    const account = passwordHash ? { status: "ACTIVE" as const, passwordHash } : {};
    const user = await prisma.user.upsert({ where: { email: p.email }, create: { email: p.email, ...account }, update: account });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.createMany({ data: p.roles.map((key, i) => ({ userId: user.id, roleId: roleIds.get(key)!, primary: i === 0 })) });
    const jobTitle = roles.find((r) => r.key === p.roles[0])?.label ?? p.roles[0]!;
    // salary, target and commission are entered by HR / management in the app, not seeded
    const emp = await prisma.employee.upsert({
      where: { userId: user.id },
      create: { userId: user.id, name: p.name, jobTitle, department: p.department, salary: 0, team: p.team ?? null },
      update: { name: p.name, jobTitle, department: p.department, team: p.team ?? null },
    });
    employeeIds.set(p.ref, emp.id);
  }
  // second pass: a salesperson follows their Team Leader (both for the sales team and for approvals / KPIs)
  for (const p of people.filter((x) => x.teamLeader)) {
    const tl = employeeIds.get(p.teamLeader!)!;
    await prisma.employee.update({ where: { id: employeeIds.get(p.ref)! }, data: { teamLeaderId: tl, managerId: tl } });
  }
  console.log(`seed: ${roles.length} roles · ${people.length} people · ${passwordHash ? "ACTIVE with the dev password" : "INVITED"}`);
}

main().finally(() => prisma.$disconnect());
