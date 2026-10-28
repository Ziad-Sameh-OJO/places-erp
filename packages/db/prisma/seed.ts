/**
 * Seed: the real organisation from the client's files — roles and their permission matrix, the 14 people in the
 * KPI file, the 4 Team Leaders and their 18 salespeople (teams A–D), the KPI cards of Q4 2026.
 * Data comes from ./seed-data/*.json (exported from the approved demo), never hard-coded passwords:
 * every account is created INVITED and receives an activation email.
 */
import { prisma } from "../src/index.ts";

async function main() {
  // TODO(phase 1): import seed-data/roles.json, people.json, teams.json, kpi-q4-2026.json
  console.log("seed: nothing to do yet");
}

main().finally(() => prisma.$disconnect());
