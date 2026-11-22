/**
 * Demo data for showing deals, collections and contracts to the client (22 Nov): made-up clients and units, every
 * step through the real API as the people who do it (the salesperson registers, the Office Manager approves, the
 * Inventory Manager approves the Seller, the accountant collects, the salesperson uploads the contract, the accountant
 * records installment payments), so entries, TCRs, audit and notifications are the real ones.
 *
 *   pnpm --filter @places/api demo:data            (API_URL, DATABASE_URL and SEED_DEV_PASSWORD from .env)
 *
 * What it leaves, each lead and unit named «مثال · …»:
 *   1. a Rent office, 60,000 + 60,000 commission, fully collected, with a 12-month contract from 1 Sep: September and
 *      October paid, November half paid (late), the rest to come
 *   2. a Resale unit, 100,000 commission, 40,000 collected (Partially Collected), the Seller still waiting
 *   3. an approved Rent deal with no contract yet: «عقد جديد» to show live
 *   4. a deal waiting for the Office Manager's review: «وافق» to show live
 * Run once: it stops if the demo is already there. Nothing here is a real client.
 */
import { prisma } from "@places/db";

const API = (process.env.API_URL ?? "http://localhost:4000") + "/api/v1";
const PW = process.env.SEED_DEV_PASSWORD;
const TAG = "مثال ·";

async function call<T = unknown>(path: string, cookie: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(API + path, { method, headers: { "content-type": "application/json", cookie }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const out = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(out)}`);
  return out as T;
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PW }) });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (res.status !== 200 || !cookie) throw new Error(`sign-in ${email}: ${res.status} (OTP on, or not the seed password?)`);
  return cookie;
}

/** The first active person holding a role (the seed's own people; none is written here). */
async function personWith(role: string, extra: object = {}) {
  const u = await prisma.user.findFirst({
    where: { status: "ACTIVE", otpRequired: false, roles: { some: { role: { key: role } } }, employee: { isNot: null }, ...extra },
    select: { email: true, employee: { select: { id: true, name: true } } }, orderBy: { email: "asc" },
  });
  if (!u?.employee) throw new Error(`nobody active with the role ${role}`);
  return { email: u.email, id: u.employee.id, name: u.employee.name };
}

/** A tiny real PDF for the contract upload (the API checks the type and size, the browser would send the scan). */
function pdfBytes(): Uint8Array {
  const body = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
  return new TextEncoder().encode(body);
}

async function upload(cookie: string, name: string): Promise<string> {
  const bytes = pdfBytes();
  const ticket = await call<{ id: string; url: string; headers: Record<string, string> }>("/files/uploads", cookie, "POST", { name, mime: "application/pdf", size: bytes.length });
  const put = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: bytes });
  if (!put.ok) throw new Error(`file storage refused the upload: ${put.status} (is \`pnpm files:local\` running?)`);
  await call(`/files/${ticket.id}/complete`, cookie, "POST");
  return ticket.id;
}

async function main() {
  if (!PW) throw new Error("SEED_DEV_PASSWORD isn't set (.env)");
  if (await prisma.lead.count({ where: { name: { startsWith: TAG } } })) {
    console.log("The demo data is already there (leads named «مثال · …»). Nothing added.");
    return;
  }
  const sales = await personWith("sales", { employee: { teamLeaderId: { not: null } } });
  const partner = await personWith("sales", { employee: { teamLeaderId: { not: null }, NOT: { id: sales.id } } });
  const [office, accountant, inventory] = await Promise.all([personWith("officemgr"), personWith("accountant"), personWith("inventory")]);
  const [cSales, cOffice, cAcc, cInv] = await Promise.all([sales, office, accountant, inventory].map((p) => signIn(p.email)));
  const salesUser = await prisma.employee.findUniqueOrThrow({ where: { id: sales.id }, select: { userId: true } });

  const acc = async (code: string) => (await prisma.account.findFirstOrThrow({ where: { code }, select: { id: true } })).id;
  const [bank, rentRevenue, resaleRevenue] = await Promise.all([acc("11201"), acc("4102"), acc("4103")]);

  // the clients' leads and the units: made up, «مثال · …»
  const n = Date.now() % 100000;
  const lead = (i: number, name: string, type: "Rent" | "Resale", area: string) => prisma.lead.create({ data: {
    code: `L-EX${n}${i}`, name: `${TAG} ${name}`, phones: [`0100000${String(n).padStart(5, "0").slice(-4)}${i}`], area, type, channel: "Facebook",
    assignedToId: sales.id, assignedAt: new Date(Date.now() - 20 * 86_400_000), createdById: salesUser.userId, stage: "NEAR_TO_CLOSE", qualified: true,
    createdAt: new Date(Date.now() - 25 * 86_400_000), propertyType: "Admin office",
  } });
  const unit = (i: number, type: "Rent" | "Resale", project: string, area: string, space: number, price: string) => prisma.unit.create({ data: {
    code: `U-EX${n}${i}`, type, project: `${TAG} ${project}`, area, space, condition: "Finished", floor: String(i + 2), building: `B${i}`,
    pricePerSqm: price, totalPrice: String(Number(price) * space), pdfStatus: "confirmed", agentId: partner.id, ownerName: `${TAG} المالك ${i}`,
  } });
  const [l1, l2, l3, l4] = await Promise.all([
    lead(1, "شركة النور للتجارة", "Rent", "التجمع الخامس"), lead(2, "شركة الأفق للاستشارات", "Resale", "الشيخ زايد"),
    lead(3, "مكتب الريادة للمحاماة", "Rent", "التجمع الخامس"), lead(4, "شركة المدار للبرمجيات", "Rent", "المعادي"),
  ]);
  const [u1, u2, u3, u4] = await Promise.all([
    unit(1, "Rent", "Business Park مكتب 401", "التجمع الخامس", 250, "800"), unit(2, "Resale", "Zayed Tower مكتب 1203", "الشيخ زايد", 180, "45000"),
    unit(3, "Rent", "Cairo Business Plaza مكتب 210", "التجمع الخامس", 140, "650"), unit(4, "Rent", "Maadi Hub مكتب 15", "المعادي", 120, "550"),
  ]);

  type Deal = { id: string; code: string };
  const register = (l: { id: string }, u: { id: string; space: number }, type: "Rent" | "Resale", owner: string, client: string) =>
    call<Deal>("/deals", cSales, "POST", { leadId: l.id, unitId: u.id, space: u.space, type, commissionOwner: owner, commissionClient: client, withMe: [] });
  const approve = (d: Deal) => call(`/deals/${d.id}/review`, cOffice, "POST", { decision: "approve" });
  const seller = (d: Deal) => call(`/deals/${d.id}/seller`, cInv, "POST");
  const collect = (d: Deal, side: "owner" | "client", amount: string, revenueId?: string) =>
    call(`/deals/${d.id}/collections`, cAcc, "POST", { side, toId: bank, amount, ...(revenueId ? { revenueId } : {}) });

  // 1 · fully collected, with a contract and its installments
  const d1 = await register(l1, u1, "Rent", "60000", "60000");
  await approve(d1);
  await seller(d1);
  await collect(d1, "client", "60000", rentRevenue);
  await collect(d1, "owner", "60000");
  const fileId = await upload(cSales, `${TAG} عقد ${d1.code}.pdf`);
  const contract = await call<{ id: string; code: string }>("/contracts", cSales, "POST", {
    dealId: d1.id, startsOn: "2026-09-01", endsOn: "2027-08-31", value: "600000", escalation: 10, fileId, schedule: { count: 12, everyMonths: 1 },
  });
  const installments = await prisma.installment.findMany({ where: { contractId: contract.id }, orderBy: { dueOn: "asc" }, select: { id: true, amount: true } });
  const pay = (i: number, amount: string, paidOn: string) => call(`/contracts/installments/${installments[i]!.id}/payments`, cAcc, "POST", { amount, paidOn });
  await pay(0, installments[0]!.amount.toFixed(2), "2026-09-03");
  await pay(1, installments[1]!.amount.toFixed(2), "2026-10-05");
  await pay(2, (Number(installments[2]!.amount) / 2).toFixed(2), "2026-11-10"); // November: half paid, the rest late

  // 2 · partially collected, the Seller still waiting for the Inventory Manager
  const d2 = await register(l2, u2, "Resale", "50000", "50000");
  await approve(d2);
  await collect(d2, "client", "40000", resaleRevenue);

  // 3 · approved, no contract yet (to upload one live)
  const d3 = await register(l3, u3, "Rent", "35000", "35000");
  await approve(d3);
  await seller(d3);

  // 4 · waiting for the Office Manager (to approve live)
  const d4 = await register(l4, u4, "Rent", "30000", "30000");

  console.log([
    `Demo data added (salesperson: ${sales.name}, Seller: ${partner.name}):`,
    `  ${d1.code}  Rent 120,000 · fully collected · contract ${contract.code} (Sep, Oct paid · Nov half paid)`,
    `  ${d2.code}  Resale 100,000 · 40,000 collected · Seller waiting`,
    `  ${d3.code}  Rent 70,000 · approved, no contract yet`,
    `  ${d4.code}  Rent 60,000 · waiting for the Office Manager`,
  ].join("\n"));
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
