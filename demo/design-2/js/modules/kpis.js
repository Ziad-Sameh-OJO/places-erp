/* KPI cards per person per quarter (client file Places_KPIs_Q4_2026). Each item is measured one of three ways:
   a = the system measures it from the modules · d = the person hands it in (on time or not) · m = their follower enters it.
   Card score = Σ weight × achievement. The follower approves, the Office Manager closes the quarter and everyone gets their result by email. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, head, note, table } = U;
  const HOW = { a: ["info", "أوتوماتيك"], d: ["warn", "تسليم"], m: ["", "يدوي"] };
  const K = () => S().kpis || { cards: {}, approved: {} };
  const cards = () => K().cards;
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  // live measures the demo can take from its own data; other "a" items carry the module's figure as a demo value
  const LIVE = {
    att: (id) => { const r = S().attendance.filter((a) => a.emp === id).map(A.attRow); return r.length ? pct(r.filter((x) => !x.ded).length, r.length) : 100; },
    ownTarget: (id, it) => { const g = A.targetGoal(id), got = A.targetOf(id); return g && got ? pct(got, g) : +(it && it.val) || 0; }, // no collections in the demo yet → its demo figure
    // sales: half for absence (up to 5 days off in the quarter), half for lateness (up to 6 hours in the month); over the limit shrinks in proportion
    attSales: (id) => { const d = new Date(A.NOW()), q0 = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).toISOString().slice(0, 10), mo = A.today().slice(0, 7), att = S().attendance.filter((a) => a.emp === id);
      const off = att.filter((a) => a.day >= q0 && a.status === "absent").length, lateH = att.filter((a) => a.day.startsWith(mo)).map(A.attRow).reduce((s, x) => s + x.late, 0) / 60;
      return 50 * (off <= 5 ? 1 : 5 / off) + 50 * (lateH <= 6 ? 1 : 6 / lateH); },
    teamTarget: (id) => (A.tlStats ? A.tlStats(id).pct : 0),
    company: () => { const s = A.sales(); return pct(s.reduce((x, p) => x + A.targetOf(p.id), 0), s.reduce((x, p) => x + (A.targetGoal(p.id) || 0), 0)); },
    team: (id, it) => { const ids = ((it && it.ids) || Object.keys(cards()).filter((k) => cards()[k].by === id)).filter((k) => cards()[k]); return ids.length ? ids.reduce((s, k) => s + score(k), 0) / ids.length : 0; },
    verified: () => { const u = S().units.filter(A.isAvailable); return u.length ? pct(u.filter((x) => !A.stale(x)).length, u.length) : 100; },
    resaleFresh: () => { const u = S().units.filter((x) => A.availableAs(x, "Resale")); return u.length ? pct(u.filter((x) => !A.stale(x)).length, u.length) : 100; },
    tickets: () => { const t = S().tickets.filter((x) => x.status !== "Pending TL"); return t.length && A.ticketLate ? pct(t.filter((x) => !A.ticketLate(x)).length, t.length) : 100; },
    call30: () => { const l = S().leads.filter((x) => x.comments.length); return pct(l.filter((x) => (new Date(x.comments[0].at) - new Date(x.created)) / 60000 <= 30).length, l.length); },
    qualifiedN: () => S().leads.filter((l) => l.everInterested).length,
    // Heba: share of the week's new leads that got a verification call; Hadeer: outbound companies this week
    outbound: () => { const wk = new Date(A.NOW() - 7 * 864e5).toISOString().slice(0, 10); return S().companies.filter((x) => x.outbound && x.date >= wk).length; },
    // deal value carried out by its due date ÷ value of deals already due; paper errors found by Finance
    dealExec: (id, it) => { const due = S().deals.filter((d) => d.status !== "Cancelled" && d.execDue && d.execDue <= A.today()), v = (d) => A.placesComm(d) || d.value || 0; return due.length ? pct(due.filter((d) => d.executed && d.executed <= d.execDue).reduce((s, d) => s + v(d), 0), due.reduce((s, d) => s + v(d), 0)) : +it.val || 0; },
    paperErrors: () => S().deals.filter((d) => d.papers && !d.papers.ok).length,
    // inventory: entered within 24h of receipt, media up within 24h of entry, lists answered within 24h, lists without unconfirmed units
    in24: (id, it) => { const u = S().units.filter((x) => x.receivedAt && x.enteredAt && (!it.only || it.only.includes(x.type))); return u.length ? pct(u.filter((x) => (new Date(x.enteredAt) - new Date(x.receivedAt)) / 36e5 <= 24).length, u.length) : +it.val || 0; },
    drive24: (id, it) => { const u = S().units.filter((x) => x.enteredAt); return u.length ? pct(u.filter((x) => x.driveAt && (new Date(x.driveAt) - new Date(x.enteredAt)) / 36e5 <= 24).length, u.length) : +it.val || 0; },
    lists24: (id, it) => { const L = S().listReqs || []; return L.length ? pct(L.filter((x) => (new Date(x.doneAt || A.nowIso()) - new Date(x.at)) / 36e5 <= 24).length, L.length) : +it.val || 0; },
    listsClean: (id, it) => { const L = (S().listReqs || []).filter((x) => x.doneAt); return L.length ? pct(L.filter((x) => !x.unconfirmed).length, L.length) : +it.val || 0; },
    webAds: () => { const d = Object.entries(S().webAds || {}).filter(([k]) => k >= new Date(A.NOW() - 7 * 864e5).toISOString().slice(0, 10)).map(([, v]) => v); return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0; }, // average a day this week
    disputes: (id, it) => { const d = S().tickets.filter((t) => t.type === "dispute"); return d.length && A.ticketLate ? pct(d.filter((t) => !A.ticketLate(t)).length, d.length) : +it.val || 0; },
    proc48: (id, it) => { const p = S().purchases.filter((x) => x.paidAt); return p.length ? pct(p.filter((x) => (new Date(x.paidAt) - new Date(x.created)) / 36e5 <= 48).length, p.length) : +it.val || 0; },
    pettyCap: () => { const st = S(), b = st.accounts.find((x) => /مختار/.test(x.name)); return b && b.balance <= (st.pettyCap || 50000) ? 100 : 0; },
    receipts: () => { const p = S().purchases.filter((x) => x.amount > 10000); return p.length ? pct(p.filter((x) => x.attach).length, p.length) : 100; }
  };
  // per-person metrics the admin / Heba can pick for an item; it.p holds the item's settings (period, kind, minutes…)
  const qStart = () => { const d = new Date(A.NOW()); return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); };
  const since = (per) => { const d = new Date(A.NOW()); if (/^d:/.test(per)) { const [y, m, n] = per.slice(2).split("-").map(Number); return new Date(y, m - 1, n).toISOString(); } return (per === "today" ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : per === "week" ? new Date(d - 7 * 864e5) : per === "month" ? new Date(d.getFullYear(), d.getMonth(), 1) : qStart()).toISOString(); };
  const weeksIn = (per) => Math.max(1, (A.NOW() - new Date(since(per))) / (7 * 864e5));
  const leadsOf = (id) => S().leads.filter((l) => l.sales === id || (l.draft && l.draft.from) === id || (l.draftAdmin && l.draftAdmin.from) === id);
  const P = (it) => it.p || {};
  Object.assign(LIVE, {
    visitsDone: (id, it) => leadsOf(id).reduce((n, l) => n + l.visits.filter((v) => v.done && v.at >= since(P(it).per) && (!P(it).kind || (v.kind || "Visit") === P(it).kind)).length, 0),
    unitsBrought: (id, it) => S().units.filter((u) => u.agent === id && (u.enteredAt || "") >= since(P(it).per) && (!P(it).type || u.type === P(it).type)).length,
    calls: (id, it) => { const n = S().leads.reduce((x, l) => x + l.comments.filter((c) => c.by === id && c.text === "مكالمة اتسجّلت" && c.at >= since(P(it).per)).length, 0); return P(it).avg === "week" ? Math.round(n / weeksIn(P(it).per)) : n; },
    broadcasts: (id) => S().broadcasts.filter((b) => b.approved && (b.sent || []).includes(id)).length,
    firstAction: (id, it) => { const L = leadsOf(id).filter((l) => l.created >= since(P(it).per)), m = +P(it).min || 30, ok = (l) => { const c = l.comments.find((x) => x.by !== "system"); return c && (new Date(c.at) - new Date(l.created)) / 6e4 <= m; }; return L.length ? pct(L.filter(ok).length, L.length) : 100; },
    qualifiedRate: (id, it) => { const L = leadsOf(id).filter((l) => l.created >= since(P(it).per)); return L.length ? pct(L.filter((l) => l.everInterested).length, L.length) : 0; },
    activitiesDone: (id, it) => { const n = (S().activities || []).filter((a) => a.by === id && a.status === "done" && (!P(it).akind || a.kind === P(it).akind) && a.at >= since(P(it).per)).length; /* counted on the day it happened, not the day it was reported */ return P(it).avg === "week" ? Math.round((n / weeksIn(P(it).per)) * 10) / 10 : n; },
    // what the person typed for this item in their daily reports, added up over the period
    dailySum: (id, it) => { const D = (S().daily || {})[id] || {}, from = since(P(it).per).slice(0, 10), k = keyOf(it), n = Object.entries(D).filter(([day]) => day >= from).reduce((x, [, r]) => x + (+((r.vals || {})[k]) || 0), 0); return P(it).avg === "week" ? Math.round((n / weeksIn(P(it).per)) * 10) / 10 : n; },
    // New Leads from Telesales: routed within X minutes of reaching Operations; one still waiting past X counts as late
    newLeadRoute: (id, it) => { const R = newLeadReqs(id, it); return R.length ? pct(R.filter((x) => !x.late).length, R.length) : 100; },
    // Second Calls: every eligible lead of the day needs one (Done + a note) before that day ends; today's undone ones aren't counted yet
    secondCalls: (id, it) => { const R = scRows(it); return R.length ? pct(R.filter((x) => !x.late).length, R.length) : 100; },
    // Draft / Draft Admin: each lead needs a decision (keep it, or send it to someone) within X hours of landing there
    draftAction: (id, it) => { const R = draftRows(it); return R.length ? pct(R.filter((x) => !x.late).length, R.length) : 100; },
    dealsCount: (id, it) => S().deals.filter((d) => !["Rejected", "Cancelled"].includes(d.status) && (d.buyers || [d.sales]).includes(id) && (d.closed || "") >= since(P(it).per)).length
  });
  const dayEnd = (iso) => { const d = new Date(iso); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };
  const scItem = () => Object.values(cards()).flatMap((c) => c.items).find((x) => x.m === "secondCalls") || { p: {} };
  const excl = (it) => String(P(it).excl ?? "By Safwat").split(",").map((x) => x.trim()).filter(Boolean);
  const scEligible = (l, it) => !l.archived && !l.selfEntered && l.owner !== "telesales" && !excl(it).includes(l.channel);
  const scRows = (it) => { const from = since(P(it).per); return S().leads.filter((l) => l.created >= from && scEligible(l, it)).map((l) => { const end = dayEnd(l.created), at = l.verify && l.verify.done ? new Date(l.verify.at).getTime() : null; return { l, late: at ? at > end : A.NOW() > end, waiting: !at && A.NOW() <= end }; }).filter((x) => !x.waiting); };
  // today's list for Operations, plus any earlier ones of this quarter still not done
  A.secondCallsFor = () => { const it = scItem(), from = since("quarter"), L = S().leads.filter((l) => l.created >= from && scEligible(l, it)), today = since("today"); return { due: L.filter((l) => l.created >= today), late: L.filter((l) => l.created < today && !(l.verify && l.verify.done)) }; };
  const draftItem = () => Object.values(cards()).flatMap((c) => c.items).find((x) => x.m === "draftAction") || { p: {} };
  const draftRows = (it) => { const lim = (+P(it).hours || 24) * 36e5, from = since(P(it).per), rows = [];
    S().leads.forEach((l) => {
      (l.draftHist || []).forEach((h) => rows.push({ l, kind: h.kind, at: h.at, done: h.decidedAt }));
      if (l.owner === "draft" && l.draft) rows.push({ l, kind: "draft", at: l.draft.at, done: l.draft.keptAt });
      if (l.owner === "draftAdmin" && l.draftAdmin) rows.push({ l, kind: "draftAdmin", at: l.draftAdmin.at, done: l.draftAdmin.reviewedAt || (l.draftAdmin.reviewed ? l.draftAdmin.at : null) });
    });
    return rows.filter((x) => x.at >= from).map((x) => { const took = (x.done ? new Date(x.done).getTime() : A.NOW()) - new Date(x.at).getTime(); return Object.assign(x, { h: Math.floor(took / 36e5), late: took > lim, waiting: !x.done && took <= lim }); }).filter((x) => !x.waiting); };
  // countdown on a Draft / Draft Admin lead waiting for a decision
  A.draftClock = (at) => { const left = (+P(draftItem()).hours || 24) * 60 - A.minsSince(at); return chip(left < 0 ? "bad" : left <= 180 ? "warn" : "info", left < 0 ? `اتأخر ${Math.ceil(-left / 60)} س` : `باقي ${Math.floor(left / 60)} س`, 1) + " "; };
  const newLeadReqs = (id, it) => { const lim = +P(it).min || 30, from = since(P(it).per);
    return S().leads.filter((l) => l.newLeadReqAt && l.newLeadReqAt >= from && (l.newLeadRoutedAt ? l.newLeadRoutedBy === id || !l.newLeadRoutedBy : true))
      .map((l) => { const m = Math.floor(((l.newLeadRoutedAt ? new Date(l.newLeadRoutedAt).getTime() : A.NOW()) - new Date(l.newLeadReqAt).getTime()) / 6e4); return { l, m, waiting: !l.newLeadRoutedAt, late: m > lim }; })
      .filter((x) => !x.waiting || x.late); }; // one still inside its minutes isn't counted yet
  // the minutes the New Lead item uses (Heba's card), for the countdown on the request
  A.newLeadMins = () => { const it = Object.values(cards()).flatMap((c) => c.items).find((x) => x.m === "newLeadRoute"); return (it && +P(it).min) || 30; };
  A.newLeadClock = (l) => { if (!l.newLeadReqAt) return ""; const left = A.newLeadMins() - A.minsSince(l.newLeadReqAt); return chip(left < 0 ? "bad" : left <= 10 ? "warn" : "info", left < 0 ? `اتأخر ${-left} د` : `باقي ${left} د`, 1); };
  const PER = [["week", "آخر 7 أيام"], ["month", "الشهر ده"], ["quarter", "الربع ده"]], perName = (p) => (p === "today" ? "النهارده" : (PER.find((x) => x[0] === (p || "quarter")) || PER[2])[1]);
  // g = group · u = "%" or "#" · d(p) = exactly what it's calculated from · ps = its settings
  const META = {
    ownTarget: { g: "المبيعات", l: "تحقيق التارجت", u: "%", d: () => "نصيبه من الكوميشن في الصفقات اللي دخلت التارجت ÷ التارجت بتاعه" },
    visitsDone: { g: "المبيعات", l: "Visits / Meetings اتعملت", u: "#", d: (p) => `عدد الـ ${p.kind || "Visits والـ Meetings"} اللي اتعلّم عليها Done في ليدزه · ${perName(p.per)}`, ps: ["kind", "per"] },
    calls: { g: "المبيعات", l: "المكالمات", u: "#", d: (p) => `عدد المكالمات اللي سجّلها بنفسه على الليدز · ${perName(p.per)}${p.avg === "week" ? " · متوسط في الأسبوع" : ""}`, ps: ["per", "avg"] },
    unitsBrought: { g: "المبيعات", l: "وحدات جابها للانفنتوري", u: "#", d: (p) => `عدد الوحدات${p.type ? " " + p.type : ""} اللي هو الـ Agent بتاعها ودخلت الانفنتوري · ${perName(p.per)}`, ps: ["type", "per"] },
    broadcasts: { g: "المبيعات", l: "الـ Broadcasts اللي بعتها", u: "#", d: () => "عدد رسايل الـ Broadcast المعتمدة اللي علّم إنه بعتها" },
    firstAction: { g: "المبيعات", l: "أول أكشن على الليد", u: "%", d: (p) => `% من ليدزه (${perName(p.per)}) اللي عمل عليها أول أكشن خلال ${p.min || 30} دقيقة من دخولها`, ps: ["min", "per"] },
    qualifiedRate: { g: "المبيعات", l: "نسبة الـ Qualified", u: "%", d: (p) => `% من ليدزه (${perName(p.per)}) اللي وصلت Interested أو بعدها`, ps: ["per"] },
    activitiesDone: { g: "المبيعات", l: "Farming / Approach اتعمل", u: "#", d: (p) => `عدد نشاطات الـ ${p.akind || "Farming والـ Approach"} اللي سجّلها وعلّم إنه عملها · ${perName(p.per)}${p.avg === "week" ? " · متوسط في الأسبوع" : ""}`, ps: ["akind", "per", "avg"] },
    dailySum: { g: "التقرير اليومي", l: "اللي بيكتبه في التقرير اليومي", u: "#", d: (p) => `مجموع الرقم اللي بيكتبه للبند ده في تقريره اليومي · ${perName(p.per)}${p.avg === "week" ? " · متوسط في الأسبوع" : ""}`, ps: ["per", "avg"] },
    dealsCount: { g: "المبيعات", l: "الصفقات", u: "#", d: (p) => `عدد الصفقات اللي هو Buyer فيها (مش مرفوضة ولا ملغية) · ${perName(p.per)}`, ps: ["per"] },
    teamTarget: { g: "المبيعات", l: "تارجت الفريق", u: "%", d: () => "تحقيق تارجت الفريق اللي بيقوده (للـ Team Leader)" },
    company: { g: "المبيعات", l: "تارجت الشركة", u: "%", d: () => "مجموع اللي حققه كل السيلز ÷ مجموع تارجتهم" },
    newLeadRoute: { g: "الليدز", l: "توزيع الـ New Lead في ميعاده", u: "%", d: (p) => `% من الـ New Leads اللي Telesales بعتتها (${perName(p.per)}) واتبعتت للسيلز خلال ${p.min || 30} دقيقة من وصولها · اللي لسه مستني وعدّى الـ ${p.min || 30} دقيقة بيتحسب متأخر`, ps: ["min", "per"],
      detail: (id, it) => { const R = newLeadReqs(id, it), late = R.filter((x) => x.late); return `${R.length - late.length} في الميعاد من ${R.length}${late.length ? ` · اتأخرت في: ${late.map((x) => `${x.l.name} (${x.m} د${x.waiting ? "، لسه مستني" : ""})`).join("، ")}` : ""}`; } },
    secondCalls: { g: "الليدز", l: "مكالمات التحقق (Second Calls)", u: "%", d: (p) => `% من ليدز كل يوم (${perName(p.per)}) اللي اتعملها Second Call Done بنوت في نفس اليوم · من غير الليدز اللي السيلز نزّلها بنفسه ولا Channel ${String(p.excl ?? "By Safwat") || "—"}`, ps: ["per", "excl"],
      detail: (id, it) => { const R = scRows(it), late = R.filter((x) => x.late); return `${R.length - late.length} في ميعادها من ${R.length}${late.length ? ` · ماتعملتش أو اتأخرت: ${late.slice(0, 6).map((x) => `${x.l.name} (${A.fmtDate(x.l.created)})`).join("، ")}${late.length > 6 ? "…" : ""}` : ""}`; } },
    draftAction: { g: "الليدز", l: "قرارات الـ Draft في ميعادها", u: "%", d: (p) => `% من الليدز اللي دخلت الـ Draft أو الـ Draft Admin (${perName(p.per)}) واتاخد عليها قرار (تفضل أو تتبعت لحد) خلال ${p.hours || 24} ساعة · اللي لسه مستني وعدّى الوقت بيتحسب متأخر`, ps: ["hours", "per"],
      detail: (id, it) => { const R = draftRows(it), late = R.filter((x) => x.late); return `${R.length - late.length} في الميعاد من ${R.length}${late.length ? ` · اتأخرت في: ${late.slice(0, 6).map((x) => `${x.l.name} (${x.kind === "draft" ? "Draft" : "Draft Admin"} · ${x.h} س${x.done ? "" : "، لسه مستني"})`).join("، ")}${late.length > 6 ? "…" : ""}` : ""}`; } },
    call30: { g: "الليدز", l: "أول أكشن خلال 30 دقيقة (كل الليدز)", u: "%", d: () => "% من كل الليدز اللي اتعمل عليها أول أكشن خلال 30 دقيقة" },
    qualifiedN: { g: "الليدز", l: "عدد الـ Qualified (كل الليدز)", u: "#", d: () => "عدد كل الليدز اللي بقت Qualified" },
    outbound: { g: "الليدز", l: "شركات Outbound", u: "#", d: () => "عدد الشركات اللي اتكلمت Outbound آخر 7 أيام" },
    att: { g: "الحضور", l: "الحضور", u: "%", d: () => "% أيام الحضور من غير خصم (من البصمة)" },
    attSales: { g: "الحضور", l: "الحضور (السيلز)", u: "%", d: () => "نص الوزن للغياب (لحد 5 أيام في الربع) ونص للتأخير (لحد 6 ساعات في الشهر)، واللي يزيد بيقل بالنسبة" },
    team: { g: "الإدارة", l: "متوسط كروت فريقه", u: "%", d: () => "متوسط نتايج كروت الـ KPIs بتاعة الناس اللي بيتابعهم" },
    dealExec: { g: "الصفقات", l: "تنفيذ الصفقات في ميعادها", u: "%", d: () => "قيمة الصفقات اللي اتنفّذت في ميعادها ÷ قيمة الصفقات اللي ميعادها جه" },
    paperErrors: { g: "الصفقات", l: "أخطاء الورق", u: "#", d: () => "عدد الصفقات اللي المالية لقت في ورقها أخطاء" },
    verified: { g: "الانفنتوري", l: "الوحدات المتحدّثة", u: "%", d: () => "% من الوحدات المتاحة اللي متحدّثة (مش قديمة)" },
    resaleFresh: { g: "الانفنتوري", l: "وحدات الـ Resale المتحدّثة", u: "%", d: () => "% من وحدات الـ Resale المتاحة اللي متحدّثة" },
    in24: { g: "الانفنتوري", l: "إدخال الوحدات خلال 24 ساعة", u: "%", d: () => "% من الوحدات اللي اتدخلت خلال 24 ساعة من استلامها" },
    drive24: { g: "الانفنتوري", l: "رفع الصور خلال 24 ساعة", u: "%", d: () => "% من الوحدات اللي صورها اترفعت خلال 24 ساعة من دخولها" },
    lists24: { g: "الانفنتوري", l: "الرد على الـ Lists خلال 24 ساعة", u: "%", d: () => "% من طلبات الـ List اللي اتردّ عليها خلال 24 ساعة" },
    listsClean: { g: "الانفنتوري", l: "Lists من غير وحدات مش مؤكدة", u: "%", d: () => "% من الـ Lists اللي مافيهاش وحدات مش مؤكدة" },
    webAds: { g: "التسويق", l: "إعلانات الموقع", u: "#", d: () => "متوسط إعلانات الموقع في اليوم آخر 7 أيام" },
    tickets: { g: "التذاكر", l: "التذاكر في ميعادها", u: "%", d: () => "% من التذاكر اللي اتقفلت في ميعادها" },
    disputes: { g: "التذاكر", l: "الشكاوى في ميعادها", u: "%", d: () => "% من الشكاوى اللي اتحلّت في ميعادها" },
    proc48: { g: "المشتريات", l: "الدفع خلال 48 ساعة", u: "%", d: () => "% من طلبات الشراء اللي اتدفعت خلال 48 ساعة" },
    pettyCap: { g: "المشتريات", l: "العهدة تحت الحد", u: "%", d: () => "رصيد العهدة تحت الحد = 100%، فوقه = 0%" },
    receipts: { g: "المشتريات", l: "الفواتير", u: "%", d: () => "% من المشتريات فوق 10,000 اللي ليها فاتورة متعلّقة" }
  };
  const keyOf = (it) => it.k || (it.k = "k" + Math.random().toString(36).slice(2, 8)); // stays when the item is renamed
  const PS = { akind: ["النشاط", [["", "الاتنين"], ["Farming", "Farming"], ["Approach", "Approach"]]], per: ["الفترة", PER], kind: ["النوع", [["", "الاتنين"], ["Visit", "Visit"], ["Meeting", "Meeting"]]], avg: ["العدد", [["", "الإجمالي"], ["week", "متوسط في الأسبوع"]]], type: ["نوع الوحدة", [["", "كل الأنواع"], ["Rent", "Rent"], ["Resale", "Resale"], ["Income", "Income"]]], min: ["خلال كام دقيقة", null], hours: ["خلال كام ساعة", null], excl: ["Channels مش محسوبة (افصل بينها بفاصلة)", null, "text"] };
  const detailOf = (id, it) => (it.how === "a" && META[it.m] && META[it.m].detail ? `<span class="sub"><b>${esc(META[it.m].detail(id, it))}</b></span>` : "");
  const repName = (rid) => ((S().schedReports || []).find((r) => r.id === rid) || {}).name;
  const byName = (x) => (x === "follower" ? "المتابع" : U.whoName(x));
  // exactly what the item is calculated from, in one sentence
  const calcText = (it) => it.how === "a" ? (it.m && META[it.m] ? META[it.m].d(P(it)) : it.m ? "مقياس جاهز من السيستم" : "قيمة تجريبية · لسه ماتحددش بيتحسب من إيه")
    : it.how === "d" ? ((it.reps || []).length ? `تسليم «${it.reps.map(repName).filter(Boolean).join("» و«")}» في ميعاده · مطلوب ${it.need} مرة في الربع` : `بيسلّمه بنفسه من الكارت · مطلوب ${it.need} مرة في الربع`)
    : `بيدخّله ${(it.by || ["follower"]).map(byName).join(" أو ")} بإيده${it.src ? ` · من ${it.src}` : ""}`;
  const valOf = (id, it) => (it.how === "d" ? pct(it.done, it.need) : it.m && LIVE[it.m] ? LIVE[it.m](id, it) : +it.val || 0);
  // client (28/10): every item is proportional and may pass 100% (recorded as is). "at most / zero" items: met = 100%, over it shrinks
  // (our proposal until confirmed: goal ÷ actual, and a "zero" item loses 25% per occurrence)
  const ach = (it, v) => (it.dir === "max" ? (v <= it.goal ? 1 : it.goal > 0 ? it.goal / v : Math.max(0, 1 - 0.25 * v)) : it.goal ? v / it.goal : 1);
  // client (28/10): the same bands for everyone; the base (salary or quarter bonus) and the period are set per person
  // the bands live in settings (management edits them): reward at ≥ top, full bonus at ≥ full, partial down to ≥ partial, then the cut; below "low" the Threshold rule
  const BD = () => Object.assign({ top: 100, full: 96, partial: 70, low: 50, reward: 15, cut: 15 }, K().bands);
  const band = (s) => { const b = BD(); return s >= b.top ? [b.top, `مكافأة ${b.reward}%`, "ok"] : s >= b.full ? [b.full, "بونص كامل", "ok"] : s >= b.partial ? [b.partial, "بونص جزئي", "warn"] : s >= b.low ? [b.low, `خصم ${b.cut}% + خطة تحسين`, "bad"] : [-1, `Threshold: البونص بيتلغي + خصم ${b.cut}% من المرتب + إنذار`, "bad"]; };
  const baseAmt = (id) => { const p = cards()[id].pay || {}, e = (S().employees || []).find((x) => x.id === id); return p.base === "salary" && e && e.salary ? e.salary : +p.amount || 0; };
  // reward (+) or deduction (−) on the base. 70–95%: partial bonus, the cut grows evenly from 0 at 96% to 15% at 70% (our proposal until confirmed)
  // RECA TECH's rules until the client says otherwise: the partial cut grows evenly from 0 at "full" to the cut at "partial";
  // under "low" (the Threshold) the whole bonus is cancelled and the cut is taken from the monthly salary, plus a written warning
  const salaryOf = (id) => ((S().employees || []).find((x) => x.id === id) || {}).salary || 0;
  const delta = (id) => { const s = score(id), B = baseAmt(id), b = BD(), p = cards()[id].pay || {};
    if (s < b.low) return -Math.round(p.base === "bonus" ? B + salaryOf(id) * b.cut / 100 : B * b.cut / 100);
    return Math.round(B * (s >= b.top ? b.reward / 100 : s >= b.full ? 0 : s >= b.partial ? (-b.cut / 100) * (b.full - s) / (b.full - b.partial) : -b.cut / 100)); };
  const PAYL = { salary: "المرتب", bonus: "بونص الكوارتر", month: "شهري", quarter: "كل ربع" };
  const score = (id) => (cards()[id] ? cards()[id].items.reduce((s, it) => s + it.w * ach(it, valOf(id, it)), 0) : 0);
  const isPct = (it) => it.how === "d" || (it.m && META[it.m] && it.how === "a" ? META[it.m].u === "%" : false) || /%/.test(it.target) || ["att", "attSales", "ownTarget", "company", "team", "verified", "resaleFresh", "tickets", "call30", "receipts", "secondCalls", "dealExec", "in24", "drive24", "lists24", "listsClean", "disputes", "proc48", "pettyCap"].includes(it.m);
  const fmt = (id, it) => { const v = valOf(id, it); if (it.how === "d") return `${it.done} من ${it.need} في الميعاد`; const n = Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : A.num(Math.round(v)); return isPct(it) ? n + "%" : n; };
  const followerOf = (id) => (cards()[id] || {}).by;
  const followerName = (by) => (by === "owners" ? "الملاك" : A.person(by));
  // the follower (or the owners, i.e. a Super Admin who isn't the card's owner) enters manual items and approves
  const isFollower = (id) => { const by = followerOf(id); return by === "owners" ? A.role === "admin" && A.uid !== id : by === A.uid; };
  const watcher = () => !!S().kpiWatch && A.isIn(S().kpiWatch);
  const seesAll = () => A.role === "admin" || A.canDo("kpis", "approve") || watcher();
  const noMoney = () => watcher() && A.role !== "admin" && !A.canDo("kpis", "edit") && !A.canDo("kpis", "approve"); // runs the KPIs, not the pay
  // the card's manager controls everything on it (items, weights, targets, how it's measured); so does whoever has KPI edit rights
  // the Inventory Manager also manages her own card (adds / edits its items); approving it stays with her follower
  const ownInv = (id) => A.role === "inventory" && id === A.uid;
  const canManage = (id) => open() && (isFollower(id) || A.canDo("kpis", "edit") || watcher() || ownInv(id));
  // a manual value is typed by whoever the item names (the follower by default)
  const canEnter = (id, it) => open() && (it.by || ["follower"]).some((x) => (x === "follower" ? isFollower(id) : x === A.uid || A.rolesOf(A.uid).includes(x)));
  const visible = (scope) => Object.keys(cards()).filter((id) => (scope === "me" ? id === A.uid : scope === "team" ? isFollower(id) : scope === "mine" ? id === A.uid || isFollower(id) : seesAll() || id === A.uid || isFollower(id)));
  const open = () => K().status !== "closed";
  const tone = (s) => band(s)[2];
  const below = (id) => cards()[id].items.filter((it) => ach(it, valOf(id, it)) < 1);
  // job titles as the client's KPI file writes them; anyone else shows their role
  const TITLE = { u1: "CEO · الإيراد", u2: "COO · التشغيل والمعروض", u21: "Office Manager", u18: "CFO (عن بُعد)", u14: "Head of HR", u11: "Marketing Manager", u12: "Photographer", u6: "Sales Operations Specialist", u5: "Telesales & Lead Qualifier", u7: "Inventory Manager", u8: "Resale & Primary Specialist", u9: "Data & Drive Specialist", u10: "Verification & Materials Specialist", u16: "Procurement Manager" };
  const roleOf = (id) => TITLE[id] || A.roleLabel(((S().users || []).find((u) => u.id === id) || {}).role);

  /* ---------- Farming / Approach: the salesperson plans it, then says if it happened and what came of it ---------- */
  const ACTS = () => (S().activities = S().activities || []);
  const dailyRep = () => (S().schedReports || []).find((r) => r.daily);
  // who a person's daily report and activities go to: the report's recipients, with "follower" = that person's KPI follower
  const whoFor = (list, id) => [...new Set(list.flatMap((x) => (x === "follower" ? [followerOf(id) === "owners" ? "admin" : followerOf(id)] : [x])).filter(Boolean))];
  A.kpiFollower = followerOf; A.whoFor = whoFor;
  A.actCard = () => {
    if (A.role !== "sales" && !(cards()[A.uid] || { items: [] }).items.some((it) => it.m === "activitiesDone")) return "";
    const mine = ACTS().filter((a) => a.by === A.uid).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    const line = (a) => `<div class="line-item"><span>${chip(a.kind === "Farming" ? "info" : "", a.kind, 1)}<b>${esc(a.place)}</b><small class="hint">${A.fmtDate(a.at)} ${A.fmtTime(a.at)}</small></span>${a.status === "done" ? `<small>${esc(a.kind === "Farming" ? (a.result.got ? "جاب حاجة · " : "مجابش حاجة · ") + (a.result.note || "") : "شركات: " + (a.result.companies || []).join("، "))}</small>${chip("ok", "اتعمل", 1)}` : a.status === "notDone" ? chip("bad", "ماتعملش", 1) : a.at <= A.nowIso() ? `<button class="btn sm" data-act="actDone" data-id="${a.id}">عملتها؟</button>` : chip("", "جاي", 1)}</div>`;
    return `<section class="card">${head("نشاطاتي · Farming و Approach", "pin", "", "بتتسجل هنا وبتتحسب في الـ KPIs بتاعتك")}${mine.map(line).join("") || `<p class="hint">مفيش نشاطات لسه</p>`}<div class="row end"><button class="btn ghost sm" data-act="actNew">${I("plus")}نشاط جديد</button></div></section>`;
  };
  A.ACT.actNew = () => A.openModal("نشاط جديد", `<form data-form="actNew" class="grid">
      ${U.field("النوع", `<select name="kind" id="ac-k"><option value="Farming">Farming</option><option value="Approach">Approach</option></select>`, 1)}
      ${U.field("المكان", `<input name="place" id="ac-p" required placeholder="مثلاً: التجمع الخامس · شارع التسعين">`, 1)}
      ${U.field("الميعاد", `<input name="at" id="ac-at" type="datetime-local" required>`, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("plus")}سجّل</button></div></form>`);
  A.FORM.actNew = (f) => { const a = { id: "AC-" + Date.now().toString(36), by: A.uid, kind: f.kind === "Approach" ? "Approach" : "Farming", place: f.place.trim(), at: new Date(f.at).toISOString(), status: "planned" }; ACTS().push(a); A.audit("kpis", `${A.person(A.uid)} سجّل ${a.kind} في ${a.place} · ${A.fmtDate(a.at)}`); A.closeModal(); A.toast(`اتسجّل · بعد الميعاد هيتسألك عملته ولا لأ`); A.render(); };
  A.ACT.actDone = (d) => { const a = ACTS().find((x) => x.id === d.id);
    A.openModal(`${a.kind} · ${a.place}`, `<form data-form="actResult" class="grid"><input type="hidden" name="id" value="${a.id}">
      ${a.kind === "Farming" ? `<label class="tog wide"><input type="checkbox" name="got" id="ar-got"><span>جبت حاجة جديدة (مباني أو انفنتوري)</span></label>${U.field("جبت إيه؟", `<textarea name="note" id="ar-note" placeholder="مثلاً: مبنى جديد 4 أدوار إداري · رقم المالك…"></textarea>`, 0, 1)}`
        : U.field("الشركات اللي عملت عليها Approach (شركة في كل سطر)", `<textarea name="companies" id="ar-co" required></textarea>`, 1, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-act="actNotDone" data-id="${a.id}">ماعملتهاش</button><button class="btn">${I("check")}عملتها</button></div></form>`); };
  A.FORM.actResult = (f) => {
    const a = ACTS().find((x) => x.id === f.id), companies = (f.companies || "").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    if (a.kind === "Approach" && !companies.length) { A.toast("اكتب الشركات"); return; }
    Object.assign(a, { status: "done", doneAt: A.nowIso(), result: a.kind === "Farming" ? { got: !!f.got, note: (f.note || "").trim() } : { companies } });
    const what = a.kind === "Farming" ? `${a.result.got ? "جاب حاجة" : "مجابش حاجة"}${a.result.note ? ": " + a.result.note : ""}` : `شركات: ${companies.join("، ")}`;
    A.audit("kpis", `${A.person(A.uid)} عمل ${a.kind} في ${a.place} · ${what}`); if (dailyRep()) A.notify(whoFor(dailyRep().to.to, A.uid).filter((x) => x !== A.uid && !S().kpiWatch.to.includes(x)), `${A.person(A.uid)} عمل ${a.kind} في ${a.place} · ${what}`);
    A.closeModal(); A.toast(`اتسجّل · نزلت ${a.kind} مرة كمان`); A.render();
  };
  A.ACT.actNotDone = () => { const id = document.querySelector("[data-form=actResult] [name=id]").value, a = ACTS().find((x) => x.id === id); a.status = "notDone"; A.audit("kpis", `${A.person(A.uid)} ماعملش الـ ${a.kind} في ${a.place}`); A.closeModal(); A.toast("اتسجّل إنه ماتعملش"); A.render(); };

  /* ---------- the daily report: the system fills what it knows today, the person types the rest ---------- */
  const DAY_AUTO = ["visitsDone", "calls", "unitsBrought", "activitiesDone", "dealsCount"];
  const at = (it, per) => Object.assign({}, it, { p: Object.assign({}, it.p, { per, avg: "" }) }); // the same item measured over another period
  const dayItems = (id) => ((cards()[id] || { items: [] }).items).filter((it) => it.how === "a" && (DAY_AUTO.includes(it.m) || it.m === "dailySum"));
  // extra fields the admin / Heba add to one person's daily report (a number or a sentence), beyond their KPI items
  const tplOf = (id) => { const T = (S().dailyTpl = S().dailyTpl || {}); return (T[id] = T[id] || []); };
  // the form exactly as the person sees it; preview = the same form, disabled, for whoever looks at it
  const dailyForm = (id, saved, preview) => {
    const its = dayItems(id), today = A.today(), dis = preview ? "disabled" : "", acts = ACTS().filter((a) => a.by === id && a.status === "done" && a.at.slice(0, 10) === today);
    return `${its.length ? table(["البند", "النهارده", ""], its.map((it) => `<tr><td><b>${esc(it.t)}</b><span class="sub">${esc(it.target)}</span></td><td class="n">${it.m === "dailySum" ? `<input type="number" min="0" step="any" name="v_${keyOf(it)}" value="${esc(saved.vals[keyOf(it)] ?? "")}" ${dis} style="width:90px" aria-label="${esc(it.t)}">` : `<b>${LIVE[it.m](id, at(it, "today"))}</b>`}</td><td class="hint">${it.m === "dailySum" ? "اكتبه إنت" : "من السيستم"}</td></tr>`)) : ""}
      ${tplOf(id).map((x) => U.field(x.label, x.type === "number" ? `<input type="number" min="0" step="any" name="x_${x.k}" value="${esc(saved.vals[x.k] ?? "")}" ${dis} style="max-width:120px">` : `<input name="x_${x.k}" value="${esc(saved.vals[x.k] ?? "")}" ${dis}>`, 0, 1)).join("")}
      ${acts.length || preview ? `<div class="wide"><h4 class="mini-h">نشاطات النهارده</h4>${acts.map((a) => `<p>${chip("info", a.kind, 1)} ${esc(a.place)}</p>`).join("") || `<p class="hint">بتيجي لوحدها من «نشاطاتي»</p>`}</div>` : ""}
      ${U.field("عملت إيه تاني النهارده؟", `<textarea name="note" ${dis}>${esc(saved.note || "")}</textarea>`, 0, 1)}`;
  };
  A.ACT.dailyOpen = () => {
    const saved = ((S().daily || {})[A.uid] || {})[A.today()] || { vals: {} };
    A.openModal(`التقرير اليومي · ${A.fmtDate(A.nowIso())}`, `<form data-form="dailySave" class="grid">${dailyForm(A.uid, saved)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("send")}سلّم التقرير</button></div></form>`);
  };
  A.FORM.dailySave = (f) => {
    const st = S(), id = A.uid, vals = {};
    dayItems(id).filter((it) => it.m === "dailySum").forEach((it) => { const v = f["v_" + keyOf(it)]; if (v !== "" && v != null) vals[keyOf(it)] = +v; });
    tplOf(id).forEach((x) => { const v = f["x_" + x.k]; if (v !== "" && v != null) vals[x.k] = x.type === "number" ? +v : String(v).trim(); });
    ((st.daily = st.daily || {})[id] = st.daily[id] || {})[A.today()] = { vals, note: (f.note || "").trim(), at: A.nowIso() };
    A.closeModal(); if (dailyRep()) A.ACT.repHand({ id: dailyRep().id }); else A.render();
  };
  // «شكل التقرير»: every field of one person's daily report, how it's filled and where it goes, then the form itself
  function dailyShape(id) {
    const R = dailyRep(), ed = A.canDo("kpis", "edit") || watcher(), role = ((S().users || []).find((u) => u.id === id) || {}).role;
    const rows = [
      ...dayItems(id).map((it) => [esc(it.t), it.m === "dailySum" ? "بيكتبه هو (رقم)" : `السيستم بيملاه لوحده: ${esc(META[it.m].d(Object.assign({}, it.p, { per: "today", avg: "" })))}`, `بند «${esc(it.t)}» في الـ KPIs · ${it.w}%`, ""]),
      ...tplOf(id).map((x) => [esc(x.label), `بيكتبه هو (${x.type === "number" ? "رقم" : "كلام"})`, "خانة إضافية · بتظهر في التقرير ومش مربوطة بالـ KPIs", ed ? `<button class="btn ghost sm" data-act="dtDel" data-id="${id}" data-k="${x.k}" aria-label="امسح ${esc(x.label)}">${I("x")}</button>` : ""]),
      ...(A.role === "sales" || (cards()[id] || { items: [] }).items.some((it) => it.m === "activitiesDone") || role === "sales" ? [["نشاطات النهارده", "بتيجي لوحدها من «نشاطاتي» (Farming / Approach)", "بند Farming في الـ KPIs", ""]] : []),
      ["عملت إيه تاني النهارده؟", "بيكتبه هو (كلام)", "بيظهر في التقرير بس", ""]];
    return `<section class="card flat">${head(`شكل التقرير اليومي · ${A.person(id)}`, "file", "", R ? `بيتسلّم كل يوم شغل الساعة ${R.time} · بيروح لـ ${esc(whoFor(R.to.to, id).map(U.whoName).join("، "))} · لو اتأخر يتبلّغ ${esc(whoFor(R.late.to, id).map(U.whoName).join("، "))}` : "")}
      ${table(["الخانة", "بتتملي إزاي", "بتروح فين", ""], rows.map((x) => `<tr><td><b>${x[0]}</b></td><td>${x[1]}</td><td class="hint">${x[2]}</td><td>${x[3]}</td></tr>`))}
      ${ed ? `<form class="row" data-form="dtAdd"><input type="hidden" name="id" value="${id}"><input name="label" placeholder="خانة جديدة · مثلاً: عدد الملاك اللي كلمتهم" required aria-label="اسم الخانة"><select name="type" aria-label="نوعها"><option value="number">رقم</option><option value="text">كلام</option></select><button class="btn ghost">${I("plus")}ضيف خانة</button>${tplOf(id).length && role ? `<button type="button" class="btn ghost sm" data-act="dtCopyRole" data-id="${id}">انسخ الخانات الإضافية لكل الـ ${esc(A.roleLabel(role))}</button>` : ""}</form>
        <p class="hint">عشان رقم بيكتبه يتحسب في الـ KPIs: ضيف بند في الكارت، وخلّيه «اللي بيكتبه في التقرير اليومي».</p>` : ""}
      <h4 class="mini-h">ده شكله عنده</h4><div class="grid report-preview">${dailyForm(id, { vals: {} }, true)}</div></section>`;
  }
  A.FORM.dtAdd = (f) => { const x = { k: "x" + Date.now().toString(36), label: f.label.trim(), type: f.type === "text" ? "text" : "number" }; tplOf(f.id).push(x); A.audit("kpis", `التقرير اليومي بتاع ${A.person(f.id)}: اتضافت خانة «${x.label}»`); A.toast("اتضافت"); A.render(); };
  A.ACT.dtDel = (d) => { const T = tplOf(d.id), i = T.findIndex((x) => x.k === d.k); if (i < 0) return; const x = T.splice(i, 1)[0]; A.audit("kpis", `التقرير اليومي بتاع ${A.person(d.id)}: اتشالت خانة «${x.label}»`); A.toast("اتشالت"); A.render(); };
  A.ACT.dtCopyRole = (d) => {
    const role = ((S().users || []).find((u) => u.id === d.id) || {}).role, ids = (S().users || []).filter((u) => u.role === role && u.id !== d.id).map((u) => u.id);
    if (!confirm(`تنسخ الخانات الإضافية لـ ${ids.length} ${A.roleLabel(role)}؟ اللي عندهم هيتبدل.`)) return;
    ids.forEach((x) => { S().dailyTpl[x] = tplOf(d.id).map((f) => Object.assign({}, f)); });
    A.audit("kpis", `خانات التقرير اليومي بتاعة ${A.person(d.id)} اتنسخت لكل الـ ${A.roleLabel(role)}`); A.toast(`اتنسخت لـ ${ids.length}`); A.render();
  };
  // one person's report for any day, next to their week / month / quarter totals and KPI %
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const nextDay = (day) => { const [y, m, n] = day.split("-").map(Number); return ymd(new Date(y, m - 1, n + 1)); };
  function dailyBoard() {
    const ids = visible(seesAll() ? "" : "team"), id = ids.includes(A.ui.dbFor) ? A.ui.dbFor : ids[0]; if (!id) return note("مفيش حد بتتابعه.");
    const R = dailyRep(), today = A.today(), day = A.ui.dbDay && A.ui.dbDay <= today ? A.ui.dbDay : today, D = (S().daily || {})[id] || {}, rep = D[day];
    const its = cards()[id].items, cnt = (it) => it.how === "a" && it.m && META[it.m] && META[it.m].u === "#" && META[it.m].ps && META[it.m].ps.includes("per");
    // what they did that day: typed numbers come from that day's report, the system's are counted inside that day
    const dayVal = (it) => it.m === "dailySum" ? ((rep && rep.vals[keyOf(it)]) ?? "—") : cnt(it) ? LIVE[it.m](id, at(it, "d:" + day)) - LIVE[it.m](id, at(it, "d:" + nextDay(day))) : "—";
    const handed = (p) => !!(((S().daily || {})[p] || {})[day]);
    const dl = new Date(`${day}T${R ? R.time : "18:00"}:00`), late = rep && new Date(rep.at) > dl, dayLbl = day === today ? "النهارده" : new Date(day).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" });
    const acts = ACTS().filter((a) => a.by === id && a.at.slice(0, 10) === day);
    return `<section class="card">${head("التقارير اليومية", "list", R ? chip("info", `بيتسلّم ${R.time}`) : "", `بيروح لـ ${R ? R.to.to.map(byName).join("، ") : "—"} · بيتجمع يومي وأسبوعي وشهري وبيتحسب منه الـ KPIs`)}
      <div class="row"><select data-change="dbFor" aria-label="الموظف">${ids.map((x) => `<option value="${x}" ${x === id ? "selected" : ""}>${esc(A.person(x))}${handed(x) ? " · سلّم" : ""}</option>`).join("")}</select>
        ${U.seg("dbView", [["day", "تقرير يوم"], ["shape", "شكل التقرير"]], A.ui.dbView || "day")}${A.ui.dbView === "shape" ? "" : `<label class="date-f"><span>يوم</span><input type="date" value="${day}" max="${today}" data-change="dbDay" aria-label="اليوم"></label><span class="hint">سلّموا ${dayLbl}: ${ids.filter(handed).length} من ${ids.length}</span>`}</div>
      ${A.ui.dbView === "shape" ? dailyShape(id) : `<section class="card flat">${head(`تقرير ${A.person(id)} · ${dayLbl}`, "file", rep ? chip(late ? "warn" : "ok", `${late ? "اتسلّم متأخر" : "اتسلّم في الميعاد"} · ${A.fmtTime(rep.at)}`) : S().leadRules.work.off.includes(new Date(day + "T12:00").getDay()) || A.holOn(day) ? chip("", "يوم أجازة") : chip("bad", "ماسلّمش تقرير اليوم ده"))}
        ${rep ? tplOf(id).filter((x) => rep.vals[x.k] != null).map((x) => `<p><b>${esc(x.label)}:</b> ${esc(rep.vals[x.k])}</p>`).join("") : ""}
        ${rep && rep.note ? `<div class="quote">${esc(rep.note)}</div>` : ""}
        ${acts.length ? acts.map((a) => `<p>${chip("info", a.kind, 1)} <b>${esc(a.place)}</b> · ${a.status === "done" ? esc(a.kind === "Farming" ? (a.result.got ? "جاب حاجة · " : "مجابش حاجة · ") + (a.result.note || "") : "شركات: " + (a.result.companies || []).join("، ")) : a.status === "notDone" ? "ماتعملش" : "لسه"}</p>`).join("") : ""}</section>
      ${table(["البند", dayLbl, "آخر 7 أيام", "الشهر", "الربع", "المستهدف", "التحقيق"], its.map((it) => { const v = valOf(id, it), a = ach(it, v); return `<tr><td><b>${esc(it.t)}</b><span class="sub">${esc(calcText(it))}</span>${detailOf(id, it)}</td><td class="n"><b>${dayVal(it)}</b></td>${cnt(it) ? ["week", "month", "quarter"].map((per) => `<td class="n">${LIVE[it.m](id, at(it, per))}</td>`).join("") : `<td colspan="3" class="hint">${esc(fmt(id, it))} (بيتحسب على الربع)</td>`}<td>${esc(it.target)}</td><td class="n"><b>${Math.round(a * 100)}%</b></td></tr>`; }))}`}</section>`;
  }
  A.CHANGE.dbDay = (v) => { A.ui.dbDay = v; A.render(); };
  A.ACT.dbView = (d) => { A.ui.dbView = d.v; A.render(); };
  A.CHANGE.dbFor = (v) => { A.ui.dbFor = v; A.render(); };

  // the board on Reports → KPIs
  A.kpiBoard = (scope) => {
    const ids = visible(scope), all = Object.keys(cards()), avg = all.length ? all.reduce((s, id) => s + score(id), 0) / all.length : 0, apr = Object.keys(K().approved || {}).length;
    const sort = A.ui.kpSort || "low", list = ids.slice().sort((a, b) => (sort === "low" ? score(a) - score(b) : score(b) - score(a)));
    return `${note(`كارت KPIs لكل موظف في ${esc(K().label || "")} من ملف الكلاينت. البند <b>الأوتوماتيك</b> السيستم بيقيسه لوحده من الموديولات، و<b>التسليم</b> الموظف بيسجّله والسيستم بيشوف كان في ميعاده ولا لأ، و<b>اليدوي</b> بيدخّله المتابع. النتيجة = مجموع (الوزن × التحقيق)، وبتتحدّث لحظياً.`)}
      <div class="kpis sm">${U.kpi("الكروت", ids.length, seesAll() ? "كل الشركة" : "كارتك وفريقك", "users")}${U.kpi("متوسط الشركة", Math.round(avg) + "%", K().label, "chart", tone(avg))}${U.kpi("اتعتمد", `${apr} من ${all.length}`, "من المتابع", "check", apr === all.length ? "ok" : "warn")}${U.kpi("الربع", open() ? "مفتوح" : "اتقفل", open() ? "النتايج بتتحدّث" : "النتايج اتبعتت", "clock", open() ? "" : "ok")}</div>
      <div class="toolbar">${U.seg("kpSort", [["low", "الأقل الأول"], ["high", "الأعلى الأول"]], sort)}<span class="spacer"></span>${open() && A.canDo("kpis", "approve") ? `<button class="btn" data-act="kpiClose">${I("send")}اقفل الربع وابعت النتايج</button>` : ""}</div>
      <div class="kpi-cards">${list.map((id) => { const s = score(id), b = below(id).length, ok = (K().approved || {})[id]; return `<button class="kpi-card" data-act="kpiOpen" data-id="${id}"><span class="row">${A.avatar(id)}<span class="kc-who"><b>${esc(A.person(id))}</b><small>${esc(roleOf(id))} · يتابعه: ${esc(followerName(followerOf(id)))}</small></span><b class="num kc-score ${tone(s)}">${Math.round(s)}%</b></span>${U.bar(s, tone(s) === "ok" ? "" : tone(s))}<span class="row">${chip(tone(s), tierName(s), 1)}${money(id)}${b ? chip("warn", `${b} بند تحت المستهدف`, 1) : ""}${ok ? chip("ok", "اتعتمد", 1) : chip("", "مستني اعتماد", 1)}${id === A.uid ? chip("info", "كارتك", 1) : ""}</span></button>`; }).join("") || U.empty("مفيش كروت ليك", "chart")}</div>`;
  };
  A.ACT.kpSort = (d) => { A.ui.kpSort = d.v; A.render(); };

  // one card in the drawer
  function parts(id) {
    const c = cards()[id], s = score(id), mine = id === A.uid, fol = isFollower(id) && open(), edit = A.ui.kpEdit && canManage(id), ok = (K().approved || {})[id], sumW = c.items.reduce((x, it) => x + it.w, 0);
    const body = `<div class="row"><b class="num kc-score big ${tone(s)}">${Math.round(s)}%</b><span class="hint">نتيجة الكارت لحد النهارده</span></div>${U.bar(s, tone(s) === "ok" ? "" : tone(s))}
        ${noMoney() ? "" : payBox(id)}${edit && (A.canDo("kpis", "edit") || watcher()) ? cardAdmin(id) : ""}
        ${edit && sumW !== 100 ? note(`مجموع الأوزان دلوقتي <b>${sumW}%</b> · لازم يبقى 100%.`) : ""}
        <div class="tbl-wrap"><table class="kpi-items"><thead><tr><th>البند</th><th class="c">الوزن</th><th>المستهدف</th><th>القياس</th><th class="c">الفعلي</th><th class="c">التحقيق</th><th class="c">في الكارت</th></tr></thead><tbody>
        ${edit ? "" : c.items.map((it, i) => { const v = valOf(id, it), a = ach(it, v); return `<tr class="${a < 1 ? "under" : ""}"><td><b>${esc(it.t)}</b><span class="sub">بيتحسب: ${esc(calcText(it))}</span>${detailOf(id, it)}</td>
          <td class="c">${edit ? `<input type="number" min="0" max="100" value="${it.w}" data-change="kpiW" data-id="${id}" data-i="${i}" style="width:64px" aria-label="الوزن">` : it.w + "%"}</td>
          <td>${esc(it.target)}</td><td>${chip(HOW[it.how][0], HOW[it.how][1], 1)}${it.mod ? ` <small class="mono hint">${it.mod}</small>` : ""}</td>
          <td class="c">${it.how === "m" && canEnter(id, it) ? `<input type="number" step="any" value="${it.val}" data-change="kpiVal" data-id="${id}" data-i="${i}" style="width:72px" aria-label="القيمة">` : esc(fmt(id, it))}${it.reps && it.reps.length ? `<small class="hint">من تسليم التقارير</small>` : ""}${it.how === "d" && !(it.reps || []).length && mine && open() && it.done < it.need ? `<button class="btn ghost sm" data-act="kpiDeliver" data-id="${id}" data-i="${i}">${I("upload")}سلّمت</button>` : ""}</td>
          <td class="c"><div class="cell-bar"><b class="num">${Math.round(a * 100)}%</b>${U.bar(a * 100, a < 1 ? "warn" : "")}</div></td><td class="c num"><b>${(it.w * a).toFixed(1)}%</b></td></tr>`; }).join("")}
        </tbody><tfoot><tr><td><b>الإجمالي</b></td><td class="c">${sumW}%</td><td colspan="4"></td><td class="c num"><b>${s.toFixed(1)}%</b></td></tr></tfoot></table></div>
        ${edit ? `${c.items.map((it, i) => editBlock(id, it, i)).join("")}<div class="row"><button class="btn ghost" data-act="kpiAdd" data-id="${id}">${I("plus")}بند جديد</button></div>` : ""}
        ${note("كل بند بيتحسب بالنسبة، ولو عدّى 100% بيتسجّل زي ما هو. البند اللي «صفر» أو «لا يزيد عن» لو زاد بيقل بالنسبة (مقترح لحد تأكيد الكلاينت).")}
`;
    const foot = `<div class="row end">${canManage(id) ? `<button class="btn ghost" data-act="kpiEditT">${A.ui.kpEdit ? "خلصت تعديل" : "عدّل البنود"}</button>` : ""}${fol && !ok ? `<button class="btn" data-act="kpiApprove" data-id="${id}">${I("check")}اعتمد النتيجة</button>` : ok ? chip("ok", `اتعتمد من ${A.person(ok.by)}`) : ""}</div>`;
    return { c, ok, body, foot };
  }
  const people = () => (S().users || []).filter((u) => u.status === "active");
  function cardAdmin(id) {
    const c = cards()[id];
    return `<section class="card flat">${head("إعدادات الكارت", "users", "", "الأدمن بس")}<div class="grid">
      ${U.field("مين بيتابعه ويعتمد نتيجته", `<select data-change="kpiBy" data-id="${id}" aria-label="المتابع"><option value="owners" ${c.by === "owners" ? "selected" : ""}>الملاك</option>${people().filter((u) => u.id !== id).map((u) => `<option value="${u.id}" ${c.by === u.id ? "selected" : ""}>${esc(A.person(u.id))}</option>`).join("")}</select>`)}
      ${U.field("انسخ البنود والأوزان دي لـ", `<select data-change="kpiCopy" data-id="${id}" aria-label="انسخ لـ"><option value="">اختار موظف…</option>${people().filter((u) => u.id !== id).map((u) => `<option value="${u.id}">${esc(A.person(u.id))}${cards()[u.id] ? " (عنده كارت · هيتبدل)" : ""}</option>`).join("")}</select>`)}</div></section>`;
  }
  A.CHANGE.kpiBy = (v, el) => { const c = cards()[el.dataset.id]; c.by = v; A.audit("kpis", `${A.person(el.dataset.id)} بقى بيتابعه ${followerName(v)}`); A.toast("اتحفظ"); A.render(); A.refreshDrawer(); };
  A.CHANGE.kpiCopy = (v, el) => {
    if (!v) return; const from = cards()[el.dataset.id];
    if (cards()[v] && !confirm(`${A.person(v)} عنده كارت. تبدّل بنوده ببنود ${A.person(el.dataset.id)}؟`)) { el.value = ""; return; }
    const items = from.items.map((it) => Object.assign(JSON.parse(JSON.stringify(it)), { val: 0, done: 0 })); // same items and weights, nothing achieved yet
    cards()[v] = Object.assign(cards()[v] || { by: from.by, pay: JSON.parse(JSON.stringify(from.pay || {})) }, { items });
    A.audit("kpis", `بنود ${A.person(el.dataset.id)} اتنسخت لـ ${A.person(v)}`); A.toast(`اتنسخت لـ ${A.person(v)}`); el.value = ""; A.render();
  };
  // anyone active without a card can get one (empty, or copied from someone afterwards)
  function noCardCard() {
    const ids = people().map((u) => u.id).filter((id) => !cards()[id]); if (!ids.length || !(A.canDo("kpis", "edit") || watcher())) return "";
    return `<section class="card">${head("موظفين من غير كارت KPIs", "users", chip("warn", ids.length))}${ids.map((id) => `<div class="line-item"><span>${A.who(id)}<small class="hint">${esc(roleOf(id))}</small></span><button class="btn ghost sm" data-act="kpiNew" data-id="${id}">${I("plus")}اعمل كارت</button></div>`).join("")}</section>`;
  }
  // Inventory → KPIs الفريق: Manar's own card + the cards she follows, and a card for anyone in the Inventory team who has none
  const invTeam = () => (S().people || []).filter((p) => p.dept === "Inventory" && p.id !== A.uid && (S().users || []).some((u) => u.id === p.id && u.status === "active")).map((p) => p.id);
  A.kpiInvMissing = () => { const ids = invTeam().filter((id) => !cards()[id]); if (!ids.length || !open()) return "";
    return `<section class="card">${head("في الفريق من غير كارت KPIs", "users", chip("warn", ids.length))}${ids.map((id) => `<div class="line-item"><span>${A.who(id)}<small class="hint">${esc(roleOf(id))}</small></span><button class="btn ghost sm" data-act="kpiNewInv" data-id="${id}">${I("plus")}اعمل كارت</button></div>`).join("")}</section>`; };
  A.ACT.kpiNewInv = (d) => { if (A.role !== "inventory" || !invTeam().includes(d.id) || cards()[d.id]) return; cards()[d.id] = { by: A.uid, items: [], pay: { base: "bonus", period: "quarter", amount: 0 } }; A.audit("kpis", `كارت KPIs جديد لـ ${A.person(d.id)} (يتابعه ${A.person(A.uid)})`); A.ui.kpEdit = true; A.render(); A.ACT.kpiOpen({ id: d.id }); };
  A.ACT.kpiNew = (d) => {
    const p = (S().people || []).find((x) => x.id === d.id) || (S().employees || []).find((x) => x.id === d.id) || {};
    cards()[d.id] = { by: p.tl || "owners", items: [], pay: { base: "bonus", period: "quarter", amount: 0 } };
    A.audit("kpis", `كارت KPIs جديد لـ ${A.person(d.id)}`); A.ui.kpEdit = true; A.render(); A.ACT.kpiOpen({ id: d.id });
  };
  function drawer(id) { const { c, ok, body, foot } = parts(id); return U.drawer(A.person(id), `KPIs · ${K().label} · يتابعه: ${followerName(c.by)}`, chip("info", roleOf(id)) + (ok ? chip("ok", "اتعتمد") : ""), body, foot); }
  // the tier without its money wording, for the KPI watcher
  const tierName = (s) => { if (!noMoney()) return band(s)[1]; const b = BD(); return s >= b.full ? "محقق" : s >= b.partial ? "محتاج متابعة" : s >= b.low ? "ضعيف · خطة تحسين" : "تحت الحد"; };
  const money = (id) => { const v = noMoney() ? 0 : delta(id); return v ? chip(v > 0 ? "ok" : "bad", `${v > 0 ? "+" : "−"}${A.money(Math.abs(v))}`, 1) : ""; };
  function payBox(id) {
    const c = cards()[id], p = c.pay || {}, s = score(id), v = delta(id), set = A.canDo("kpis", "edit") && open(), low = s < 70;
    const sel = (k, opts) => `<select data-change="kpiPay" data-id="${id}" data-k="${k}" ${set ? "" : "disabled"} aria-label="${k}">${opts.map((o) => `<option value="${o}" ${p[k] === o ? "selected" : ""}>${PAYL[o]}</option>`).join("")}</select>`;
    return `<section class="card flat">${head("النتيجة والفلوس", "wallet", chip(tone(s), band(s)[1]))}
      <div class="row">${sel("base", ["bonus", "salary"])}${sel("period", ["quarter", "month"])}${p.base === "bonus" ? `<label class="row hint">البونص <input type="number" min="0" value="${p.amount || 0}" data-change="kpiPay" data-id="${id}" data-k="amount" ${set ? "" : "disabled"} style="width:110px"></label>` : `<span class="hint">المرتب ${A.money(baseAmt(id))}</span>`}</div>
      <p>${v > 0 ? `مكافأة <b class="num">${A.money(v)}</b> على ${PAYL[p.base]}` : v < 0 ? `خصم <b class="num">${A.money(-v)}</b> من ${PAYL[p.base]}` : `${PAYL[p.base]} كامل`} · ${PAYL[p.period]}</p>
      ${low ? `<label class="field"><span>خطة التحسين ${s < BD().low ? "· تحت الـ Threshold: البونص اتلغى + إنذار مكتوب، ولو اتكرر ربعين ورا بعض بيروح للـ HR" : ""}</span><textarea rows="2" data-change="kpiPlan" data-id="${id}" ${isFollower(id) && open() ? "" : "disabled"} placeholder="المتابع بيكتب الخطة والمواعيد">${esc(c.plan || "")}</textarea></label>` : ""}
      <small class="hint">100%+ مكافأة 15% · 96%+ بونص كامل · 70–95% جزئي (النقص بيزيد بالتساوي لحد 15%) · أقل من 70% خصم 15% + خطة تحسين · أقل من 50% البونص بيتلغي + خصم 15% من المرتب + إنذار</small></section>`;
  }
  A.CHANGE.kpiPay = (v, el) => { const c = cards()[el.dataset.id], p = (c.pay = c.pay || {}); p[el.dataset.k] = el.dataset.k === "amount" ? +v : v; A.audit("reports", `KPI ${A.person(el.dataset.id)}: الحسبة على ${PAYL[p.base]} · ${PAYL[p.period]}`, 1); A.render(); A.refreshDrawer(); };
  A.CHANGE.kpiPlan = (v, el) => { cards()[el.dataset.id].plan = v; A.audit("reports", `خطة تحسين لـ ${A.person(el.dataset.id)}`); A.toast("خطة التحسين اتحفظت"); };
  A.ACT.kpiOpen = (d) => A.openDrawer(() => drawer(d.id));
  A.CHANGE.kpiW = (v, el) => { const it = cards()[el.dataset.id].items[+el.dataset.i], old = it.w; it.w = Math.max(0, Math.min(100, Math.round(+v || 0))); A.audit("kpis", `KPI ${A.person(el.dataset.id)} · ${it.t}: الوزن ${old}% ← ${it.w}%`); A.toast("اتحفظ الوزن"); A.render(); A.refreshDrawer(); };
  A.CHANGE.kpiVal = (v, el) => { const it = cards()[el.dataset.id].items[+el.dataset.i]; it.val = +v; A.audit("reports", `KPI ${A.person(el.dataset.id)} · ${it.t}: ${v}`); A.toast("اتحفظ · النتيجة اتحدّثت"); A.render(); A.refreshDrawer(); };
  // edit mode: every field of an item, plus add / remove
  const editBlock = (id, it, i) => {
    const at = `data-id="${id}" data-i="${i}"`, f = (k, v, x) => `<input value="${esc(v == null ? "" : v)}" data-change="kpiF" ${at} data-k="${k}" ${x || ""}>`;
    const sel = (k, o, v, ch) => `<select data-change="${ch || "kpiF"}" ${at} data-k="${k}" aria-label="${k}">${o.map(([x, l]) => `<option value="${x}" ${String(v ?? "") === String(x) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const groups = [...new Set(Object.values(META).map((m) => m.g))];
    const metric = `<select data-change="kpiF" ${at} data-k="m" aria-label="المقياس"><option value="">اختار بيتحسب من إيه…</option>${groups.map((g) => `<optgroup label="${g}">${Object.entries(META).filter(([, m]) => m.g === g).map(([k, m]) => `<option value="${k}" ${it.m === k ? "selected" : ""}>${esc(m.l)}</option>`).join("")}</optgroup>`).join("")}</select>`;
    const params = it.how === "a" && it.m && META[it.m] && META[it.m].ps ? META[it.m].ps.map((k) => U.field(PS[k][0], PS[k][1] ? sel(k, PS[k][1], P(it)[k] || (k === "per" ? "quarter" : ""), "kpiP") : PS[k][2] === "text" ? `<input value="${esc(P(it)[k] ?? (k === "excl" ? "By Safwat" : ""))}" data-change="kpiP" ${at} data-k="${k}" aria-label="${PS[k][0]}">` : `<input type="number" min="1" value="${P(it)[k] || (k === "hours" ? 24 : 30)}" data-change="kpiP" ${at} data-k="${k}" aria-label="${PS[k][0]}" style="max-width:100px">`)).join("") : "";
    const hand = (S().schedReports || []).filter((r) => r.kind === "handin");
    const goal = U.field("المستهدف بالرقم", `<div class="row">${sel("dir", [["min", "لا يقل عن"], ["max", "لا يزيد عن"]], it.dir || "min")}${f("goal", it.goal, 'type="number" step="any" style="max-width:100px" aria-label="المستهدف بالرقم"')}<span class="hint">${it.how === "a" && it.m && META[it.m] ? (META[it.m].u === "%" ? "%" : "") : ""}</span></div>`);
    return `<section class="card flat kpi-edit">${head(it.t || "بند", "chart", `<button class="btn ghost sm" data-act="kpiDel" ${at} aria-label="امسح البند">${I("x")}امسح</button>`)}
      <p class="rule-says">${I("bolt")}<span><b>بيتحسب:</b> ${esc(calcText(it))} · <b>الفعلي دلوقتي:</b> ${esc(fmt(id, it))}</span></p>
      <div class="grid">${U.field("اسم البند", f("t", it.t, 'aria-label="اسم البند"'))}${U.field("الوزن %", f("w", it.w, 'type="number" min="0" max="100" style="max-width:100px" aria-label="الوزن"'))}
        ${U.field("المستهدف زي ما بيتكتب", f("target", it.target, 'aria-label="المستهدف"'))}
        ${U.field("بيتحسب إزاي", sel("how", [["a", "السيستم بيحسبه"], ["d", "من تسليم تقرير"], ["m", "حد بيدخّله بإيده"]], it.how))}
        ${it.how === "a" ? U.field("بيتحسب من", metric) + params + goal : ""}
        ${it.how === "d" ? U.field("التقرير", `<select data-change="kpiRep" ${at} aria-label="التقرير"><option value="">من غير تقرير (بيسلّمه من الكارت)</option>${hand.map((r) => `<option value="${r.id}" ${(it.reps || []).includes(r.id) ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>`) + U.field("مطلوب كام مرة في الربع", f("need", it.need, 'type="number" min="1" style="max-width:100px" aria-label="مرات التسليم"')) : ""}
        ${it.how === "m" ? goal + U.field("بيدخّله من فين (ملاحظة)", f("src", it.src, 'placeholder="مثلاً: مراجعة نانسي الأسبوعية" aria-label="المصدر"')) : ""}</div>
      ${it.how === "m" ? `<div class="field"><span>مين بيدخّل الرقم</span>${U.whoEdit(it.by || ["follower"], "kpiItemWho", at, true, [["follower", "المتابع بتاع الكارت"]])}</div>` : ""}</section>`;
  };
  // settings of the chosen metric (period, kind, minutes…), the report a hand-in counts, and who types a manual value
  A.CHANGE.kpiP = (v, el) => { const it = cards()[el.dataset.id].items[+el.dataset.i]; it.p = Object.assign({}, it.p, { [el.dataset.k]: ["min", "hours"].includes(el.dataset.k) ? +v : v }); A.audit("kpis", `KPI ${A.person(el.dataset.id)} · ${it.t}: ${PS[el.dataset.k][0]} ← ${v}`); A.render(); A.refreshDrawer(); };
  A.CHANGE.kpiRep = (v, el) => { const it = cards()[el.dataset.id].items[+el.dataset.i]; it.reps = v ? [v] : []; A.audit("kpis", `KPI ${A.person(el.dataset.id)} · ${it.t}: ${v ? `بيتحسب من «${repName(v)}»` : "اتشال من التقارير"}`); A.render(); A.refreshDrawer(); };
  A.CHANGE.kpiItemWhoAdd = (v, el) => { if (!v) return; const it = cards()[el.dataset.id].items[+el.dataset.i]; it.by = [...(it.by || ["follower"]), v]; A.audit("kpis", `KPI ${A.person(el.dataset.id)} · ${it.t}: ${byName(v)} بقى بيدخّله`); A.render(); A.refreshDrawer(); };
  A.ACT.kpiItemWhoDel = (d) => { const it = cards()[d.id].items[+d.i]; it.by = (it.by || ["follower"]).filter((x) => x !== d.v); A.audit("kpis", `KPI ${A.person(d.id)} · ${it.t}: ${byName(d.v)} اتشال من اللي بيدخّلوه`); A.render(); A.refreshDrawer(); };
  A.CHANGE.kpiF = (v, el) => { const id = el.dataset.id, it = cards()[id].items[+el.dataset.i], k = el.dataset.k, old = it[k], num = ["w", "goal", "need"].includes(k);
    it[k] = num ? +v : v;
    if (k === "how" && v === "d") Object.assign(it, { need: it.need || 4, done: it.done || 0, goal: 100, dir: "min" });
    if (k === "how" && v === "m") { delete it.m; if (it.need) { it.goal = 100; it.val = pct(it.done, it.need); } }
    if (k === "m") { it.p = {}; if (v && META[v]) Object.assign(it, { mod: it.mod || "", goal: META[v].u === "%" ? 100 : it.goal || 1 }); }
    if (k === "need") it.done = Math.min(it.done || 0, +v);
    A.audit("reports", `KPI ${A.person(id)} · ${it.t}: ${k} ${old ?? ""} ← ${v}`); A.render(); A.refreshDrawer(); };
  A.ACT.kpiAdd = (d) => { cards()[d.id].items.push({ t: "بند جديد", w: 0, target: "", src: "", how: "m", mod: "", goal: 100, dir: "min", val: 0 }); A.audit("reports", `KPI ${A.person(d.id)}: بند جديد`); A.render(); A.refreshDrawer(); };
  A.ACT.kpiDel = (d) => { const c = cards()[d.id], it = c.items[+d.i]; if (!confirm(`تمسح «${it.t}» من كارت ${A.person(d.id)}؟`)) return; c.items.splice(+d.i, 1); A.audit("reports", `KPI ${A.person(d.id)}: اتمسح «${it.t}»`); A.render(); A.refreshDrawer(); };
  A.ACT.kpiEditT = () => { A.ui.kpEdit = !A.ui.kpEdit; A.refreshDrawer(); };
  A.ACT.kpiDeliver = (d) => { const it = cards()[d.id].items[+d.i]; it.done = Math.min(it.need, it.done + 1); A.audit("reports", `${A.person(d.id)} سلّم «${it.t}» في الميعاد`); A.toast("اتسجّل التسليم في ميعاده"); A.render(); A.refreshDrawer(); };
  A.ACT.kpiApprove = (d) => { const k = K(); (k.approved = k.approved || {})[d.id] = { by: A.uid, at: A.nowIso() }; A.audit("reports", `اتعتمد KPI ${A.person(d.id)} · ${Math.round(score(d.id))}%`); A.toast("النتيجة اتعتمدت"); A.render(); A.refreshDrawer(); };
  A.ACT.kpiClose = () => {
    const k = K(), left = Object.keys(k.cards).filter((id) => !(k.approved || {})[id]).length;
    if (left && !confirm(`فيه ${left} كارت لسه ماتعتمدش. تقفل الربع برضه؟`)) return;
    Object.keys(k.cards).forEach((id) => { const u = (S().users || []).find((x) => x.id === id); const v = delta(id); k.cards[id].final = Math.round(score(id) * 10) / 10; k.cards[id].amount = v; if (u && u.status === "active") A.sendMail(u.email, `نتيجة الـ KPIs بتاعتك · ${k.label}`, `نتيجتك ${k.cards[id].final}% · ${band(score(id))[1]}${v ? ` · ${v > 0 ? "مكافأة" : "خصم"} ${A.money(Math.abs(v))}` : ""}. ${below(id).map((it) => `تحت المستهدف: ${it.t}`).join(" · ") || "كل البنود محققة."}`, { kind: "kpi" }); });
    k.status = "closed"; A.audit("reports", `الـ Office Manager قفلت ${k.label} · النتايج اتبعتت`); A.notify(["admin"], `${k.label} اتقفل · متوسط الشركة ${Math.round(Object.keys(k.cards).reduce((s, id) => s + k.cards[id].final, 0) / Object.keys(k.cards).length)}%`); A.toast("الربع اتقفل والنتايج اتبعتت على الإيميل"); A.render();
  };

  // home: my card, and what's waiting for me as a follower
  A.kpiMine = () => {
    const c = cards()[A.uid]; if (!c) return "";
    const s = score(A.uid), b = below(A.uid);
    return `<section class="card">${head("الـ KPIs بتاعتي", "chart", chip(tone(s) === "ok" ? "ok" : tone(s), Math.round(s) + "%"), `${K().label} · يتابعني: ${followerName(c.by)}`)}${U.bar(s, tone(s) === "ok" ? "" : tone(s))}
      ${b.length ? `<ul class="plain">${b.slice(0, 3).map((it) => `<li>${I("alert")}<span>${esc(it.t)} <small class="hint">· ${esc(fmt(A.uid, it))} من ${esc(it.target)}</small></span></li>`).join("")}</ul>` : `<p class="hint">كل البنود محققة لحد دلوقتي.</p>`}
      <div class="row end"><button class="btn ghost sm" data-act="kpiOpen" data-id="${A.uid}">افتح الكارت</button></div></section>`;
  };
  A.kpiInbox = (add) => {
    if (!open()) return;
    Object.keys(cards()).filter((id) => isFollower(id) && !(K().approved || {})[id]).forEach((id) => add("", "chart", `KPIs ${A.person(id)}: ${Math.round(score(id))}%`, `${cards()[id].items.filter((it) => it.how === "m").length} بند يدوي بتدخّله · ومستني اعتمادك`, "kpiOpen", { id }, "افتح الكارت"));
    ACTS().filter((a) => a.by === A.uid && a.status === "planned" && a.at <= A.nowIso()).forEach((a) => add("warn", "pin", `عملت الـ ${a.kind} في ${a.place}؟`, `كان ميعادها ${A.fmtDate(a.at)} ${A.fmtTime(a.at)}`, "actDone", { id: a.id }, "سجّل"));
    Object.keys(cards()).forEach((id) => { if (isFollower(id)) return; const n = cards()[id].items.filter((it) => it.how === "m" && it.by && canEnter(id, it)).length; if (n) add("", "chart", `دخّل أرقام KPIs ${A.person(id)}`, `${n} بند بتدخّله بإيدك`, "kpiOpen", { id }, "افتح الكارت"); });
    const c = cards()[A.uid]; if (c) c.items.forEach((it, i) => { if (it.how === "d" && !(it.reps || []).length && it.done < it.need) add("warn", "upload", `تسليم: ${it.t}`, `${it.done} من ${it.need} · بند في الـ KPIs بتاعتك`, "kpiOpen", { id: A.uid }, "سلّم");});
  };
  A.kpiScore = score;
  A.kpiCards = cards;
  A.kpiItemFor = (id, rep) => (cards()[id] ? cards()[id].items.find((it) => (it.reps || []).includes(rep)) : null); // the item a hand-in report counts toward
  // M-12 · its own page for everybody: my card, the cards I manage, the whole company (management), the ideal employee
  const V = (window.VIEWS = window.VIEWS || {});
  V.kpis = {
    sub: () => "كارت كل موظف للربع · المدير بيتحكم في بنود فريقه · الموظف المثالي",
    render() {
      const mine = !!cards()[A.uid], team = visible("team").length, tabs = [mine && ["me", "كارتي"], team && ["team", "فريقي", team], seesAll() && ["all", "كل الشركة", Object.keys(cards()).length], (team || seesAll()) && ["daily", "التقارير اليومية"], (watcher() || A.role === "admin") && ["log", "التقارير والتغييرات"], !noMoney() && ["ideal", "الموظف المثالي"]].filter(Boolean);
      const t = tabs.some((x) => x[0] === A.ui.kpTab) ? A.ui.kpTab : tabs[0][0];
      let body = "";
      if (t === "me") { const x = parts(A.uid); body = `<section class="card">${head(`${A.person(A.uid)} · ${roleOf(A.uid)}`, "chart", "", `${K().label} · يتابعني: ${followerName(x.c.by)}`)}${x.body}${x.foot}</section>`; }
      if (t === "team" || t === "all") body = A.kpiBoard(t === "team" ? "team" : "") + (t === "all" ? quarterCard() + noCardCard() + watchCard() + (noMoney() ? "" : bandsCard()) : "") + draftsCard(t);
      if (t === "log") body = logView();
      if (t === "daily") body = dailyBoard();
      if (t === "ideal") { const m = A.today().slice(0, 7); body = `${note("الموظف المثالي في كل فريق بيستلم خصومات الحضور والتأخير بتاعة باقي الفريق آخر الشهر. التفاصيل والجزاءات في الـ HR ← التوفير.")}${table(["الفريق", "الموظف المثالي", "الصندوق"], (A.idealTeams ? A.idealTeams() : []).map(([k, mm]) => { const x = A.idealOf(mm, m); return `<tr><td><b>${esc(k)}</b><span class="sub">${mm.length} موظف</span></td><td>${x.win ? A.who(x.win.e.id) : chip("warn", "مفيش حد مستوفي الشروط")}</td><td class="n">${A.money(x.fund)}</td></tr>`; }))}`; }
      return `<div class="row">${U.tabs("kpTab", tabs, t)}</div>${body}`;
    }
  };
  // who runs the KPIs day to day: sees every card, report and change (never money) and is told about each change
  const nextQ = (q) => { const [y, n] = q.split("-Q").map(Number); return n === 4 ? `${y + 1}-Q1` : `${y}-Q${n + 1}`; };
  const qLabel = (q) => q.replace(/(\d+)-Q(\d)/, "Q$2 $1");
  // a new quarter starts from the current cards (same items and weights, nothing achieved yet); past quarters keep their results
  function quarterCard() {
    if (!(A.canDo("kpis", "edit") || watcher())) return "";
    const H = K().history || [];
    return `<section class="card">${head("الأرباع", "calendar", chip(open() ? "ok" : "warn", `${K().label} · ${open() ? "شغال" : "اتقفل"}`), "كل ربع بيبدأ بنسخة من كروت الربع اللي قبله، وبعدها تعدّلوا البنود براحتكم")}
      ${H.length ? table(["الربع", "عدد الكروت", "متوسط النتيجة"], H.slice().reverse().map((h) => { const v = Object.values(h.scores); return `<tr><td><b>${esc(h.label)}</b></td><td class="n">${v.length}</td><td class="n">${v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0}%</td></tr>`; })) : `<p class="hint">مفيش أرباع قبل كده في السيستم.</p>`}
      <div class="row end"><button class="btn ghost" data-act="kpiNewQ">${I("plus")}ابدأ ${esc(qLabel(nextQ(K().q)))}</button></div></section>`;
  }
  A.ACT.kpiNewQ = () => {
    const k = K(), q = nextQ(k.q), label = qLabel(q);
    if (!confirm(`تبدأ ${label}؟ نتايج ${k.label} هتتحفظ، وكل كارت هيبدأ بنفس البنود والأوزان من غير أرقام.`)) return;
    (k.history = k.history || []).push({ q: k.q, label: k.label, scores: Object.fromEntries(Object.keys(k.cards).map((id) => [id, Math.round(score(id))])) });
    Object.values(k.cards).forEach((c) => { delete c.final; delete c.amount; c.items.forEach((it) => { if (it.how !== "a" || !it.m) it.val = 0; if (it.how === "d") it.done = 0; }); });
    Object.assign(k, { q, label, status: "open", approved: {} });
    A.audit("kpis", `بدأ ${label} بنسخة من كروت الربع اللي فات`); A.toast(`${label} بدأ · عدّلوا البنود براحتكم`); A.render();
  };
  function watchCard() {
    if (!A.canDo("kpis", "edit")) return "";
    return `<section class="card">${head("مسؤول الـ KPIs", "chart", "", "بيشوف كل الكروت والتقارير وأي تغيير، وبيتبلّغ بيه · من غير أي حاجة ليها علاقة بالفلوس")}${U.whoEdit(S().kpiWatch.to, "kpiWatch", "", true)}</section>`;
  }
  A.CHANGE.kpiWatchAdd = (v) => { if (!v) return; S().kpiWatch.to = [...S().kpiWatch.to, v]; A.audit("kpis", `${U.whoName(v)} بقى من مسؤولين الـ KPIs`); A.toast("اتحفظ"); A.render(); };
  A.ACT.kpiWatchDel = (d) => { S().kpiWatch.to = S().kpiWatch.to.filter((x) => x !== d.v); A.audit("kpis", `${U.whoName(d.v)} اتشال من مسؤولين الـ KPIs`); A.toast("اتحفظ"); A.render(); };
  // every KPI / report change, and the reports with their schedules · money lines and money reports are hidden from the watcher
  function logView() {
    const hide = noMoney(), log = (S().audit || []).filter((a) => (a.mod === "kpis" || a.mod === "reports") && !(hide && a.money)).slice(0, 40);
    return `<section class="card">${head("سجل التغييرات", "clock", chip("info", log.length), "كل تعديل على الـ KPIs أو التقارير، ومين عمله وإمتى")}
      <div class="timeline">${log.map((a) => `<div>${esc(a.text)}<small>${esc(A.person(a.by))} · ${A.fmtDate(a.at)} ${A.fmtTime(a.at)}</small></div>`).join("") || U.empty("مفيش تغييرات لسه", "clock")}</div></section>
      ${A.reportCards ? A.reportCards(hide) : ""}`;
  }
  // M-13: the money bands, editable by whoever has KPI edit rights
  function bandsCard() {
    const b = BD(), ed = A.canDo("kpis", "edit"), n = (k, w) => (ed ? `<input type="number" value="${b[k]}" data-change="kpiBand" data-k="${k}" style="width:${w || 64}px" aria-label="${k}">` : `<b>${b[k]}</b>`);
    return `<section class="card">${head("شرايح الفلوس", "wallet", "", "واحدة للكل · الحسبة على المرتب أو بونص الكوارتر حسب كل موظف")}
      <div class="tiers"><div class="tier ok"><b>${n("top")}% وأكتر</b><span>البونص كامل + مكافأة ${n("reward", 52)}%</span></div><div class="tier ok"><b>${n("full")}%</b><span>بونص كامل</span></div><div class="tier warn"><b>${n("partial")}% لحد ${b.full}%</b><span>بونص جزئي (النقص لحد ${b.cut}%)</span></div><div class="tier warn2"><b>أقل من ${b.partial}%</b><span>خصم ${n("cut", 52)}% + خطة تحسين</span></div><div class="tier bad"><b>أقل من ${n("low")}%</b><span>Threshold: البونص بيتلغي + خصم ${b.cut}% من المرتب + إنذار</span></div></div></section>`;
  }
  // next quarter's Team Leader cards (RECA TECH's draft until the client sends theirs): shown, not scored yet
  function draftsCard(t) {
    const D = K().drafts || {}, ids = Object.keys(D).filter((id) => t === "all" ? seesAll() : id === A.uid || D[id].by === A.uid); if (!ids.length) return "";
    return `<section class="card">${head("كروت الـ Team Leaders · الربع الجاي", "list", chip("warn", "مسودة من RECA TECH"), "بتتفعّل أول الربع الجاي، ولحد ما الكلاينت يبعت بتاعته")}
      ${table(["البند", "الوزن", "المستهدف", "بيتقاس إزاي"], (D[ids[0]].items || []).map((it) => `<tr><td><b>${esc(it.t)}</b><span class="sub">${esc(it.src)}</span></td><td class="c">${it.w}%</td><td>${esc(it.target)}</td><td>${chip(HOW[it.how][0], HOW[it.how][1], 1)}${it.mod ? ` <small class="mono hint">${it.mod}</small>` : ""}</td></tr>`))}
      <p class="hint">نفس الكارت لـ ${ids.map((id) => esc(A.person(id))).join("، ")} · يتابعهم أحمد إسلام.</p>${A.canDo("kpis", "edit") && t === "all" ? `<div class="row end"><button class="btn ghost sm" data-act="kpiDraftOn">${I("check")}فعّلها دلوقتي</button></div>` : ""}</section>`;
  }
  A.ACT.kpiDraftOn = () => { const k = K(); Object.entries(k.drafts || {}).forEach(([id, c]) => { k.cards[id] = c; }); k.drafts = {}; A.audit("kpis", "كروت الـ Team Leaders اتفعّلت"); A.toast("الكروت اتفعّلت · بتتحسب من دلوقتي"); A.render(); };
  A.CHANGE.kpiBand = (v, el) => { const k = K(); k.bands = Object.assign(BD(), { [el.dataset.k]: +v }); A.audit("kpis", `شرايح الـ KPIs: ${el.dataset.k} = ${v}`, 1); A.toast("اتحفظ · كل الكروت اتحسبت تاني"); A.render(); };
  A.ACT.kpTab = (d) => { A.ui.kpTab = d.v; A.render(); };
})();
