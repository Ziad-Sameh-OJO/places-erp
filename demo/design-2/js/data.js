/* Demo seed data. Every name and number here is example data for the demo, not real records. */
window.SEED = (function () {
  const MIN = 60 * 1000, DAY = 24 * 60 * MIN, now = Date.now();
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ago = (m) => new Date(now - m * MIN).toISOString();
  const at = (d, hh = 11, mm = 0) => { const t = new Date(now - d * DAY); t.setHours(hh, mm, 0, 0); return t.toISOString(); };
  const dayKey = (d) => new Date(now - d * DAY).toISOString().slice(0, 10);

  const people = [
    { id: "u1", name: "أحمد إسلام", role: "admin", dept: "الإدارة" },
    { id: "u2", name: "محمد صفوت", role: "admin", dept: "الإدارة" },
    { id: "u4", name: "عبدالله سليم", role: "tl", dept: "المبيعات" },
    { id: "u19", name: "محمود علي", role: "tl", dept: "المبيعات" },
    { id: "u23", name: "عبدالرحمن يونس", role: "tl", dept: "المبيعات" },
    { id: "u24", name: "مصطفى عزت", role: "tl", dept: "المبيعات" },
    // sales teams from the client: A محمود علي · B مصطفى عزت · C عبدالرحمن يونس · D عبدالله سليم
    { id: "s1", name: "محمد محسن", role: "sales", tl: "u4", team: "D", dept: "المبيعات" },
    { id: "s2", name: "محمد عيد", role: "sales", tl: "u4", team: "D", dept: "المبيعات" },
    { id: "s17", name: "أحمد علي", role: "sales", tl: "u4", team: "D", dept: "المبيعات" },
    { id: "s18", name: "أحمد يونس", role: "sales", tl: "u4", team: "D", dept: "المبيعات" },
    { id: "s3", name: "عمر جمال", role: "sales", tl: "u23", team: "C", dept: "المبيعات" },
    { id: "s14", name: "أحمد عمرو", role: "sales", tl: "u23", team: "C", dept: "المبيعات" },
    { id: "s15", name: "أحمد مدحت", role: "sales", tl: "u23", team: "C", dept: "المبيعات" },
    { id: "s16", name: "يوسف حسني", role: "sales", tl: "u23", team: "C", dept: "المبيعات" },
    { id: "s4", name: "يوسف صفوت", role: "sales", tl: "u19", team: "A", dept: "المبيعات" },
    { id: "s5", name: "زياد مدحت", role: "sales", tl: "u19", team: "A", dept: "المبيعات" },
    { id: "s7", name: "أحمد خالد", role: "sales", tl: "u19", team: "A", dept: "المبيعات" },
    { id: "s8", name: "صلاح الدين", role: "sales", tl: "u19", team: "A", dept: "المبيعات" },
    { id: "s9", name: "محمد ممدوح", role: "sales", tl: "u19", team: "A", dept: "المبيعات" },
    { id: "s6", name: "محمد خالد", role: "sales", tl: "u24", team: "B", dept: "المبيعات" },
    { id: "s10", name: "عبدالرحمن صلاح", role: "sales", tl: "u24", team: "B", dept: "المبيعات" },
    { id: "s11", name: "إبراهيم سمير", role: "sales", tl: "u24", team: "B", dept: "المبيعات" },
    { id: "s12", name: "أنس", role: "sales", tl: "u24", team: "B", dept: "المبيعات" },
    { id: "s13", name: "محمد سامي", role: "sales", tl: "u24", team: "B", dept: "المبيعات" },
    { id: "u5", name: "هدير طارق", role: "telesales", dept: "المبيعات" },
    { id: "u6", name: "هبة صلاح", role: "ops", dept: "Operations" },
    { id: "u7", name: "منار أحمد", role: "inventory", dept: "Inventory" },
    { id: "u8", name: "رندا محمد", role: "resale", dept: "Inventory" },
    { id: "u9", name: "سارة عبدالحليم", role: "inventory_staff", dept: "Inventory" },
    { id: "u10", name: "مروة مصطفى", role: "inventory_staff", dept: "Inventory" },
    { id: "u11", name: "رحمة حسن", role: "marketing", dept: "Marketing" },
    { id: "u12", name: "عبدالرحمن بيومي", role: "photographer", dept: "Marketing" },
    { id: "u14", name: "بسنت الصاوي", role: "hr", dept: "HR" },
    { id: "u16", name: "مختار جمال", role: "procurement", dept: "Accounts" },
    { id: "u18", name: "أحمد أشرف", role: "accountant", dept: "Accounts" },
    { id: "u21", name: "نانسي إسلام", role: "officemgr", dept: "الإدارة" }
  ];
  const SALES = people.filter((p) => p.role === "sales").map((p) => p.id);

  const areas = ["التجمع الخامس", "الشيخ زايد", "أكتوبر", "العاصمة الإدارية", "المعادي", "مدينة نصر"];
  const areaRouting = { "التجمع الخامس": ["s1", "s4", "s7", "s10", "s14"], "الشيخ زايد": ["s3", "s15", "s11"], "أكتوبر": ["s2", "s8", "s16"], "العاصمة الإدارية": ["s5", "s6", "s12", "s17"], "المعادي": ["s1", "s9", "s18"], "مدينة نصر": ["s4", "s6", "s13"] };
  const channels = ["Facebook", "Instagram", "LinkedIn", "Google Ads", "TikTok", "Website", "Referral", "By Safwat"];

  const campaigns = [
    { id: "c1", name: "Admin Offices · New Cairo", channel: "Facebook", start: dayKey(58), end: dayKey(-20), budget: 60000, spent: 41000, target: "مكاتب إدارية التجمع", link: "fb.com/ads/1021", note: "" },
    { id: "c2", name: "Retail Zayed Launch", channel: "Facebook", start: dayKey(40), end: dayKey(-5), budget: 45000, spent: 30500, target: "محلات الشيخ زايد", link: "fb.com/ads/1044", note: "" },
    { id: "c3", name: "Clinics October", channel: "Instagram", start: dayKey(45), end: dayKey(-10), budget: 25000, spent: 18200, target: "عيادات أكتوبر", link: "ig.com/p/88", note: "" },
    { id: "c4", name: "Corporate HQ", channel: "LinkedIn", start: dayKey(60), end: dayKey(-15), budget: 70000, spent: 52000, target: "مقرات شركات العاصمة", link: "linkedin.com/ad/77", note: "" },
    { id: "c5", name: "Search · Office for rent", channel: "Google Ads", start: dayKey(60), end: dayKey(-30), budget: 40000, spent: 33000, target: "مكاتب للإيجار", link: "ads.google.com/c/31", note: "" },
    { id: "c6", name: "Income units", channel: "TikTok", start: dayKey(20), end: dayKey(-15), budget: 15000, spent: 6100, target: "وحدات بعائد", link: "tiktok.com/@places", note: "" },
    { id: "c7", name: "Nasr City Offices", channel: "Instagram", start: dayKey(25), end: dayKey(-25), budget: 20000, spent: 9400, target: "مكاتب مدينة نصر", link: "ig.com/p/131", note: "" }
  ];
  const posts = [
    { id: "P-1", title: "ريلز مكاتب Mivida", channel: "Instagram", campaign: "c7", at: at(0, 19, 0), status: "scheduled", approved: true },
    { id: "P-2", title: "كاروسيل عيادات أكتوبر", channel: "Facebook", campaign: "c3", at: at(-1, 20, 0), status: "scheduled", approved: true },
    { id: "P-3", title: "بوست مقرات شركات العاصمة", channel: "LinkedIn", campaign: "c4", at: at(2, 12, 0), status: "published", approved: true, publishedAt: at(2, 12, 6) },
    { id: "P-4", title: "فيديو جولة Capital Gardens", channel: "TikTok", campaign: "c6", at: at(-3, 18, 30), status: "scheduled", approved: false },
    { id: "P-5", title: "إعلان محلات Zayed Hub", channel: "Facebook", campaign: "c2", at: at(5, 21, 0), status: "published", approved: true, publishedAt: at(5, 21, 2) },
    { id: "P-6", title: "Case study · Orbit Tech HQ", channel: "LinkedIn", campaign: "c4", at: at(-6, 11, 0), status: "scheduled", approved: true },
    { id: "P-7", title: "ستوري وحدات بعائد 9%", channel: "Instagram", campaign: "c6", at: at(-9, 20, 0), status: "scheduled", approved: false }
  ];

  const stages = ["Fresh", "Interested", "Not Interested", "No Answer", "Follow up to Visit", "Visit", "Follow up after Visit", "Follow up to Meeting", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal", "Cancellation", "Hold"];
  const QUAL = (s) => s !== "Fresh" && s !== "Not Interested" && s !== "No Answer";

  const first = ["خالد", "منى", "شريف", "هبة", "طارق", "رنا", "ياسر", "نادر", "سلمى", "وليد", "عمر", "دعاء", "حسام", "مها", "إيهاب", "نهى", "أشرف", "دينا", "باسم", "ريهام", "تامر", "إنجي", "رامي", "سحر", "مروان", "ليلى", "حازم", "يارا"];
  const last = ["فهمي", "سليم", "عادل", "رضا", "حسين", "مجدي", "كمال", "سامي", "فؤاد", "عزت", "شوقي", "نبيل", "الدين", "زكي", "منصور", "صبري"];
  // «Companys archive» sheet: 62 categories (one tab each), all with the same 13 columns
  const companyCats = ["cosmetics", "banks", "clinics", "courses", "design", "education", "Developer", "Events", "fashion", "furniture", "Pharmaceuticals", "health care", "IT", "logistics", "nursery", "marketing", "solution", "programming", "real estate", "Security", "service", "others", "Technology", "Customer Service", "GPS", "app", "Government", "Sport", "tourist", "طيران", "استشارات هندسية", "استشارات", "استشارات مالية", "إنتاج إعلامي", "إدارة مشروعات", "العملات الرقمية", "استثمار", "استيراد وتصدير", "إدارة جودة", "أبحاث", "اتصالات", "بترول", "بناء", "تأمينات", "تجارة", "توظيف", "تصوير", "تشطيب", "تصنيع", "أغذية", "مؤسسة خيرية", "زراعة", "تمويل", "شحن", "حماية منتج", "سفارات", "طاقة", "طباعة", "محاماة", "مستورد", "مبيعات", "مقاولات", "كهرباء"];
  const co = (name, cat, number, contact, title, location, space, end, rent, feedback) => ({ name, cat, number, contact, title, email: contact ? name.toLowerCase().replace(/\s+/g, "") + "@mail.com" : "", location, space, start: end ? String(+end.slice(0, 4) - 3) + end.slice(4) : "", end, rent, escalation: 10, date: dayKey(Math.floor(rnd() * 40)), feedback });
  const companies = [
    co("Nile Pharma", "Pharmaceuticals", "01001234567", "م. خالد فهمي", "Admin Manager", "مدينة نصر", 140, "2027-02-28", 160000, "عايزين مكتب في التجمع"), co("Smile Clinics", "clinics", "01112223344", "د. سمر", "Owner", "أكتوبر", 90, "2026-12-31", 70000, "اتقفل معاهم ديل"),
    co("Orbit Tech", "Technology", "01223344556", "م. ياسر", "CEO", "المعادي", 220, "2027-06-30", 240000, ""), co("Delta Builders", "مقاولات", "01099887766", "أ. نادر", "HR", "التجمع الخامس", 300, "2028-01-31", 300000, "مش مهتمين دلوقتي"),
    co("Green Foods", "أغذية", "01555667788", "أ. هبة", "Office Manager", "الشيخ زايد", 180, "2026-11-30", 190000, "عقدهم قرّب يخلص"), co("Vertex Bank", "banks", "01011122233", "أ. طارق", "Facilities", "وسط البلد", 500, "2029-03-31", 650000, ""),
    co("Bright Academy", "education", "01266554433", "أ. رنا", "Founder", "مدينة نصر", 260, "2027-09-30", 210000, "اتقفل معاهم ديل"), co("Cairo Dental Hub", "clinics", "01123456780", "د. وليد", "Owner", "مصر الجديدة", 120, "2027-01-31", 95000, ""), co("Atlas Logistics", "logistics", "01077788899", "أ. عمر", "Operations", "العاصمة الإدارية", 400, "2028-05-31", 280000, "")
  ];
  const campByCh = (ch) => campaigns.filter((c) => c.channel === ch);

  const leads = [];
  let seq = 1001;
  const mkLead = (o) => {
    const l = Object.assign({ id: "L-" + seq++, phones: [], company: "", type: "Rent", space: 0, condition: "متشطب", budget: 0, note: "", comments: [], visits: [], answers: {}, noAnswer: 0, rotation: 1, everInterested: false, owner: "sales", post: "", tlFlag: "", activity: 0 }, o);
    if (QUAL(l.stage)) l.everInterested = true;
    leads.push(l); return l;
  };
  // history: 52 leads spread over the last 60 days
  for (let i = 0; i < 52; i++) {
    const ch = pick(["Facebook", "Facebook", "Facebook", "Instagram", "Instagram", "LinkedIn", "LinkedIn", "Google Ads", "TikTok", "Website", "Referral"]);
    const cps = campByCh(ch), cp = cps.length ? pick(cps) : null;
    const area = pick(areas), type = pick(["Rent", "Rent", "Rent", "Resale", "Income"]);
    const space = type === "Income" ? pick([180, 220, 250, 300]) : pick([60, 80, 95, 100, 110, 120, 150, 200, 300, 600]);
    const budget = type === "Rent" ? Math.round(space * pick([450, 600, 800, 1000, 1200]) / 1000) * 1000 : type === "Resale" ? Math.round(space * pick([28000, 32000, 38000]) / 100000) * 100000 : Math.round(space * pick([35000, 45000]) / 100000) * 100000;
    const d = Math.floor(rnd() * 58) + 2;
    const stage = pick(["Interested", "Not Interested", "No Answer", "Follow up to Visit", "Visit", "Follow up after Visit", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal", "Cancellation", "Hold", "Interested", "Not Interested"]);
    const pool = areaRouting[area] || SALES;
    const co = rnd() < 0.35 ? pick(companies).name : "";
    mkLead({ name: `${rnd() < 0.5 ? "أ." : rnd() < 0.5 ? "م." : "د."} ${pick(first)} ${pick(last)}`, company: co, phones: ["01" + pick(["0", "1", "2", "5"]) + String(10000000 + Math.floor(rnd() * 89999999))], area, type, space, condition: pick(["متشطب", "متشطب", "نص تشطيب", "Core & Shell"]), budget, channel: ch, campaign: cp ? cp.id : "", post: cp && rnd() < 0.5 ? pick(posts.filter((p) => p.campaign === cp.id).map((p) => p.id).concat([""])) : "", sales: pick(pool), stage, created: at(d, 10 + Math.floor(rnd() * 8), Math.floor(rnd() * 59)), touched: true, activity: 1 + Math.floor(rnd() * 6) });
  }
  // live demo cases (today)
  mkLead({ name: "م. خالد فهمي", company: "Nile Pharma", phones: ["01001234567", "01223456789"], area: "التجمع الخامس", type: "Rent", space: 150, budget: 140000, channel: "Facebook", campaign: "c1", post: "", sales: "s1", stage: "Fresh", created: ago(150), note: "عايز مكتب قريب من التسعين" });
  mkLead({ name: "أ. منى سليم", phones: ["01112345678"], area: "الشيخ زايد", type: "Resale", space: 80, condition: "نص تشطيب", budget: 2800000, channel: "Facebook", campaign: "c2", post: "P-5", sales: "s3", stage: "Fresh", created: ago(40) });
  mkLead({ name: "أ. هبة رضا", phones: ["01033221100"], area: "التجمع الخامس", type: "Rent", space: 100, budget: 120000, channel: "Google Ads", campaign: "c5", sales: "s4", stage: "No Answer", noAnswer: 1, rotation: 1, created: ago(60 * 26), touched: true });
  mkLead({ name: "أ. وليد عزت", phones: ["01177778888"], area: "الشيخ زايد", type: "Rent", space: 90, budget: 55000, channel: "Instagram", campaign: "c3", sales: "s3", stage: "No Answer", noAnswer: 2, rotation: 2, created: ago(60 * 50), touched: true });
  mkLead({ name: "Orbit Tech", company: "Orbit Tech", phones: ["01288776655"], area: "العاصمة الإدارية", type: "Rent", space: 600, condition: "Core & Shell", budget: 350000, channel: "LinkedIn", campaign: "c4", post: "P-3", sales: "s5", stage: "Follow up to Visit", created: ago(60 * 24 * 4), touched: true, visits: [{ at: at(0, 10, 0), units: ["U-208"], extra: "", done: false }] });
  mkLead({ name: "أ. دعاء نبيل", phones: ["01188889999"], area: "أكتوبر", type: "Rent", space: 60, budget: 35000, channel: "Website", sales: "u5", owner: "telesales", stage: "Interested", created: ago(60 * 5), touched: true, note: "ليد عاملاه Telesales لنفسها" });
  mkLead({ name: "م. حسام الدين", company: "Arc Studio", phones: ["01244445555"], area: "المعادي", type: "Rent", space: 140, budget: 80000, channel: "Referral", sales: "s1", stage: "Fresh", created: ago(175) });
  mkLead({ name: "Vertex Bank", company: "Vertex Bank", phones: ["01299990000"], area: "العاصمة الإدارية", type: "Rent", space: 120, condition: "Core & Shell", budget: 60000, channel: "LinkedIn", campaign: "c4", sales: "s5", stage: "Interested", created: ago(60 * 24 * 2), touched: true, tlFlag: "محتاجين عرض بفرع كامل + parking 4" });
  leads.forEach((l, i) => {
    if (l.touched && !l.comments.length) l.comments.push({ by: l.sales, at: l.created, text: `أول تواصل · ${l.stage}` });
    // most leads were followed up this week; a few were left idle so the Draft rule has something to show
    if (l.touched && i % 9 !== 4 && !["Done Deal", "Cancellation", "Not Interested", "No Answer"].includes(l.stage)) l.comments.push({ by: l.sales, at: ago(((i * 7) % 5) * 1440 + 90), text: "متابعة مع العميل" });
    // why a lead never became Qualified: the salesperson's own comment on the action they took (marketing reads these)
    if (l.touched && !l.everInterested && ["Not Interested", "No Answer"].includes(l.stage)) { const R = l.stage === "No Answer" ? ["مابيردش · اتصلت 3 مرات", "التليفون مقفول", "بيرن ومحدش بيرد", "ردّ مرة وقال هيكلمني ومكلمش"] : ["مش في المنطقة اللي عايزها · عايز زايد", "الميزانية أقل من الأسعار المتاحة", "بيدوّر على سكني مش إداري", "المساحة صغيرة عليه", "لقى مكان خلاص", "رقم غلط · مش هو"];
      l.comments.push({ by: l.sales, at: ago(((i * 11) % 6) * 1440 + 45), text: R[i % R.length], note: true }); }
    // No Answer is timed from when the salesperson marked it: these were marked within the last day
    if (l.stage === "No Answer" && !l.noAnswerAt) Object.assign(l, { noAnswerAt: ago(60 * (2 + ((i * 5) % 21))), naBy: l.sales });
    if (i % 8 === 5) l.kind = "broker"; // a few brokers for the Brokers tab
  });
  // Not Interested / Cancellation sit in Heba's Draft Admin; the two newest came in today and wait for her decision
  leads.filter((l) => ["Not Interested", "Cancellation"].includes(l.stage)).forEach((l, i) => {
    const today = i < 2, at = today ? ago(60 * (i + 1)) : (l.comments[l.comments.length - 1] || l).at || l.created;
    Object.assign(l, { owner: "draftAdmin", sales: "u6", draftAdmin: { at, from: l.sales, stage: l.stage, by: l.sales, reviewed: !today, ...(today ? {} : { reviewedAt: new Date(new Date(at).getTime() + (i % 6 === 5 ? 30 : 3) * 3600e3).toISOString(), reviewedBy: "u6" }) } });
  });

  const U = (o) => Object.assign({ status: "available", divisible: false, minSplit: 0, photos: "", pdf: "confirmed", tab: null, lastUpdate: dayKey(5), agent: "s1", commission: "", parking: 0, floor: "", building: "", maintenance: "", location: "", created: dayKey(30) }, o);
  const units = [
    U({ code: "U-101", type: "Rent", project: "Mivida Business Park", area: "التجمع الخامس", space: 95, condition: "متشطب", pricePerSqm: 1100, contact: "أ. سمير", number: "01000000101", floor: "2", building: "B4", parking: 1, lastUpdate: dayKey(3), agent: "s1", photos: "U-101-01.jpg، U-101-02.jpg، U-101-03.jpg", location: "30.0235, 31.4890", maintenance: "Included", commission: "1,5 Month", layout: "Yes", seedLayouts: ["img/units/P1901/layout/25-00-04-03.pdf", "img/units/P1901/layout/2D-CAD-MALLE.dwg"], layouts: "25-00-04-03.pdf، 2D-CAD-MALLE.dwg", comment: "المالك بيفضّل شركات" }),
    U({ code: "U-102", type: "Rent", project: "Mivida Business Park", area: "التجمع الخامس", space: 110, condition: "متشطب", pricePerSqm: 1050, contact: "أ. سمير", number: "01000000101", floor: "3", building: "B4", parking: 2, lastUpdate: dayKey(12), agent: "s4", maintenance: "15 EGP / m", commission: "1 Month", layout: "No" }),
    U({ code: "U-103", also: "Resale", alsoStatus: "available", alsoPricePerSqm: 34000, type: "Rent", project: "The Waterway", area: "التجمع الخامس", space: 150, condition: "متشطب", pricePerSqm: 900, contact: "م. هاني", number: "01000000103", floor: "1", building: "W2", parking: 2, lastUpdate: dayKey(41), agent: "s1", maintenance: "Included", commission: "1 Month", layout: "Yes", comment: "متاحة بيع كمان" }),
    U({ code: "U-104", type: "Rent", project: "Capital Business Park", area: "الشيخ زايد", space: 90, condition: "متشطب", pricePerSqm: 650, contact: "أ. ليلى", number: "01000000104", floor: "G", building: "C1", parking: 2, agent: "s3", maintenance: "10 EGP / m", commission: "1 Month", layout: "No" }),
    U({ code: "U-105", type: "Rent", project: "Sodic East", area: "التجمع الخامس", space: 210, condition: "متشطب", pricePerSqm: 700, contact: "م. وائل", number: "01000000105", floor: "4", building: "E7", parking: 3, status: "rented", agent: "s4", closedAt: dayKey(10), maintenance: "Included", commission: "1 Month", layout: "Yes" }),
    U({ code: "U-106", type: "Rent", project: "October Plaza", area: "أكتوبر", space: 120, condition: "متشطب", pricePerSqm: 500, contact: "د. عادل", number: "01000000106", floor: "1", building: "P2", parking: 1, agent: "s2", pdf: "draft", created: dayKey(0), maintenance: "Not included", commission: "1 Month", layout: "No", comment: "مستنية الصور" }),
    U({ code: "U-107", type: "Rent", project: "Capital Gardens", area: "العاصمة الإدارية", space: 5000, condition: "Core & Shell", pricePerSqm: 380, contact: "م. فؤاد", number: "01000000107", floor: "كامل المبنى", building: "CG1", parking: 40, divisible: true, minSplit: 250, agent: "s5", maintenance: "Included", commission: "2 Months", layout: "Yes", comment: "مبنى كامل · بيتقسم من 250 م" }),
    U({ code: "U-108", type: "Rent", project: "Mivida Business Park", area: "التجمع الخامس", space: 1800, condition: "متشطب", pricePerSqm: 850, contact: "أ. سمير", number: "01000000101", floor: "5-6", building: "B9", parking: 12, divisible: true, minSplit: 90, agent: "s1", maintenance: "Included", commission: "1,5 Month", layout: "Yes" }),
    U({ code: "U-109", type: "Rent", project: "Nasr City Hub", area: "مدينة نصر", space: 75, condition: "متشطب", pricePerSqm: 600, contact: "أ. منير", number: "01000000109", floor: "6", building: "N1", parking: 0, agent: "s6", maintenance: "8 EGP / m", commission: "1 Month", layout: "No" }),
    U({ code: "U-110", type: "Rent", project: "Maadi Corner", area: "المعادي", space: 140, condition: "متشطب", pricePerSqm: 560, contact: "أ. جيهان", number: "01000000110", floor: "2", building: "M3", parking: 1, agent: "s1", lastUpdate: dayKey(38), maintenance: "Included", commission: "1 Month", layout: "No", comment: "محتاجة ابديت مع المالك" }),
    U({ code: "U-111", type: "Rent", project: "The Waterway", area: "التجمع الخامس", space: 320, condition: "نص تشطيب", pricePerSqm: 720, contact: "م. هاني", number: "01000000103", floor: "G", building: "W5", parking: 4, agent: "s4", maintenance: "12 EGP / m", commission: "1 Month", layout: "Yes" }),
    U({ code: "U-112", type: "Rent", project: "Zayed Business Hub", area: "الشيخ زايد", space: 65, condition: "متشطب", pricePerSqm: 700, contact: "أ. نبيل", number: "01000000201", floor: "1", building: "Z2", parking: 1, agent: "s3", maintenance: "Included", commission: "1 Month", layout: "No" }),
    U({ code: "U-208", type: "Rent", project: "Capital Gardens", area: "العاصمة الإدارية", space: 600, condition: "Core & Shell", pricePerSqm: 420, contact: "م. فؤاد", number: "01000000107", floor: "3", building: "CG2", parking: 6, agent: "s5", maintenance: "Not included", commission: "1,5 Month", layout: "Yes" }),
    U({ code: "P1901", type: "Rent", project: "Gate way El Rehab (Maqr)", area: "التجمع الخامس", space: 690, divisible: true, minSplit: 20, condition: "Furnished", pricePerSqm: 2500, maintenance: "Included", commission: "1,5 Month", layout: "Yes", seedLayouts: ["img/units/P1901/layout/25-00-04-03.pdf", "img/units/P1901/layout/2D-CAD-MALLE.dwg"], layouts: "25-00-04-03.pdf، 2D-CAD-MALLE.dwg", seedPhotos: [1, 2, 3, 4, 5, 6, 7].map((n) => `img/units/P1901/P1901-${n}.jpg`), photos: [1, 2, 3, 4, 5, 6, 7].map((n) => `P1901-${n}.jpg`).join("، "), drive: "P1901 · صور + PDF", driveAt: ago(60 * 24 * 9 - 60), location: "30.0631, 31.4905", contact: "إدارة المبنى", number: "01000000190", floor: "2", building: "b3-1-2", parking: 5, agent: "s4",
      delivery: "Ready to move", upfront: "3 months", security: "3 months", payment: "Quarterly", term: "3-5 years", grace: "N\\A", escalation: 10 }),
    U({ code: "U-201", type: "Resale", project: "Zayed Business Hub", owner: "أ. نبيل", number: "01000000201", area: "الشيخ زايد", space: 85, floor: "2", condition: "متشطب", pricePerSqm: 36000, payment: "كاش", delivery: "فوري", building: "Z3", parking: 1, agent: "s3", photos: "U-201-01.jpg، U-201-02.jpg، U-201-03.jpg" }),
    U({ code: "U-202", type: "Resale", project: "Zayed Business Hub", owner: "م. رامي", number: "01000000202", area: "الشيخ زايد", space: 100, floor: "3", condition: "نص تشطيب", pricePerSqm: 31000, payment: "تقسيط 3 سنين", delivery: dayKey(-180), building: "Z3", parking: 1, agent: "s3" }),
    U({ code: "U-203", type: "Resale", project: "New Capital Towers", owner: "أ. سحر", number: "01000000203", area: "العاصمة الإدارية", space: 130, floor: "11", condition: "نص تشطيب", pricePerSqm: 29000, payment: "تقسيط 5 سنين", delivery: dayKey(-365), building: "T2", parking: 2, agent: "s6", lastUpdate: dayKey(35) }),
    U({ code: "U-204", type: "Resale", project: "Trivium Square", owner: "م. أيمن", number: "01000000204", area: "الشيخ زايد", space: 220, floor: "G", condition: "متشطب", pricePerSqm: 42000, payment: "كاش", delivery: "فوري", building: "TS1", parking: 2, agent: "s3", status: "sold", closedAt: dayKey(8) }),
    U({ code: "U-205", type: "Resale", project: "Eastown Offices", owner: "أ. وفاء", number: "01000000205", area: "التجمع الخامس", space: 160, floor: "4", condition: "متشطب", pricePerSqm: 39000, payment: "تقسيط 3 سنين", delivery: "فوري", building: "EO2", parking: 2, agent: "s4" }),
    U({ code: "U-206", type: "Resale", project: "Nasr Medical Tower", owner: "د. سامح", number: "01000000206", area: "مدينة نصر", space: 70, floor: "8", condition: "متشطب", pricePerSqm: 30000, payment: "كاش", delivery: "فوري", building: "NM", parking: 0, agent: "s6" }),
    U({ code: "U-301", type: "Income", project: "October Medical Mall", name: "أ. ماجد", number: "01000000301", link: "U-301 · ملف الوحدة", area: "أكتوبر", space: 250, floor: "1", salePerSqm: 36000, leasePerSqm: 270, contractYears: 5, start: dayKey(200), end: dayKey(-1625), escalation: 10, payment: "كاش", building: "M1", serviceUsd: 2, tenant: "صيدليات النهدي", parking: 3, agreement: "U-301-contract.pdf", agent: "s2", note: "مستأجر من 2026" }),
    U({ code: "U-302", type: "Income", project: "Sodic East", name: "م. شادي", number: "01000000302", link: "U-302 · ملف الوحدة", area: "التجمع الخامس", space: 180, floor: "G", salePerSqm: 48000, leasePerSqm: 360, contractYears: 3, start: dayKey(90), end: dayKey(-1000), escalation: 7, payment: "تقسيط", building: "E2", serviceUsd: 3, tenant: "بنك تجاري", parking: 2, agreement: "U-302-contract.pdf", agent: "s4", status: "sold", closedAt: dayKey(21) }),
    U({ code: "U-303", type: "Income", project: "Zayed Strip Mall", name: "أ. حمدي", number: "01000000303", link: "U-303 · ملف الوحدة", area: "الشيخ زايد", space: 220, floor: "G", salePerSqm: 40000, leasePerSqm: 300, contractYears: 4, start: dayKey(120), end: dayKey(-1340), escalation: 8, payment: "كاش", building: "ZS", serviceUsd: 2, tenant: "سلسلة كافيهات", parking: 4, agreement: "U-303-contract.pdf", agent: "s3" })
  ];
  // the seed is complete like a filled sheet, except U-106 / U-112 (no photos yet); P1901 is the client's own row (Book, 9 Nov) with its layout files
  const AREA_LOC = { "التجمع الخامس": "30.0235, 31.4890", "الشيخ زايد": "30.0444, 30.9760", "العاصمة الإدارية": "30.0196, 31.7612", "أكتوبر": "29.9737, 30.9420", "مدينة نصر": "30.0561, 31.3301", "المعادي": "29.9602, 31.2569" };
  // Website Ads (marketing's column): a few units already posted on the website
  ["U-101", "U-103", "U-108", "U-201"].forEach((c) => { const u = units.find((x) => x.code === c); if (u) Object.assign(u, { webAd: "posted", webAdAt: ago(60 * 24 * 3), webAdBy: "u11" }); });
  units.forEach((u) => { if (!u.location && u.code !== "U-106") u.location = AREA_LOC[u.area] || ""; if (u.type !== "Rent") { if (!u.commission) u.commission = "2.5%"; if (u.type === "Resale" && !u.maintenance) u.maintenance = "Included"; if (!u.photos) u.photos = u.code + "-01.jpg"; } });
  const areaTabs = [
    { label: "20 to 100", min: 20, max: 100 }, { label: "101 to 200", min: 101, max: 200 },
    { label: "201 to 500", min: 201, max: 500 }, { label: "501 to 800", min: 501, max: 800 }, { label: "+800", min: 801, max: 1e9 }
  ];
  const importSample = [
    { project: "The Waterway", space: 150, floor: "1", building: "W2", contact: "م. هاني", number: "01000000103", pricePerSqm: 900, type: "Rent" },
    { project: "Nasr City Hub", space: 90, floor: "3", building: "N1", contact: "أ. منير", number: "01000000109", pricePerSqm: 620, type: "Rent" },
    { project: "Maadi Corner", space: 140, floor: "2", building: "M3", contact: "أ. جيهان", number: "01000000110", pricePerSqm: 560, type: "Rent" },
    { project: "Eastown Offices", space: 200, floor: "5", building: "EO3", contact: "أ. وفاء", number: "01000000205", pricePerSqm: 820, type: "Rent" }
  ];
  const invAccess = { ...Object.fromEntries(SALES.map((id) => [id, "view"])), u8: "edit", u9: "edit", u10: "view", u11: "view", u5: "none", u6: "view" };

  const tasks = [
    { id: "T-1", kind: "photo", unit: "U-106", by: "u7", to: "u12", due: dayKey(0), status: "todo", note: "الدور الأول · المفتاح مع البواب" },
    { id: "T-2", kind: "photo", unit: "U-203", by: "u8", to: "u12", due: dayKey(0), status: "progress" },
    { id: "T-3", kind: "retouch", unit: "U-104", by: "u7", to: "u12", due: dayKey(-1), status: "uploaded", link: "U-104-raw-01.jpg، U-104-raw-02.jpg" },
    { id: "T-4", kind: "retouch", unit: "U-202", by: "u8", to: "u12", due: dayKey(-1), status: "todo", link: "U-202-raw-01.jpg، U-202-raw-02.jpg" },
    { id: "T-5", kind: "marketing", title: "Website leasing · رفع وحدات التجمع", by: "u11", to: "u11", due: dayKey(0), status: "progress" },
    { id: "T-6", kind: "marketing", title: "Market survey · أسعار مكاتب زايد", by: "u11", to: "u11", due: dayKey(-2), status: "todo" },
    { id: "T-7", kind: "followup", unit: "U-103", by: "system", to: "u7", due: dayKey(0), status: "todo", note: "last update عدّى عليه أكتر من شهر · كلّم المالك" },
    { id: "T-8", kind: "toResale", unit: "U-110", by: "u7", to: "u8", due: dayKey(-1), status: "todo", note: "المالك عايز يبيع · اعمليلها ابديت للبيع" },
    { id: "T-9", kind: "photo", unit: "U-205", by: "u8", to: "u12", due: dayKey(1), status: "done" }
  ];
  const broadcasts = [
    { id: "B-1", text: "مكاتب متشطبة في Mivida من 95 متر · إيجار يبدأ من 1,050 للمتر", sent: ["s1", "s4"], created: ago(60 * 26), approved: true, image: "Mivida-offices.jpg" },
    { id: "B-2", text: "وحدات بعائد 9% في أكتوبر · تسليم فوري", sent: [], created: ago(60 * 2), approved: false, image: "income-units.jpg" }
  ];

  // commissionPct = Places' commission rate on the deal value; the commission has a Buyer part and a Seller part, and collections are against it
  // Shape of the «admin done deal» sheet: commission expected from the Owner and the Client; collections are tagged with their side,
  // each collection prints a TCR; Buyer side = the salesperson(s) who closed it, Seller side = the unit's agent (after Manar approves)
  let tcrSeq = 180;
  const mkDeal = (o) => {
    const d = Object.assign({ payments: [], status: "Approved", reviewNote: "", note: "", targetBase: null, tcrs: [] }, o), c = Math.round(d.value * d.commissionPct / 100), u = units.find((x) => x.code === d.unit) || {};
    d.commOwner = Math.round(c / 2); d.commClient = c - d.commOwner;
    d.buyers = d.buyers || [d.sales]; d.sellers = u.agent && u.agent !== d.sales ? [u.agent] : []; d.sellerApproved = d.status !== "Pending Review";
    Object.assign(d, { company: d.client, space: u.space || 0, type: u.type || "Rent", location: u.project || "", source: d.channel });
    d.payments = d.payments.map((p, i) => ({ at: p.at, amount: Math.round(p.amount * d.commissionPct / 100), side: i % 2 ? "owner" : "client" }));
    d.tcrs = d.payments.map((p) => ({ code: "T" + tcrSeq++, at: p.at, amount: p.amount, side: p.side, signed: Object.fromEntries(d.buyers.concat(d.sellers).map((id) => [id, true])) }));
    return d;
  };
  const deals = [
    mkDeal({ id: "D-301", lead: "", client: "م. نادر سامي", unit: "U-105", sales: "s4", value: 1764000, commissionPct: 2.5, created: at(14), closed: at(10), channel: "Google Ads", campaign: "c5", area: "التجمع الخامس", kind: "عمولات تسويق عقاري اداري", payments: [{ at: at(10), amount: 1764000 }], status: "Fully Collected" }),
    mkDeal({ id: "D-302", lead: "", client: "أ. رنا مجدي", unit: "U-204", sales: "s3", value: 9240000, commissionPct: 2, created: at(9), closed: at(8), channel: "Facebook", campaign: "c2", area: "الشيخ زايد", kind: "عمولات تسويق عقاري resale", payments: [{ at: at(8), amount: 4000000 }], status: "Partially Collected", buyers: ["s3", "s1"] }),
    mkDeal({ id: "D-303", lead: "", client: "Green Foods", unit: "U-302", sales: "s4", value: 8640000, commissionPct: 2, created: at(30), closed: at(21), channel: "LinkedIn", campaign: "c4", area: "التجمع الخامس", kind: "عمولات تسويق عقاري تجاري", payments: [{ at: at(21), amount: 8640000 }], status: "Fully Collected" }),
    mkDeal({ id: "D-304", lead: "", client: "م. طارق حسين", unit: "U-102", sales: "s1", value: 1386000, commissionPct: 2.5, created: at(5), closed: at(4), channel: "Facebook", campaign: "c1", area: "التجمع الخامس", kind: "عمولات تسويق عقاري اداري", payments: [{ at: at(3), amount: 700000 }], status: "Partially Collected" }),
    mkDeal({ id: "D-305", lead: "", client: "Smile Clinics", unit: "U-106", sales: "s2", value: 720000, commissionPct: 2.5, created: at(2), closed: at(1), channel: "Instagram", campaign: "c3", area: "أكتوبر", kind: "عمولات تسويق عقاري اداري", status: "Pending Review" }),
    mkDeal({ id: "D-306", lead: "", client: "Bright Academy", unit: "U-111", sales: "s6", value: 2764800, commissionPct: 2.5, created: at(40), closed: at(33), channel: "Referral", campaign: "", area: "مدينة نصر", kind: "عمولات تسويق عقاري اداري", payments: [{ at: at(33), amount: 2764800 }], status: "Fully Collected" })
  ];

  const roleSalary = { sales: 14000, tl: 22000, salesdir: 35000, telesales: 11000, ops: 15000, inventory: 20000, resale: 17000, inventory_staff: 12000, marketing: 19000, photographer: 11000, designer: 13000, hr: 16000, accountant: 30000, procurement: 14000 };
  // commissionPct = scheme: % of the salesperson's share of the commission (the client's example: 30%); target = commission shares
  // KPI data on deals: execution date (Office Manager) and Finance's paper check
  deals.forEach((d, i) => { d.execDue = dayKey(i % 3 ? -7 + i : 3); if (i % 3) d.executed = dayKey(-6 + i + (i === 4 ? 2 : 0)); d.papers = i === 2 ? { ok: false, note: "التفويض ناقص إمضا المالك", by: "u18", at: ago(60 * 30) } : i < 5 ? { ok: true, note: "", by: "u18", at: ago(60 * 40) } : null; });
  // inventory KPI data: received → entered (24h), media link (24h after entry), list requests, Manar's team tasks
  units.forEach((u, i) => { const e = new Date(now - (i * 2 + 1) * DAY - (i % 4) * 36e5); u.enteredAt = e.toISOString(); u.receivedAt = new Date(e - (i === 3 ? 30 : 2 + (i % 5) * 3) * 36e5).toISOString(); if (i % 6 !== 5) { u.drive = `${u.code} · صور + PDF`; u.driveAt = new Date(e.getTime() + (i === 7 ? 31 : 3 + (i % 4) * 4) * 36e5).toISOString(); } });
  const listReqs = [{ id: "LR-1", by: "u19", text: "إيجار التجمع 100–150 م متشطب لعميل شركة أدوية", at: ago(60 * 20) }, { id: "LR-2", by: "u4", text: "Resale زايد أقل من 3 مليون", at: ago(60 * 50), units: ["U-201", "U-202"], doneAt: ago(60 * 40), doneBy: "u10", unconfirmed: 0 }];
  tasks.push({ id: "T-21", kind: "team", title: "حدّثي لينكات صور U-103 و U-105", unit: "U-103", by: "u7", to: "u9", due: dayKey(0), created: ago(60 * 2), status: "todo" }, { id: "T-22", kind: "team", title: "جهّزي PDF لـ U-111", unit: "U-111", by: "u7", to: "u10", due: dayKey(0), created: ago(60 * 3), status: "todo" });
  // website ads counted from the site, and Rahma's competitor reports
  const webAds = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [dayKey(i), [19, 27, 25, 22, 26, 24, 28, 21, 25, 26][i]]));
  const compReports = [{ month: dayKey(31).slice(0, 7), name: "تقرير المنافسين · الشهر اللي فات (Nawy · Property Finder · Bayut)", at: ago(60 * 24 * 29), by: "u11" }];
  // Mokhtar: petty-cash ceiling, office assets, the office boys' rota
  const officeAssets = [{ name: "لابتوب Dell × 14", place: "المبيعات", ok: true }, { name: "طابعة HP LaserJet", place: "الاستقبال", ok: false }, { name: "تكييف كاريير × 6", place: "الدورين", ok: true }, { name: "جهاز البصمة ZKTeco", place: "المدخل", ok: true }, { name: "شاشة اجتماعات 65\"", place: "غرفة الاجتماعات", ok: true }];
  const officeBoys = [{ area: "الدور الأرضي + الاستقبال", name: "سيد", slots: "9:00 · 13:00 · 17:00" }, { area: "الدور الأول (المبيعات)", name: "عم ممدوح", slots: "9:30 · 12:30 · 16:30" }, { area: "المطبخ + غرفة الاجتماعات", name: "سيد", slots: "قبل كل اجتماع" }];
  const employees = people.filter((p) => !["admin", "approver"].includes(p.role)).map((p) => ({
    id: p.id, name: p.name, role: p.role, dept: p.dept, salary: roleSalary[p.role] || 12000, target: p.role === "sales" ? [60000, 60000, 80000, 70000, 60000, 50000][SALES.indexOf(p.id)] || 50000 : 0,
    commissionPct: p.role === "sales" ? 30 : 0, kind: p.id === "u10" ? "Part-time" : "Full-time", deduction: null, tl: p.tl || "",
    leaveBalance: 21, leaveUsed: p.id === "s1" ? 6 : p.id === "s3" ? 3 : 2, joined: dayKey(400 + Math.floor(rnd() * 500))
  }));
  employees.find((e) => e.id === "u18").schedule = "الاتنين والخميس 17:00–19:00 (عن بُعد)"; // CFO: fixed attendance, his KPI item
  employees.find((e) => e.id === "s5").deduction = { graceMin: 29, quarterMin: 30, halfMin: 45, dayMin: 60 };

  const seedMin = [-10, 2, 5, -5, 9, 0, 12, -15, 3, 18, 7, 1, -8, 22, 4, 10, 35, 6, 14, 0, 8, 3, 64, 11, -3]; // minutes after 11:00 (negative = came early)
  const attendance = [];
  for (let d = 20; d >= 0; d--) {
    if (new Date(now - d * DAY).getDay() === 5) continue;
    employees.forEach((e, i) => {
      if (e.kind === "Part-time") return;
      const m = seedMin[(i * 3 + d * 7) % seedMin.length];
      attendance.push({ emp: e.id, day: dayKey(d), inMin: m, outAt: d === 0 ? null : "19:" + String(i % 6 * 7).padStart(2, "0"), status: "auto" });
    });
  }
  const today = dayKey(0);
  const setToday = (emp, patch) => { const a = attendance.find((x) => x.emp === emp && x.day === today); if (a) Object.assign(a, patch); };
  setToday("s2", { inMin: 27, status: "excuse" });
  setToday("s5", { inMin: 40, status: "visit", visitAt: "10:00" }); // Visit at 10, then came and punched at 11:40
  setToday("u9", { inMin: null, status: "forgot" });
  setToday("s6", { inMin: 75 });
  // a few days off without permission (they count in the ideal-employee score and as a day's deduction)
  [["s4", 3], ["u8", 6], ["s2", 8]].forEach(([emp, d]) => { const a = attendance.find((x) => x.emp === emp && x.day === dayKey(d)); if (a) Object.assign(a, { inMin: null, status: "absent" }); });
  // administrative penalties this month: anyone with one can't be the team's ideal employee
  const penalties = [{ emp: "s6", day: dayKey(4), text: "تجاوز في التعامل مع عميل", by: "u14" }];
  setToday("s3", { inMin: null, status: "outside" });
  const excuses = [{ emp: "s2", day: today, n: 3 }, { emp: "s2", day: dayKey(6), n: 2 }, { emp: "s2", day: dayKey(9), n: 1 }, { emp: "u11", day: dayKey(4), n: 1 }];
  const requests = [
    { id: "RQ-4", emp: "s3", kind: "شغل من بره", day: today, reason: "اجتماع عند العميل في زايد", status: "Approved", by: "u4" },
    { id: "RQ-5", emp: "s4", kind: "عذر غياب", day: dayKey(-1), reason: "ظرف عائلي", status: "Pending", by: "" },
    { id: "RQ-6", emp: "s2", kind: "شغل من بره", day: dayKey(-2), reason: "معاينة مع عميل", status: "Head Approved", by: "u4" }
  ];

  const oneQuestions = ["أكتر حاجة بتعطلك في الشغل؟", "محتاج تدريب في إيه؟", "تقييمك لنفسك الشهر ده؟", "إيه اللي محتاج يتغير في الفريق؟"];
  const oneOnOnes = [
    { emp: "s1", date: dayKey(31), answers: { "أكتر حاجة بتعطلك في الشغل؟": "التأخير في رفع الوحدات الجديدة", "محتاج تدريب في إيه؟": "Negotiation", "تقييمك لنفسك الشهر ده؟": "7/10", "إيه اللي محتاج يتغير في الفريق؟": "توزيع الليدز يبقى أوضح" }, action: "ترتيب تدريب Negotiation", actionDue: dayKey(1), actionDone: false },
    { emp: "s1", date: dayKey(62), answers: { "أكتر حاجة بتعطلك في الشغل؟": "ليدز من غير بيانات", "محتاج تدريب في إيه؟": "CRM", "تقييمك لنفسك الشهر ده؟": "6/10" }, action: "", actionDue: "", actionDone: false },
    { emp: "s4", date: dayKey(28), answers: { "أكتر حاجة بتعطلك في الشغل؟": "مفيش صور كفاية للوحدات", "محتاج تدريب في إيه؟": "Presentation", "تقييمك لنفسك الشهر ده؟": "8/10" }, action: "مراجعة مهام التصوير مع رحمة", actionDue: dayKey(-3), actionDone: false }
  ];
  const leaves = [
    { id: "LV-11", emp: "s3", type: "سنوية", from: dayKey(-3), to: dayKey(-4), reason: "سفر", status: "Pending TL", created: ago(60 * 30) },
    { id: "LV-12", emp: "s6", type: "عارضة", from: today, to: today, reason: "ظرف عائلي", status: "Approved by TL", created: ago(60 * 20) },
    { id: "LV-10", emp: "s1", type: "سنوية", from: dayKey(12), to: dayKey(10), reason: "إجازة", status: "Closed by HR", created: ago(60 * 24 * 15) },
    { id: "LV-13", emp: "u12", type: "مرضية", from: dayKey(2), to: dayKey(2), reason: "دور برد · مرفق تقرير", status: "Rejected", created: ago(60 * 24 * 3), rejectReason: "محتاجين التقرير الطبي الأصلي" }
  ];

  const tickets = [
    { id: "TK-71", from: "s1", dept: "Inventory", title: "محتاج صور U-103 الجديدة", priority: "عادية", status: "Open", created: ago(60 * 30), log: [{ at: ago(60 * 30), by: "s1", kind: "open", text: "اتفتحت للـ Inventory" }] },
    { id: "TK-72", from: "s2", dept: "HR", type: "excuse", title: "Excuse بكرة · ميعاد دكتور", priority: "عادية", status: "Closed", created: ago(60 * 20), firstReply: ago(60 * 18), log: [{ at: ago(60 * 20), by: "s2", kind: "open", text: "طلب Excuse" }, { at: ago(60 * 18), by: "u14", kind: "reply", text: "تمام، اتسجّل Excuse رقم 3 الشهر ده (خصم نص يوم)" }, { at: ago(60 * 17), by: "s2", kind: "close", text: "أكّد وقفل" }] },
    { id: "TK-73", from: "u11", dept: "Accounts", title: "فاتورة كامبين LinkedIn", priority: "عالية", status: "In Progress", created: ago(60 * 5), firstReply: ago(60 * 4), log: [{ at: ago(60 * 5), by: "u11", kind: "open", text: "محتاجة تحويل 52,000 لـ LinkedIn" }, { at: ago(60 * 4), by: "u18", kind: "reply", text: "محتاج الفاتورة الأصلية عشان تتحمّل على بند سبونسر لينكدان" }] },
    { id: "TK-74", from: "s5", dept: "Marketing", title: "تصميم عرض لـ Vertex Bank", priority: "عادية", status: "Open", created: ago(60 * 3), log: [{ at: ago(60 * 3), by: "s5", kind: "open", text: "عرض PDF بفرع كامل في Capital Gardens" }] },
    { id: "TK-70", from: "s4", dept: "Operations", title: "الليد L-1015 متكرر", priority: "عادية", status: "Resolved", created: ago(60 * 52), firstReply: ago(60 * 49), log: [{ at: ago(60 * 52), by: "s4", kind: "open", text: "نفس الرقم موجود مرتين" }, { at: ago(60 * 50), by: "u14", kind: "transfer", text: "اتحوّلت من HR لـ Operations" }, { at: ago(60 * 49), by: "u6", kind: "reply", text: "اتدمجوا في ليد واحد" }] }
  ];

  // a dispute between two salespeople, settled by the Office Manager (KPI: within 48h)
  tickets.push({ id: "TK-76", from: "s4", dept: "الإدارة", type: "dispute", title: "نزاع على عميل Nile Pharma مع زياد مدحت", priority: "عالية", status: "Resolved", created: ago(60 * 30), firstReply: ago(60 * 26), log: [{ at: ago(60 * 30), by: "s4", kind: "status", text: "اتفتحت" }, { at: ago(60 * 26), by: "u21", kind: "reply", text: "الليد يفضل مع يوسف لأنه اللي خلاه Interested، وزياد ياخد الجاي" }] });
  // Hadeer's outbound companies this week (KPI: 15 a week)
  ["Delta Labs", "Mazaya Clinics", "Orion Logistics", "Petra Design", "Nile Fintech", "Gemini Events", "Atlas Security", "Crown Pharma", "Zest Foods", "Cedar Tech", "Lotus Courses"].forEach((name, i) => companies.push({ name, cat: companyCats[i * 5 % companyCats.length], number: "0122" + String(3000000 + i * 17), date: dayKey(i % 6), outbound: true, by: "u5" }));
  const pendingCompanies = [{ name: "Arc Studio", lead: leads.find((l) => l.company === "Arc Studio").id, by: "s1" }];

  const accounts = [
    { name: "خزينة رئيسية", balance: 412000, kind: "خزينة" }, { name: "خزينة نانسي", balance: 38500, kind: "خزينة" }, { name: "خزينة مختار", balance: 21700, kind: "خزينة" },
    { name: "خزينة احمد اشرف", balance: 9800, kind: "خزينة" }, { name: "بنك CIB", balance: 2860000, kind: "بنك" }, { name: "بنك QNB", balance: 1145000, kind: "بنك" }, { name: "حساب Dopay", balance: 64300, kind: "محفظة" }
  ];
  // treasury movements (vouchers): pay · receive · transfer · advance · custody · settle; the balances above already include them
  const moves = [
    { id: "MV-108", at: ago(60 * 26), kind: "transfer", from: "بنك CIB", to: "خزينة رئيسية", amount: 50000, note: "سحب نقدية للمصروفات الأسبوعية", by: "u18" },
    { id: "MV-107", at: ago(60 * 30), kind: "pay", from: "بنك CIB", line: "ايجار", amount: 85000, party: "مالك المقر", note: "إيجار شهر نوفمبر", by: "u18" },
    { id: "MV-106", at: ago(60 * 50), kind: "custody", from: "خزينة رئيسية", party: "u16", amount: 15000, note: "عهدة مشتريات الأسبوع", by: "u18" },
    { id: "MV-105", at: ago(60 * 52), kind: "receive", to: "بنك QNB", amount: 120000, party: "Orbit Tech", source: "عمولة من عميل", note: "دفعة عمولة صفقة", by: "u18" },
    { id: "MV-104", at: ago(60 * 75), kind: "pay", from: "خزينة رئيسية", line: "بوفيه", amount: 2300, party: "Office Plus", note: "قهوة وسكر وشاي", by: "u18" },
    { id: "MV-103", at: ago(60 * 24 * 5), kind: "advance", from: "خزينة رئيسية", party: "s6", amount: 2000, note: "سلفة على المرتب", by: "u18" },
    { id: "MV-102", at: ago(60 * 24 * 6), kind: "settle", party: "u16", to: "خزينة مختار", amount: 9800, spent: 8300, line: "صيانات", returned: 1500, note: "تسوية عهدة الأسبوع اللي فات · 6 فواتير", by: "u18" }
  ];
  const custody = [{ emp: "u16", amount: 15000, date: dayKey(2) }, { emp: "u21", amount: 4000, date: dayKey(9) }];
  const advances = [{ emp: "s2", amount: 6000, date: dayKey(20) }, { emp: "u12", amount: 3500, date: dayKey(12) }, { emp: "s6", amount: 2000, date: dayKey(5) }];
  const expenses = {
    admin: [["ايجار", 85000], ["مرتبات ادارية", 210000], ["كهرباء", 9400], ["مياه", 1200], ["انترنت", 3200], ["اتصالات", 4100], ["بوفيه", 6100], ["صيانات", 4800], ["ادوات مكتبية", 2300], ["تامين طبي", 12500], ["تامينات اجتماعية", 26000]],
    selling: [["مرتبات مبيعات", 144000], ["سبونسر فيسوك", 71500], ["سبونسر لينكدان", 52000], ["google ads", 33000], ["بروبيرتي فايندر", 18500], ["CRM", 4200], ["Capcut", 600], ["business development", 9000]]
  };
  // the accountant's chart of accounts (4 Nov): expense lines in his order · "@" = commission computed from the deals · [parent, [sub-lines]]
  const chart = {
    admin: ["ايجار", "مرتبات ادارية", "بوفيه", "انتقالات", "انترنت", "اتصالات", "صيانات", "عمولات بنكية", "تبرعات", "هدايا", "ترفيه", "ايناس محاسب قانوني", "خالد محاسب قانوني", "محاماة", "شراء فواتير", "تامين طبي", "تامينات اجتماعية", "كهرباء", "مياه", "ادوات مكتبية", "مستلزمات المكتب", "نثريات"],
    selling: ["مرتبات مبيعات", "@عمولة مبيعات", "@عمولة اوبريشن", "@عمولات خارجية", "@عمولة تيم ليدر", "business development", "سبونسر فيسوك", "سبونسر لينكدان", "google ads", "lusha", "مصطفي لينكدان wolf egy", "CRM", "Sara website", "Zash", "ماركتينج", "Capcut", ["اشتراكات منصات و برامج", ["دوبيزل", "عقار ماب", "بروبيرتي فايندر"]]]
  };
  const flatLines = (k) => chart[k].flatMap((x) => (Array.isArray(x) ? x[1] : x[0] === "@" ? [] : [x]));
  ["admin", "selling"].forEach((k) => flatLines(k).forEach((nm) => { if (!expenses[k].some((x) => x[0] === nm)) expenses[k].push([nm, 0]); }));
  const monthly = [{ m: "أغسطس", rev: 7200000, exp: 690000 }, { m: "سبتمبر", rev: 9800000, exp: 742000 }, { m: "أكتوبر", rev: 0, exp: 0 }];
  const budgets = [
    { line: "ماركتينج", kind: "مصروفات بيعية", budget: 250000, spent: 181300 }, { line: "ادوات مكتبية", kind: "مصروفات إدارية", budget: 8000, spent: 2300 },
    { line: "صيانات", kind: "مصروفات إدارية", budget: 15000, spent: 4800 }, { line: "بروبيرتي فايندر", kind: "مصروفات بيعية", budget: 20000, spent: 18500 },
    { line: "اجهزة اخري", kind: "أصول ثابتة", budget: 60000, spent: 0 }, { line: "بوفيه", kind: "مصروفات إدارية", budget: 7000, spent: 6100 }
  ];
  const vendors = ["Raya", "Property Finder", "B.TECH", "Office Plus", "Vodafone Business", "Dubizzle"];
  const purchases = [
    { id: "PR-23", item: "شاشات عرض لقاعة الاجتماعات", amount: 72000, line: "اجهزة اخري", vendor: "Raya", attach: "quote-screens.pdf", status: "Pending", created: ago(60 * 5) },
    { id: "PR-21", item: "لابتوب Dell لسيلز جديد", amount: 30000, line: "اجهزة اخري", vendor: "Raya", attach: "quote-raya.pdf", status: "Pending", created: ago(60 * 3) },
    { id: "PR-24", item: "طلبات بوفيه الأسبوع (قهوة وسكر وشاي)", amount: 1000, line: "بوفيه", vendor: "Office Plus", attach: "", status: "Settled", approver: "u21", suggestedAccount: "خزينة مختار", settledAt: ago(60 * 2), settledBy: "u16", created: ago(60 * 26) },
    { id: "PR-22", item: "ورق وحبر للمكتب", amount: 1800, line: "ادوات مكتبية", vendor: "Office Plus", attach: "", status: "Pending", created: ago(60 * 1) },
    { id: "PR-20", item: "تجديد اشتراك بروبيرتي فايندر", amount: 1500, line: "بروبيرتي فايندر", vendor: "Property Finder", attach: "invoice-pf.pdf", status: "Paid", approver: "u21", account: "بنك CIB", created: ago(60 * 48), paidAt: ago(60 * 40) },
    { id: "PR-19", item: "قهوة وسكر للبوفيه", amount: 1400, line: "بوفيه", vendor: "Office Plus", attach: "", status: "Rejected", approver: "u18", rejectReason: "البند قرّب يخلص · اطلبها الشهر الجاي", created: ago(60 * 70) }
  ];
  const periods = [{ name: "أغسطس 2026", status: "مقفول شهرياً" }, { name: "سبتمبر 2026", status: "مقفول ربع سنوي" }, { name: "أكتوبر 2026", status: "مفتوح" }];


  /* roles & permissions: v view · c create · e edit · a approve · d delete/archive · x export. Tiers follow the meeting hierarchy. */
  const MODS = ["home", "leads", "deals", "settings", "clients", "contracts", "inventory", "notactive", "tasks", "marketing", "hr", "tickets", "finance", "procurement", "reports", "kpis", "access", "master", "integrations"];
  const spec = {
    admin: { tier: "Super Admin", scope: "all", p: Object.assign(Object.fromEntries(MODS.map((m) => [m, "vceadix"])), { finance: "vx", hr: "vx" }) },
    officemgr: { tier: "Office Manager", scope: "all", p: { home: "v", leads: "v", deals: "veadx", clients: "v", contracts: "v", reports: "vceax", access: "vceadix", master: "ve", tickets: "vce" } },
    opshead: { tier: "Operations Head", scope: "all", p: { home: "v", leads: "vx", settings: "ve", clients: "vce", contracts: "v", inventory: "vx", tasks: "vcead", marketing: "v", tickets: "vce", reports: "vx", access: "v", master: "ve", integrations: "v" } },
    salesdir: { tier: "Sales Director", scope: "dept", p: { home: "v", leads: "vceadix", deals: "vcex", settings: "ve", clients: "vcex", contracts: "vx", marketing: "v", tickets: "vce", reports: "vcex" } },
    tl: { tier: "Team Leaders", scope: "team", p: { home: "v", leads: "vce", deals: "v", hr: "va", tickets: "vce", clients: "v", reports: "v" } },
    sales: { tier: "Executive Staff", scope: "own", p: { home: "v", leads: "vce", deals: "vc", inventory: "v", tickets: "vce", clients: "v", contracts: "vc" } },
    telesales: { tier: "Executive Staff", scope: "own", p: { home: "v", leads: "vcei", tickets: "vce" } },
    ops: { tier: "Executive Staff", scope: "all", p: { home: "v", leads: "vceaix", settings: "v", clients: "vce", tickets: "vce", master: "v" } },
    inventory: { tier: "Department Head", scope: "dept", p: { home: "v", inventory: "vceadix", notactive: "vceadix", tasks: "vcea", tickets: "vce", master: "ve", reports: "v" } }, // no clients & owners for the Inventory Manager
    resale: { tier: "Executive Staff", scope: "dept", p: { home: "v", inventory: "vce", tasks: "vce", clients: "vce", tickets: "vce" } },
    marketing: { tier: "Department Head", scope: "dept", p: { home: "v", marketing: "vceadx", tasks: "vce", inventory: "v", tickets: "vce", reports: "v", integrations: "v", master: "ve" } },
    photographer: { tier: "Executive Staff", scope: "own", p: { home: "v", tasks: "ve", tickets: "vce" } },
    designer: { tier: "Executive Staff", scope: "own", p: { home: "v", tasks: "ve", tickets: "vce" } },
    hr: { tier: "Department Head", scope: "all", p: { home: "v", hr: "vceadix", tickets: "vce", access: "vc", master: "ve", reports: "vc" } },
    accountant: { tier: "Department Head", scope: "all", p: { home: "v", deals: "ve", finance: "vceaix", procurement: "vx", contracts: "vceax", tickets: "vce", reports: "vx", master: "ve" } },
    procurement: { tier: "Executive Staff", scope: "own", p: { home: "v", procurement: "vce", tickets: "vce" } },
    inventory_staff: { tier: "Executive Staff", scope: "own", p: { home: "v", inventory: "v", notactive: "ve", tickets: "vce" } },
    approver: { tier: "Super Admin", scope: "all", p: { home: "v", procurement: "va", finance: "v" } }
  };
  const perms = Object.fromEntries(Object.entries(spec).map(([r, x]) => [r, { tier: x.tier, scope: x.scope, p: Object.fromEntries(MODS.map((m) => [m, x.p[m] || ""])) }]));
  Object.entries(perms).forEach(([r, x]) => { x.p.kpis = ["admin", "officemgr"].includes(r) ? "vceadix" : "v"; });
  // accounts: every person signs in with their own email. shortcut: demo hash in the browser; the real build hashes on the server (bcrypt)
  const pwHash = (pw) => { let h = 5381; for (const c of "places|" + pw) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return "h" + h.toString(36); };
  window.PWHASH = pwHash;
  const DEMO_PASSWORD = "Places@2026"; // every demo account starts with this; the login screen fills it for the demo accounts
  const slug = { u1: "ahmed.islam", u2: "m.safwat", u4: "abdallah.sleem", u19: "mahmoud.ali", u23: "abdelrahman.younes", u24: "mostafa.ezzat", s1: "m.mohsen", s2: "m.eid", s3: "omar.gamal", s4: "youssef.safwat", s5: "ziad.medhat", s6: "m.khaled", s7: "ahmed.khaled", s8: "salah.eldin", s9: "m.mamdouh", s10: "abdelrahman.salah", s11: "ibrahim.samir", s12: "anas", s13: "m.samy", s14: "ahmed.amr", s15: "ahmed.medhat", s16: "youssef.hosny", s17: "ahmed.ali", s18: "ahmed.younes", u5: "hadeer.tarek", u6: "heba.salah", u7: "manar.ahmed", u8: "randa.mohamed", u9: "sara.abdelhalim", u10: "marwa.mostafa", u11: "rahma.hassan", u12: "abdelrahman.bayoumi", u14: "basant.elsawy", u16: "mokhtar.gamal", u18: "ahmed.ashraf", u21: "nancy.islam" };
  const users = people.map((p, i) => ({ id: p.id, role: p.role, extraRoles: ({ u4: ["sales"], u21: ["approver"], u18: ["approver"] })[p.id] || [], active: true, status: "active", email: (slug[p.id] || p.id) + "@places.com", phone: "010" + String(10000000 + i * 7919).slice(-8), pw: pwHash(DEMO_PASSWORD), pwChangedAt: ago(60 * 24 * (20 + i)), failed: 0, lastLogin: ago(30 + i * 47), twofa: false, endDate: "", overrides: {} }));
  // one invited account that hasn't been activated yet, to show the activation e-mail
  const mails = [];
  users.find((u) => u.id === "u10").active = true;
  const audit = [
    { at: ago(15), by: "u7", mod: "inventory", text: "اتعدّل سعر المتر في U-102 من 1,000 لـ 1,050" },
    { at: ago(60), by: "u21", mod: "deals", text: "وافق على الصفقة D-304" },
    { at: ago(120), by: "u1", mod: "access", text: "إدّى «تعديل» لسارة إبراهيم على الانفنتوري" },
    { at: ago(300), by: "u14", mod: "hr", text: "أكّدت خصم يوم لسارة إبراهيم (نسيان بصمة)" }
  ];
  const holidays = [{ from: dayKey(-6), to: dayKey(-6), name: "إجازة رسمية · 6 أكتوبر (تعويضي)" }, { from: dayKey(-38), to: dayKey(-41), name: "عيد (مثال · 4 أيام)" }];
  const leaveTypes = [{ name: "سنوية", days: 21 }, { name: "عارضة", days: 6 }, { name: "مرضية", days: 15 }];
  // targets are in commission shares (what counts in a salesperson's target), not deal values
  const targets = Object.fromEntries(SALES.map((id, i) => [id, { value: [60000, 60000, 80000, 70000, 60000, 50000][i] || 50000, deals: [3, 3, 2, 3, 2, 3][i] || 2, visits: 12 }]));
  // Not Active Inventory: an uploaded sheet (CFC). shortcut: demo columns until the client sends the real CFC columns
  const naSheets = [{ id: "CFC", name: "CFC", key: "unit", cols: [["unit", "رقم الوحدة"], ["owner", "اسم المالك"], ["number", "الرقم"], ["area", "المنطقة"], ["space", "المساحة"], ["note", "ملاحظة"]],
    rows: [["C-201", "أ. سامح", "01055501201", "التجمع الخامس", 120, "إداري"], ["C-202", "م. رشا", "01055501202", "الشيخ زايد", 85, ""], ["C-203", "أ. كمال", "01000000102", "التجمع الخامس", 110, "نفس رقم مالك عندنا"], ["C-204", "د. هالة", "01055501204", "أكتوبر", 200, "عيادة"], ["C-205", "أ. فريد", "01055501205", "المعادي", 75, ""], ["C-206", "م. سلوى", "01055501206", "مدينة نصر", 160, ""], ["C-207", "أ. ماهر", "01055501207", "العاصمة الإدارية", 300, "تنفع تتقسم"], ["C-208", "أ. نجلاء", "01055501208", "التجمع الخامس", 90, ""]]
      .map(([unit, owner, number, area, space, note], i) => ({ id: "NA-" + (i + 1), d: { unit, owner, number, area, space, note }, status: i === 5 ? "No Answer" : i === 6 ? "Not True" : "", feedback: i === 6 ? "مش صاحب الوحدة · الوحدة باسم أخوه" : "", to: i >= 4 ? "u10" : "", dup: number === "01000000102" ? "U-102" : "" })) }];
  const tlTiers = [{ upTo: 70, pct: 4 }, { upTo: 100000, pct: 6 }]; // team achievement below 70% → 4%, otherwise 6% (the client's example)
  // every report: sent by the system (auto) or handed in by a person (handin) · freq daily|weekly|monthly|quarterly, day = weekday 0–6 or day of month
  const schedReports = [
    { id: "SR-1", on: true, kind: "auto", name: "أداء السيلز الأسبوعي", freq: "weekly", day: 0, time: "09:00", fmt: "PDF", to: { to: ["tl", "u1"], ch: ["app", "email"] } },
    { id: "SR-2", on: true, money: true, kind: "auto", name: "قايمة الدخل الشهرية", freq: "monthly", day: 1, time: "09:00", fmt: "Excel", to: { to: ["u1", "u2", "u18"], ch: ["email"] } },
    { id: "SR-3", on: true, kind: "auto", name: "Weekly Delay", freq: "weekly", day: 4, time: "17:00", fmt: "Excel", to: { to: ["hr"], ch: ["app", "email"] } },
    { id: "SR-4", on: true, kind: "handin", name: "التقرير اليومي للقادة", freq: "daily", day: 0, time: "11:30", fmt: "جوه السيستم", by: ["u6"], to: { to: ["u1", "salesdir", "tl"], ch: ["app"] }, remindMin: 60, late: { to: ["u21"], ch: ["app"] } },
    { id: "SR-5", on: true, kind: "handin", name: "التقرير الأسبوعي للقادة", freq: "weekly", day: 4, time: "15:00", fmt: "PDF", by: ["u6"], to: { to: ["u1", "salesdir", "tl"], ch: ["app", "email"] }, remindMin: 120, late: { to: ["u21"], ch: ["app"] } },
    { id: "SR-6", on: true, kind: "handin", name: "تقرير الانفنتوري اليومي (جديد / متحدّث / اتأجر / مش مؤكد)", freq: "daily", day: 0, time: "13:00", fmt: "جوه السيستم", by: ["u7"], to: { to: ["u2", "u21"], ch: ["app"] }, remindMin: 60, late: { to: ["u21"], ch: ["app"] } },
    // every team member's daily report: the system fills what it knows, they type the rest; it adds up into their KPIs
    { id: "SR-8", on: true, daily: true, kind: "handin", name: "التقرير اليومي", freq: "daily", day: 0, time: "18:00", fmt: "جوه السيستم", by: ["sales", "telesales", "ops", "inventory", "inventory_staff", "resale", "marketing", "photographer", "designer", "hr", "accountant", "procurement", "officemgr", "tl"], to: { to: ["u6", "follower"], ch: ["app"] }, remindMin: 60, late: { to: ["follower"], ch: ["app"] } },
    { id: "SR-7", on: true, kind: "handin", name: "تقرير المنافسين الشهري", freq: "monthly", day: 30, time: "17:00", fmt: "PDF", by: ["u11"], to: { to: ["u1"], ch: ["app", "email"] }, remindMin: 1440, late: { to: ["u1"], ch: ["app"] } }
  ];
  // every lead rule the system runs on, editable from «قواعد الليدز» · who: roles, people ids, or "owner" (the lead's salesperson)
  const leadRules = {
    work: { from: 660, to: 1140, off: [5] }, // SLA clock: minutes from midnight, Friday off
    sla: { on: true, warnMin: 150, pullMin: 180, holWarnMin: 1320, holPullMin: 1440, warn: { to: ["tl", "salesdir"], ch: ["app", "push", "email"] }, pull: { to: ["ops", "salesdir"], ch: ["app", "push", "email"] } },
    newLead: { to: ["owner", "tl"], ch: ["app", "push"] },
    noAnswer: { hours: 24, remindH: 4, toTelesalesAt: 3, telesales: "u5", notify: { to: ["telesales"], ch: ["app", "push"] } },
    visit: { postpone: { to: ["ownerTl"], ch: ["app", "push"] }, postponeInfo: { to: ["u6"], ch: ["app"] }, notDone: { to: ["hr"], ch: ["app", "email"] } },
    close: { alarmH: 24, notify: { to: ["officemgr", "admin"], ch: ["app", "push", "email"] } },
    draftAdmin: { on: true, see: { to: ["u6"], ch: [] }, notify: { to: ["u6"], ch: ["app"] } }, // every Not Interested / Cancellation lands here for Heba
    draft: { on: true, days: 7, holdDays: 14, see: { to: ["u6"], ch: [] }, notify: { to: ["u6", "owner"], ch: ["app", "push"] } } // idle leads leave the salesperson
  };
  const notifRules = [
    // lead events (new lead, SLA, pull, No Answer, Visit, Done Deal Alarm) live in leadRules
    { ev: "Excuse / الخامس", to: "الـ HR · الإدارة", ch: ["app", "push", "email"] },
    { ev: "طلب شراء", to: "المعتمدين", ch: ["app", "push", "email"] }, { ev: "Reminder بوست", to: "التسويق", ch: ["app", "push"] }, { ev: "تجديد عقد (90/60/30)", to: "السيلز · المالية", ch: ["app", "email"] }
  ];
  const interactions = [];
  const notifications = [
    { at: ago(5), to: ["telesales"], text: "شركة جديدة «Arc Studio» اتضافت في ليد · محتاجة تتضاف لشيت الشركات" },
    { at: ago(20), to: ["hr"], text: "Alarm: يوسف خالد عمل Excuse رقم 3 الشهر ده · خصم نص يوم" },
    { at: ago(30), to: ["marketing"], text: "وحدة جديدة U-106 اتضافت للانفنتوري · جاهزة للتصوير" },
    { at: ago(45), to: ["salesdir", "admin"], text: "Alarm: الصفقة D-305 اتعملت واتقفلت تاني يوم · محتاجة مراجعة" }
  ];

  // KPI cards Q4 2026, from the client's file (Places_KPIs_Q4_2026.pdf). One row per item:
  // [item, weight %, target as written, source, how (a = system measures it · d = the person hands it in · m = the follower enters it), module, goal, dir (min = at least · max = at most), demo value, live metric]
  // "need" on hand-in items is how many times it's due in the quarter so far; the demo value is how many were on time.
  const K = (by, rows) => ({ by, items: rows.map(([t, w, target, src, how, mod, goal, dir, val, m]) => Object.assign({ t, w, target, src, how, mod, goal, dir: dir || "min", val }, m ? { m } : {}, how === "d" ? { need: goal, goal: 100, done: val } : {})) });
  const ATT = ["الحضور (5% غياب + 5% تأخير)", 10, "حسب اللائحة", "البصمة", "a", "M-05", 95, "min", 0, "att"];
  const kpis = { q: "2026-Q4", label: "Q4 2026", status: "open", approved: {}, cards: {
    u1: K("owners", [
      ["تحقيق تارجت الشركة الربعي", 40, "≥70% في Q4 2026 · ≥80% من Q1 2027", "شيت التحصيل", "a", "M-02", 70, "min", 0, "company"],
      ["متابعة الصفقات والتنفيذ في الميعاد", 15, "≥90% من قيمة الصفقات", "تقرير المالية الشهري", "a", "M-02", 90, "min", 86, "dealExec"],
      ["متوسط تقييم القادة الأربعة + رحمة", 15, "≥80%", "ملف الـ KPIs", "a", "M-12", 80, "min", 0, "team"],
      ["الاجتماع الأسبوعي مع القادة ورحمة + One-to-One شهري", 10, "الالتزام بالمواعيد اللي نانسي بتحددها", "تقرير نانسي الأسبوعي", "m", "", 100, "min", 90],
      ["الميزانية", 10, "الالتزام بالموازنة المعتمدة كل ربع", "تقرير المالية", "a", "M-07", 100, "max", 96],
      ["مواضيع مبيعات وصلته من غير القائد", 10, "صفر", "تقرير نانسي الأسبوعي", "m", "", 0, "max", 1]]),
    u2: K("owners", [
      ["نسبة الوحدات المتحقق منها خلال 30 يوم", 25, "≥80%", "شيت الإنفنتوري", "a", "M-03", 80, "min", 0, "verified"],
      ["التزام الـ SLAs بين الإدارات", 25, "≥90%", "نموذج الطلبات", "a", "M-06", 90, "min", 0, "tickets"],
      ["نمو الوحدات النشطة (متاحة + متحقق منها)", 20, "+10% كل ربع", "تقرير منار", "a", "M-03", 10, "min", 7],
      ["إقفال الديلات (الليدز المؤهلة) فوق 500 متر", 15, "70% (خط الأساس من أكتوبر)", "الـ CRM", "a", "M-01", 70, "min", 64],
      ["أورينتيشن لفريق المبيعات", 15, "أول وتالت اتنين في الشهر", "تنسيق نانسي", "m", "", 100, "min", 100]]),
    u21: K("u2", [
      ["التزام الإدارات الداعمة بالـ SLAs", 20, "≥90%", "نموذج الطلبات", "a", "M-06", 90, "min", 0, "tickets"],
      ["حسم النزاعات", 15, "100% خلال 48 ساعة", "سجل النزاعات", "a", "M-06", 100, "min", 100, "disputes"],
      ["إصدار وإرسال ملف التارجت الفصلي (مع بنود المكافآت)", 15, "100% في أول يوم عمل من الربع", "تاريخ الإرسال", "d", "M-12", 1, "", 1],
      ["دقة أوراق الصفقات (عقود، تفويضات، تسجيل)", 15, "صفر أخطاء", "مراجعة المالية", "a", "M-02", 0, "max", 0, "paperErrors"],
      ["تنفيذ خطة الـ 90 يوم", 15, "≥90% من البنود في ميعادها", "تقرير التقدم الأسبوعي", "d", "", 8, "", 7],
      ["متوسط KPIs فريقها (هبة، منار، مختار، بسنت)", 10, "≥80%", "تقييماتهم", "a", "M-12", 80, "min", 0, "team"], ATT]),
    u18: K("u1", [
      ["صرف المرتبات في أول 5 أيام من الشهر", 20, "100%", "كشف البنك", "a", "M-07", 100, "min", 100],
      ["حساب العمولة في نفس يوم ظهور التحصيل", 25, "100%", "كشف الحساب مقابل شيت العمولات", "a", "M-02", 100, "min", 92],
      ["دقة حساب العمولات", 15, "صفر تصحيحات بعد الاعتماد", "مراجعة نانسي", "a", "M-02", 0, "max", 0],
      ["التقرير المالي الشهري قبل يوم 5", 10, "100%", "تاريخ التسليم", "d", "M-07", 2, "", 2],
      ["تسوية العهدة الأسبوعية", 10, "كل أسبوع، صفر فروقات", "محضر التسوية", "d", "M-08", 8, "", 7],
      ["الفواتير الإلكترونية في مواعيدها", 5, "100%", "تأكيد يدوي", "m", "", 100, "min", 100],
      ["الحضور الثابت (الاتنين والخميس 17:00–19:00) والمواعيد", 15, "100%", "سجل الحضور وسجل التسليمات", "a", "M-05", 100, "min", 94]]),
    u14: K("u21", [
      ["تسجيل الحضور قبل 12 والجزاءات في نفس اليوم", 20, "100%", "سجل المخالفات مقابل البصمة", "a", "M-05", 100, "min", 97],
      ["شيت المرتبات للمالية يوم 30 + صندوق الخصومات", 15, "100%", "مراجعة المالية", "d", "M-07", 2, "", 2],
      ["One-to-One meetings ومتابعة المواعيد الثابتة", 10, "مع كل الموظفين مرة في الشهر", "ملف One-to-One feedback", "a", "M-05", 90, "min", 85],
      ["تنفيذ خطة التدريب الربعية + الترفيه", 15, "≥90% من الجلسات", "سجل التدريب", "d", "M-05", 6, "", 5],
      ["تسجيل الإكسكيوز والإجازات يومياً", 10, "100%", "سجل HR", "a", "M-05", 100, "min", 100],
      ["تطبيق جزاءات التصرفات المهمة + التخطي", 5, "100% في ميعادها", "شيت الخصومات", "a", "M-05", 100, "min", 100],
      ["تحديث المسار الوظيفي", 10, "100% في ميعاده الخميس", "ملف الموظفين + مراجعة نانسي", "d", "M-05", 8, "", 6],
      ["HR Letters والتأمينات خلال 24 ساعة", 5, "≥95%", "نموذج الطلبات", "a", "M-06", 95, "min", 100], ATT]),
    u11: K("u1", [
      ["عدد الليدز المؤهلة (مش إجمالي الليدز)", 20, "+15% كل ربع عن أكتوبر", "الـ CRM (بطاقات هدير)", "a", "M-01", 15, "min", 11],
      ["إعلانات الويبسايت", 20, "25 إعلان يومياً", "الويبسايت (متربط بالسيستم)", "a", "M-04", 25, "min", 22, "webAds"],
      ["الالتزام بالخطة الشهرية (محتوى + حملات) + Daily Report", 20, "≥90%", "Content Calendar", "a", "M-04", 90, "min", 92],
      ["الـ Broadcast في مواعيده (يومين في الأسبوع) + Hot Inventory", 10, "100%", "جروب السيلز", "a", "M-04", 100, "min", 88],
      ["تسجيل توقيت وصول كل ليد على واتساب الحملة", 5, "100%", "واتساب الحملة مقابل الـ CRM", "a", "M-01", 100, "min", 100],
      ["التزام الـ SLA (تصميم 48 ساعة)", 5, "≥90%", "نموذج الطلبات", "a", "M-04", 90, "min", 93],
      ["تقرير المنافسين الشهري", 5, "كل شهر يوم 30", "شيت المنافسين", "d", "M-04", 2, "", 1],
      ["متوسط KPIs فريقها (بيومي)", 5, "≥80%", "تقييمه", "a", "M-12", 80, "min", 0, "team"], ATT]),
    u12: K("u11", [
      ["تصوير الوحدات الجديدة خلال 72 ساعة", 35, "≥90%", "نموذج الطلبات", "a", "M-04", 90, "min", 86],
      ["تسليم المواد متعدّلة خلال 48 ساعة", 25, "≥90%", "Drive", "a", "M-04", 90, "min", 91],
      ["تنفيذ خطة التصوير الأسبوعية", 20, "100%", "مراجعة رحمة", "m", "", 100, "min", 90],
      ["جودة المواد (اتقبلت من أول مرة)", 10, "≥85%", "مراجعة رحمة", "m", "", 85, "min", 88], ATT]),
    u6: K("u21", [
      ["توزيع الليد المؤهل خلال 30 دقيقة", 25, "≥95% من الليدز", "توقيتات الـ CRM", "a", "M-01", 95, "min", 97, "newLeadRoute"],
      ["التقرير اليومي للقادة قبل 11:30 + الأسبوعي الخميس", 15, "≥95% من أيام الشغل", "جروب القادة", "d", "M-01", 40, "", 38],
      ["سحب الليدز المخالفة أوتوماتيك حسب اللائحة", 15, "قرار على كل ليد في الـ Draft والـ Draft Admin خلال يومه (100%)", "الـ Draft والـ Draft Admin", "a", "M-01", 100, "min", 0, "draftAction"],
      ["مكالمات التحقق (Second Calls)", 15, "كل ليدز اليوم في نفس اليوم (100%)", "الليدز اللي دخلت النهارده", "a", "M-01", 100, "min", 0, "secondCalls"],
      ["دقة الأرقام المنشورة", 10, "تقييم نانسي (100%)", "نانسي بتقيّم دقة الأرقام", "m", "", 100, "min", 100],
      ["تسليم بيانات العرض الشهري", 10, "تقييم نانسي (100%)", "نانسي بتقيّم التسليم (قبل الاجتماع بـ 48 ساعة)", "m", "", 100, "min", 90], ATT]),
    u5: K("u21", [
      ["أول اتصال بالليد خلال 30 دقيقة", 25, "≥90%", "واتساب الحملة مقابل الـ CRM", "a", "M-01", 90, "min", 0, "call30"],
      ["عدد المكالمات اليومية", 15, "100 مكالمة في اليوم", "سجل المكالمات", "a", "M-01", 100, "min", 84],
      ["ليدز مؤهلة متسلّمة", 20, "يتحدد بعد قياس أكتوبر", "الـ CRM", "a", "M-01", 40, "min", 0, "qualifiedN"],
      ["شيت الشركات متحدّث أسبوعياً", 15, "100%", "مراجعة هبة", "m", "M-01", 100, "min", 100],
      ["شركات جديدة Outbound + إنفنتوري", 15, "15 شركة + 8 وحدات إنفنتوري أسبوعياً (في الأيام اللي مفيش فيها كامبين)", "شيت الشركات والـ CRM", "a", "M-01", 15, "min", 12, "outbound"], ATT]),
    u7: K("u21", [
      ["نسبة الوحدات المتحقق منها خلال 30 يوم", 25, "≥80%", "شيت الإنفنتوري", "a", "M-03", 80, "min", 0, "verified"],
      ["عدد الإنفنتوري الجديد في الربع", 15, "100 وحدة في الربع", "شيت الإنفنتوري + تقرير هبة", "a", "M-03", 100, "min", 62],
      ["إدخال الوحدات الجديدة خلال 24 ساعة", 10, "≥95%", "تقرير هبة مقابل الشيت والواتساب", "a", "M-03", 95, "min", 96, "in24"],
      ["التزام فريقها بالـ SLAs (Lists، معاينات)", 10, "≥90%", "نموذج الطلبات", "a", "M-06", 90, "min", 87],
      ["التقرير اليومي (جديد / متحدّث / اتأجر / مش مؤكد)", 10, "كل يوم في ميعاده", "تاريخ التسليم", "d", "M-03", 40, "", 39],
      ["صفر تكرار في قاعدة البيانات", 10, "≤1% سجلات مكررة", "مراجعة شهرية", "a", "M-03", 1, "max", 0.4],
      ["متوسط KPIs فريقها (رندا، سارة، مروة)", 10, "≥80%", "تقييماتهم", "a", "M-12", 80, "min", 0, "team"], ATT]),
    u8: K("u7", [
      ["مفيش وحدة Resale / Primary تعدّي شهر من غير ابديت", 30, "95% من وحداتها", "شيت الإنفنتوري (آخر تحديث)", "a", "M-03", 95, "min", 0, "resaleFresh"],
      ["عدد الإنفنتوري الجديد في الربع", 15, "100 وحدة", "شيت الإنفنتوري", "a", "M-03", 100, "min", 46],
      ["إدخال وحدات Resale / Primary خلال 24 ساعة + PDF", 20, "≥95%", "توقيت الواتساب مقابل الشيت", "a", "M-03", 95, "min", 92, "in24"],
      ["جدولة المعاينات + صفر تكرار في الشيت", 15, "100%", "نموذج الطلبات + مراجعة منار", "m", "M-03", 100, "min", 100],
      ["تنسيق أماكن التصوير في نفس اليوم", 10, "100% مع بيومي", "مهام التصوير", "a", "M-04", 100, "min", 95], ATT]),
    u9: K("u7", [
      ["مهام منار اليومية (حد أقصى 30 في اليوم)", 30, "≥95%", "شيت الإنفنتوري (اللينك + التوقيت)", "a", "M-03", 95, "min", 96],
      ["الرفع على Drive خلال 24 ساعة من الإدخال", 25, "≥95%", "Drive مقابل الشيت", "a", "M-03", 95, "min", 93, "drive24"],
      ["الجودة: صفر تكرار", 15, "≤1% سجلات مكررة", "مراجعة منار الشهرية", "m", "M-03", 1, "max", 0.5],
      ["تحديث قالب الـ List يومياً", 20, "يومياً خلال 24 ساعة", "تاريخ التسليم", "d", "M-03", 40, "", 40], ATT]),
    u10: K("u7", [
      ["مهام منار اليومية (حد أقصى 30 في اليوم)", 30, "≥95%", "توقيت الواتساب مقابل الشيت / Drive", "a", "M-03", 95, "min", 97],
      ["طلبات الـ Team Leaders من الـ Lists خلال 24 ساعة", 25, "≥90%", "Team Leaders", "a", "M-06", 90, "min", 89, "lists24"],
      ["الجودة: صفر وحدات مش مؤكدة في أي List", 20, "100%", "مراجعة منار", "a", "M-03", 100, "min", 100, "listsClean"],
      ["جلسة تغذية راجعة شهرية مع فريق المبيعات", 15, "مرة في الشهر", "محضر الجلسة", "d", "", 2, "", 1], ATT]),
    u16: K("u21", [
      ["تنفيذ طلبات الشراء والصيانة خلال 48 ساعة", 30, "≥90%", "نموذج الطلبات", "a", "M-08", 90, "min", 88, "proc48"],
      ["مصروفات بإيصال / عرضين أسعار فوق 10,000", 25, "100%", "تسوية المالية", "a", "M-08", 100, "min", 0, "receipts"],
      ["الالتزام بسقف العهدة", 10, "100%", "تسوية المالية", "a", "M-08", 100, "min", 100, "pettyCap"],
      ["جودة خدمات المكتب (جدول الـ Office Boys)", 15, "≥90% التزام", "مراجعة نانسي", "m", "", 90, "min", 92],
      ["سجل أصول المكتب متحدّث", 10, "مراجعة شهرية", "السجل", "d", "M-08", 2, "", 2],
      ["تنفيذ المهام اللي الإدارة بتديهاله", 10, "حسب المهام", "تقرير نانسي", "m", "", 100, "min", 95]])
  } };
  // "the four leaders" on the CEO's card are the Team Leaders, plus Rahma
  kpis.cards.u1.items[2].ids = ["u4", "u19", "u23", "u24", "u11"];
  // what the result moves: salary or the quarter bonus, monthly or per quarter (set per person by management). amount = the base it's taken from
  const PAY = { u1: ["bonus", "quarter", 30000], u2: ["bonus", "quarter", 30000], u21: ["bonus", "quarter", 15000], u18: ["salary", "month", 20000], u14: ["bonus", "quarter", 8000], u11: ["bonus", "quarter", 10000], u12: ["salary", "month", 9000], u6: ["salary", "month", 10000], u5: ["salary", "month", 8000], u7: ["bonus", "quarter", 10000], u8: ["salary", "month", 9000], u9: ["salary", "month", 8000], u10: ["salary", "month", 8000], u16: ["bonus", "quarter", 8000] };
  Object.entries(PAY).forEach(([id, [base, period, amount]]) => (kpis.cards[id].pay = { base, period, amount }));
  // sales card (client, one template for every salesperson), followed by their Team Leader. Demo values vary per person
  SALES.forEach((id, i) => {
    const p = people.find((x) => x.id === id), v = (lo, hi) => lo + ((i * 7 + 3) % (hi - lo + 1));
    kpis.cards[id] = K(p.tl, [
      ["التارجت", 40, "التارجت الخاص بكل بياع", "شيت التحصيل (نصيبه من الكوميشن)", "a", "M-02", 100, "min", v(58, 104), "ownTarget"],
      ["Showings (معاينات)", 10, "30 في الربع", "الـ CRM (الزيارات اللي اتعملت)", "a", "M-01", 30, "min", v(18, 34)],
      ["Meetings", 10, "15 في الربع", "الـ CRM (مراحل الـ Meeting)", "a", "M-01", 15, "min", v(8, 17)],
      ["Inventory (وحدات جابها)", 10, "30 وحدة في الربع", "شيت الإنفنتوري (الـ Agent بتاع الوحدة)", "a", "M-03", 30, "min", v(14, 32)],
      ["Farming", 10, "1 أسبوعياً", "نشاطات الـ Farming اللي سجّلها واتعملت", "a", "M-01", 1, "min", 0, "activitiesDone"],
      ["Calls & Broadcast", 10, "50 مكالمة أسبوعياً + Broadcast", "سجل المكالمات + الـ Broadcast", "a", "M-01", 50, "min", v(34, 58)],
      ["الحضور (5% غياب + 5% تأخير)", 10, "غياب لحد 5 أيام في الربع + تأخير لحد 6 ساعات في الشهر", "البصمة", "a", "M-05", 100, "min", 0, "attSales"]]);
    kpis.cards[id].pay = { base: "bonus", period: "quarter", amount: 6000 };
    kpis.cards[id].items[4].p = { akind: "Farming", per: "quarter", avg: "week" };
  });
  // Farming / Approach the salespeople logged: most went out every week or so; Ziad has one waiting to be reported and one later today
  const activities = [];
  SALES.forEach((id, i) => {
    for (let w = 1; w <= 3 + (i % 5); w++) activities.push({ id: `AC-${id}-${w}`, by: id, kind: "Farming", place: pick(areas), at: at(w * 7 - 2 + (i % 3), 12, 0), status: "done", doneAt: at(w * 7 - 2 + (i % 3), 15, 0), result: { got: w % 2 === 0, note: w % 2 === 0 ? "مبنى جديد فيه 3 أدوار إداري · اتكلمت مع البواب" : "مفيش حاجة جديدة في المنطقة" } });
    if (i % 2 === 0) activities.push({ id: `AC-${id}-a`, by: id, kind: "Approach", place: pick(areas), at: at(10 + i % 4, 13, 0), status: "done", doneAt: at(10 + i % 4, 16, 0), result: { companies: ["Nile Pharma", "Cairo Dental Hub"].slice(0, 1 + (i % 2)) } });
  });
  activities.push({ id: "AC-s5-y", by: "s5", kind: "Farming", place: "العاصمة الإدارية · R7", at: at(1, 12, 0), status: "planned" }, { id: "AC-s5-t", by: "s5", kind: "Approach", place: "التجمع الخامس · Point 90", at: at(0, 17, 0), status: "planned" });
  kpis.cards.u8.items[2].only = ["Resale", "Income"];
  // RECA TECH (until the client decides): the quarter bonus defaults to one month's salary for whoever has one
  Object.entries(kpis.cards).forEach(([id, c]) => { const e = employees.find((x) => x.id === id); if (c.pay && c.pay.base === "bonus" && e && e.salary) c.pay.amount = e.salary; });
  // next quarter's Team Leader card: RECA TECH's draft (the client said TL KPIs start next quarter)
  kpis.drafts = Object.fromEntries(["u4", "u19", "u23", "u24"].map((id) => [id, K("u1", [
    ["تحقيق تارجت الفريق", 40, "100% من تارجت الفريق", "شيت التحصيل (مجموع تارجت سيلز الفريق)", "a", "M-02", 100, "min", 0, "teamTarget"],
    ["متوسط KPIs سيلز الفريق", 20, "≥80%", "كروت السيلز", "a", "M-12", 80, "min", 0, "team"],
    ["التزام الفريق بالـ SLA (أول أكشن خلال ساعتين ونص)", 10, "≥90% من الليدز", "الـ CRM", "a", "M-01", 90, "min", 88],
    ["One-to-One شهري مع كل سيلز في الفريق", 10, "مرة في الشهر لكل واحد", "ملف One-to-One feedback", "d", "M-05", 3, "", 2],
    ["Showings الفريق", 10, "متوسط 30 لكل بياع في الربع", "الـ CRM", "a", "M-01", 30, "min", 26],
    ["الحضور (5% غياب + 5% تأخير)", 10, "غياب لحد 5 أيام في الربع + تأخير لحد 6 ساعات في الشهر", "البصمة", "a", "M-05", 100, "min", 0, "attSales"]])])); // Randa: her resale & income units only

  // KPI items counted by hand-in reports: an on-time hand-in adds one to the item
  const link = (id, re, reps) => { const it = kpis.cards[id] && kpis.cards[id].items.find((x) => re.test(x.t)); if (it) it.reps = reps; };
  link("u6", /التقرير اليومي للقادة/, ["SR-4", "SR-5"]); link("u7", /التقرير اليومي \(جديد/, ["SR-6"]); link("u11", /تقرير المنافسين/, ["SR-7"]);
  const kpiWatch = { to: ["u6"], ch: ["app"] }; // who runs the KPIs day to day (Heba): sees every card, report and change, but nothing about money
  kpis.cards.u6.items[0].p = { min: 30, per: "quarter" };
  Object.assign(kpis.cards.u6.items[2], { p: { hours: 24, per: "quarter" } }); Object.assign(kpis.cards.u6.items[3], { p: { per: "quarter", excl: "By Safwat" } });
  kpis.cards.u6.items[4].by = ["u21"]; kpis.cards.u6.items[5].by = ["u21"]; // Nancy rates these two
  // who a lead came from: some a salesperson entered himself, some came through Safwat · neither needs a Second Call
  leads.forEach((l, i) => { if (i % 11 === 0) l.selfEntered = true; else if (i % 13 === 6) Object.assign(l, { channel: "By Safwat", campaign: "" }); });
  // Second Calls done this quarter: most the same day; a few were missed
  leads.filter((l) => l.created >= new Date(now - 35 * DAY).toISOString() && !l.selfEntered && l.channel !== "By Safwat" && l.owner !== "telesales" && l.created < new Date(now - DAY).toISOString()).forEach((l, i) => {
    if (i % 7 !== 3) l.verify = { done: true, called: i % 9 !== 2, sent: true, note: i % 9 === 2 ? "السيلز لسه مكلّموش · اتبلّغ" : "العميل اتكلم واتبعتله العرض", by: "u6", at: new Date(new Date(l.created).getTime() + 3 * 3600e3).toISOString() };
  });
  // Draft decisions this quarter: how many hours each waited for Heba (two went past the day)
  [4, 2, 30, 6, 1, 3, 40, 5].forEach((h, i) => { const l = leads.filter((x) => x.owner === "sales")[i * 3 + 1]; if (!l) return; const at0 = new Date(now - (4 + i * 4) * DAY); (l.draftHist = l.draftHist || []).push({ kind: i % 2 ? "draftAdmin" : "draft", at: at0.toISOString(), decidedAt: new Date(at0.getTime() + h * 3600e3).toISOString(), by: "u6", decision: l.sales }); });
  // New Leads Hadeer sent Heba this quarter and how many minutes each took to reach a salesperson; one is waiting right now
  [8, 12, 25, 41, 15, 5, 55, 20, 10, 28, 33, 18].forEach((m, i) => { const l = leads.filter((x) => x.owner === "sales" && x.everInterested)[i]; if (!l) return; const req = new Date(now - (3 + i * 5) * DAY); Object.assign(l, { newLeadReq: "done", newLeadReqAt: req.toISOString(), newLeadReqBy: "u5", newLeadRoutedAt: new Date(req.getTime() + m * MIN).toISOString(), newLeadRoutedBy: "u6" }); });
  mkLead({ name: "م. شريف نبيل", company: "Delta Logistics", phones: ["01066554433"], area: "مدينة نصر", type: "Rent", space: 220, budget: 180000, channel: "LinkedIn", campaign: "c4", sales: "u5", owner: "telesales", stage: "Interested", everInterested: true, touched: true, rotation: 3, created: ago(60 * 24 * 3), newLeadReq: "pending", newLeadReqAt: ago(19), newLeadReqBy: "u5" });
  // the last 10 days of daily reports: what each person wrote; a few came in late and a few days are missing
  const daily = {};
  const NOTE = { sales: (n) => `كلّمت ${8 + n} عميل · ${n % 3} Visit · بعت ${(n % 2) + 1} عرض سعر`, inventory_staff: (n) => `خلّصت ${20 + n} مهمة من منار · رديت على ${(n % 4) + 1} List للـ Team Leaders`, inventory: (n) => `دخّلت ${n + 2} وحدة جديدة · راجعت ${n + 5} وحدة`, telesales: (n) => `${60 + n * 3} مكالمة · ${(n % 3) + 1} New Lead`, ops: (n) => `وزّعت ${15 + n} ليد · ${(n % 4) + 2} مكالمة تحقق` };
  Object.keys(kpis.cards).forEach((id, i) => {
    const role = (users.find((u) => u.id === id) || {}).role;
    for (let d = 1; d <= 10; d++) {
      if (new Date(now - d * DAY).getDay() === 5 || (i + d) % 7 === 0) continue;
      const k = dayKey(d), late = (i + d) % 5 === 0;
      (daily[id] = daily[id] || {})[k] = { vals: {}, note: (NOTE[role] || ((n) => `خلّصت شغل اليوم · ${n + 1} مهام`))(d % 6), at: new Date(`${k}T${late ? "19:10" : "17:4" + (d % 10)}:00`).toISOString() };
    }
  });
  return { moves, custody, activities, daily, leadRules, kpiWatch, kpis, penalties, listReqs, invReports: {}, webAds, compReports, officeAssets, officeBoys, assetsReviewed: dayKey(12), pettyCap: 50000, pwHashSeed: DEMO_PASSWORD, mails, perms, users, audit, holidays, leaveTypes, targets, tlTiers, tcrSeq, naSheets, pdfFields: ["salary", "target", "achieved", "scheme", "commission", "bonus"], bonuses: [{ minPct: 100, amount: 5000 }, { minPct: 120, amount: 10000 }], statements: {}, chart, bills: [
    { id: "BL-1", on: true, name: "اشتراك Property Finder الشهري", vendor: "Property Finder", line: "بروبيرتي فايندر", amount: 23000, day: 1, from: "بنك CIB", paid: {}, skipped: {} },
    { id: "BL-2", on: true, name: "إيجار المقر", vendor: "مالك المقر", line: "ايجار", amount: 85000, day: 5, from: "بنك CIB", paid: {}, skipped: {} },
    { id: "BL-3", on: true, name: "إنترنت المكتب", vendor: "Vodafone Business", line: "انترنت", amount: 3200, day: 15, from: "خزينة رئيسية", paid: {}, skipped: {} }], clientCodes: {}, receiveSources: ["عمولة من عميل", "إيراد آخر", "استرداد"], interactionTypes: ["مكالمة", "زيارة", "طلب", "شكوى", "ابديت مع المالك"], finishings: ["Furnished", "متشطب", "نص تشطيب", "Core & Shell"], unitPurposes: ["Rent", "Resale", "Income"], paymentPlans: ["كاش", "تقسيط 3 سنين", "تقسيط 5 سنين"], mkTaskTypes: ["Website leasing", "Market survey", "تصميم بوست", "تصوير فيديو"], ticketDepts: ["HR", "Inventory", "Marketing", "Accounts", "Operations", "الإدارة"], schedReports, notifRules, notifEmail: "notifications@places.com", interactions, contracts: [], people, areas, areaRouting, channels, campaigns, posts, stages, leads, units, areaTabs, importSample, invAccess, tasks, broadcasts, deals, employees, attendance, excuses, requests, oneQuestions, oneOnOnes, leaves, tickets, companies, companyCats, pendingCompanies, accounts, advances, expenses, monthly, budgets, vendors, purchases, periods, notifications, bulk: [], imports: [], unitSeq: 304, leadSeq: seq, clock: 0, holiday: false, waSentToday: 140, waLimit: 250 };
})();
