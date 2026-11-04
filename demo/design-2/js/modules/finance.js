/* M-07 Finance on the chart of accounts: dashboard, income statement, balance sheet, cost center, payroll, periods. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, head, note, table } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  function figures() {
    // Q37–Q39: revenue is Places' commission, recorded in full from the first collection (the rest is a receivable)
    const st = S(), deals = st.deals.filter(A.countsRevenue), rev = deals.reduce((s, d) => s + A.placesComm(d), 0);
    const byKind = {}; deals.forEach((d) => (byKind[d.kind] = (byKind[d.kind] || 0) + A.placesComm(d)));
    const salesCom = deals.reduce((s, d) => s + A.salesComm(d), 0), opsCom = rev * 0.05, tlCom = st.people.filter((p) => p.role === "tl").reduce((s, p) => s + A.tlStats(p.id).comm, 0); // shortcut: demo rate for ops commission
    const direct = [["عمولة مبيعات", salesCom], ["عمولة اوبريشن", opsCom], ["عمولة تيم ليدر", tlCom]];
    const paidByLine = {}; st.purchases.filter((p) => p.status === "Paid").forEach((p) => (paidByLine[p.line] = (paidByLine[p.line] || 0) + p.amount));
    const selling = st.expenses.selling.map(([k, v]) => [k, v + (paidByLine[k] || 0)]), admin = st.expenses.admin.map(([k, v]) => [k, v + (paidByLine[k] || 0)]);
    const sum = (a) => a.reduce((s, x) => s + x[1], 0);
    const saved = (st.dedApproved || {})[A.today().slice(0, 7)] ? st.attendance.filter((a) => a.day.startsWith(A.today().slice(0, 7))).reduce((s, a) => { const x = A.attRow(a); return s + x.ded * A.dayRate(x.e); }, 0) : 0; // Q32: only after HR approves
    const d = sum(direct), se = sum(selling), ad = sum(admin);
    return { rev, byKind, direct, d, selling, se, admin, ad, saved, gross: rev - d, contrib: rev - d - se, net: rev - d - se - ad + saved };
  }
  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const ensurePeriod = () => { const st = S(), t = A.today(), name = `${MONTHS[+t.slice(5, 7) - 1]} ${t.slice(0, 4)}`; if (st.periods.some((x) => x.name === name)) return;
    st.periods.forEach((x) => { if (x.status === "مفتوح") x.status = "مقفول شهرياً"; }); st.periods.push({ name, status: "مفتوح" }); };
  V.finance = {
    sub: () => "سندات الصرف والقبض · التحويلات · العهد والسلف · القيود · قايمة الدخل · الميزانية",
    render() {
      const t = ui("fnTab") || "dash";
      ensurePeriod();
      return `<div class="row">${U.tabs("fnTab", [["dash", "Dashboard"], ["cash", "الخزن والحركات"], ["custody", "العهد والسلف"], ["journal", "القيود"], ["bills", "الفواتير الثابتة", billsDue().length || ""], ["pnl", "قايمة الدخل"], ["bs", "الميزانية العمومية"], ["budget", "البادجت", budOver().length || ""], ["cost", "Cost Center"], ["payroll", "المرتبات"], ["tree", "شجرة الحسابات"]], t)}</div>${FN[t]()}`;
    }
  };
  A.ACT.fnTab = (d) => { ui("fnTab", d.v); A.render(); };
  const row = (l, v, cls, drill) => `<tr class="${cls || ""} ${v < 0 ? "neg" : ""} ${drill ? "click" : ""}" ${drill ? `data-act="drill" data-k="${esc(drill)}"` : ""}><td>${esc(l)}${drill ? ` <span class="hint">${I("search")}</span>` : ""}</td><td class="n">${A.money(v)}</td></tr>`;
  /* ---------- treasury: every movement is a voucher; balances, statements and journal entries all come from it ---------- */
  const KIND = { pay: ["إذن صرف خزنة", "bad"], receive: ["إذن توريد خزنة", "ok"], transfer: ["تحويل بين خزن", "info"], advance: ["سلفة موظف", "warn"], custody: ["عهدة", "warn"], settle: ["تسوية عهدة", ""], advded: ["خصم سلفة من المرتب", "info"], commission: ["صرف عمولة سيلز", "bad"] };
  const acc = (name) => S().accounts.find((a) => a.name === name);
  const lines = () => [...S().expenses.admin.map(([k]) => [k, "مصروفات إدارية"]), ...S().expenses.selling.map(([k]) => [k, "مصروفات بيعية"])];
  const lineOpts = (v) => `<optgroup label="مصروفات إدارية">${S().expenses.admin.map(([k]) => opt(k, k, v)).join("")}</optgroup><optgroup label="مصروفات بيعية">${S().expenses.selling.map(([k]) => opt(k, k, v)).join("")}</optgroup>`;
  const accOpts = (v, skip) => S().accounts.filter((a) => a.name !== skip).map((a) => opt(a.name, `${a.name} · ${A.money(a.balance)}`, v)).join("");
  const people = () => S().employees.map((e) => opt(e.id, A.person(e.id))).join("");
  const partyName = (m) => (m.party && S().people.some((p) => p.id === m.party) ? A.person(m.party) : m.party || "—");
  const canPost = () => A.canDo("finance", "create");
  const openPeriod = () => S().periods[S().periods.length - 1].status === "مفتوح";
  const NATURE = { pay: "صرف نقدية", receive: "توريد نقدية", transfer: "تحويل نقدية بين الخزن", advance: "سلفة موظف", custody: "صرف عهدة", settle: "تسوية عهدة", advded: "خصم سلفة من المرتب", commission: "صرف عمولة سيلز" };
  const LIVE = (d) => !["Pending Review", "Rejected", "Cancelled"].includes(d.status);
  const dueOf = (d) => (A.countsRevenue(d) ? Math.max(0, A.placesComm(d) - A.collected(d)) : 0);
  // every client of a deal (or one the accountant adds) gets its own account under 113; the code is given once and kept
  function clientKids(st) {
    const cc = st.clientCodes = st.clientCodes || {}, names = [...st.deals.filter(LIVE).slice().reverse().map((d) => d.client), ...st.moves.filter((m) => m.kind === "receive" && m.source === "عمولة من عميل" && m.party).slice().reverse().map((m) => m.party)]; /* oldest first */
    names.forEach((n) => { if (!cc[n]) cc[n] = Object.keys(cc).length + 1; });
    return Object.keys(cc).sort((a, b) => cc[a] - cc[b]).map((n) => ({ code: "113" + String(cc[n]).padStart(3, "0"), name: n, key: "عميل:" + n, bal: st.deals.filter((d) => d.client === n).reduce((s, d) => s + dueOf(d), 0) }));
  }
  const advGiven = (id) => S().advances.filter((a) => a.emp === id).reduce((s, a) => s + a.amount, 0);
  const advTaken = (id) => (S().advDeds || []).filter((x) => x.emp === id).reduce((s, x) => s + x.amount, 0);
  const advLeft = (id) => advGiven(id) - advTaken(id);
  const advEmps = () => [...new Set(S().advances.map((a) => a.emp))];
  const advPosted = (mk) => (S().advDeds || []).some((x) => x.month === mk);
  // planned deduction this month: what Ahmed typed, else last month's choice, else all of it · never more than what's left
  const advPlan = (id, mk) => { const st = S(), m = mk || A.today().slice(0, 7); if (advPosted(m)) return (st.advDeds || []).filter((x) => x.emp === id && x.month === m).reduce((s, x) => s + x.amount, 0);
    const v = ((st.advPlan || {})[m] || {})[id] ?? (st.advMonthly || {})[id]; return Math.min(advLeft(id), v == null ? advLeft(id) : +v); };
  function advKids(st) { const ec = st.advCodes = st.advCodes || {}; advEmps().forEach((id) => { if (!ec[id]) ec[id] = Object.keys(ec).length + 1; });
    return Object.keys(ec).sort((a, b) => ec[a] - ec[b]).map((id) => ({ code: "114" + String(ec[id]).padStart(2, "0"), name: A.person(id), key: "سلفة:" + id, emp: id, bal: advLeft(id) })); }
  const earnedOf = (id) => S().deals.filter((d) => A.dealStatus(d) === "Fully Collected").reduce((s, d) => s + A.salesComm(d, id), 0);
  const paidOf = (id) => (S().commPaid || []).filter((x) => x.emp === id).reduce((s, x) => s + x.amount, 0);
  const commDue = (id) => earnedOf(id) - paidOf(id);
  // due on one deal = his share − what was paid on that deal; payments saved without a deal (older demos) cover the oldest deals first
  const dealDue = (d, id) => { const P = S().commPaid || [], left = (x) => (A.dealStatus(x) === "Fully Collected" ? A.salesComm(x, id) : 0) - P.filter((y) => y.emp === id && y.deal === x.id).reduce((s, y) => s + y.amount, 0);
    let free = P.filter((y) => y.emp === id && !y.deal).reduce((s, y) => s + y.amount, 0);
    for (const x of S().deals.slice().reverse()) { const l = Math.max(0, left(x)), use = Math.min(l, free); free -= use; if (x.id === d.id) return l - use; } return left(d); };
  const dueDeals = (id) => S().deals.filter((d) => dealDue(d, id) > 0.5);
  const tcrsFor = (d, id) => (d.tcrs || []).filter(() => A.buyersOf(d).concat(A.sellersOf(d)).includes(id));
  const salesIds = () => [...new Set(S().deals.filter(LIVE).flatMap((d) => A.salesShares(d).map((x) => x.sales)))];
  function commKids(st) { const sc = st.salesCodes = st.salesCodes || {}; salesIds().filter((id) => earnedOf(id) || paidOf(id)).forEach((id) => { if (!sc[id]) sc[id] = Object.keys(sc).length + 1; });
    return Object.keys(sc).sort((a, b) => sc[a] - sc[b]).map((id) => ({ code: "211" + String(sc[id]).padStart(2, "0"), name: A.person(id), key: "عمولة:" + id, emp: id, bal: commDue(id) })); }
  function coa() {
    const st = S(), p = figures(), cash = st.accounts, kids = (code, list) => list.map((x, i) => Object.assign({ code: code + String(i + 1).padStart(2, "0") }, x));
    const ar = st.deals.filter(A.countsRevenue).reduce((s, d) => s + Math.max(0, A.placesComm(d) - A.collected(d)), 0), adv = st.advances.reduce((s, a) => s + a.amount, 0) - (st.advDeds || []).reduce((s, x) => s + x.amount, 0), cust = st.custody.reduce((s, c) => s + c.amount, 0);
    const comPay = st.deals.filter((d) => A.dealStatus(d) === "Fully Collected").reduce((s, d) => s + A.salesComm(d), 0) - (st.commPaid || []).reduce((s, x) => s + x.amount, 0), other = st.moves.filter((m) => m.kind === "receive" && m.source !== "عمولة من عميل").reduce((s, m) => s + m.amount, 0);
    const assets = cash.reduce((s, a) => s + a.balance, 0) + ar + adv + cust + 420000, liab = comPay + 86000;
    const T = [
      { code: "1", name: "الأصول", nat: "dr", kids: [
        { code: "11", name: "الأصول المتداولة", kids: [
          { code: "111", name: "النقدية بالخزن", kids: kids("111", cash.filter((a) => a.kind === "خزينة").map((a) => ({ name: a.name, bal: a.balance, key: a.name }))) },
          { code: "112", name: "النقدية بالبنوك والمحافظ", kids: kids("112", cash.filter((a) => a.kind !== "خزينة").map((a) => ({ name: a.name, bal: a.balance, key: a.name }))) },
          { code: "113", name: "العملاء (عمولات مستحقة)", key: "عملاء", kids: clientKids(st) }, { code: "114", name: "سلف الموظفين", key: "سلف موظفين", kids: advKids(st) }, { code: "115", name: "العهد", bal: cust, key: "عهد" }] },
        { code: "12", name: "الأصول الثابتة (صافي)", bal: 420000 }] },
      { code: "2", name: "الخصوم", nat: "cr", kids: [{ code: "21", name: "الخصوم المتداولة", kids: [{ code: "211", name: "عمولة مبيعات مستحقة", kids: commKids(st) }, { code: "212", name: "ضرائب قيمة مضافة", bal: 86000 }] }] },
      { code: "3", name: "حقوق الملكية", nat: "cr", kids: [{ code: "31", name: "رأس المال", bal: 1500000 }, { code: "32", name: "الأرباح المحتجزة", bal: assets - liab - 1500000 - p.net - other + (st.glPlug || 0) }, { code: "33", name: "أرباح وخسائر العام", bal: p.net + other }] },
      { code: "4", name: "الإيرادات", nat: "cr", kids: [{ code: "41", name: "عمولات تسويق عقاري", kids: kids("41", Object.entries(p.byKind).map(([k, v]) => ({ name: k, bal: v }))) }, { code: "42", name: "إيرادات أخرى", bal: other, key: "إيرادات أخرى" }] },
      { code: "5", name: "المصروفات", nat: "dr", kids: [
        { code: "51", name: "مصروفات مباشرة (العمولات)", kids: kids("51", p.direct.map(([k, v]) => ({ name: k, bal: v }))) },
        { code: "52", name: "مصروفات إدارية", kids: kids("52", p.admin.map(([k, v]) => ({ name: k, bal: v, key: k }))) },
        { code: "53", name: "مصروفات بيعية", kids: kids("53", p.selling.map(([k, v]) => ({ name: k, bal: v, key: k }))) }] }];
    const adj = st.glAdj || {}, netAdj = Object.entries(adj).reduce((s, [c, v]) => s + (c[0] === "4" ? v : c[0] === "5" ? -v : 0), 0);
    const extra = st.coaCustom || [], graft = (n) => { const mine = extra.filter((a) => a.parent === n.code);
      if (mine.length && !n.kids) { n.kids = n.custom ? [] : [{ code: n.code + "00", name: n.name + " (عام)", bal: n.bal, key: n.key, adjCode: n.code }]; delete n.key; delete n.bal; }
      if (mine.length) n.kids.push(...mine.map((a) => ({ code: a.code, name: a.name, bal: 0, custom: 1 }))); (n.kids || []).forEach(graft); };
    T.forEach(graft);
    const idx = {}, byCode = {}, walk = (n, path, nat) => { n.nat = n.nat || nat; n.path = [...path, n.name]; byCode[n.code] = n;
      if (n.kids) n.bal = n.kids.reduce((s, k) => s + walk(k, n.path, n.nat), 0); else n.bal += (adj[n.adjCode || n.code] || 0) + ((n.adjCode || n.code) === "33" ? netAdj : 0);
      if (n.key) idx[n.key] = n; return n.bal; };
    T.forEach((n) => walk(n, [], n.nat));
    const leaves = Object.values(byCode).filter((n) => !n.kids);
    return { T, idx, byCode, leaves };
  }
  A.coa = () => coa();
  const acctLabel = (key, C) => { const n = (C || coa()).idx[key]; return n ? `${n.code} · ${n.path.join(" ← ")}` : key; };
  // how much a movement changes one account (+ in, − out)
  const effect = (m, name) => (m.to === name ? (m.kind === "settle" ? m.returned : m.amount) : 0) - (m.from === name ? m.amount : 0);
  // the journal entry of a movement: debit / credit lines
  const entry = (m) => ({
    pay: [[m.line, m.amount, 0], [m.from, 0, m.amount]], receive: [[m.to, m.amount, 0], [m.source === "عمولة من عميل" ? (m.party ? "عميل:" + m.party : "عملاء") : "إيرادات أخرى", 0, m.amount]],
    transfer: [[m.to, m.amount, 0], [m.from, 0, m.amount]], advance: [["سلفة:" + m.party, m.amount, 0], [m.from, 0, m.amount]], advded: [[m.to, m.amount, 0], ["سلفة:" + m.party, 0, m.amount]],
    custody: [["عهد", m.amount, 0], [m.from, 0, m.amount]],
    commission: [["عمولة:" + m.party, m.amount, 0], [m.from, 0, m.amount]],
    settle: [[m.line, m.spent, 0], ...(m.returned ? [[m.to, m.returned, 0]] : []), ["عهد", 0, m.spent + m.returned]]
  })[m.kind];
  const jvOf = (m) => "JV-" + m.id.slice(3);
  const entryTable = (m, C) => U.table(["كود الحساب · الحساب", "مدين", "دائن"], entry(m).map(([a, dr, cr]) => `<tr><td>${esc(acctLabel(a, C))}${["سلف موظفين", "عهد"].includes(a) || (a === "عملاء" && m.party) || (m.deal && a.startsWith("عميل:")) ? `<span class="sub">${esc(partyName(m))}${m.deal ? ` · ${m.deal}` : ""}</span>` : ""}</td><td class="n">${dr ? A.money(dr) : ""}</td><td class="n">${cr ? A.money(cr) : ""}</td></tr>`));
  // after Done: what each account in the entry was and is now
  const effectOnTree = (m) => { const C = coa(); return `<h4 class="mini-h">الأثر على شجرة الحسابات</h4>${U.table(["الحساب", "قبل", "بعد"], entry(m).map(([a, dr, cr]) => { const n = C.idx[a]; if (!n) return ""; const d = n.nat === "dr" ? dr - cr : cr - dr; return `<tr><td>${esc(n.code)} · ${esc(n.name)}</td><td class="n">${A.money(n.bal - d)}</td><td class="n"><b>${A.money(n.bal)}</b> ${chip(d >= 0 ? "ok" : "bad", (d >= 0 ? "+" : "−") + A.money(Math.abs(d)), 1)}</td></tr>`; }))}${note("القيد اتسمّع في شجرة الحسابات، فـ قايمة الدخل والميزانية العمومية اتحدّثوا لوحدهم.")}`; };
  const voucher = (m, after) => `<div class="pdf"><div class="pdf-head"><b>Places · ${KIND[m.kind][0]}</b><span class="mono">${m.id}</span></div>
    ${U.kv([["التاريخ", `${A.fmtDate(m.at)} ${A.fmtTime(m.at)}`], ["المبلغ", `<b>${A.money(m.amount)}</b>`], ["قيد اليومية", `<span class="mono">${jvOf(m)}</span> · ${NATURE[m.kind]}`], ...(m.ref ? [["رقم الفاتورة / المرجع", esc(m.ref)]] : []), ...(m.from ? [["من", esc(m.from)]] : []), ...(m.to ? [["لـ", esc(m.to)]] : []), ...(m.party ? [["الطرف", esc(partyName(m))]] : []), ...(m.line ? [["البند", esc(m.line)]] : []), ...(m.kind === "commission" && m.deal ? [["الصفقة", `<span class="mono">${m.deal}</span> · ${esc((S().deals.find((x) => x.id === m.deal) || {}).client || "")}`], ["الـ TCR", m.tcr ? `<span class="mono">${m.tcr}</span> · ${((S().deals.find((x) => x.id === m.deal) || {}).tcrs || []).some((t) => t.code === m.tcr && (t.signed || {})[m.party]) ? "مضى ✓" : "لسه مامضاش"}` : "—"]] : []), ...(m.kind === "settle" ? [["اتصرف", A.money(m.spent)], ["رجع للخزنة", A.money(m.returned)]] : []), ["البيان", esc(m.note || "—")], ["سجّله", esc(A.person(m.by))]])}
    <h4 class="mini-h">قيد اليومية ${jvOf(m)}</h4>${entryTable(m)}${after ? effectOnTree(m) : ""}
    <div class="row" style="margin-top:28px"><span class="spacer">توقيع المستلم: ____________</span><span>توقيع المحاسب: ____________</span></div></div><div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع السند</button></div>`;
  A.ACT.mvView = (d) => { const m = S().moves.find((x) => x.id === d.id); A.openModal(`${KIND[m.kind][0]} · ${m.id}`, voucher(m)); };
  const mvRow = (m, name) => `<tr class="click" data-act="mvView" data-id="${m.id}"><td class="mono">${m.id}</td><td>${A.fmtDate(m.at)}</td><td>${chip(KIND[m.kind][1], KIND[m.kind][0], 1)}</td><td>${esc(m.from || "—")}${m.to ? ` ← ${esc(m.to)}` : ""}</td><td>${esc(partyName(m))}${m.line ? `<span class="sub">${esc(m.line)}</span>` : ""}</td><td>${esc(m.note || "")}</td><td class="n">${name ? (effect(m, name) >= 0 ? "+" : "−") + A.money(Math.abs(effect(m, name))) : A.money(m.amount)}</td></tr>`;
  // purchases Procurement settled: Finance posts each one (the only place balances change)
  const prQueue = () => S().purchases.filter((p) => p.status === "Settled");
  const prCard = () => { const q = prQueue(); if (!q.length) return "";
    return `<section class="card attn">${head("طلبات مشتريات مستنية الصرف", "cart", chip("warn", q.length), "المشتريات سوّتها وبلّغت · الصرف من الخزنة والقيد عندك")}
      ${table(["الطلب", "البند", "المورد", "اتدفع من (حسب المشتريات)", "المبلغ", ""], q.map((p) => `<tr><td><b>${esc(p.item)}</b><span class="sub mono">${p.id} · ${A.fmtDate(p.settledAt)}</span></td><td>${esc(p.line)}</td><td>${esc(p.vendor || "—")}</td><td>${esc(p.suggestedAccount || "—")}</td><td class="n"><b>${A.money(p.amount)}</b></td><td>${canPost() ? `<button class="btn sm" data-act="mvNew" data-k="pay" data-pr="${p.id}">اصرفها</button>` : ""}</td></tr>`))}</section>`; };
  A.financeInbox = (add) => { if (!canPost()) return;
    S().budgets.filter((b) => b.on !== false && b.budget && budSpent(b) >= b.budget).forEach((b) => add("bad", "wallet", `بند «${b.line}» عدّى البادجت`, `اتصرف ${A.money(budSpent(b))} من ${A.money(b.budget)}`, "goFinTab", { t: "budget" }, "افتح"));
    const due = salesIds().filter((id) => commDue(id) > 0); if (due.length) add("warn", "wallet", `عمولات سيلز مستحقة · ${due.length} سيلز`, `${A.money(due.reduce((s, id) => s + commDue(id), 0))} · صفقات اتحصّلت بالكامل`, "goFinTab", { t: "payroll" }, "افتح");
    S().deals.filter((d) => d.status === "Approved" && !A.collected(d)).forEach((d) => add("warn", "handshake", `صفقة اتقفلت · حصّل عمولة ${d.id}`, `${d.client} · ${A.money(A.placesComm(d))} · اتفتحله حساب تحت العملاء`, "mvNew", { k: "receive", deal: d.id }, "حصّل"));
    billsDue().forEach((b) => add("warn", "calendar", `ميعاد فاتورة ${b.name}`, `${A.money(b.amount)} · ${b.vendor} · مستنية موافقتك`, "goFinPay", {}, "افتح")); prQueue().forEach((p) => add("warn", "cart", `اصرف طلب شراء ${p.id}`, `${p.item} · ${A.money(p.amount)} · المشتريات سوّته`, "goFinPay", {}, "افتح")); };
  A.ACT.commStatement = (d) => { const st = S(), id = d.emp, fm = A.money;
    const rows = st.deals.filter((x) => LIVE(x) && A.salesShares(x).some((y) => y.sales === id)).map((x) => { const sh = A.salesShares(x).filter((y) => y.sales === id), amt = sh.reduce((s, y) => s + y.amount, 0), full = A.dealStatus(x) === "Fully Collected";
      const due = dealDue(x, id), paidD = full ? amt - due : 0;
      return `<tr><td class="mono click" data-act="dealOpen" data-id="${x.id}">${x.id}</td><td>${esc(x.client)}</td><td>${sh.map((y) => `${y.rate}% × ${y.pct}%`).join(" + ")}</td><td>${full ? (due > 0.5 ? chip("ok", "مستحقة · اتحصّلت بالكامل", 1) : chip("", "اتصرفت", 1)) : A.collected(x) ? chip("warn", `مستنية باقي التحصيل ${fm(A.placesComm(x) - A.collected(x))}`, 1) : chip("", "لسه مااتحصّلتش", 1)}</td><td class="n">${fm(amt)}</td><td class="n">${paidD ? fm(paidD) : "—"}</td><td>${canPost() && due > 0.5 ? `<button class="btn sm" data-act="mvNew" data-k="commission" data-emp="${id}" data-cdeal="${x.id}">اصرف ${fm(due)}</button>` : ""}</td></tr>`; });
    const paid = (st.commPaid || []).filter((x) => x.emp === id);
    A.openModal(`كشف عمولة · ${A.person(id)}`, `<div class="pdf">${note(`<b>المستحق دلوقتي = عمولة الصفقات اللي اتحصّلت بالكامل (${fm(earnedOf(id))}) − اللي اتصرف (${fm(paidOf(id))}) = ${fm(commDue(id))}</b><br>العمولة = نسبة السيلز (الـ Scheme) × نصيبه في الصفقة (Buyer أو Seller) × عمولة Places، وبتبقى مستحقة لما الصفقة تتحصّل بالكامل.`)}
      ${U.table(["الصفقة", "العميل", "نسبته", "الحالة", "عمولته", "اتصرف", ""], rows)}
      ${paid.length ? `<h4 class="mini-h">اتصرفله</h4>${U.table(["السند", "التاريخ", "الصفقة", "الـ TCR", "المبلغ"], paid.map((x) => `<tr class="click" data-act="mvView" data-id="${x.move}"><td class="mono">${x.move}</td><td>${A.fmtDate(x.at)}</td><td class="mono">${x.deal || "—"}</td><td class="mono">${x.tcr || "—"}</td><td class="n">${fm(x.amount)}</td></tr>`))}` : ""}</div>
`); };
  A.ACT.pnlM = (d) => { ui("pnlM", d.v); A.render(); };
  A.CHANGE.commEmp = (v) => A.ACT.mvNew({ k: "commission", emp: v });
  A.CHANGE.commDeal = (v, el) => A.ACT.mvNew({ k: "commission", emp: el.form.querySelector("[name=party]").value, cdeal: v });
  A.ACT.goFinTab = (d) => { ui("fnTab", d.t); location.hash = "#finance"; A.render(); };
  A.ACT.goFinPay = () => { ui("fnTab", "cash"); location.hash = "#finance"; A.render(); };
  // one form for every voucher kind; the fields follow the kind
  A.ACT.mvNew = (d) => {
    let ccd, cemp; const k = d.k, F = U.field, bill = d.bill && S().bills.find((x) => x.id === d.bill), dl = d.deal && S().deals.find((x) => x.id === d.deal);
    const pr = (d.pr && S().purchases.find((x) => x.id === d.pr)) || (bill && { id: "", item: `${bill.name} · ${monthName()}`, amount: bill.amount, line: bill.line, vendor: bill.vendor, suggestedAccount: bill.from, bill: bill.id });
    const C = coa(), expOpts = ["52", "53"].map((pc) => { const g = C.T[4].kids.find((x) => x.code === pc); return `<optgroup label="${g.code} · ${g.name}">${g.kids.map((n) => { const b = S().budgets.find((x) => x.line === n.key && x.on !== false && x.budget); return opt(n.key, `${n.code} · ${n.name}${b ? ` · فاضل من البادجت ${A.money(b.budget - budSpent(b))}` : ""}`, pr && pr.line); }).join("")}</optgroup>`; }).join("");
    const body = { pay: (bill ? `<input type="hidden" name="bill" value="${bill.id}">${note(`فاتورة ثابتة <b>${esc(bill.name)}</b> · ميعادها يوم ${bill.day} · المبلغ المعتاد ${A.money(bill.amount)} (عدّله لو الفاتورة مختلفة)`)}` : pr ? `<input type="hidden" name="pr" value="${pr.id}">${note(`من طلب الشراء <b>${pr.id}</b> · ${esc(pr.item)} · المبلغ المعتمد ${A.money(pr.amount)}`)}` : "") + F("التاريخ", `<input name="date" type="date" value="${A.today()}" max="${A.today()}" required>`, 1) + F("من خزنة / بنك", `<select name="from" required>${accOpts(pr && pr.suggestedAccount)}</select>`, 1) + F("نوع المصروف (من شجرة الحسابات)", `<select name="line" required>${expOpts}</select>`, 1)
        + F("المستلم", `<input name="party" list="pp-list" required placeholder="اسم اللي هيستلم الفلوس" value="${esc(pr ? pr.vendor || "" : "")}"><datalist id="pp-list">${S().employees.map((e) => `<option value="${esc(A.person(e.id))}">`).join("")}${S().vendors.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`, 1) + F("رقم الفاتورة / المرجع", `<input name="ref" placeholder="اختياري" value="${pr ? pr.id : ""}">`),
      receive: F("لخزنة / بنك", `<select name="to" required>${accOpts(dl && "بنك CIB")}</select>`, 1) + F("المصدر", `<select name="source">${S().receiveSources.map((x) => opt(x)).join("")}</select>`)
        + F("الصفقة (لو عمولة من عميل)", `<select name="deal"><option value="">—</option>${S().deals.filter((x) => LIVE(x) && A.placesComm(x) - A.collected(x) > 0).map((x) => opt(x.id, `${x.id} · ${x.client} · باقي ${A.money(A.placesComm(x) - A.collected(x))}`, dl && dl.id)).join("")}</select>`, 1) + F("التحصيل من", `<select name="side">${opt("client", "الـ Client")}${opt("owner", "الـ Owner")}</select>`)
        + F("من مين (لو مش من صفقة)", `<input name="party" placeholder="اسم الجهة">`),
      transfer: F("من", `<select name="from" required>${accOpts()}</select>`, 1) + F("لـ", `<select name="to" required>${accOpts("خزينة رئيسية")}</select>`, 1),
      advance: F("من خزنة / بنك", `<select name="from" required>${accOpts()}</select>`, 1) + F("الموظف", `<select name="party" required>${people()}</select>`, 1),
      custody: F("من خزنة / بنك", `<select name="from" required>${accOpts()}</select>`, 1) + F("العهدة مع", `<select name="party" required>${people()}</select>`, 1),
      commission: (() => { const ids = salesIds().filter((id) => commDue(id) > 0), emp = d.emp && ids.includes(d.emp) ? d.emp : ids[0], ds = emp ? dueDeals(emp) : [], cd = ds.find((x) => x.id === d.cdeal) || ds[0];
        ccd = cd; cemp = emp; if (!cd) return note("مفيش عمولة مستحقة دلوقتي", "warn");
        const sh = A.salesShares(cd).filter((y) => y.sales === emp), tc = tcrsFor(cd, emp);
        return F("من خزنة / بنك", `<select name="from" required>${accOpts("خزينة رئيسية")}</select>`, 1) + F("السيلز", `<select name="party" required data-change="commEmp">${ids.map((id) => opt(id, `${A.person(id)} · مستحق ${A.money(commDue(id))}`, emp)).join("")}</select>`, 1)
          + F("الصفقة اللي بتصرف عمولتها", `<select name="cdeal" required data-change="commDeal">${ds.map((x) => opt(x.id, `${x.id} · ${x.client} · مستحق ${A.money(dealDue(x, emp))}`, cd.id)).join("")}</select>`, 1, 1)
          + `<div class="wide card flat">${U.kv([["العميل", `${esc(cd.client)}${cd.company && cd.company !== cd.client ? ` · ${esc(cd.company)}` : ""}`], ["الوحدة", esc(cd.unit || "—")], ["عمولة Places", A.money(A.placesComm(cd))], ["نصيبه", `${sh.map((y) => `${y.side === "seller" ? "Seller" : "Buyer"} · ${y.rate}% × ${y.pct}%`).join(" + ")} = <b>${A.money(A.salesComm(cd, emp))}</b>`], ["اتصرفله منها", A.money(A.salesComm(cd, emp) - dealDue(cd, emp))]])}</div>`
          + F("الـ TCR اللي هيمضي عليها", `<select name="tcr" required>${tc.map((t) => opt(t.code, `${t.code} · ${A.money(t.amount)} · ${t.side === "owner" ? "من الـ Owner" : "من الـ Client"} · ${(t.signed || {})[emp] ? "مضى ✓" : "لسه مامضاش"}`)).join("")}<option value="">من غير TCR</option></select>`, 1, 1); })() }[k];
    A.openModal(KIND[k][0], `<form data-form="mvSave" class="grid"><input type="hidden" name="kind" value="${k}">${body}
      ${U.field("المبلغ", `<input name="amount" type="number" min="1" step="any" required ${pr ? `value="${pr.amount}" ${bill ? "" : "readonly"}` : dl ? `value="${A.placesComm(dl) - A.collected(dl)}"` : k === "commission" && ccd ? `value="${dealDue(ccd, cemp)}"` : ""}>`, 1)}${U.field("البيان", `<input name="note" required placeholder="مثلاً: فاتورة كهرباء أكتوبر" value="${esc(pr ? pr.item : "")}">`, 1, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("check")}سجّل</button></div></form>`);
  };
  A.FORM.mvSave = (f) => {
    const st = S(), amt = +f.amount, k = f.kind, from = f.from && acc(f.from), to = f.to && acc(f.to);
    if (!canPost()) return A.toast("مالكش صلاحية تسجّل حركات");
    if (!openPeriod()) return A.toast("الشهر مقفول · مينفعش تسجّل حركة فيه");
    if (!(amt > 0)) return A.toast("المبلغ لازم يبقى أكبر من صفر");
    if (k === "transfer" && f.from === f.to) return A.toast("اختار خزنتين مختلفتين");
    if (from && from.balance < amt) return A.toast(`الرصيد في ${from.name} (${A.money(from.balance)}) مش كفاية`);
    if (f.date && f.date > A.today()) return A.toast("مينفعش تاريخ بعد النهارده");
    if (f.pr && (st.purchases.find((x) => x.id === f.pr) || {}).status !== "Settled") return A.toast("الطلب ده اترحّل قبل كده");
    const bill = f.bill && st.bills.find((x) => x.id === f.bill); if (bill && bill.paid[monthKey()]) return A.toast("الفاتورة دي اتصرفت الشهر ده");
    const at = f.date && f.date !== A.today() ? new Date(`${f.date}T12:00:00`).toISOString() : A.nowIso();
    const cdl = k === "commission" && st.deals.find((x) => x.id === f.cdeal);
    if (k === "commission" && !cdl) return A.toast("اختار الصفقة اللي بتصرف عمولتها");
    if (k === "commission" && amt > dealDue(cdl, f.party) + 0.5) return A.toast(`المستحق لـ ${A.person(f.party)} على ${cdl.id} ${A.money(dealDue(cdl, f.party))} بس`);
    if (k === "receive" && f.source === "عمولة من عميل") {
      const dl = st.deals.find((x) => x.id === f.deal); if (!dl) return A.toast("اختار الصفقة اللي العمولة دي بتاعتها");
      const rem = A.placesComm(dl) - A.collected(dl); if (amt > rem) return A.toast(`الباقي على الصفقة ${A.money(rem)} بس`);
      const mv = A.FORM.dealPay({ id: dl.id, side: f.side || "client", amount: String(amt), to: f.to, note: f.note.trim() }); A.render(); A.openModal(`${KIND.receive[0]} · ${mv.id}`, voucher(mv, true)); return;
    }
    const m = { id: "MV-" + (109 + st.moves.length), at, kind: k, amount: amt, note: f.note.trim(), by: A.me(), ...(f.ref ? { ref: f.ref.trim() } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.party ? { party: f.party } : {}), ...(f.line ? { line: f.line } : {}), ...(f.source ? { source: f.source } : {}) };
    if (from) from.balance -= amt; if (to) to.balance += amt;
    if (bill) { bill.paid[monthKey()] = m.id; m.bill = bill.id; }
    if (f.pr) { const pr = st.purchases.find((x) => x.id === f.pr); Object.assign(pr, { status: "Posted", account: f.from, postedAt: A.nowIso(), move: m.id, paidAt: pr.settledAt }); A.notify(["procurement"], `المالية رحّلت ${pr.id} من ${f.from}`); }
    const bud0 = k === "pay" && st.budgets.find((x) => x.line === f.line), budBefore = bud0 ? budSpent(bud0) : 0;
    if (k === "pay") { const L = [...st.expenses.admin, ...st.expenses.selling].find((x) => x[0] === f.line); L[1] += amt; const b = st.budgets.find((x) => x.line === f.line); if (b) b.spent += amt; } // lands in the income statement and the budget
    if (k === "advance") st.advances.push({ emp: f.party, amount: amt, date: A.today() });
    if (k === "commission") { m.deal = cdl.id; if (f.tcr) m.tcr = f.tcr; (st.commPaid = st.commPaid || []).push({ emp: f.party, amount: amt, at: m.at, move: m.id, deal: cdl.id, tcr: f.tcr || "" });
      const t = f.tcr && (cdl.tcrs || []).find((x) => x.code === f.tcr); A.notify([f.party], `اتصرفتلك عمولة ${A.money(amt)} عن ${cdl.id} · ${m.id}${t && !(t.signed || {})[f.party] ? ` · امضي على ${t.code}` : ""}`); }
    if (k === "custody") { const c = st.custody.find((x) => x.emp === f.party); c ? (c.amount += amt) : st.custody.push({ emp: f.party, amount: amt, date: A.today() }); }
    st.moves.unshift(m); A.audit("finance", `${KIND[k][0]} ${m.id} · ${A.money(amt)} · ${m.note}`);
    A.render(); A.openModal(`${KIND[k][0]} · ${m.id}`, voucher(m, true)); A.toast(`اتسجّل · قيد اليومية ${jvOf(m)} اتعمل لوحده`); if (bud0) budCheck(f.line, budBefore);
  };
  // settling custody: what was spent (on which line) and what came back to which safe
  A.ACT.custSettle = (d) => { const c = S().custody.find((x) => x.emp === d.emp);
    A.openModal(`تسوية عهدة · ${A.person(c.emp)}`, `<form data-form="custSave" class="grid"><input type="hidden" name="emp" value="${c.emp}">${note(`العهدة دلوقتي: <b>${A.money(c.amount)}</b>`)}
      ${U.field("اتصرف منها", `<input name="spent" type="number" min="0" step="any" value="0" required>`, 1)}${U.field("على بند", `<select name="line">${lineOpts()}</select>`, 1)}
      ${U.field("رجع نقدي", `<input name="returned" type="number" min="0" step="any" value="0" required>`, 1)}${U.field("رجع لخزنة", `<select name="to">${accOpts()}</select>`, 1)}
      ${U.field("البيان", `<input name="note" required placeholder="مثلاً: 6 فواتير صيانة">`, 1, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("check")}سجّل التسوية</button></div></form>`); };
  A.FORM.custSave = (f) => {
    const st = S(), c = st.custody.find((x) => x.emp === f.emp), spent = +f.spent || 0, ret = +f.returned || 0;
    if (!openPeriod()) return A.toast("الشهر مقفول · مينفعش تسجّل حركة فيه");
    if (spent + ret <= 0) return A.toast("اكتب اتصرف كام أو رجع كام");
    if (spent + ret > c.amount) return A.toast(`المجموع أكبر من العهدة (${A.money(c.amount)})`);
    const m = { id: "MV-" + (109 + st.moves.length), at: A.nowIso(), kind: "settle", party: f.emp, to: f.to, amount: spent + ret, spent, returned: ret, line: f.line, note: f.note.trim(), by: A.me() };
    c.amount -= spent + ret; acc(f.to).balance += ret;
    if (spent) { const L = [...st.expenses.admin, ...st.expenses.selling].find((x) => x[0] === f.line); L[1] += spent; }
    st.moves.unshift(m); A.audit("finance", `تسوية عهدة ${A.person(f.emp)} · اتصرف ${A.money(spent)} · رجع ${A.money(ret)}`);
    A.render(); A.openModal(`تسوية عهدة · ${m.id}`, voucher(m, true)); A.toast(c.amount ? `اتسوّى · فاضل ${A.money(c.amount)} عهدة` : "العهدة اتقفلت");
  };
  // account statement: every movement on one safe / bank with the running balance
  A.ACT.accStatement = (d) => {
    const a = acc(d.name), ms = S().moves.filter((m) => effect(m, a.name)); let bal = a.balance;
    const rows = ms.map((m) => { const r = { m, bal }; bal -= effect(m, a.name); return r; });
    A.openModal(`كشف حساب · ${a.name}`, `<div class="pdf">${note(`الرصيد دلوقتي <b>${A.money(a.balance)}</b> · رصيد أول المدة في الكشف ${A.money(bal)}`)}
      ${U.table(["التاريخ", "الحركة", "البيان", "داخل", "خارج", "الرصيد بعدها"], rows.map(({ m, bal: b }) => { const e = effect(m, a.name); return `<tr><td>${A.fmtDate(m.at)}</td><td>${chip(KIND[m.kind][1], KIND[m.kind][0], 1)} <span class="mono">${m.id}</span></td><td>${esc(m.note || "")}</td><td class="n">${e > 0 ? A.money(e) : ""}</td><td class="n">${e < 0 ? A.money(-e) : ""}</td><td class="n"><b>${A.money(b)}</b></td></tr>`; }))}</div>
      <div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع الكشف</button></div>`);
  };
  const FN = {
    cash() {
      const st = S(), f = ui("mvF") || "", list = st.moves.filter((m) => !f || m.from === f || m.to === f), today = st.moves.filter((m) => m.at.slice(0, 10) === A.today());
      const btn = (k, ic, l) => `<button class="btn ${k === "pay" ? "" : "ghost"}" data-act="mvNew" data-k="${k}">${I(ic)}${l}</button>`;
      return `${openPeriod() ? "" : note("الشهر مقفول · مفيش حركات جديدة لحد ما يتفتح شهر جديد", "warn")}${billCard()}${prCard()}
        <div class="kpis">${U.kpi("الخزن والبنوك", A.money(st.accounts.reduce((s, a) => s + a.balance, 0)), `${st.accounts.length} حساب`, "bank")}${U.kpi("حركات النهارده", today.length, `صرف ${A.short(today.filter((m) => m.kind === "pay").reduce((s, m) => s + m.amount, 0))} · قبض ${A.short(today.filter((m) => m.kind === "receive").reduce((s, m) => s + m.amount, 0))}`, "list")}${U.kpi("عهد مفتوحة", A.money(st.custody.reduce((s, c) => s + c.amount, 0)), `${st.custody.filter((c) => c.amount).length} شخص`, "wallet", "warn")}${U.kpi("سلف الموظفين", A.money(st.advances.reduce((s, a) => s + a.amount, 0)), "بتتخصم من المرتب", "users")}</div>
        ${canPost() ? `<div class="row">${btn("pay", "send", "إذن صرف خزنة")}${btn("receive", "wallet", "إذن توريد خزنة")}${btn("transfer", "swap", "تحويل بين خزن")}${btn("advance", "users", "سلفة موظف")}${btn("custody", "wallet", "عهدة لشخص")}</div>` : ""}
        <div class="cols wide"><section class="card">${head("الحركات", "list", chip("", list.length), "دوس على أي حركة تشوف السند والقيد وتطبعه")}
          <div class="toolbar"><select data-change="mvF" aria-label="الحساب">${opt("", "كل الخزن والبنوك", f)}${st.accounts.map((a) => opt(a.name, a.name, f)).join("")}</select></div>
          ${table(["رقم", "التاريخ", "النوع", "من ← لـ", "الطرف / البند", "البيان", f ? "على الحساب" : "المبلغ"], list.map((m) => mvRow(m, f)))}</section>
        <section class="card">${head("الأرصدة", "bank")}${st.accounts.map((a) => `<div class="acct click" data-act="accStatement" data-name="${esc(a.name)}"><span class="a-ico">${I(a.kind === "بنك" ? "bank" : "wallet")}</span><span class="spacer">${esc(a.name)}<small>${esc(a.kind)} · كشف حساب</small></span><b class="num">${A.money(a.balance)}</b></div>`).join("")}</section></div>`;
    },
    custody() {
      const st = S();
      return `<div class="cols"><section class="card">${head("العهد المفتوحة", "wallet", chip("warn", A.money(st.custody.reduce((s, c) => s + c.amount, 0))), "الفلوس اللي مع الناس ومستنية تسوية")}
          ${table(["مع", "المبلغ", "من", ""], st.custody.filter((c) => c.amount).map((c) => `<tr><td>${A.who(c.emp)}</td><td class="n"><b>${A.money(c.amount)}</b></td><td>${A.fmtDate(c.date)}</td><td>${canPost() ? `<button class="btn sm" data-act="custSettle" data-emp="${c.emp}">سوّي</button>` : ""}</td></tr>`))}
          ${canPost() ? `<div class="row end"><button class="btn ghost sm" data-act="mvNew" data-k="custody">${I("plus")}عهدة جديدة</button></div>` : ""}</section>
        </div>${advCard()}`;
    },
    journal() {
      const st = S(), C = coa(), rows = st.moves.flatMap((m) => entry(m).map(([a, dr, cr], i) => `<tr class="${i ? "" : "jr-top"} click" data-act="mvView" data-id="${m.id}"><td>${i ? "" : `<span class="mono">${jvOf(m)}</span><span class="sub">${NATURE[m.kind]}</span>`}</td><td>${i ? "" : A.fmtDate(m.at)}</td><td>${esc(acctLabel(a, C))}</td><td class="n">${dr ? A.money(dr) : ""}</td><td class="n">${cr ? A.money(cr) : ""}</td><td>${i ? "" : esc(m.note || "")}</td></tr>`));
      const man = (st.journal || []).flatMap((je) => je.lines.map((l, i) => `<tr class="${i ? "" : "jr-top"} click" data-act="jeView" data-id="${je.id}"><td>${i ? "" : `<span class="mono">${je.id}</span><span class="sub">قيد يدوي</span>`}</td><td>${i ? "" : A.fmtDate(je.at)}</td><td>${esc(l.code)} · ${esc(C.byCode[l.code].path.join(" ← "))}</td><td class="n">${l.dr ? A.money(l.dr) : ""}</td><td class="n">${l.cr ? A.money(l.cr) : ""}</td><td>${i ? "" : esc(je.note)}</td></tr>`));
      const mdr = (st.journal || []).reduce((s, je) => s + je.lines.reduce((x, l) => x + l.dr, 0), 0), mcr = (st.journal || []).reduce((s, je) => s + je.lines.reduce((x, l) => x + l.cr, 0), 0);
      const dr = mdr + st.moves.reduce((s, m) => s + entry(m).reduce((x, e) => x + e[1], 0), 0), cr = mcr + st.moves.reduce((s, m) => s + entry(m).reduce((x, e) => x + e[2], 0), 0);
      return `${canPost() ? `<div class="row"><span class="spacer"></span><button class="btn" data-act="jeNew">${I("plus")}قيد يومية جديد</button></div>` : ""}${note(`كل سند بيعمل قيده لوحده، والقيد اليدوي بيتعمل من «قيد يومية جديد» (مدين = دائن). إجمالي المدين ${A.money(dr)} · إجمالي الدائن ${A.money(cr)}${dr === cr ? " · متوازن ✓" : " · مش متوازن!"}`, dr === cr ? "" : "warn")}
        ${table(["قيد اليومية", "التاريخ", "كود الحساب · الحساب", "مدين", "دائن", "البيان"], [...man, ...rows])}`;
    },
    dash() {
      const st = S(), p = figures(), bal = st.accounts.reduce((s, a) => s + a.balance, 0), payroll = st.employees.reduce((s, e) => s + e.salary, 0);
      const wf = [["الإيرادات", p.rev, "acc"], ["مصاريف مباشرة", -p.d, "bad"], ["مصاريف بيعية", -p.se, "bad"], ["مصاريف إدارية", -p.ad, "bad"], ["خصومات", p.saved, "ok"], ["صافي الربح", p.net, "ok"]];
      const max = Math.max(...wf.map((x) => Math.abs(x[1])));
      return `<div class="kpis">${U.kpi("صافي الربح لحد النهارده", A.money(p.net), "إيرادات − مباشرة − بيعية − إدارية", "trend", "ok")}${U.kpi("الإيرادات", A.money(p.rev), "صفقات معتمدة", "handshake")}${U.kpi("المصاريف البيعية والإدارية", A.money(p.se + p.ad), `بيعية ${A.short(p.se)} · إدارية ${A.short(p.ad)}`, "wallet", "warn")}${U.kpi("وفّرنا من الخصومات", A.money(p.saved), "تأخير وغياب الشهر ده", "id", "ok")}</div>
        <div class="cols wide"><section class="card">${head("من الإيرادات لصافي الربح", "chart", "", "على مراحل زي ما د. علي بيحسبه")}<div class="waterfall">${wf.map(([l, v, tone]) => `<div class="wf"><span>${esc(l)}</span><div class="wf-bar ${tone}" style="width:${(Math.abs(v) / max) * 100}%"></div><b class="num">${A.short(v)}</b></div>`).join("")}</div></section>
          <section class="card">${head("رصيد الخزن والبنوك", "bank", chip("acc", A.money(bal)))}${st.accounts.map((a) => `<div class="acct"><span class="a-ico">${I(a.kind === "بنك" ? "bank" : "wallet")}</span><span class="spacer">${esc(a.name)}<small>${esc(a.kind)}</small></span><b class="num">${A.money(a.balance)}</b></div>`).join("")}
            <button class="btn ghost" data-act="advances">${I("users")}سلف الموظفين · ${A.money(advEmps().reduce((s, id) => s + advLeft(id), 0))}</button></section></div>
        <div class="kpis">${U.kpi("موازنة المرتبات / شهر", A.money(payroll), `${st.employees.length} موظف × المرتب`, "id")}${st.periods.map((pr) => U.kpi(pr.name, pr.status, pr.status === "مفتوح" ? "الحركات بتتسجّل" : "اتقفل", pr.status === "مفتوح" ? "clock" : "lock", pr.status === "مفتوح" ? "warn" : "ok")).join("")}</div>`;
    },
    pnl() {
      const st = S(), mon = (ui("pnlM") || "month") === "month", P = pnlNums(mon), close = A.canDo("finance", "approve"), C = P.C;
      const r = (l, v, cls, c) => `<tr class="${cls || ""} ${v < 0 ? "neg" : ""} click" data-act="pnlWhy" data-c="${c}" data-m="${mon ? "month" : ""}"><td>${esc(l)} <span class="hint">${I("search")}</span></td><td class="n">${A.money(v)}</td></tr>`;
      const leaves = (code, sign) => C.leaves.filter((n) => n.code.startsWith(code) && n.code !== code).map((n) => [n, P.N(n.code)]).filter(([, v]) => !mon || v).map(([n, v]) => r(`${n.code} · ${n.name}`, sign * v, "sub", n.code)).join("");
      return `<div class="row">${U.seg("pnlM", [["month", `الشهر ده · ${esc(st.periods[st.periods.length - 1].name)}`], ["year", "من أول السنة"]], mon ? "month" : "year")}<span class="hint spacer">${mon ? "اللي حصل الشهر ده بس (الأذونات والتحصيلات والقيود بتاريخها)" : "أرصدة شجرة الحسابات"} · دوس على أي رقم تشوف وصل لكده إزاي وعدّى على إيه</span>${close ? `<button class="btn ghost" data-act="closeMonth">${I("lock")}اقفل الشهر</button>` : ""}</div>
        <div class="tbl-wrap pnl"><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>
        ${r("4 · الإيرادات", P.rev, "", "4")}${leaves("4", 1)}
        ${r("ناقص: 51 · المصاريف المباشرة (العمولات)", -P.d, "", "51")}${leaves("51", -1)}${r("ربح الصفقات", P.gross, "total", "gross")}
        ${r("ناقص: 53 · مصروفات بيعية", -P.se, "", "53")}${leaves("53", -1)}${r("ربح النشاط", P.contrib, "total", "contrib")}
        ${r("ناقص: 52 · مصروفات إدارية", -P.ad, "", "52")}${leaves("52", -1)}
        ${C.byCode["5"].kids.filter((k) => !["51", "52", "53"].includes(k.code)).map((k) => r(`ناقص: ${k.code} · ${k.name}`, -P.N(k.code), "", k.code) + (k.kids ? leaves(k.code, -1) : "")).join("")}
        ${r("زائد: خصومات التأخير والغياب", P.saved, "", "saved")}${r("صافي الربح", P.net, "total grand", "net")}</tbody></table></div>
        ${note("قايمة الدخل كل شهر، والميزانية العمومية كل 3 شهور، وصافي الربح في أي وقت. الأرقام هنا هي نفس أرصدة شجرة الحسابات، فأي إذن أو قيد بيظهر هنا على طول.")}`;
    },
    bs() {
      const C = coa(), N = (c) => C.byCode[c], subs = (r) => C.leaves.filter((x) => x.code.startsWith(r.code) && x.code !== r.code);
      const line = (r) => { const k = subs(r); return k.length ? `<details class="bs-acct"><summary class="acct"><span class="spacer"><span class="mono hint">${r.code}</span> ${esc(r.name)} <span class="hint">(${k.length} حساب فرعي)</span></span><b class="num">${A.money(r.bal)}</b></summary>${k.map((x) => `<div class="acct sub click" data-act="pnlWhy" data-c="${x.code}"><span class="spacer"><span class="mono hint">${x.code}</span> ${esc(x.name)} <span class="hint">${I("search")}</span></span><span class="num">${A.money(x.bal)}</span></div>`).join("")}</details>`
        : `<div class="acct click" data-act="pnlWhy" data-c="${r.code}"><span class="spacer"><span class="mono hint">${r.code}</span> ${esc(r.name)} <span class="hint">${I("search")}</span></span><b class="num">${A.money(r.bal)}</b></div>`; };
      const blk = (n, rows) => `<section class="card">${head(`${n.code} · ${n.name}`, "layers", chip("acc", A.money(n.bal)))}${rows.map(line).join("")}</section>`;
      return `<div class="row"><span class="hint spacer">الميزانية العمومية · من شجرة الحسابات · افتح أي بند تشوف حساباته الفرعية، ودوس على أي حساب تشوف رصيده جه منين</span>${A.canDo("finance", "approve") ? `<button class="btn ghost" data-act="closeQuarter">${I("lock")}اقفل الربع</button>` : ""}</div>
        <div class="cols">${["1", "2", "3"].map((c) => blk(N(c), N(c).kids.flatMap((k) => (["11", "21"].includes(k.code) && k.kids ? k.kids : [k])))).join("")}</div>
        ${note(`الأصول (${A.short(N("1").bal)}) = الخصوم (${A.short(N("2").bal)}) + حقوق الملكية (${A.short(N("3").bal)}). الأرقام تجريبية، وأرصدة البداية الحقيقية هتتدخل وقت الإطلاق.`)}`;
    },
    budget() {
      const st = S(), C = coa(), ed = canPost() || A.canDo("finance", "approve"), f = ui("budF") || "", P = { month: "شهري", quarter: "ربع سنوي", year: "سنوي" };
      const lines = C.leaves.filter((n) => /^5[23]\d/.test(n.code)), extra = st.budgets.filter((b) => !C.idx[b.line] || !/^5[23]/.test(C.idx[b.line].code));
      const row = (n, b) => { const sp = b ? budSpent(b) : 0, pct = b && b.budget ? (sp / b.budget) * 100 : 0, al = b ? b.alert ?? 80 : 80, lv = !b || !b.budget ? "" : pct >= 100 ? "bad" : pct >= al ? "warn" : "ok";
        const name = n ? `<span class="mono hint">${n.code}</span> ${esc(n.name)}` : `${esc(b.line)} <span class="hint">· ${esc(b.kind)}</span>`, key = esc(b ? b.line : n.key);
        const inp = (k, v, w, extraAttr) => `<input type="number" min="0" step="any" value="${v}" data-change="budEdit" data-line="${key}" data-k="${k}" style="max-width:${w}px" ${extraAttr || ""}>`;
        return `<tr class="${b && b.on === false ? "muted" : ""}"><td>${name}</td>
          <td class="n">${ed ? inp("budget", b ? b.budget : "", 120, `placeholder="مالوش بادجت"`) : b ? A.money(b.budget) : "—"}</td>
          <td>${ed ? `<select data-change="budEdit" data-line="${key}" data-k="period">${Object.entries(P).map(([k, l]) => opt(k, l, (b && b.period) || "month")).join("")}</select>` : P[(b && b.period) || "month"]}</td>
          <td class="n">${n ? `<a class="click" data-act="pnlWhy" data-c="${n.code}" data-m="${(b && b.period) === "year" ? "" : "month"}">${A.money(sp)}</a>` : A.money(sp)}</td>
          <td class="n">${b && b.budget ? `<b class="${sp > b.budget ? "bad-t" : ""}">${A.money(b.budget - sp)}</b>` : "—"}</td>
          <td style="min-width:120px">${b && b.budget ? `${U.bar(Math.min(100, pct), lv === "ok" ? "" : lv)}<small class="hint">${Math.round(pct)}%${lv === "bad" ? " · عدّى البادجت" : lv === "warn" ? " · قرّب يخلص" : ""}</small>` : ""}</td>
          <td class="n">${ed ? inp("alert", al, 70, 'max="100"') + "%" : al + "%"}</td>
          <td>${ed ? `<select data-change="budEdit" data-line="${key}" data-k="owner"><option value="">—</option>${st.employees.map((e) => opt(e.id, A.person(e.id), b && b.owner)).join("")}</select>` : b && b.owner ? esc(A.person(b.owner)) : "—"}</td>
          <td>${ed && b ? `<button class="btn ghost sm" data-act="budToggle" data-line="${key}">${b.on === false ? "شغّل" : "وقّف"}</button>` : ""}</td></tr>`; };
      const of = (n) => st.budgets.find((b) => b.line === n.key), pass = (n, b) => !f || (f === "over" ? b && b.budget && budSpent(b) >= (b.budget * (b.alert ?? 80)) / 100 : f === "none" ? !b || !b.budget : n && n.code.startsWith(f));
      const H = ["البند", "البادجت", "الفترة", "اتصرف في الفترة", "فاضل", "", "نبّهني عند", "مسؤول البند", ""];
      const grp = (code, title) => { const r = lines.filter((n) => n.code.startsWith(code)).filter((n) => pass(n, of(n))); if (!r.length) return ""; const bs = r.map(of).filter(Boolean), tb = bs.reduce((s, b) => s + (b.budget || 0), 0), ts = bs.reduce((s, b) => s + budSpent(b), 0);
        return `<section class="card">${head(`${code} · ${title}`, "wallet", chip(ts > tb && tb ? "bad" : "", `${A.short(ts)} / ${A.short(tb)}`, 1))}${table(H, r.map((n) => row(n, of(n))))}</section>`; };
      const all = st.budgets.filter((b) => b.on !== false), TB = all.reduce((s, b) => s + (b.budget || 0), 0), TS = all.reduce((s, b) => s + budSpent(b), 0);
      return `<div class="kpis">${U.kpi("إجمالي البادجت", A.money(TB), `${all.filter((b) => b.budget).length} بند ليه بادجت`, "wallet")}${U.kpi("اتصرف", A.money(TS), "في فترة كل بند", "trend")}${U.kpi("فاضل", A.money(TB - TS), "", "layers", TB - TS < 0 ? "bad" : "ok")}${U.kpi("بنود عدّت التنبيه", budOver().length, "قرّبت تخلص أو عدّت", "clock", budOver().length ? "bad" : "")}</div>
        <div class="row">${U.seg("budF", [["", "الكل"], ["52", "إدارية"], ["53", "بيعية"], ["over", "عدّت التنبيه"], ["none", "مالهاش بادجت"]], f)}<span class="spacer"></span></div>
        ${note("كل بند مصروفات في شجرة الحسابات ليه بادجت بتعدّله براحتك: المبلغ، والفترة (شهري · ربع سنوي · سنوي)، ونسبة التنبيه، والمسؤول. «اتصرف» محسوب من الأذونات والقيود في الفترة (دوس عليه تشوف التفاصيل). لما بند يعدّي نسبة التنبيه بيوصل إشعار للمحاسب ومسؤول البند، ولو عدّى البادجت بتظهر مهمة في الرئيسية.")}
        ${grp("52", "مصروفات إدارية")}${grp("53", "مصروفات بيعية")}
        ${extra.filter((b) => !f || pass(null, b)).length ? `<section class="card">${head("بادجت بنود تانية", "layers", "", "بنود مش مصروفات في الشجرة (زي الأصول الثابتة أو الماركتينج كإجمالي) · اتصرف بيتدخّل بإيدك")}${table(H, extra.map((b) => row(null, b)))}</section>` : ""}
        ${ed ? `<form class="card flat grid" data-form="budAdd">${head("بند جديد بالبادجت بتاعه", "plus")}${U.field("اسم البند", `<input name="line" required placeholder="مثلاً: صيانة التكييفات">`, 1)}${U.field("تحت", `<select name="kind">${opt("52", "52 · مصروفات إدارية")}${opt("53", "53 · مصروفات بيعية")}${opt("other", "بند تاني (مش في الشجرة)")}</select>`, 1)}${U.field("البادجت", `<input name="budget" type="number" min="0" step="any" required>`, 1)}${U.field("الفترة", `<select name="period">${Object.entries(P).map(([k, l]) => opt(k, l, "month")).join("")}</select>`)}${U.field("نبّهني عند %", `<input name="alert" type="number" min="1" max="100" value="80">`)}<div class="row end wide"><button class="btn">${I("plus")}ضيف البند</button></div></form>` : ""}`;
    },
    cost() {
      const st = S(), f = ui("ccf") || {};
      let ds = st.deals.filter(A.countsRevenue);
      if (f.channel) ds = ds.filter((d) => d.channel === f.channel); if (f.sales) ds = ds.filter((d) => A.inDeal(d, f.sales)); if (f.area) ds = ds.filter((d) => d.area === f.area);
      if (f.from) ds = ds.filter((d) => d.closed.slice(0, 10) >= f.from); if (f.to) ds = ds.filter((d) => d.closed.slice(0, 10) <= f.to);
            // Q40: for cost-center and deal profitability, a campaign's cost is spread over its Qualified leads; the accounting reports keep it as one total expense
      const rows = ds.map((d) => { const c = st.campaigns.find((x) => x.id === d.campaign), n = st.leads.filter((l) => l.campaign === d.campaign && l.everInterested).length || 1, mkt = c ? c.spent / n : 0, com = A.salesComm(d), rev = A.placesComm(d); return { d, c, mkt, com, rev, net: rev - com - mkt }; });
      const byCh = {}; rows.forEach((x) => { const k = x.d.channel; (byCh[k] = byCh[k] || { rev: 0, mkt: 0 }); byCh[k].rev += x.rev; byCh[k].mkt += x.mkt; });
      return `<div class="toolbar"><select id="cc-ch" data-change="ccf" data-k="channel">${opt("", "كل المنصات", f.channel)}${st.channels.map((c) => opt(c, c, f.channel)).join("")}</select><select id="cc-s" data-change="ccf" data-k="sales">${opt("", "كل السيلز", f.sales)}${A.sales().map((s) => opt(s.id, s.name, f.sales)).join("")}</select><select id="cc-a" data-change="ccf" data-k="area">${opt("", "كل المناطق", f.area)}${st.areas.map((a) => opt(a, a, f.area)).join("")}</select><label class="date-f"><span>من</span><input type="date" id="cc-f" value="${esc(f.from || "")}" data-change="ccf" data-k="from"></label><label class="date-f"><span>لحد</span><input type="date" id="cc-t" value="${esc(f.to || "")}" data-change="ccf" data-k="to"></label></div>
        <section class="card">${head("الصفقات كلّفت كام ماركتينج · حسب المنصة", "chart")}${U.hbars(Object.entries(byCh).map(([k, v]) => ({ label: k, sub: `إيراد ${A.short(v.rev)}`, value: v.mkt })), (v) => A.money(v))}</section>
        ${table(["الصفقة", "المنصة · الكامبين", "السيلز", "المنطقة", "الإيراد", "تكلفة الماركتينج", "العمولة", "صافي الصفقة"], rows.map((x) => `<tr><td class="mono">${x.d.id}</td><td>${esc(x.d.channel)}<span class="sub">${esc(x.c ? x.c.name : "—")}</span></td><td>${A.who(x.d.sales)}</td><td>${esc(x.d.area)}</td><td class="n">${A.money(x.rev)}</td><td class="n">${A.money(x.mkt)}</td><td class="n">${A.money(x.com)}</td><td class="n"><b>${A.money(x.net)}</b></td></tr>`))}
        ${note("تكلفة الماركتينج على الصفقة = صرف الكامبين اللي جابت الليد ÷ عدد صفقات الكامبين (مقترح، والطريقة النهائية من د. علي).")}`;
    },
    // Q41: a salesperson's commission is due once the deal is fully collected; Q32: deductions count only after HR approves them
    payroll() {
      const st = S(), month = A.today().slice(0, 7);
      const rows = st.employees.map((e) => { const att = st.attendance.filter((a) => a.emp === e.id && a.day.startsWith(month)).map(A.attRow), dd = att.reduce((s, x) => s + x.ded, 0), ded = (S().dedApproved || {})[month] ? dd * A.dayRate(e) : 0, com = e.role === "tl" ? A.tlStats(e.id).comm : commDue(e.id), adv = advPlan(e.id); return { e, ded, com, adv, net: e.salary - ded + com - adv }; });
      const t = (k) => rows.reduce((s, x) => s + (k === "salary" ? x.e.salary : x[k]), 0);
      return `<div class="kpis">${U.kpi("المرتبات", A.money(t("salary")), "الأساسي", "id")}${U.kpi("الخصومات", A.money(t("ded")), "من الـ HR", "clock", "bad")}${U.kpi("العمولات المستحقة", A.money(t("com")), "صفقات اتحصّلت بالكامل − اللي اتصرف", "trend", "ok")}${U.kpi("صافي المستحق", A.money(t("net")), "بعد خصم السلف اللي اخترتها", "wallet")}</div>
        ${table(["الموظف", "المرتب", "الخصم", "العمولة", "سلفة", "الصافي"], rows.map((x) => `<tr><td>${A.who(x.e.id)}</td><td class="n">${A.money(x.e.salary)}</td><td class="n">${x.ded ? "−" + A.money(x.ded) : "—"}</td><td class="n">${x.e.role === "tl" ? (x.com ? "+" + A.money(x.com) : "—") : `<a class="click" data-act="commStatement" data-emp="${x.e.id}">${x.com ? "+" + A.money(x.com) : "—"}</a>${x.com > 0 && canPost() ? ` <button class="btn sm" data-act="mvNew" data-k="commission" data-emp="${x.e.id}">اصرف</button>` : ""}`}</td><td class="n">${x.adv ? `−${A.money(x.adv)}<span class="sub">عليه ${A.money(advLeft(x.e.id) + (advPosted(A.today().slice(0, 7)) ? x.adv : 0))}</span>` : "—"}</td><td class="n"><b>${A.money(x.net)}</b></td></tr>`))}
        ${note("العمولة بتبقى مستحقة لما الصفقة تتحصّل بالكامل، وبتظهر في حساب السيلز تحت «عمولة مبيعات مستحقة» (211). دوس على العمولة تشوف كشفها صفقة صفقة، و«اصرف» بيعمل إذن «صرف عمولة سيلز» بقيده: من ح/ عمولة السيلز إلى ح/ الخزنة.")}
        ${note((S().dedApproved || {})[month] ? "الخصومات اتعتمدت من الـ HR واترحّلت. والمرتبات بعد الخصم بتتحمّل على المصروفات أوتوماتيك." : "خصومات الشهر لسه مستنية اعتماد الـ HR، فمش محسوبة هنا.", (S().dedApproved || {})[month] ? "" : "warn")}`;
    },
    bills() {
      const st = S(), lab = { paid: ["ok", "اتصرفت الشهر ده"], skipped: ["", "اتأجلت الشهر ده"], due: ["warn", "ميعادها جه · مستنية موافقتك"], soon: ["warn", "قرّبت"], later: ["", "لسه"], off: ["", "متوقفة"] };
      return `${note("الفاتورة الثابتة (اشتراك، إيجار، إنترنت…) مابتتصرفش لوحدها: يوم ميعادها بتجيلك مهمة في «مهامي النهارده» والكارت ده في «الخزن والحركات»، وانت اللي بتوافق وتصرف (إذن صرف بقيده) أو تقول «مش الشهر ده».")}
        ${table(["الفاتورة", "البند", "من", "يوم", "المبلغ", "الشهر ده", ""], st.bills.map((b) => { const s = billState(b), mv = b.paid[monthKey()]; return `<tr><td><b>${esc(b.name)}</b><span class="sub">${esc(b.vendor)}</span></td><td>${esc(b.line)}</td><td>${esc(b.from)}</td><td class="n">${b.day}</td><td class="n">${A.money(b.amount)}</td><td>${chip(lab[s][0], lab[s][1], 1)}${mv ? ` <a class="mono click" data-act="mvView" data-id="${mv}">${mv}</a>` : ""}${b.skipped[monthKey()] ? `<span class="sub">${esc(b.skipped[monthKey()])}</span>` : ""}</td><td>${canPost() ? `${s === "due" || s === "soon" ? `<button class="btn sm" data-act="mvNew" data-k="pay" data-bill="${b.id}">وافق واصرف</button>` : ""} <button class="btn ghost sm" data-act="billToggle" data-id="${b.id}">${b.on ? "وقّفها" : "شغّلها"}</button>` : ""}</td></tr>`; }))}
        ${canPost() ? `<form class="card flat grid" data-form="billAdd">${U.field("الفاتورة", `<input name="name" required placeholder="مثلاً: اشتراك Bayut">`, 1)}${U.field("المورد", `<input name="vendor" list="bl-v" required><datalist id="bl-v">${st.vendors.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`, 1)}${U.field("البند", `<select name="line">${lineOpts()}</select>`, 1)}${U.field("المبلغ المعتاد", `<input name="amount" type="number" min="1" required>`, 1)}${U.field("يوم في الشهر", `<input name="day" type="number" min="1" max="28" required value="1">`, 1)}${U.field("بتتصرف من", `<select name="from">${accOpts()}</select>`, 1)}<div class="row end wide"><button class="btn">${I("plus")}ضيف فاتورة ثابتة</button></div></form>` : ""}`;
    },
    tree() {
      const C = coa(), node = (n, depth) => n.kids ? `<details ${depth < 2 ? "open" : ""}><summary><b class="mono">${n.code}</b> <b>${esc(n.name)}</b><span class="spacer"></span><span class="hint">${n.nat === "dr" ? "مدين" : "دائن"}</span><b class="num">${A.money(n.bal)}</b></summary><div class="kids">${n.kids.map((k) => node(k, depth + 1)).join("")}${canPost() && canAddUnder(n) ? `<button class="btn ghost sm add-sub" data-act="acctNew" data-p="${n.code}">${I("plus")}حساب فرعي تحت ${esc(n.name)}</button>` : ""}</div></details>`
        : `<div class="kid click" data-act="acctLedger" data-k="${esc(n.key || n.code)}"><span class="mono">${n.code}</span><span class="spacer">${esc(n.name)}${n.custom ? ` <span class="hint">· حساب جديد</span>` : ""}</span><b class="num">${A.money(n.bal)}</b>${n.custom && canPost() && !n.bal ? `<button class="icon-btn sm" data-act="acctDel" data-c="${n.code}" aria-label="امسح الحساب">${I("x")}</button>` : ""}</div>`;
      const tot = (c) => C.T.find((n) => n.code === c).bal;
      return `${canPost() ? `<div class="row"><button class="btn" data-act="acctNew">${I("plus")}حساب جديد في الشجرة</button><span class="spacer"></span><button class="btn ghost" data-act="jeNew">${I("plus")}قيد يومية جديد</button></div>` : ""}${note(`الحسابات الرئيسية الخمسة (الأصول، والخصوم، وحقوق الملكية، والإيرادات، والمصروفات) ثابتة، وتحت أي حساب فيهم تقدر تضيف حساب فرعي بإيدك («+ حساب فرعي» جوه كل حساب)، ولو ليه رصيد افتتاحي بيتعمله قيد لوحده. حساب «العملاء» (113) رصيده = مجموع حسابات العملاء اللي تحته: كل عميل في صفقة بيتفتحله حساب لوحده، وكل تحصيل بيتقيد على حسابه. كل حساب بكوده وطبيعته ورصيده دلوقتي. أي إذن صرف أو توريد أو تحويل بيعمل قيد يومية بيتسمّع هنا لوحده. الأصول ${A.short(tot("1"))} = الخصوم ${A.short(tot("2"))} + حقوق الملكية ${A.short(tot("3"))}.`)}<div class="tree coa">${C.T.map((n) => node(n, 0)).join("")}</div>
        ${note("الأكواد والحسابات ملخص من «شجرة الحسابات.xlsx». أرصدة البداية الحقيقية هتتدخل وقت الإطلاق.")}`;
    }
  };
  A.CHANGE.mvF = (v) => { ui("mvF", v); A.render(); };
  /* ---- budgets: spent = the line's vouchers and entries inside the budget's period ---- */
  const inPeriod = (at, period) => { if (!at) return false; const t = A.today(); if (period === "year") return at.slice(0, 4) === t.slice(0, 4); if (period === "quarter") return at.slice(0, 4) === t.slice(0, 4) && Math.floor((+at.slice(5, 7) - 1) / 3) === Math.floor((+t.slice(5, 7) - 1) / 3); return at.slice(0, 7) === t.slice(0, 7); };
  const budSpent = (b) => { const n = coa().idx[b.line]; if (!n || n.kids || !/^5/.test(n.code)) return b.spent || 0; if ((b.period || "month") === "year") return n.bal; return leafRows(n.code).rows.filter((x) => inPeriod(x.at, b.period || "month")).reduce((s, x) => s + x.v, 0); };
  A.budSpent = budSpent;
  const budOver = () => S().budgets.filter((b) => b.on !== false && b.budget && budSpent(b) >= (b.budget * (b.alert ?? 80)) / 100);
  A.ACT.budF = (d) => { ui("budF", d.v); A.render(); };
  A.CHANGE.budEdit = (v, el) => { const st = S(), line = el.dataset.line, k = el.dataset.k, n = coa().idx[line];
    let b = st.budgets.find((x) => x.line === line); if (!b) { b = { line, kind: n && n.code.startsWith("53") ? "مصروفات بيعية" : "مصروفات إدارية", budget: 0, spent: 0, period: "month", alert: 80 }; st.budgets.push(b); }
    const old = b[k]; b[k] = ["budget", "alert"].includes(k) ? Math.max(0, +v || 0) : v; if (k === "alert") b.alert = Math.min(100, b.alert || 80);
    A.audit("finance", `البادجت · ${line}: ${k} ${old ?? "—"} ← ${b[k]}`); A.toast("اتحفظ"); A.render(); };
  A.ACT.budToggle = (d) => { const b = S().budgets.find((x) => x.line === d.line); b.on = b.on === false; A.audit("finance", `البادجت · ${b.line}: ${b.on ? "اتشغّل" : "اتوقف"}`); A.render(); };
  A.FORM.budAdd = (f) => { const st = S(), name = f.line.trim(); if (!name) return;
    if (st.budgets.some((b) => b.line === name) || coa().idx[name]) return A.toast("البند ده موجود · عدّل البادجت بتاعه من الجدول");
    const kindAr = f.kind === "53" ? "مصروفات بيعية" : f.kind === "52" ? "مصروفات إدارية" : "بند تاني";
    if (f.kind !== "other") st.expenses[f.kind === "52" ? "admin" : "selling"].push([name, 0]);
    st.budgets.push({ line: name, kind: kindAr, budget: +f.budget || 0, spent: 0, period: f.period || "month", alert: Math.min(100, +f.alert || 80) });
    A.audit("finance", `بند جديد بالبادجت: ${name} · ${A.money(+f.budget || 0)} ${f.period}`); A.toast(f.kind === "other" ? "اتضاف البند" : `اتضاف البند واتفتحله حساب ${coa().idx[name].code}`); A.render(); };
  // after any posting on an expense line: tell the accountant and the line's owner once it passes the alert %
  const budCheck = (line, before) => { const b = S().budgets.find((x) => x.line === line); if (!b || b.on === false || !b.budget) return; const sp = budSpent(b), al = b.alert ?? 80, lim = (b.budget * al) / 100;
    if (sp >= b.budget) { if (before < b.budget) A.notify(["accountant", ...(b.owner ? [b.owner] : [])], `بند «${line}» عدّى البادجت: اتصرف ${A.money(sp)} من ${A.money(b.budget)}`); A.toast(`تنبيه: «${line}» عدّى البادجت (${A.money(sp)} من ${A.money(b.budget)})`); }
    else if (sp >= lim && before < lim) { A.notify(["accountant", ...(b.owner ? [b.owner] : [])], `بند «${line}» وصل ${Math.round((sp / b.budget) * 100)}% من البادجت · فاضل ${A.money(b.budget - sp)}`); A.toast(`«${line}» وصل ${Math.round((sp / b.budget) * 100)}% من البادجت`); } };
  const advCard = () => { const st = S(), mk = A.today().slice(0, 7), done = advPosted(mk), ids = advEmps().filter((id) => advLeft(id) > 0 || advPlan(id, mk) > 0), tot = ids.reduce((s, id) => s + advPlan(id, mk), 0);
    return `<section class="card">${head("سلف الموظفين", "users", chip("", A.money(advEmps().reduce((s, id) => s + advLeft(id), 0))), "كل واحد عليه كام · وانت بتختار يتخصم منه كام الشهر ده")}
      ${table(["الموظف", "اتسلّف", "اتخصم قبل كده", "عليه دلوقتي", `يتخصم ${esc(st.periods[st.periods.length - 1].name)}`, ""], ids.map((id) => { const plan = advPlan(id, mk), left = advLeft(id) + (done ? plan : 0);
        return `<tr><td>${A.who(id)}</td><td class="n">${A.money(advGiven(id))}</td><td class="n">${A.money(advTaken(id) - (done ? plan : 0))}</td><td class="n"><b>${A.money(left)}</b></td>
          <td class="n">${done || !canPost() ? `<b>${A.money(plan)}</b>` : `<input type="number" min="0" max="${advLeft(id)}" step="any" value="${plan}" data-change="advPlanSet" data-emp="${id}" aria-label="الخصم الشهر ده" style="max-width:110px">`}<span class="sub">باقي بعده ${A.money(left - plan)}</span></td>
          <td><button class="btn ghost sm" data-act="advStatement" data-emp="${id}">كشف</button></td></tr>`; }))}
      ${note(done ? `خصومات السلف للشهر ده اتعتمدت (${A.money(tot)}) واتعملها أذونات «خصم سلفة من المرتب».` : `المبلغ اللي بتكتبه هو اللي هيتخصم من مرتب الشهر ده (مش شرط كله)، وبيظهر في «المرتبات». لما تعتمد، كل خصم بيتعمله إذن بقيده: من ح/ الخزنة اللي بتصرف منها المرتبات إلى ح/ سلفة الموظف. الإجمالي ${A.money(tot)}.`)}
      ${canPost() ? `<div class="row end">${!done && tot > 0 ? `<select id="adv-from" aria-label="خزنة المرتبات">${accOpts("خزينة رئيسية")}</select><button class="btn" data-act="advPost">${I("check")}اعتمد خصومات الشهر</button>` : ""}<button class="btn ghost sm" data-act="mvNew" data-k="advance">${I("plus")}سلفة جديدة</button></div>` : ""}</section>`; };
  A.CHANGE.advPlanSet = (v, el) => { const st = S(), mk = A.today().slice(0, 7), id = el.dataset.emp, n = Math.max(0, Math.min(advLeft(id), +v || 0));
    ((st.advPlan = st.advPlan || {})[mk] = st.advPlan[mk] || {})[id] = n; (st.advMonthly = st.advMonthly || {})[id] = n;
    A.audit("finance", `خصم سلفة ${A.person(id)} الشهر ده: ${A.money(n)}`); A.toast(`${A.person(id)}: هيتخصم ${A.money(n)} الشهر ده`); A.render(); };
  A.ACT.advPost = () => { const st = S(), mk = A.today().slice(0, 7), to = (document.getElementById("adv-from") || {}).value || "خزينة رئيسية";
    if (!canPost()) return A.toast("مالكش صلاحية"); if (!openPeriod()) return A.toast("الشهر مقفول"); if (advPosted(mk)) return A.toast("خصومات الشهر ده اتعتمدت قبل كده");
    const list = advEmps().map((id) => [id, advPlan(id, mk)]).filter(([, v]) => v > 0); if (!list.length) return A.toast("مفيش خصومات الشهر ده");
    list.forEach(([id, v]) => { const m = { id: "MV-" + (109 + st.moves.length), at: A.nowIso(), kind: "advded", to, party: id, amount: v, note: `خصم سلفة من مرتب ${A.person(id)}`, by: A.me() };
      acc(to).balance += v; st.moves.unshift(m); (st.advDeds = st.advDeds || []).push({ emp: id, amount: v, month: mk, at: m.at, move: m.id }); A.notify([id], `اتخصم ${A.money(v)} من سلفتك الشهر ده · باقي عليك ${A.money(advLeft(id))}`); });
    A.audit("finance", `خصومات السلف ${mk}: ${list.map(([id, v]) => `${A.person(id)} ${A.money(v)}`).join(" · ")}`); A.toast(`اتعتمدت ${list.length} خصومات · اتعملها أذونات وقيود`); A.render(); };
  A.ACT.advStatement = (d) => { const st = S(), id = d.emp, rows = st.advances.filter((a) => a.emp === id).map((a) => [a.date, "سلفة", a.amount, 0]).concat((st.advDeds || []).filter((x) => x.emp === id).map((x) => [x.at, `خصم من مرتب ${x.month} · <span class="mono">${x.move}</span>`, 0, x.amount])).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    let bal = 0; A.openModal(`كشف سلفة · ${A.person(id)}`, `<div class="pdf">${note(`<b>عليه دلوقتي ${A.money(advLeft(id))}</b> = اتسلّف ${A.money(advGiven(id))} − اتخصم ${A.money(advTaken(id))}`)}${U.table(["التاريخ", "البيان", "سلفة", "خصم", "الرصيد"], rows.map((r) => { bal += r[2] - r[3]; return `<tr><td>${A.fmtDate(r[0])}</td><td>${r[1]}</td><td class="n">${r[2] ? A.money(r[2]) : ""}</td><td class="n">${r[3] ? A.money(r[3]) : ""}</td><td class="n"><b>${A.money(bal)}</b></td></tr>`; }))}</div>`); };
  // where a new account can go: any parent, or a leaf that the system doesn't compute by itself
  const NO_SUB = ["32", "33"], canAddUnder = (n) => !NO_SUB.includes(n.code) && !/^(111|112|113|114|211|52|53)./.test(n.code) && !(n.custom && n.bal);
  A.ACT.acctNew = (d) => { const C = coa(), opts = Object.values(C.byCode).filter(canAddUnder).sort((a, b) => a.code.localeCompare(b.code));
    A.openModal("حساب جديد في شجرة الحسابات", `<form data-form="acctAdd" class="grid">
      ${U.field("تحت حساب", `<select name="parent" required>${opts.map((n) => opt(n.code, `${n.code} · ${n.path.join(" ← ")}`, d.p)).join("")}</select>`, 1, 1)}
      ${U.field("اسم الحساب", `<input name="name" required placeholder="مثلاً: بنك مصر">`, 1)}${U.field("لو بنك: النوع", `<select name="kind"><option>بنك</option><option>محفظة</option></select>`)}
      ${U.field("رصيد افتتاحي", `<input name="opening" type="number" min="0" step="any" value="0">`)}${U.field("الرصيد الافتتاحي جه من", `<select name="counter">${opt("32", "32 · رصيد افتتاحي (الأرباح المحتجزة)", "32")}${C.leaves.filter((n) => n.code !== "32").map((n) => opt(n.code, `${n.code} · ${n.name}`)).join("")}</select>`)}
      ${note("الكود بيتعمل لوحده تحت الحساب اللي اخترته. الخزن والبنوك والعملاء وبنود المصروفات بتظهر على طول في الأذونات. لو فيه رصيد افتتاحي بيتعمله قيد: من ح/ الحساب الجديد إلى ح/ الطرف التاني (أو العكس لو الحساب دائن).")}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("check")}افتح الحساب</button></div></form>`); };
  A.FORM.acctAdd = (f) => {
    const st = S(), C = coa(), par = C.byCode[f.parent], name = f.name.trim(), amt = +f.opening || 0;
    if (!canPost()) return A.toast("مالكش صلاحية تفتح حسابات");
    if (!par || !canAddUnder(par)) return A.toast("مينفعش تضيف حساب تحت الحساب ده");
    if (Object.values(C.byCode).some((n) => n.name === name)) return A.toast("فيه حساب بنفس الاسم");
    if (amt && f.counter === f.parent) return A.toast("اختار طرف تاني غير الحساب نفسه");
    if (f.parent === "111" || f.parent === "112") st.accounts.push({ name, kind: f.parent === "111" ? "خزينة" : f.kind, balance: 0 });
    else if (f.parent === "113") { const cc = st.clientCodes; cc[name] = Object.keys(cc).length + 1; }
    else if (f.parent === "52" || f.parent === "53") { const k = f.parent === "52" ? "admin" : "selling"; st.expenses[k].push([name, 0]); st.budgets.push({ line: name, kind: k === "admin" ? "مصروفات إدارية" : "مصروفات بيعية", budget: 0, spent: 0 }); }
    else { const taken = new Set(Object.keys(C.byCode)), base = par.code, start = (par.kids || []).length + 1; let i = start, code; do { code = base + String(i++).padStart(2, "0"); } while (taken.has(code));
      (st.coaCustom = st.coaCustom || []).push({ parent: par.code, code, name, at: A.nowIso(), by: A.me() }); }
    const n = Object.values(coa().byCode).find((x) => x.name === name);
    A.audit("finance", `حساب جديد ${n.code} · ${name} تحت ${par.code} ${par.name}`);
    if (!amt) { A.closeModal(); A.toast(`اتفتح الحساب ${n.code} · ${name}`); A.render(); return; }
    const dr = n.nat === "dr";
    A.FORM.jeSave({ date: A.today(), note: `رصيد افتتاحي · ${name}`, lines: [{ code: n.code, dr: dr ? amt : 0, cr: dr ? 0 : amt }, { code: f.counter, dr: dr ? 0 : amt, cr: dr ? amt : 0 }] });
  };
  A.ACT.acctDel = (d) => { const st = S(), used = (st.journal || []).some((je) => je.lines.some((l) => l.code === d.c)) || (st.coaCustom || []).some((a) => a.parent === d.c);
    if (used) return A.toast("الحساب عليه قيود أو تحته حسابات · مينفعش يتمسح"); const a = st.coaCustom.find((x) => x.code === d.c); st.coaCustom = st.coaCustom.filter((x) => x !== a); A.audit("finance", `اتمسح الحساب ${a.code} · ${a.name}`); A.toast("اتمسح"); A.render(); };
  A.FORM.clientAcct = (f) => { const st = S(), cc = st.clientCodes, n = f.name.trim(); if (cc[n]) return A.toast("العميل ده ليه حساب"); cc[n] = Object.keys(cc).length + 1; A.audit("finance", `حساب عميل جديد: 113${String(cc[n]).padStart(3, "0")} · ${n}`); A.toast(`اتفتح حساب 113${String(cc[n]).padStart(3, "0")} · ${n}`); A.render(); };
  // a collection from a deal: the safe / bank goes up, the client's account goes down (Dr safe · Cr client)
  A.finReceive = (o) => { const st = S(), a = acc(o.to); a.balance += o.amount;
    const m = { id: "MV-" + (109 + st.moves.length), at: o.at || A.nowIso(), kind: "receive", to: o.to, amount: o.amount, party: o.party, source: "عمولة من عميل", deal: o.deal, side: o.side, ref: o.ref, note: o.note, by: A.me() };
    st.moves.unshift(m); A.audit("finance", `${KIND.receive[0]} ${m.id} · ${A.money(o.amount)} · ${o.party} · ${o.deal}`);
    const d = st.deals.find((x) => x.id === o.deal); if (d && A.dealStatus(d) === "Fully Collected") A.notify(["accountant"], `${d.id} اتحصّلت بالكامل · العمولة بقت مستحقة: ${A.salesShares(d).map((x) => `${A.person(x.sales)} ${A.money(x.amount)}`).join(" · ")} · اصرفها من «المرتبات»`);
    return m; };
  /* recurring bills: on the due day the accountant gets a task. Nothing is paid by itself: he approves and pays, or skips the month */
  const monthKey = () => A.today().slice(0, 7), monthName = () => new Date(A.today() + "T12:00:00").toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  const billState = (b) => { const mk = monthKey(), day = +A.today().slice(8, 10); return b.paid[mk] ? "paid" : b.skipped[mk] ? "skipped" : !b.on ? "off" : day >= b.day ? "due" : b.day - day <= 3 ? "soon" : "later"; };
  const billsDue = () => (S().bills || []).filter((b) => billState(b) === "due");
  const billCard = () => { const q = billsDue(); if (!q.length) return "";
    return `<section class="card attn">${head("فواتير ثابتة ميعادها جه", "calendar", chip("warn", q.length), "مفيش حاجة بتتصرف لوحدها · انت اللي بتوافق وتصرف أو تأجّل الشهر ده")}
      ${table(["الفاتورة", "البند", "الميعاد", "المبلغ المعتاد", ""], q.map((b) => `<tr><td><b>${esc(b.name)}</b><span class="sub">${esc(b.vendor)}</span></td><td>${esc(b.line)}</td><td>يوم ${b.day}</td><td class="n"><b>${A.money(b.amount)}</b></td><td>${canPost() ? `<button class="btn sm" data-act="mvNew" data-k="pay" data-bill="${b.id}">وافق واصرف</button> <button class="btn ghost sm" data-act="billSkip" data-id="${b.id}">مش الشهر ده</button>` : ""}</td></tr>`))}</section>`; };
  A.ACT.billSkip = (d) => { const b = S().bills.find((x) => x.id === d.id), why = (prompt("ليه مش هتتصرف الشهر ده؟") || "").trim(); if (!why) return; b.skipped[monthKey()] = why; A.audit("finance", `${b.name}: مش هتتصرف ${monthName()} · ${why}`); A.toast("اتأجلت للشهر الجاي"); A.render(); };
  A.ACT.billToggle = (d) => { const b = S().bills.find((x) => x.id === d.id); b.on = !b.on; A.audit("finance", `${b.name}: ${b.on ? "اتفعّلت" : "اتوقفت"}`); A.render(); };
  A.FORM.billAdd = (f) => { const st = S(); st.bills.push({ id: "BL-" + (st.bills.length + 1), on: true, name: f.name.trim(), vendor: f.vendor.trim(), line: f.line, amount: +f.amount, day: Math.min(28, Math.max(1, +f.day)), from: f.from, paid: {}, skipped: {} }); A.audit("finance", `فاتورة ثابتة جديدة: ${f.name} · يوم ${f.day}`); A.toast("اتضافت · هتجيلك مهمة يوم ميعادها"); A.render(); };
  /* manual journal entry: the accountant picks accounts from the chart, debit / credit, and it must balance */
  const jeLine = (C) => `<tr class="je-line"><td><select name="acct" aria-label="الحساب"><option value="">اختار حساب…</option>${C.T.map((root) => `<optgroup label="${root.code} · ${root.name}">${C.leaves.filter((n) => n.code[0] === root.code).map((n) => `<option value="${n.code}">${n.code} · ${esc(n.path.slice(1).join(" ← "))}</option>`).join("")}</optgroup>`).join("")}</select></td>
    <td><input name="dr" type="number" min="0" step="any" data-input="jeSum" aria-label="مدين" style="width:110px"></td><td><input name="cr" type="number" min="0" step="any" data-input="jeSum" aria-label="دائن" style="width:110px"></td><td><button type="button" class="btn ghost sm" data-act="jeDelLine" aria-label="امسح السطر">${I("x")}</button></td></tr>`;
  A.ACT.jeNew = () => { const C = coa();
    A.openModal("قيد يومية جديد", `<form data-form="jeSave" class="grid">${U.field("التاريخ", `<input name="date" type="date" value="${A.today()}" max="${A.today()}" required>`, 1)}${U.field("البيان", `<input name="note" required placeholder="مثلاً: تسوية فرق جرد الخزنة">`, 1)}
      <div class="wide"><table class="je"><thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th><th></th></tr></thead><tbody id="je-lines">${jeLine(C)}${jeLine(C)}</tbody>
        <tfoot><tr><td><button type="button" class="btn ghost sm" data-act="jeAddLine">${I("plus")}سطر</button></td><td class="n"><b id="je-dr">0</b></td><td class="n"><b id="je-cr">0</b></td><td></td></tr></tfoot></table>
        <p class="hint" id="je-diff">المدين لازم يساوي الدائن</p></div>
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("check")}سجّل القيد</button></div></form>`); };
  A.ACT.jeAddLine = () => { document.getElementById("je-lines").insertAdjacentHTML("beforeend", jeLine(coa())); };
  A.ACT.jeDelLine = (d, el) => { const rows = document.querySelectorAll("#je-lines tr"); if (rows.length > 2) el.closest("tr").remove(); A.CHANGE.jeSum(); };
  A.CHANGE.jeSum = () => { const t = [...document.querySelectorAll("#je-lines tr")].reduce((s, r) => [s[0] + (+r.querySelector("[name=dr]").value || 0), s[1] + (+r.querySelector("[name=cr]").value || 0)], [0, 0]);
    document.getElementById("je-dr").textContent = A.money(t[0]); document.getElementById("je-cr").textContent = A.money(t[1]);
    const d = document.getElementById("je-diff"); d.textContent = t[0] === t[1] && t[0] > 0 ? "متوازن ✓" : `الفرق ${A.money(Math.abs(t[0] - t[1]))}`; d.className = t[0] === t[1] && t[0] > 0 ? "hint ok-t" : "hint bad-t"; };
  A.FORM.jeSave = (f, form) => {
    const st = S(), C = coa();
    if (!canPost()) return A.toast("مالكش صلاحية تسجّل قيود");
    if (!openPeriod()) return A.toast("الشهر مقفول · مينفعش تسجّل قيد فيه");
    if (f.date > A.today()) return A.toast("مينفعش تاريخ بعد النهارده");
    const lines = f.lines || [...form.querySelectorAll("#je-lines tr")].map((r) => ({ code: r.querySelector("[name=acct]").value, dr: +r.querySelector("[name=dr]").value || 0, cr: +r.querySelector("[name=cr]").value || 0 })).filter((l) => l.code || l.dr || l.cr);
    if (lines.length < 2) return A.toast("القيد محتاج سطرين على الأقل");
    if (lines.some((l) => !l.code)) return A.toast("اختار الحساب في كل سطر");
    if (lines.some((l) => (l.dr > 0) === (l.cr > 0))) return A.toast("كل سطر يا مدين يا دائن (مش الاتنين ولا صفر)");
    const dr = lines.reduce((s, l) => s + l.dr, 0), cr = lines.reduce((s, l) => s + l.cr, 0);
    if (Math.round(dr * 100) !== Math.round(cr * 100)) return A.toast(`القيد مش متوازن · المدين ${A.money(dr)} والدائن ${A.money(cr)}`);
    const before = Object.fromEntries(lines.map((l) => [l.code, C.byCode[l.code].bal]));
    // post: a safe / bank or an expense line changes its own balance (so the income statement follows); anything else through glAdj
    lines.forEach((l) => { const n = C.byCode[l.code], a = n.key && acc(n.key), L = n.key && [...st.expenses.admin, ...st.expenses.selling].find((x) => x[0] === n.key);
      if (a || L) st.glPlug = (st.glPlug || 0) - (l.dr - l.cr);
      if (a) a.balance += l.dr - l.cr; else if (L) { L[1] += l.dr - l.cr; const b = st.budgets.find((x) => x.line === n.key); if (b) b.spent += l.dr - l.cr; }
      else { st.glAdj = st.glAdj || {}; st.glAdj[l.code] = (st.glAdj[l.code] || 0) + (n.nat === "dr" ? l.dr - l.cr : l.cr - l.dr); } });
    const je = { id: "JV-M" + String((st.journal = st.journal || []).length + 1).padStart(3, "0"), at: f.date === A.today() ? A.nowIso() : new Date(`${f.date}T12:00:00`).toISOString(), note: f.note.trim(), lines, by: A.me(), before };
    st.journal.unshift(je); A.audit("finance", `قيد يدوي ${je.id} · ${A.money(dr)} · ${je.note}`);
    A.render(); A.openModal(`قيد يومية ${je.id}`, jeView(je, true)); A.toast(`اتسجّل القيد ${je.id} واتسمّع في الشجرة`);
  };
  const jeView = (je, after) => { const C = coa();
    return `<div class="pdf"><div class="pdf-head"><b>Places · قيد يومية</b><span class="mono">${je.id}</span></div>${U.kv([["التاريخ", A.fmtDate(je.at)], ["طبيعة الحركة", "قيد يدوي"], ["البيان", esc(je.note)], ["سجّله", esc(A.person(je.by))]])}
      ${U.table(["كود الحساب · الحساب", "مدين", "دائن"], je.lines.map((l) => `<tr><td>${esc(l.code)} · ${esc(C.byCode[l.code].path.join(" ← "))}</td><td class="n">${l.dr ? A.money(l.dr) : ""}</td><td class="n">${l.cr ? A.money(l.cr) : ""}</td></tr>`))}
      ${after ? `<h4 class="mini-h">الأثر على شجرة الحسابات</h4>${U.table(["الحساب", "قبل", "بعد"], je.lines.map((l) => { const n = C.byCode[l.code], d = n.bal - je.before[l.code]; return `<tr><td>${esc(n.code)} · ${esc(n.name)}</td><td class="n">${A.money(je.before[l.code])}</td><td class="n"><b>${A.money(n.bal)}</b> ${chip(d >= 0 ? "ok" : "bad", (d >= 0 ? "+" : "−") + A.money(Math.abs(d)), 1)}</td></tr>`; }))}` : ""}</div>
      <div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع القيد</button></div>`; };
  A.ACT.jeView = (d) => A.openModal(`قيد يومية ${d.id}`, jeView(S().journal.find((x) => x.id === d.id)));
  // one account's movements from the journal (حركات الحساب)
  A.ACT.acctLedger = (d) => { const C = coa(), n = C.idx[d.k] || C.byCode[d.k], ms = S().moves.filter((m) => entry(m).some((e) => e[0] === n.key)), mj = (S().journal || []).filter((je) => je.lines.some((l) => l.code === n.code));
    A.openModal(`حركات الحساب · ${n.code} ${n.name}`, `<div class="pdf">${note(`${esc(n.path.join(" ← "))} · الرصيد ${A.money(n.bal)} (${n.nat === "dr" ? "مدين" : "دائن"})`)}${U.table(["قيد اليومية", "التاريخ", "البيان", "مدين", "دائن"], ms.map((m) => { const e = entry(m).filter((x) => x[0] === d.k).reduce((s, x) => [s[0] + x[1], s[1] + x[2]], [0, 0]); return `<tr class="click" data-act="mvView" data-id="${m.id}"><td class="mono">${jvOf(m)}</td><td>${A.fmtDate(m.at)}</td><td>${esc(m.note || "")}</td><td class="n">${e[0] ? A.money(e[0]) : ""}</td><td class="n">${e[1] ? A.money(e[1]) : ""}</td></tr>`; }).concat(mj.map((je) => { const e = je.lines.filter((l) => l.code === n.code).reduce((s, l) => [s[0] + l.dr, s[1] + l.cr], [0, 0]); return `<tr class="click" data-act="jeView" data-id="${je.id}"><td class="mono">${je.id}</td><td>${A.fmtDate(je.at)}</td><td>${esc(je.note)}</td><td class="n">${e[0] ? A.money(e[0]) : ""}</td><td class="n">${e[1] ? A.money(e[1]) : ""}</td></tr>`; })))}</div><div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع</button></div>`); };
  A.CHANGE.ccf = (v, el) => { ui("ccf", Object.assign({}, ui("ccf"), { [el.dataset.k]: v })); A.render(); };
  A.ACT.advances = () => { ui("fnTab", "custody"); A.render(); };
  A.ACT.advancesOld = () => A.openModal("سلف الموظفين", U.table(["الموظف", "التاريخ", "رصيد السلفة"], S().advances.map((a) => `<tr><td>${A.who(a.emp)}</td><td>${A.fmtDate(a.date)}</td><td class="n">${A.money(a.amount)}</td></tr>`)));
  A.ACT.drill = (d) => {
    const st = S(), p = figures();
    const html = d.k === "rev" ? U.table(["الصفقة", "العميل", "النوع", "عمولة Places"], st.deals.filter(A.countsRevenue).map((x) => `<tr><td class="mono">${x.id}</td><td>${esc(x.client)}</td><td>${esc(x.kind)}</td><td class="n">${A.money(A.placesComm(x))}</td></tr>`))
      : d.k === "direct" ? U.table(["الصفقة", "السيلز", "النسبة", "العمولة"], st.deals.filter(A.countsRevenue).flatMap((x) => A.salesShares(x).map((s) => `<tr><td class="mono">${x.id}</td><td>${A.who(s.sales)}</td><td class="n">${s.rate}% × ${s.pct}%</td><td class="n">${A.money(s.amount)}</td></tr>`)))
      : U.table(["البند", "المبلغ", "من المشتريات"], p[d.k].map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${A.money(v)}</td><td>${st.purchases.filter((x) => x.line === k && x.status === "Paid").map((x) => x.id).join("، ") || "—"}</td></tr>`));
    A.openModal({ rev: "الإيرادات", direct: "المصاريف المباشرة", selling: "المصروفات البيعية", admin: "المصروفات الإدارية" }[d.k], html);
  };
  /* ---- income statement drill-down: where every number comes from and what it passed through ---- */
  const inMon = (at) => !!at && at.slice(0, 7) === A.today().slice(0, 7);
  const monVal = (c, C) => { const n = C.byCode[c]; return n.kids ? C.leaves.filter((x) => x.code.startsWith(c) && x.code !== c).reduce((s, x) => s + monVal(x.code, C), 0) : leafRows(c).rows.filter((x) => inMon(x.at)).reduce((s, x) => s + x.v, 0); };
  const pnlNums = (mon) => { const C = coa(), p = figures(), N = (c) => (mon ? monVal(c, C) : C.byCode[c].bal), rev = N("4"), d = N("51"), se = N("53"), ad = N("52");
    const oth = N("5") - d - se - ad; return { C, p, N, rev, d, se, ad, oth, saved: p.saved, gross: rev - d, contrib: rev - d - se, net: rev - d - se - ad - oth + p.saved }; };
  const upOf = (code, n) => (["1", "2", "3"].includes(code[0]) ? n.path.slice(0, -1).reverse().join(" ← ") : code[0] === "4" ? "الإيرادات ← ربح الصفقات ← ربح النشاط ← صافي الربح" : code.startsWith("51") ? "المصاريف المباشرة ← ربح الصفقات ← ربح النشاط ← صافي الربح" : code.startsWith("53") ? "المصروفات البيعية ← ربح النشاط ← صافي الربح" : code.startsWith("52") ? "المصروفات الإدارية ← صافي الربح" : "المصروفات ← صافي الربح");
  const whyTable = (rows, total, totLabel) => U.table(["المصدر", "عدّى على", "المبلغ"], rows.map((x) => `<tr class="${x.act ? "click" : ""}" ${x.act ? `data-act="${x.act}" data-id="${esc(x.id)}"` : ""}><td>${x.src}</td><td class="hint">${x.path}</td><td class="n">${A.money(x.v)}</td></tr>`).concat(`<tr class="total"><td><b>${totLabel || "الإجمالي"}</b></td><td></td><td class="n"><b>${A.money(total)}</b></td></tr>`));
  const manualRows = (n) => (S().journal || []).flatMap((je) => je.lines.filter((l) => l.code === n.code).map((l) => ({ src: `قيد يدوي <span class="mono">${je.id}</span> · ${A.fmtDate(je.at)} · ${esc(je.note)}`, path: `${je.id} ← ح/ ${n.code}`, v: n.nat === "dr" ? l.dr - l.cr : l.cr - l.dr, act: "jeView", id: je.id })));
  // the sources behind one account, each with its date when it has one
  const leafRows = (c) => { const st = S(), C = coa(), n = C.byCode[c], fm = (x) => A.money(x); let rows = [], how = "";
    const deals = st.deals.filter(A.countsRevenue), firstPay = (x) => (x.payments || []).slice().sort((a, b) => a.at.localeCompare(b.at))[0], firstTcr = (x) => ((x.tcrs || [])[0] || {}).code;
    if (c.startsWith("41")) { how = "عمولة Places (من الـ Owner + من الـ Client) لكل صفقة من النوع ده، وبتتسجّل كاملة من أول تحصيل. الباقي اللي لسه ماتحصّلش بيفضل على حساب العميل تحت «العملاء» (113).";
      rows = deals.filter((x) => x.kind === n.name).map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(x.client)} · ${fm(x.commOwner || 0)} + ${fm(x.commClient || 0)}`, path: `اتوافق عليها ← أول تحصيل ${firstPay(x) ? A.fmtDate(firstPay(x).at) : ""} ${firstTcr(x) ? `(${firstTcr(x)})` : ""} ← ح/ ${c}`, v: A.placesComm(x), act: "dealOpen", id: x.id, at: (firstPay(x) || {}).at })); }
    else if (c === "42") { how = "كل إذن توريد خزنة مصدره مش «عمولة من عميل» (إيراد آخر، استرداد…).";
      rows = st.moves.filter((m) => m.kind === "receive" && m.source !== "عمولة من عميل").map((m) => ({ src: `${KIND.receive[0]} <span class="mono">${m.id}</span> · ${A.fmtDate(m.at)} · ${esc(m.source)} · ${esc(m.note || "")}`, path: `${m.id} ← ${jvOf(m)} ← ح/ 42`, v: m.amount, act: "mvView", id: m.id, at: m.at })); }
    else if (n.name === "عمولة مبيعات") { how = "نصيب كل سيلز من عمولة كل صفقة اتحصّل منها (نسبته × نصيبه في الصفقة).";
      rows = deals.flatMap((x) => A.salesShares(x).map((sh) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(A.person(sh.sales))}`, path: `${sh.rate}% × ${sh.pct}% ← ح/ ${c}`, v: sh.amount, act: "dealOpen", id: x.id, at: (firstPay(x) || {}).at }))); }
    else if (n.name === "عمولة اوبريشن") { how = "5% من عمولة Places في الصفقات اللي اتحصّل منها (نسبة الديمو).";
      rows = deals.map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(x.client)}`, path: `${fm(A.placesComm(x))} × 5% ← ح/ ${c}`, v: A.placesComm(x) * 0.05, act: "dealOpen", id: x.id, at: (firstPay(x) || {}).at })); }
    else if (n.name === "عمولة تيم ليدر") { how = "نسبة كل Team Leader حسب شريحة تحقيق فريقه.";
      rows = st.people.filter((x) => x.role === "tl").map((x) => ({ src: esc(x.name), path: `تحقيق الفريق ← الشريحة ← ح/ ${c}`, v: A.tlStats(x.id).comm })).filter((x) => x.v); }
    else if (n.key && n.key.startsWith("عميل:")) { const nm = n.name; how = "كل صفقة للعميل ده اتحصّل منها: عمولة Places − اللي اتحصّل = الباقي عليه. كل تحصيل (إذن توريد) بينزّل حسابه.";
      rows = st.deals.filter((x) => x.client === nm && LIVE(x)).map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · العمولة ${fm(A.placesComm(x))} − اتحصّل ${fm(A.collected(x))}${A.countsRevenue(x) ? "" : " · لسه مااتحصّلش منها حاجة فمادخلتش الحساب"}`, path: `${(x.tcrs || []).map((t) => t.code).join("، ") || "—"} ← ح/ ${c}`, v: dueOf(x), act: "dealOpen", id: x.id })); }
    else if (n.key && n.key.startsWith("سلفة:")) { const id = n.emp; how = "كل سلفة اتصرفتله − كل خصم من مرتبه (إذن خصم سلفة).";
      rows = st.advances.filter((x) => x.emp === id).map((x) => ({ src: `سلفة · ${A.fmtDate(x.date)}`, path: `إذن سلفة ← ح/ ${c}`, v: x.amount, at: x.date }))
        .concat((st.advDeds || []).filter((x) => x.emp === id).map((x) => ({ src: `خصم من مرتب ${x.month} · <span class="mono">${x.move}</span>`, path: `ح/ ${c} ← ${x.move} ← المرتب`, v: -x.amount, act: "mvView", id: x.move, at: x.at }))); }
    else if (c === "114") { how = "كل سلفة اتصرفت لموظف (إذن سلفة) ولسه ماتخصمتش.";
      rows = st.advances.map((x) => ({ src: `${esc(A.person(x.emp))} · ${A.fmtDate(x.date)}`, path: `إذن سلفة ← ح/ 114`, v: x.amount })); }
    else if (c === "115") { how = "كل عهدة مع موظف ولسه ماتسوّتش (صرف عهدة − التسويات).";
      rows = st.custody.map((x) => ({ src: `${esc(A.person(x.emp))} · من ${A.fmtDate(x.date)}`, path: `إذن صرف عهدة ← تسوية ← ح/ 115`, v: x.amount })); }
    else if (c === "211") { how = "نصيب السيلز من عمولة كل صفقة اتحصّلت بالكامل، ولسه ماتصرفش مع المرتب.";
      rows = st.deals.filter((x) => A.dealStatus(x) === "Fully Collected").map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(x.client)}`, path: `اتحصّلت بالكامل ← عمولة السيلز ← ح/ 211`, v: A.salesComm(x), act: "dealOpen", id: x.id })); }
    else if (n.key && n.key.startsWith("عمولة:")) { const id = n.emp; how = "نصيبه من عمولة كل صفقة اتحصّلت بالكامل − اللي اتصرفله (إذن صرف عمولة سيلز).";
      rows = st.deals.filter((x) => A.dealStatus(x) === "Fully Collected" && A.salesComm(x, id)).map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(x.client)}`, path: `اتحصّلت بالكامل ← ${A.salesShares(x).filter((y) => y.sales === id).map((y) => `${y.rate}% × ${y.pct}%`).join(" + ")} ← ح/ ${c}`, v: A.salesComm(x, id), act: "dealOpen", id: x.id }))
        .concat((st.commPaid || []).filter((x) => x.emp === id).map((x) => ({ src: `صرف عمولة <span class="mono">${x.move}</span> · ${A.fmtDate(x.at)}${x.deal ? ` · ${x.deal}` : ""}${x.tcr ? ` · ${x.tcr}` : ""}`, path: `ح/ ${c} ← ${x.move} ← الخزنة`, v: -x.amount, act: "mvView", id: x.move }))); }
    else if (c === "32") { how = "أرباح السنين اللي فاتت (من الميزانية الافتتاحية): الأصول − الخصوم − رأس المال − نتيجة السنة دي.";
      rows = [{ src: "الأصول", path: "1", v: C.byCode["1"].bal }, { src: "ناقص الخصوم", path: "2", v: -C.byCode["2"].bal }, { src: "ناقص رأس المال", path: "31", v: -C.byCode["31"].bal }, { src: "ناقص أرباح وخسائر العام", path: "33", v: -C.byCode["33"].bal }]; }
    else if (["12", "212", "31"].includes(c)) how = "رصيد افتتاحي ثابت في الديمو، وأرصدة البداية الحقيقية هتتدخل وقت الإطلاق.";
    else if (n.key) { const mv = st.moves.filter((m) => entry(m).some((e) => e[0] === n.key)), paid = st.purchases.filter((x) => x.line === n.key && x.status === "Paid");
      rows = mv.map((m) => { const e = entry(m).filter((x) => x[0] === n.key).reduce((s, x) => s + x[1] - x[2], 0); return { at: m.at, src: `${KIND[m.kind][0]} <span class="mono">${m.id}</span> · ${A.fmtDate(m.at)} · ${esc(m.note || "")}`, path: `${m.from ? `${esc(m.from)} ← ` : ""}${m.id} ← ${jvOf(m)} ← ح/ ${c}`, v: e, act: "mvView", id: m.id }; })
        .concat(paid.map((x) => ({ src: `طلب شراء <span class="mono">${x.id}</span> · ${esc(x.item)}`, path: `المشتريات ← اتدفع ← ح/ ${c}`, v: x.amount, at: x.paidAt || x.date })));
      how = c[0] === "1" ? "رصيد أول المدة + كل إذن توريد أو تحويل داخل − كل إذن صرف أو تحويل خارج، وأي قيد يدوي عليه." : "كل إذن صرف أو تسوية عهدة أو طلب شراء اتدفع على البند ده، وأي قيد يدوي عليه."; }
    return { rows: rows.concat(manualRows(n).map((x) => Object.assign(x, { at: (S().journal.find((j) => j.id === x.id) || {}).at }))), how }; };
  A.ACT.pnlWhy = (d) => {
    const st = S(), mon = d.m === "month", P = pnlNums(mon), C = P.C, c = d.c, n = C.byCode[c], fm = (x) => A.money(x), V_ = (k) => (mon ? P.N(k) : C.byCode[k].bal);
    const formula = (title, f, parts) => A.openModal(title, `<div class="pdf">${note(`<b>${f}</b>`)}${U.table(["البند", "المبلغ"], parts.map(([l, v, k]) => `<tr class="${k ? "click" : ""}" ${k ? `data-act="pnlWhy" data-c="${k}" data-m="${mon ? "month" : ""}"` : ""}><td>${l}</td><td class="n">${fm(v)}</td></tr>`))}</div>`);
    if (c === "gross") return formula("ربح الصفقات", `الإيرادات − المصاريف المباشرة = ${fm(P.rev)} − ${fm(P.d)} = ${fm(P.gross)}`, [["4 · الإيرادات", P.rev, "4"], ["ناقص 51 · المصاريف المباشرة", -P.d, "51"]]);
    if (c === "contrib") return formula("ربح النشاط", `ربح الصفقات − المصروفات البيعية = ${fm(P.gross)} − ${fm(P.se)} = ${fm(P.contrib)}`, [["ربح الصفقات", P.gross, "gross"], ["ناقص 53 · مصروفات بيعية", -P.se, "53"]]);
    if (c === "net") return formula("صافي الربح", `ربح النشاط − المصروفات الإدارية${P.oth ? " − المصروفات الأخرى" : ""} + خصومات التأخير والغياب = ${fm(P.contrib)} − ${fm(P.ad)}${P.oth ? ` − ${fm(P.oth)}` : ""} + ${fm(P.saved)} = ${fm(P.net)}${mon ? "" : ` · ونفس الرقم في الشجرة ح/ 33 أرباح وخسائر العام (${fm(C.byCode["33"].bal)})`}`, [["ربح النشاط", P.contrib, "contrib"], ["ناقص 52 · مصروفات إدارية", -P.ad, "52"], ...C.byCode["5"].kids.filter((k) => !["51", "52", "53"].includes(k.code)).map((k) => [`ناقص ${k.code} · ${k.name}`, -P.N(k.code), k.code]), ["زائد خصومات التأخير والغياب", P.saved, "saved"]]);
    if (c === "saved") { const mk = A.today().slice(0, 7), on = (st.dedApproved || {})[mk], rows = on ? st.attendance.filter((a) => a.day.startsWith(mk)).map((a) => [a, A.attRow(a)]).filter(([, x]) => x.ded > 0).map(([a, x]) => ({ src: `${esc(A.person(x.e.id))} · ${A.fmtDate(a.day)}`, path: `البصمة ← خصم ${x.ded} يوم × ${fm(A.dayRate(x.e))} يومية ← الـ HR وافق`, v: x.ded * A.dayRate(x.e) })) : [];
      return A.openModal("خصومات التأخير والغياب", `<div class="pdf">${note(on ? "خصومات الشهر بعد موافقة الـ HR: أيام الخصم × اليومية (المرتب ÷ 26)." : "لسه الـ HR ماوافقش على خصومات الشهر ده، فمابتدخلش قايمة الدخل غير بعد الموافقة.")}${rows.length ? whyTable(rows, P.saved) : ""}</div>`); }
    if (c === "33") return A.ACT.pnlWhy({ c: "net" });
    if (n.kids) return A.openModal(`${n.code} · ${n.name}${mon ? " · الشهر ده" : ""}`, `<div class="pdf">${note(`<b>${esc(n.name)} = مجموع الحسابات اللي تحته = ${fm(V_(c))}</b><br>بيدخل في: ${upOf(c, n)}`)}${U.table(["الحساب", "المبلغ"], C.leaves.filter((x) => x.code.startsWith(c) && x.code !== c).map((x) => `<tr class="click" data-act="pnlWhy" data-c="${x.code}" data-m="${mon ? "month" : ""}"><td>${x.code} · ${esc(x.path.slice(1).join(" ← "))}</td><td class="n">${fm(V_(x.code))}</td></tr>`))}</div>`);
    let { rows, how } = leafRows(c);
    if (mon) rows = rows.filter((x) => inMon(x.at));
    const known = rows.reduce((s, x) => s + x.v, 0);
    if (!mon && c !== "32" && Math.round(n.bal - known)) rows.unshift({ src: c[0] === "5" ? "رصيد البند من شيت المصروفات (قبل الحركات اللي اتسجّلت على السيستم)" : "رصيد أول المدة (من البيانات الافتتاحية)", path: `أول المدة ← ح/ ${c}`, v: n.bal - known });
    const tot = mon ? rows.reduce((s, x) => s + x.v, 0) : n.bal;
    A.openModal(`${n.code} · ${n.name}${mon ? " · الشهر ده" : ""}`, `<div class="pdf">${note(`<b>${esc(n.path.join(" ← "))} = ${fm(tot)}${mon ? " (الحركات اللي حصلت الشهر ده بس)" : ""}</b><br>بيتحسب من: ${how || "القيود اليدوية على الحساب ده."}<br>وبيدخل في: ${upOf(c, n)}`)}${whyTable(rows, tot)}${Math.round(rows.reduce((s, x) => s + x.v, 0) - tot) ? note("فيه فرق بين التفاصيل والرصيد", "warn") : ""}</div>`);
  };
  A.ACT.closeMonth = () => { const pr = S().periods[S().periods.length - 1]; pr.status = "مقفول شهرياً"; A.toast(`${pr.name} اتقفل · اتطلعت قايمة الدخل`); A.render(); };
  A.ACT.closeQuarter = () => { const pr = S().periods[S().periods.length - 1]; pr.status = "مقفول ربع سنوي"; A.toast("الربع اتقفل · اتطلعت الميزانية العمومية"); A.render(); };
})();
