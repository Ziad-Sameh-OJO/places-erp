/**
 * Demo data for showing deals, collections and contracts to the client (22 Nov): made-up clients and units, every
 * step through the real API as the people who do it (the salesperson registers, the Office Manager approves, the
 * Inventory Manager approves the Seller, the accountant collects, the salesperson uploads the contract, the accountant
 * records installment payments), so entries, TCRs, audit and notifications are the real ones.
 *
 *   pnpm --filter @places/api demo:data            (API_URL, DATABASE_URL and SEED_DEV_PASSWORD from .env)
 *
 * Four parts, each skipped when its data is already there (so it can run again after a pull):
 *   A · deals, collections and a contract (below)
 *   B · leads «مثال ليد · …» in every stage, channel and area: Visits and Meetings today, calls and comments today,
 *       Cancellations with each reason, transfers between salespeople, a duplicate number, Telesales' own
 *   C · this year's targets for every salesperson (only the months that have none), so the dashboard's gauges move
 *   D · two Word templates in «المستندات» («بلّغ بس» and «لازم موافقة») and a document issued from each
 *
 * Part A leaves, each lead and unit named «مثال · …»:
 *   1. a Rent office, 60,000 + 60,000 commission, fully collected, with a 12-month contract from 1 Sep: September and
 *      October paid, November half paid (late), the rest to come
 *   2. a Resale unit, 100,000 commission, 40,000 collected (Partially Collected), the Seller still waiting
 *   3. an approved Rent deal with no contract yet: «عقد جديد» to show live
 *   4. a deal waiting for the Office Manager's review: «وافق» to show live
 * Nothing here is a real client.
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

async function upload(cookie: string, name: string, bytes: Uint8Array = pdfBytes(), mime = "application/pdf", purpose?: string): Promise<string> {
  const ticket = await call<{ id: string; url: string; headers: Record<string, string> }>("/files/uploads", cookie, "POST", { name, mime, size: bytes.length, ...(purpose ? { purpose } : {}) });
  const put = await fetch(ticket.url, { method: "PUT", headers: ticket.headers, body: bytes });
  if (!put.ok) throw new Error(`file storage refused the upload: ${put.status} (is \`pnpm files:local\` running?)`);
  await call(`/files/${ticket.id}/complete`, cookie, "POST");
  return ticket.id;
}

async function main() {
  if (!PW) throw new Error("SEED_DEV_PASSWORD isn't set (.env)");
  for (const [name, part] of [["A · deals and contracts", deals], ["B · leads", leads], ["C · targets", targets], ["D · documents", papers]] as const) {
    try { console.log(`${name}: ${await part()}`); } catch (e) { console.log(`${name}: failed · ${e instanceof Error ? e.message : String(e)}`); process.exitCode = 1; }
  }
}

async function deals(): Promise<string> {
  if (await prisma.lead.count({ where: { name: { startsWith: `${TAG} ` } } })) return "already there";
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

  return [
    `added (salesperson: ${sales.name}, Seller: ${partner.name})`,
    `  ${d1.code}  Rent 120,000 · fully collected · contract ${contract.code} (Sep, Oct paid · Nov half paid)`,
    `  ${d2.code}  Resale 100,000 · 40,000 collected · Seller waiting`,
    `  ${d3.code}  Rent 70,000 · approved, no contract yet`,
    `  ${d4.code}  Rent 60,000 · waiting for the Office Manager`,
  ].join("\n");
}

// ───────── B · leads ─────────

const LEAD_TAG = "مثال ليد ·";
const COMPANIES = ["شركة الندى للأغذية", "مكتب العدالة للمحاماة", "شركة سما للتسويق", "شركة النيل للاستيراد", "عيادات الشفاء", "شركة رواد التقنية",
  "مدرسة المستقبل", "شركة الأمانة للتأمين", "مطاعم البيت", "شركة دلتا للشحن", "مكتب الهندسة الحديثة", "شركة جرين للطاقة", "شركة الرؤية للإعلان",
  "بنك التعمير (فرع)", "شركة الفجر للأدوية", "مركز تدريب النخبة", "شركة الحصن للأمن", "شركة الوادي للمقاولات", "كافيه بن ومزاج", "شركة القمة للاستشارات",
  "صيدليات الحياة", "شركة سحاب للبرمجيات", "معرض الأناقة للأثاث", "شركة أوج للسياحة"];
const CHANNELS = ["Facebook", "Instagram", "LinkedIn", "Google Ads", "TikTok", "Website", "Referral"];
const AREAS = ["التجمع الخامس", "الشيخ زايد", "أكتوبر", "العاصمة الإدارية", "المعادي", "مدينة نصر"];
const TYPES = ["Rent", "Rent", "Resale", "Primary", "Income"] as const;
const USES = ["Admin office", "Commercial", "Residential"] as const;

async function leads(): Promise<string> {
  if (await prisma.lead.count({ where: { name: { startsWith: LEAD_TAG } } })) return "already there";
  const ops = await personWith("ops"), tele = await personWith("telesales").catch(() => null);
  const salesList = await prisma.user.findMany({
    where: { status: "ACTIVE", otpRequired: false, roles: { some: { role: { key: "sales" } } }, employee: { teamLeaderId: { not: null } } },
    select: { employee: { select: { id: true, name: true } } }, orderBy: { email: "asc" }, take: 6,
  }).then((u) => u.flatMap((x) => (x.employee ? [x.employee] : [])));
  if (salesList.length < 2) throw new Error("needs two salespeople with a Team Leader");
  const cOps = await signIn(ops.email), cTele = tele ? await signIn(tele.email) : null;
  const stamp = String(Date.now()).slice(-6);
  const phone = (i: number) => `01${["0", "1", "2", "5"][i % 4]}${stamp}${String(i).padStart(2, "0")}`;
  let failed = 0;
  const tryIt = async <T>(fn: () => Promise<T>): Promise<T | null> => { try { return await fn(); } catch { failed++; return null; } };
  type Made = { id: string; code: string };
  const made: Made[] = [];
  for (const [i, company] of COMPANIES.entries()) {
    const r = await tryIt(() => call<Made>("/leads", cOps, "POST", {
      name: `${LEAD_TAG} ${company}`, company, phones: [phone(i)], area: AREAS[i % AREAS.length], type: TYPES[i % TYPES.length], propertyType: USES[i % USES.length],
      space: 80 + (i % 8) * 40, budget: String(250_000 + (i % 6) * 150_000), channel: CHANNELS[i % CHANNELS.length], assignToId: salesList[i % salesList.length]!.id,
      note: i % 3 === 0 ? "مثال: محتاج مكان قريب من الدائري" : undefined,
    }));
    if (r) made.push(r);
  }
  // Telesales' own leads: two she keeps, one sent on by area
  if (cTele) for (let i = 0; i < 3; i++) await tryIt(() => call("/leads", cTele, "POST", {
    name: `${LEAD_TAG} عميل Telesales ${i + 1}`, phones: [phone(40 + i)], area: AREAS[i], type: "Rent", channel: "By Telesales", keep: i < 2,
  }));
  const at = (k: number) => made[k];
  const stage = (k: number, s: string, extra: object = {}) => at(k) && tryIt(() => call(`/leads/${at(k)!.id}/stage`, cOps, "PATCH", { stage: s, ...extra }));
  for (const k of [0, 1, 2, 3, 4, 5, 6, 7]) await stage(k, "Interested");
  for (const k of [8, 9, 10]) await stage(k, "No Answer");
  for (const k of [11, 12]) await stage(k, "Hold");
  for (const k of [13, 14]) { await stage(k, "Interested"); await stage(k, "Near to Close"); }
  const reasons = ["Not Interested", "Low Budget", "Destination", "No Answer", "Rent Outside", "Buy Outside"];
  for (const [j, reason] of reasons.entries()) await stage(15 + j, "Cancellation", { reason, note: `مثال: ${reason}` });
  // today: Visits and a Meeting (some marked Done), calls and comments; two Visits earlier this week
  const hour = (h: number, daysAgo = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString(); };
  const visit = async (k: number, kind: "Visit" | "Meeting", when: string, done: boolean) => {
    if (!at(k) || !(await tryIt(() => call(`/leads/${at(k)!.id}/visits`, cOps, "POST", { kind, at: when, extra: "مثال: معاينة" })))) return;
    // the answer is the lead; the Visit is its newest one
    const id = (await prisma.leadVisit.findFirst({ where: { leadId: at(k)!.id }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id;
    if (done && id) await tryIt(() => call(`/leads/${at(k)!.id}/visits/${id}/outcome`, cOps, "POST", { outcome: "done" }));
  };
  await visit(0, "Visit", hour(12), true); await visit(1, "Visit", hour(14), false); await visit(2, "Meeting", hour(15), true);
  await visit(3, "Visit", hour(13, 2), true); await visit(4, "Meeting", hour(16, 3), true);
  for (const k of [5, 6, 7, 8, 9]) if (at(k)) await tryIt(() => call(`/leads/${at(k)!.id}/calls`, cOps, "POST"));
  for (const k of [0, 5, 13]) if (at(k)) await tryIt(() => call(`/leads/${at(k)!.id}/comments`, cOps, "POST", { text: "مثال: العميل طالب عرض أسعار للمساحات المتاحة" }));
  // transfers: «اتحوّل من» / «راح لـ»
  for (const k of [6, 7, 22]) if (at(k)) await tryIt(() => call(`/leads/${at(k)!.id}/assign`, cOps, "POST", { to: salesList[(k + 1) % salesList.length]!.id }));
  // the same number again: no new lead, a duplicate arrival for Operations to compare
  await tryIt(() => call("/leads", cOps, "POST", { name: `${LEAD_TAG} رقم متكرر`, phones: [phone(3)], area: AREAS[0], type: "Rent", channel: "Instagram" }));
  return `${made.length} leads (+ Telesales' 3) · stages, 5 Visits/Meetings, 5 calls, 3 comments, 6 Cancellations, 3 transfers, 1 duplicate${failed ? ` · ${failed} steps refused` : ""}`;
}

// ───────── C · targets ─────────

async function targets(): Promise<string> {
  const admin = await personWith("admin"), cAdmin = await signIn(admin.email);
  const year = new Date().getFullYear();
  type Plan = { months: Array<{ month: string; lock: string }>; people: Array<{ employeeId: string; cells: Record<string, { saved: boolean }> }> };
  const plan = await call<Plan>(`/reports/targets/plan?year=${year}`, cAdmin);
  const open = new Set(plan.months.filter((m) => m.lock !== "closed").map((m) => m.month));
  const value = (i: number) => 150_000 + (i % 5) * 25_000, deals = (i: number) => 2 + (i % 3), visits = (i: number) => 10 + (i % 4) * 2;
  const cells: Record<"value" | "deals" | "visits", Array<{ employeeId: string; month: string; amount: string }>> = { value: [], deals: [], visits: [] };
  let past = 0;
  for (const [i, p] of plan.people.entries()) {
    for (const [month, c] of Object.entries(p.cells)) {
      if (c.saved) continue; // never overwrite a target someone set
      if (open.has(month)) {
        cells.value.push({ employeeId: p.employeeId, month, amount: String(value(i)) });
        cells.deals.push({ employeeId: p.employeeId, month, amount: String(deals(i)) });
        cells.visits.push({ employeeId: p.employeeId, month, amount: String(visits(i)) });
      } else {
        // a closed month can't change through the app: the demo writes it as it would have been planned
        await prisma.salesTarget.upsert({ where: { employeeId_month: { employeeId: p.employeeId, month } }, create: { employeeId: p.employeeId, month, value: String(value(i)), deals: deals(i), visits: visits(i) }, update: {} });
        past++;
      }
    }
  }
  if (!cells.value.length && !past) return "already there";
  for (const metric of ["value", "deals", "visits"] as const) if (cells[metric].length) await call("/reports/targets/plan", cAdmin, "PUT", { metric, cells: cells[metric] });
  return `${plan.people.length} salespeople · ${cells.value.length} open months through «خطة التارجت», ${past} past months`;
}

// ───────── D · documents ─────────

async function wordFile(title: string, lines: string[]): Promise<Uint8Array> {
  const { default: JSZip } = await import("jszip");
  const z = new JSZip();
  const p = (t: string) => `<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p(title)}${lines.map(p).join("")}<w:sectPr/></w:body></w:document>`);
  return new Uint8Array(await z.generateAsync({ type: "nodebuffer" }));
}

async function papers(): Promise<string> {
  if (await prisma.wordTemplate.count({ where: { name: { startsWith: TAG }, archivedAt: null } })) return "already there";
  const office = await personWith("officemgr"), sales = await personWith("sales", { employee: { teamLeaderId: { not: null } } });
  const [cOffice, cSales] = await Promise.all([signIn(office.email), signIn(sales.email)]);
  const officeUser = (await prisma.user.findUniqueOrThrow({ where: { email: office.email }, select: { id: true } })).id;
  const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  type View = { id: string; name: string; fields: Array<{ id: number; label: string }> };
  const make = async (name: string, lines: string[], mode: "notify" | "approve") => {
    const fileId = await upload(cOffice, `${name}.docx`, await wordFile(name, lines), DOCX, "template");
    const v = await call<View>("/papers/templates", cOffice, "POST", { name, fileId });
    await call(`/papers/templates/${v.id}`, cOffice, "PUT", { name, fields: v.fields.map((f) => ({ id: f.id, label: f.label, skip: false })), seeRoles: [], seeUserIds: [],
      mode, approverIds: mode === "approve" ? [officeUser] : [], notifyIds: mode === "notify" ? [officeUser] : [], stamp: true, active: true });
    return v;
  };
  const mandate = await make(`${TAG} تفويض`, ["أفوض السيد / ……………", "بطاقة رقم ……………", "بالتعامل نيابة عني في الوحدة رقم ……………", "بتاريخ …/…/……", "ختم الشركة : {{الختم}}"], "notify");
  const receipt = await make(`${TAG} إيصال استلام`, ["استلمت من السيد / {{اسم العميل}}", "مبلغ وقدره ( ……… ) جنيه مصري", "وذلك عن ……………", "التوقيع : {{الإمضا}}"], "approve");
  const fill = (v: View, words: string[]) => Object.fromEntries(v.fields.map((f, i) => [String(f.id), words[i] ?? ""]));
  const a = await call<{ code: string }>("/papers", cSales, "POST", { templateId: mandate.id, values: fill(mandate, ["أحمد محمود (مثال)", "29001010101010", "U-101", "25", "11", "2026"]) });
  const b = await call<{ code: string }>("/papers", cSales, "POST", { templateId: receipt.id, values: fill(receipt, ["شركة المثال", "50,000", "دفعة مقدمة إيجار"]) });
  return `2 templates («بلّغ بس» · «لازم موافقة» to ${office.name}) · ${a.code} ready, ${b.code} waiting for approval (issued by ${sales.name})`;
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
