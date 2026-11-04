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
  V.finance = {
    sub: () => "سندات الصرف والقبض · التحويلات · العهد والسلف · القيود · قايمة الدخل · الميزانية",
    render() {
      const t = ui("fnTab") || "dash";
      return `<div class="row">${U.tabs("fnTab", [["dash", "Dashboard"], ["cash", "الخزن والحركات"], ["custody", "العهد والسلف"], ["journal", "القيود"], ["bills", "الفواتير الثابتة", billsDue().length || ""], ["pnl", "قايمة الدخل"], ["bs", "الميزانية العمومية"], ["cost", "Cost Center"], ["payroll", "المرتبات"], ["tree", "شجرة الحسابات"]], t)}</div>${FN[t]()}`;
    }
  };
  A.ACT.fnTab = (d) => { ui("fnTab", d.v); A.render(); };
  const row = (l, v, cls, drill) => `<tr class="${cls || ""} ${v < 0 ? "neg" : ""} ${drill ? "click" : ""}" ${drill ? `data-act="drill" data-k="${esc(drill)}"` : ""}><td>${esc(l)}${drill ? ` <span class="hint">${I("search")}</span>` : ""}</td><td class="n">${A.money(v)}</td></tr>`;
  /* ---------- treasury: every movement is a voucher; balances, statements and journal entries all come from it ---------- */
  const KIND = { pay: ["إذن صرف خزنة", "bad"], receive: ["إذن توريد خزنة", "ok"], transfer: ["تحويل بين خزن", "info"], advance: ["سلفة موظف", "warn"], custody: ["عهدة", "warn"], settle: ["تسوية عهدة", ""] };
  const acc = (name) => S().accounts.find((a) => a.name === name);
  const lines = () => [...S().expenses.admin.map(([k]) => [k, "مصروفات إدارية"]), ...S().expenses.selling.map(([k]) => [k, "مصروفات بيعية"])];
  const lineOpts = (v) => `<optgroup label="مصروفات إدارية">${S().expenses.admin.map(([k]) => opt(k, k, v)).join("")}</optgroup><optgroup label="مصروفات بيعية">${S().expenses.selling.map(([k]) => opt(k, k, v)).join("")}</optgroup>`;
  const accOpts = (v, skip) => S().accounts.filter((a) => a.name !== skip).map((a) => opt(a.name, `${a.name} · ${A.money(a.balance)}`, v)).join("");
  const people = () => S().employees.map((e) => opt(e.id, A.person(e.id))).join("");
  const partyName = (m) => (m.party && S().people.some((p) => p.id === m.party) ? A.person(m.party) : m.party || "—");
  const canPost = () => A.canDo("finance", "create");
  const openPeriod = () => S().periods[S().periods.length - 1].status === "مفتوح";
  const NATURE = { pay: "صرف نقدية", receive: "توريد نقدية", transfer: "تحويل نقدية بين الخزن", advance: "سلفة موظف", custody: "صرف عهدة", settle: "تسوية عهدة" };
  const LIVE = (d) => !["Pending Review", "Rejected", "Cancelled"].includes(d.status);
  const dueOf = (d) => (A.countsRevenue(d) ? Math.max(0, A.placesComm(d) - A.collected(d)) : 0);
  // every client of a deal (or one the accountant adds) gets its own account under 113; the code is given once and kept
  function clientKids(st) {
    const cc = st.clientCodes = st.clientCodes || {}, names = [...st.deals.filter(LIVE).slice().reverse().map((d) => d.client), ...st.moves.filter((m) => m.kind === "receive" && m.source === "عمولة من عميل" && m.party).slice().reverse().map((m) => m.party)]; /* oldest first */
    names.forEach((n) => { if (!cc[n]) cc[n] = Object.keys(cc).length + 1; });
    return Object.keys(cc).sort((a, b) => cc[a] - cc[b]).map((n) => ({ code: "113" + String(cc[n]).padStart(3, "0"), name: n, key: "عميل:" + n, bal: st.deals.filter((d) => d.client === n).reduce((s, d) => s + dueOf(d), 0) }));
  }
  function coa() {
    const st = S(), p = figures(), cash = st.accounts, kids = (code, list) => list.map((x, i) => Object.assign({ code: code + String(i + 1).padStart(2, "0") }, x));
    const ar = st.deals.filter(A.countsRevenue).reduce((s, d) => s + Math.max(0, A.placesComm(d) - A.collected(d)), 0), adv = st.advances.reduce((s, a) => s + a.amount, 0), cust = st.custody.reduce((s, c) => s + c.amount, 0);
    const comPay = st.deals.filter((d) => A.dealStatus(d) === "Fully Collected").reduce((s, d) => s + A.salesComm(d), 0), other = st.moves.filter((m) => m.kind === "receive" && m.source !== "عمولة من عميل").reduce((s, m) => s + m.amount, 0);
    const assets = cash.reduce((s, a) => s + a.balance, 0) + ar + adv + cust + 420000, liab = comPay + 86000;
    const T = [
      { code: "1", name: "الأصول", nat: "dr", kids: [
        { code: "11", name: "الأصول المتداولة", kids: [
          { code: "111", name: "النقدية بالخزن", kids: kids("111", cash.filter((a) => a.kind === "خزينة").map((a) => ({ name: a.name, bal: a.balance, key: a.name }))) },
          { code: "112", name: "النقدية بالبنوك والمحافظ", kids: kids("112", cash.filter((a) => a.kind !== "خزينة").map((a) => ({ name: a.name, bal: a.balance, key: a.name }))) },
          { code: "113", name: "العملاء (عمولات مستحقة)", key: "عملاء", kids: clientKids(st) }, { code: "114", name: "سلف الموظفين", bal: adv, key: "سلف موظفين" }, { code: "115", name: "العهد", bal: cust, key: "عهد" }] },
        { code: "12", name: "الأصول الثابتة (صافي)", bal: 420000 }] },
      { code: "2", name: "الخصوم", nat: "cr", kids: [{ code: "21", name: "الخصوم المتداولة", kids: [{ code: "211", name: "عمولة مبيعات مستحقة", bal: comPay }, { code: "212", name: "ضرائب قيمة مضافة", bal: 86000 }] }] },
      { code: "3", name: "حقوق الملكية", nat: "cr", kids: [{ code: "31", name: "رأس المال", bal: 1500000 }, { code: "32", name: "الأرباح المحتجزة", bal: assets - liab - 1500000 - p.net - other + (st.glPlug || 0) }, { code: "33", name: "أرباح وخسائر العام", bal: p.net + other }] },
      { code: "4", name: "الإيرادات", nat: "cr", kids: [{ code: "41", name: "عمولات تسويق عقاري", kids: kids("41", Object.entries(p.byKind).map(([k, v]) => ({ name: k, bal: v }))) }, { code: "42", name: "إيرادات أخرى", bal: other, key: "إيرادات أخرى" }] },
      { code: "5", name: "المصروفات", nat: "dr", kids: [
        { code: "51", name: "مصروفات مباشرة (العمولات)", kids: kids("51", p.direct.map(([k, v]) => ({ name: k, bal: v }))) },
        { code: "52", name: "مصروفات إدارية", kids: kids("52", p.admin.map(([k, v]) => ({ name: k, bal: v, key: k }))) },
        { code: "53", name: "مصروفات بيعية", kids: kids("53", p.selling.map(([k, v]) => ({ name: k, bal: v, key: k }))) }] }];
    const adj = st.glAdj || {}, netAdj = Object.entries(adj).reduce((s, [c, v]) => s + (c[0] === "4" ? v : c[0] === "5" ? -v : 0), 0);
    const idx = {}, byCode = {}, walk = (n, path, nat) => { n.nat = n.nat || nat; n.path = [...path, n.name]; byCode[n.code] = n;
      if (n.kids) n.bal = n.kids.reduce((s, k) => s + walk(k, n.path, n.nat), 0); else n.bal += (adj[n.code] || 0) + (n.code === "33" ? netAdj : 0);
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
    transfer: [[m.to, m.amount, 0], [m.from, 0, m.amount]], advance: [["سلف موظفين", m.amount, 0], [m.from, 0, m.amount]],
    custody: [["عهد", m.amount, 0], [m.from, 0, m.amount]],
    settle: [[m.line, m.spent, 0], ...(m.returned ? [[m.to, m.returned, 0]] : []), ["عهد", 0, m.spent + m.returned]]
  })[m.kind];
  const jvOf = (m) => "JV-" + m.id.slice(3);
  const entryTable = (m, C) => U.table(["كود الحساب · الحساب", "مدين", "دائن"], entry(m).map(([a, dr, cr]) => `<tr><td>${esc(acctLabel(a, C))}${["سلف موظفين", "عهد"].includes(a) || (a === "عملاء" && m.party) || (m.deal && a.startsWith("عميل:")) ? `<span class="sub">${esc(partyName(m))}${m.deal ? ` · ${m.deal}` : ""}</span>` : ""}</td><td class="n">${dr ? A.money(dr) : ""}</td><td class="n">${cr ? A.money(cr) : ""}</td></tr>`));
  // after Done: what each account in the entry was and is now
  const effectOnTree = (m) => { const C = coa(); return `<h4 class="mini-h">الأثر على شجرة الحسابات</h4>${U.table(["الحساب", "قبل", "بعد"], entry(m).map(([a, dr, cr]) => { const n = C.idx[a]; if (!n) return ""; const d = n.nat === "dr" ? dr - cr : cr - dr; return `<tr><td>${esc(n.code)} · ${esc(n.name)}</td><td class="n">${A.money(n.bal - d)}</td><td class="n"><b>${A.money(n.bal)}</b> ${chip(d >= 0 ? "ok" : "bad", (d >= 0 ? "+" : "−") + A.money(Math.abs(d)), 1)}</td></tr>`; }))}${note("القيد اتسمّع في شجرة الحسابات، فـ قايمة الدخل والميزانية العمومية اتحدّثوا لوحدهم.")}`; };
  const voucher = (m, after) => `<div class="pdf"><div class="pdf-head"><b>Places · ${KIND[m.kind][0]}</b><span class="mono">${m.id}</span></div>
    ${U.kv([["التاريخ", `${A.fmtDate(m.at)} ${A.fmtTime(m.at)}`], ["المبلغ", `<b>${A.money(m.amount)}</b>`], ["قيد اليومية", `<span class="mono">${jvOf(m)}</span> · ${NATURE[m.kind]}`], ...(m.ref ? [["رقم الفاتورة / المرجع", esc(m.ref)]] : []), ...(m.from ? [["من", esc(m.from)]] : []), ...(m.to ? [["لـ", esc(m.to)]] : []), ...(m.party ? [["الطرف", esc(partyName(m))]] : []), ...(m.line ? [["البند", esc(m.line)]] : []), ...(m.kind === "settle" ? [["اتصرف", A.money(m.spent)], ["رجع للخزنة", A.money(m.returned)]] : []), ["البيان", esc(m.note || "—")], ["سجّله", esc(A.person(m.by))]])}
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
    S().deals.filter((d) => d.status === "Approved" && !A.collected(d)).forEach((d) => add("warn", "handshake", `صفقة اتقفلت · حصّل عمولة ${d.id}`, `${d.client} · ${A.money(A.placesComm(d))} · اتفتحله حساب تحت العملاء`, "mvNew", { k: "receive", deal: d.id }, "حصّل"));
    billsDue().forEach((b) => add("warn", "calendar", `ميعاد فاتورة ${b.name}`, `${A.money(b.amount)} · ${b.vendor} · مستنية موافقتك`, "goFinPay", {}, "افتح")); prQueue().forEach((p) => add("warn", "cart", `اصرف طلب شراء ${p.id}`, `${p.item} · ${A.money(p.amount)} · المشتريات سوّته`, "goFinPay", {}, "افتح")); };
  A.ACT.goFinPay = () => { ui("fnTab", "cash"); location.hash = "#finance"; A.render(); };
  // one form for every voucher kind; the fields follow the kind
  A.ACT.mvNew = (d) => {
    const k = d.k, F = U.field, bill = d.bill && S().bills.find((x) => x.id === d.bill), dl = d.deal && S().deals.find((x) => x.id === d.deal);
    const pr = (d.pr && S().purchases.find((x) => x.id === d.pr)) || (bill && { id: "", item: `${bill.name} · ${monthName()}`, amount: bill.amount, line: bill.line, vendor: bill.vendor, suggestedAccount: bill.from, bill: bill.id });
    const C = coa(), expOpts = ["52", "53"].map((pc) => { const g = C.T[4].kids.find((x) => x.code === pc); return `<optgroup label="${g.code} · ${g.name}">${g.kids.map((n) => opt(n.key, `${n.code} · ${n.name}`, pr && pr.line)).join("")}</optgroup>`; }).join("");
    const body = { pay: (bill ? `<input type="hidden" name="bill" value="${bill.id}">${note(`فاتورة ثابتة <b>${esc(bill.name)}</b> · ميعادها يوم ${bill.day} · المبلغ المعتاد ${A.money(bill.amount)} (عدّله لو الفاتورة مختلفة)`)}` : pr ? `<input type="hidden" name="pr" value="${pr.id}">${note(`من طلب الشراء <b>${pr.id}</b> · ${esc(pr.item)} · المبلغ المعتمد ${A.money(pr.amount)}`)}` : "") + F("التاريخ", `<input name="date" type="date" value="${A.today()}" max="${A.today()}" required>`, 1) + F("من خزنة / بنك", `<select name="from" required>${accOpts(pr && pr.suggestedAccount)}</select>`, 1) + F("نوع المصروف (من شجرة الحسابات)", `<select name="line" required>${expOpts}</select>`, 1)
        + F("المستلم", `<input name="party" list="pp-list" required placeholder="اسم اللي هيستلم الفلوس" value="${esc(pr ? pr.vendor || "" : "")}"><datalist id="pp-list">${S().employees.map((e) => `<option value="${esc(A.person(e.id))}">`).join("")}${S().vendors.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`, 1) + F("رقم الفاتورة / المرجع", `<input name="ref" placeholder="اختياري" value="${pr ? pr.id : ""}">`),
      receive: F("لخزنة / بنك", `<select name="to" required>${accOpts(dl && "بنك CIB")}</select>`, 1) + F("المصدر", `<select name="source">${S().receiveSources.map((x) => opt(x)).join("")}</select>`)
        + F("الصفقة (لو عمولة من عميل)", `<select name="deal"><option value="">—</option>${S().deals.filter((x) => LIVE(x) && A.placesComm(x) - A.collected(x) > 0).map((x) => opt(x.id, `${x.id} · ${x.client} · باقي ${A.money(A.placesComm(x) - A.collected(x))}`, dl && dl.id)).join("")}</select>`, 1) + F("التحصيل من", `<select name="side">${opt("client", "الـ Client")}${opt("owner", "الـ Owner")}</select>`)
        + F("من مين (لو مش من صفقة)", `<input name="party" placeholder="اسم الجهة">`),
      transfer: F("من", `<select name="from" required>${accOpts()}</select>`, 1) + F("لـ", `<select name="to" required>${accOpts("خزينة رئيسية")}</select>`, 1),
      advance: F("من خزنة / بنك", `<select name="from" required>${accOpts()}</select>`, 1) + F("الموظف", `<select name="party" required>${people()}</select>`, 1),
      custody: F("من خزنة / بنك", `<select name="from" required>${accOpts()}</select>`, 1) + F("العهدة مع", `<select name="party" required>${people()}</select>`, 1) }[k];
    A.openModal(KIND[k][0], `<form data-form="mvSave" class="grid"><input type="hidden" name="kind" value="${k}">${body}
      ${U.field("المبلغ", `<input name="amount" type="number" min="1" step="any" required ${pr ? `value="${pr.amount}" ${bill ? "" : "readonly"}` : dl ? `value="${A.placesComm(dl) - A.collected(dl)}"` : ""}>`, 1)}${U.field("البيان", `<input name="note" required placeholder="مثلاً: فاتورة كهرباء أكتوبر" value="${esc(pr ? pr.item : "")}">`, 1, 1)}
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
    if (k === "receive" && f.source === "عمولة من عميل") {
      const dl = st.deals.find((x) => x.id === f.deal); if (!dl) return A.toast("اختار الصفقة اللي العمولة دي بتاعتها");
      const rem = A.placesComm(dl) - A.collected(dl); if (amt > rem) return A.toast(`الباقي على الصفقة ${A.money(rem)} بس`);
      const mv = A.FORM.dealPay({ id: dl.id, side: f.side || "client", amount: String(amt), to: f.to, note: f.note.trim() }); A.render(); A.openModal(`${KIND.receive[0]} · ${mv.id}`, voucher(mv, true)); return;
    }
    const m = { id: "MV-" + (109 + st.moves.length), at, kind: k, amount: amt, note: f.note.trim(), by: A.me(), ...(f.ref ? { ref: f.ref.trim() } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.party ? { party: f.party } : {}), ...(f.line ? { line: f.line } : {}), ...(f.source ? { source: f.source } : {}) };
    if (from) from.balance -= amt; if (to) to.balance += amt;
    if (bill) { bill.paid[monthKey()] = m.id; m.bill = bill.id; }
    if (f.pr) { const pr = st.purchases.find((x) => x.id === f.pr); Object.assign(pr, { status: "Posted", account: f.from, postedAt: A.nowIso(), move: m.id, paidAt: pr.settledAt }); A.notify(["procurement"], `المالية رحّلت ${pr.id} من ${f.from}`); }
    if (k === "pay") { const L = [...st.expenses.admin, ...st.expenses.selling].find((x) => x[0] === f.line); L[1] += amt; const b = st.budgets.find((x) => x.line === f.line); if (b) b.spent += amt; } // lands in the income statement and the budget
    if (k === "advance") st.advances.push({ emp: f.party, amount: amt, date: A.today() });
    if (k === "custody") { const c = st.custody.find((x) => x.emp === f.party); c ? (c.amount += amt) : st.custody.push({ emp: f.party, amount: amt, date: A.today() }); }
    st.moves.unshift(m); A.audit("finance", `${KIND[k][0]} ${m.id} · ${A.money(amt)} · ${m.note}`);
    A.render(); A.openModal(`${KIND[k][0]} · ${m.id}`, voucher(m, true)); A.toast(`اتسجّل · قيد اليومية ${jvOf(m)} اتعمل لوحده`);
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
        <section class="card">${head("سلف الموظفين", "users", chip("", A.money(st.advances.reduce((s, a) => s + a.amount, 0))), "بتتخصم من المرتب في شيت المرتبات")}
          ${table(["الموظف", "التاريخ", "المبلغ"], st.advances.map((a) => `<tr><td>${A.who(a.emp)}</td><td>${A.fmtDate(a.date)}</td><td class="n">${A.money(a.amount)}</td></tr>`))}
          ${canPost() ? `<div class="row end"><button class="btn ghost sm" data-act="mvNew" data-k="advance">${I("plus")}سلفة جديدة</button></div>` : ""}</section></div>`;
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
            <button class="btn ghost" data-act="advances">${I("users")}سلف الموظفين · ${A.money(st.advances.reduce((s, a) => s + a.amount, 0))}</button></section></div>
        <div class="kpis">${U.kpi("موازنة المرتبات / شهر", A.money(payroll), `${st.employees.length} موظف × المرتب`, "id")}${st.periods.map((pr) => U.kpi(pr.name, pr.status, pr.status === "مفتوح" ? "الحركات بتتسجّل" : "اتقفل", pr.status === "مفتوح" ? "clock" : "lock", pr.status === "مفتوح" ? "warn" : "ok")).join("")}</div>`;
    },
    pnl() {
      const st = S(), P = pnlNums(), close = A.canDo("finance", "approve"), C = P.C;
      const r = (l, v, cls, c) => `<tr class="${cls || ""} ${v < 0 ? "neg" : ""} click" data-act="pnlWhy" data-c="${c}"><td>${esc(l)} <span class="hint">${I("search")}</span></td><td class="n">${A.money(v)}</td></tr>`;
      const leaves = (code, sign) => C.leaves.filter((n) => n.code.startsWith(code) && n.code !== code).map((n) => r(`${n.code} · ${n.name}`, sign * n.bal, "sub", n.code)).join("");
      return `<div class="row"><span class="hint spacer">قايمة الدخل · ${esc(st.periods[st.periods.length - 1].name)} · من شجرة الحسابات · دوس على أي رقم تشوف وصل لكده إزاي وعدّى على إيه</span>${close ? `<button class="btn ghost" data-act="closeMonth">${I("lock")}اقفل الشهر</button>` : ""}</div>
        <div class="tbl-wrap pnl"><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>
        ${r("4 · الإيرادات", P.rev, "", "4")}${leaves("4", 1)}
        ${r("ناقص: 51 · المصاريف المباشرة (العمولات)", -P.d, "", "51")}${leaves("51", -1)}${r("ربح الصفقات", P.gross, "total", "gross")}
        ${r("ناقص: 53 · مصروفات بيعية", -P.se, "", "53")}${leaves("53", -1)}${r("ربح النشاط", P.contrib, "total", "contrib")}
        ${r("ناقص: 52 · مصروفات إدارية", -P.ad, "", "52")}${leaves("52", -1)}
        ${r("زائد: خصومات التأخير والغياب", P.saved, "", "saved")}${r("صافي الربح", P.net, "total grand", "net")}</tbody></table></div>
        ${note("قايمة الدخل كل شهر، والميزانية العمومية كل 3 شهور، وصافي الربح في أي وقت. الأرقام هنا هي نفس أرصدة شجرة الحسابات، فأي إذن أو قيد بيظهر هنا على طول.")}`;
    },
    bs() {
      const C = coa(), N = (c) => C.byCode[c], subs = (r) => C.leaves.filter((x) => x.code.startsWith(r.code) && x.code !== r.code);
      const line = (r) => { const k = subs(r); return k.length ? `<details class="bs-acct"><summary class="acct"><span class="spacer"><span class="mono hint">${r.code}</span> ${esc(r.name)} <span class="hint">(${k.length} حساب فرعي)</span></span><b class="num">${A.money(r.bal)}</b></summary>${k.map((x) => `<div class="acct sub click" data-act="pnlWhy" data-c="${x.code}"><span class="spacer"><span class="mono hint">${x.code}</span> ${esc(x.name)} <span class="hint">${I("search")}</span></span><span class="num">${A.money(x.bal)}</span></div>`).join("")}</details>`
        : `<div class="acct click" data-act="pnlWhy" data-c="${r.code}"><span class="spacer"><span class="mono hint">${r.code}</span> ${esc(r.name)} <span class="hint">${I("search")}</span></span><b class="num">${A.money(r.bal)}</b></div>`; };
      const blk = (n, rows) => `<section class="card">${head(`${n.code} · ${n.name}`, "layers", chip("acc", A.money(n.bal)))}${rows.map(line).join("")}</section>`;
      return `<div class="row"><span class="hint spacer">الميزانية العمومية · من شجرة الحسابات · افتح أي بند تشوف حساباته الفرعية، ودوس على أي حساب تشوف رصيده جه منين</span>${A.canDo("finance", "approve") ? `<button class="btn ghost" data-act="closeQuarter">${I("lock")}اقفل الربع</button>` : ""}</div>
        <div class="cols">${blk(N("1"), [N("111"), N("112"), N("113"), N("114"), N("115"), N("12")])}${blk(N("2"), [N("211"), N("212")])}${blk(N("3"), [N("31"), N("32"), N("33")])}</div>
        ${note(`الأصول (${A.short(N("1").bal)}) = الخصوم (${A.short(N("2").bal)}) + حقوق الملكية (${A.short(N("3").bal)}). الأرقام تجريبية، وأرصدة البداية الحقيقية هتتدخل وقت الإطلاق.`)}`;
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
      const rows = st.employees.map((e) => { const att = st.attendance.filter((a) => a.emp === e.id && a.day.startsWith(month)).map(A.attRow), dd = att.reduce((s, x) => s + x.ded, 0), ded = (S().dedApproved || {})[month] ? dd * A.dayRate(e) : 0, com = e.role === "tl" ? A.tlStats(e.id).comm : st.deals.filter((d) => A.dealStatus(d) === "Fully Collected").reduce((s, d) => s + A.salesComm(d, e.id), 0), adv = (st.advances.find((a) => a.emp === e.id) || {}).amount || 0; return { e, ded, com, adv, net: e.salary - ded + com - adv }; });
      const t = (k) => rows.reduce((s, x) => s + (k === "salary" ? x.e.salary : x[k]), 0);
      return `<div class="kpis">${U.kpi("المرتبات", A.money(t("salary")), "الأساسي", "id")}${U.kpi("الخصومات", A.money(t("ded")), "من الـ HR", "clock", "bad")}${U.kpi("العمولات", A.money(t("com")), "صفقات اتحصّلت بالكامل", "trend", "ok")}${U.kpi("صافي المستحق", A.money(t("net")), "بعد السلف", "wallet")}</div>
        ${table(["الموظف", "المرتب", "الخصم", "العمولة", "سلفة", "الصافي"], rows.map((x) => `<tr><td>${A.who(x.e.id)}</td><td class="n">${A.money(x.e.salary)}</td><td class="n">${x.ded ? "−" + A.money(x.ded) : "—"}</td><td class="n">${x.com ? "+" + A.money(x.com) : "—"}</td><td class="n">${x.adv ? "−" + A.money(x.adv) : "—"}</td><td class="n"><b>${A.money(x.net)}</b></td></tr>`))}
        ${note((S().dedApproved || {})[month] ? "الخصومات اتعتمدت من الـ HR واترحّلت. والمرتبات بعد الخصم بتتحمّل على المصروفات أوتوماتيك." : "خصومات الشهر لسه مستنية اعتماد الـ HR، فمش محسوبة هنا.", (S().dedApproved || {})[month] ? "" : "warn")}`;
    },
    bills() {
      const st = S(), lab = { paid: ["ok", "اتصرفت الشهر ده"], skipped: ["", "اتأجلت الشهر ده"], due: ["warn", "ميعادها جه · مستنية موافقتك"], soon: ["warn", "قرّبت"], later: ["", "لسه"], off: ["", "متوقفة"] };
      return `${note("الفاتورة الثابتة (اشتراك، إيجار، إنترنت…) مابتتصرفش لوحدها: يوم ميعادها بتجيلك مهمة في «مهامي النهارده» والكارت ده في «الخزن والحركات»، وانت اللي بتوافق وتصرف (إذن صرف بقيده) أو تقول «مش الشهر ده».")}
        ${table(["الفاتورة", "البند", "من", "يوم", "المبلغ", "الشهر ده", ""], st.bills.map((b) => { const s = billState(b), mv = b.paid[monthKey()]; return `<tr><td><b>${esc(b.name)}</b><span class="sub">${esc(b.vendor)}</span></td><td>${esc(b.line)}</td><td>${esc(b.from)}</td><td class="n">${b.day}</td><td class="n">${A.money(b.amount)}</td><td>${chip(lab[s][0], lab[s][1], 1)}${mv ? ` <a class="mono click" data-act="mvView" data-id="${mv}">${mv}</a>` : ""}${b.skipped[monthKey()] ? `<span class="sub">${esc(b.skipped[monthKey()])}</span>` : ""}</td><td>${canPost() ? `${s === "due" || s === "soon" ? `<button class="btn sm" data-act="mvNew" data-k="pay" data-bill="${b.id}">وافق واصرف</button>` : ""} <button class="btn ghost sm" data-act="billToggle" data-id="${b.id}">${b.on ? "وقّفها" : "شغّلها"}</button>` : ""}</td></tr>`; }))}
        ${canPost() ? `<form class="card flat grid" data-form="billAdd">${U.field("الفاتورة", `<input name="name" required placeholder="مثلاً: اشتراك Bayut">`, 1)}${U.field("المورد", `<input name="vendor" list="bl-v" required><datalist id="bl-v">${st.vendors.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`, 1)}${U.field("البند", `<select name="line">${lineOpts()}</select>`, 1)}${U.field("المبلغ المعتاد", `<input name="amount" type="number" min="1" required>`, 1)}${U.field("يوم في الشهر", `<input name="day" type="number" min="1" max="28" required value="1">`, 1)}${U.field("بتتصرف من", `<select name="from">${accOpts()}</select>`, 1)}<div class="row end wide"><button class="btn">${I("plus")}ضيف فاتورة ثابتة</button></div></form>` : ""}`;
    },
    tree() {
      const C = coa(), node = (n, depth) => n.kids ? `<details ${depth < 2 ? "open" : ""}><summary><b class="mono">${n.code}</b> <b>${esc(n.name)}</b><span class="spacer"></span><span class="hint">${n.nat === "dr" ? "مدين" : "دائن"}</span><b class="num">${A.money(n.bal)}</b></summary><div class="kids">${n.kids.map((k) => node(k, depth + 1)).join("")}</div></details>`
        : `<div class="kid click" data-act="acctLedger" data-k="${esc(n.key || n.code)}"><span class="mono">${n.code}</span><span class="spacer">${esc(n.name)}</span><b class="num">${A.money(n.bal)}</b></div>`;
      const tot = (c) => C.T.find((n) => n.code === c).bal;
      return `${canPost() ? `<div class="row"><form class="row" data-form="clientAcct"><input name="name" placeholder="اسم عميل جديد" required><button class="btn ghost sm">${I("plus")}حساب عميل تحت 113</button></form><span class="spacer"></span><button class="btn ghost" data-act="jeNew">${I("plus")}قيد يومية جديد</button></div>` : ""}${note(`حساب «العملاء» (113) رصيده = مجموع حسابات العملاء اللي تحته: كل عميل في صفقة بيتفتحله حساب لوحده، وكل تحصيل بيتقيد على حسابه. كل حساب بكوده وطبيعته ورصيده دلوقتي. أي إذن صرف أو توريد أو تحويل بيعمل قيد يومية بيتسمّع هنا لوحده. الأصول ${A.short(tot("1"))} = الخصوم ${A.short(tot("2"))} + حقوق الملكية ${A.short(tot("3"))}.`)}<div class="tree coa">${C.T.map((n) => node(n, 0)).join("")}</div>
        ${note("الأكواد والحسابات ملخص من «شجرة الحسابات.xlsx». أرصدة البداية الحقيقية هتتدخل وقت الإطلاق.")}`;
    }
  };
  A.CHANGE.mvF = (v) => { ui("mvF", v); A.render(); };
  A.FORM.clientAcct = (f) => { const st = S(), cc = st.clientCodes, n = f.name.trim(); if (cc[n]) return A.toast("العميل ده ليه حساب"); cc[n] = Object.keys(cc).length + 1; A.audit("finance", `حساب عميل جديد: 113${String(cc[n]).padStart(3, "0")} · ${n}`); A.toast(`اتفتح حساب 113${String(cc[n]).padStart(3, "0")} · ${n}`); A.render(); };
  // a collection from a deal: the safe / bank goes up, the client's account goes down (Dr safe · Cr client)
  A.finReceive = (o) => { const st = S(), a = acc(o.to); a.balance += o.amount;
    const m = { id: "MV-" + (109 + st.moves.length), at: o.at || A.nowIso(), kind: "receive", to: o.to, amount: o.amount, party: o.party, source: "عمولة من عميل", deal: o.deal, side: o.side, ref: o.ref, note: o.note, by: A.me() };
    st.moves.unshift(m); A.audit("finance", `${KIND.receive[0]} ${m.id} · ${A.money(o.amount)} · ${o.party} · ${o.deal}`); return m; };
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
  A.ACT.advances = () => A.openModal("سلف الموظفين", U.table(["الموظف", "التاريخ", "رصيد السلفة"], S().advances.map((a) => `<tr><td>${A.who(a.emp)}</td><td>${A.fmtDate(a.date)}</td><td class="n">${A.money(a.amount)}</td></tr>`)));
  A.ACT.drill = (d) => {
    const st = S(), p = figures();
    const html = d.k === "rev" ? U.table(["الصفقة", "العميل", "النوع", "عمولة Places"], st.deals.filter(A.countsRevenue).map((x) => `<tr><td class="mono">${x.id}</td><td>${esc(x.client)}</td><td>${esc(x.kind)}</td><td class="n">${A.money(A.placesComm(x))}</td></tr>`))
      : d.k === "direct" ? U.table(["الصفقة", "السيلز", "النسبة", "العمولة"], st.deals.filter(A.countsRevenue).flatMap((x) => A.salesShares(x).map((s) => `<tr><td class="mono">${x.id}</td><td>${A.who(s.sales)}</td><td class="n">${s.rate}% × ${s.pct}%</td><td class="n">${A.money(s.amount)}</td></tr>`)))
      : U.table(["البند", "المبلغ", "من المشتريات"], p[d.k].map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${A.money(v)}</td><td>${st.purchases.filter((x) => x.line === k && x.status === "Paid").map((x) => x.id).join("، ") || "—"}</td></tr>`));
    A.openModal({ rev: "الإيرادات", direct: "المصاريف المباشرة", selling: "المصروفات البيعية", admin: "المصروفات الإدارية" }[d.k], html);
  };
  /* ---- income statement drill-down: where every number comes from and what it passed through ---- */
  const pnlNums = () => { const C = coa(), p = figures(), N = (c) => C.byCode[c].bal, rev = N("4"), d = N("51"), se = N("53"), ad = N("52");
    return { C, p, rev, d, se, ad, saved: p.saved, gross: rev - d, contrib: rev - d - se, net: rev - d - se - ad + p.saved }; };
  const upOf = (code, n) => (["1", "2", "3"].includes(code[0]) ? n.path.slice(0, -1).reverse().join(" ← ") : code[0] === "4" ? "الإيرادات ← ربح الصفقات ← ربح النشاط ← صافي الربح" : code.startsWith("51") ? "المصاريف المباشرة ← ربح الصفقات ← ربح النشاط ← صافي الربح" : code.startsWith("53") ? "المصروفات البيعية ← ربح النشاط ← صافي الربح" : "المصروفات الإدارية ← صافي الربح");
  const whyTable = (rows, total, totLabel) => U.table(["المصدر", "عدّى على", "المبلغ"], rows.map((x) => `<tr class="${x.act ? "click" : ""}" ${x.act ? `data-act="${x.act}" data-id="${esc(x.id)}"` : ""}><td>${x.src}</td><td class="hint">${x.path}</td><td class="n">${A.money(x.v)}</td></tr>`).concat(`<tr class="total"><td><b>${totLabel || "الإجمالي"}</b></td><td></td><td class="n"><b>${A.money(total)}</b></td></tr>`));
  const manualRows = (n) => (S().journal || []).flatMap((je) => je.lines.filter((l) => l.code === n.code).map((l) => ({ src: `قيد يدوي <span class="mono">${je.id}</span> · ${A.fmtDate(je.at)} · ${esc(je.note)}`, path: `${je.id} ← ح/ ${n.code}`, v: n.nat === "dr" ? l.dr - l.cr : l.cr - l.dr, act: "jeView", id: je.id })));
  A.ACT.pnlWhy = (d) => {
    const st = S(), P = pnlNums(), C = P.C, c = d.c, n = C.byCode[c], fm = (x) => A.money(x);
    const formula = (title, f, parts) => A.openModal(title, `<div class="pdf">${note(`<b>${f}</b>`)}${U.table(["البند", "المبلغ"], parts.map(([l, v, k]) => `<tr class="${k ? "click" : ""}" ${k ? `data-act="pnlWhy" data-c="${k}"` : ""}><td>${l}</td><td class="n">${fm(v)}</td></tr>`))}</div>`);
    if (c === "gross") return formula("ربح الصفقات", `الإيرادات − المصاريف المباشرة = ${fm(P.rev)} − ${fm(P.d)} = ${fm(P.gross)}`, [["4 · الإيرادات", P.rev, "4"], ["ناقص 51 · المصاريف المباشرة", -P.d, "51"]]);
    if (c === "contrib") return formula("ربح النشاط", `ربح الصفقات − المصروفات البيعية = ${fm(P.gross)} − ${fm(P.se)} = ${fm(P.contrib)}`, [["ربح الصفقات", P.gross, "gross"], ["ناقص 53 · مصروفات بيعية", -P.se, "53"]]);
    if (c === "net") return formula("صافي الربح", `ربح النشاط − المصروفات الإدارية + خصومات التأخير والغياب = ${fm(P.contrib)} − ${fm(P.ad)} + ${fm(P.saved)} = ${fm(P.net)} · ونفس الرقم في الشجرة ح/ 33 أرباح وخسائر العام (${fm(C.byCode["33"].bal)})`, [["ربح النشاط", P.contrib, "contrib"], ["ناقص 52 · مصروفات إدارية", -P.ad, "52"], ["زائد خصومات التأخير والغياب", P.saved, "saved"]]);
    if (c === "saved") { const mk = A.today().slice(0, 7), on = (st.dedApproved || {})[mk], rows = on ? st.attendance.filter((a) => a.day.startsWith(mk)).map((a) => [a, A.attRow(a)]).filter(([, x]) => x.ded > 0).map(([a, x]) => ({ src: `${esc(A.person(x.e.id))} · ${A.fmtDate(a.day)}`, path: `البصمة ← خصم ${x.ded} يوم × ${fm(A.dayRate(x.e))} يومية ← الـ HR وافق`, v: x.ded * A.dayRate(x.e) })) : [];
      return A.openModal("خصومات التأخير والغياب", `<div class="pdf">${note(on ? "خصومات الشهر بعد موافقة الـ HR: أيام الخصم × اليومية (المرتب ÷ 26)." : "لسه الـ HR ماوافقش على خصومات الشهر ده، فمابتدخلش قايمة الدخل غير بعد الموافقة.")}${rows.length ? whyTable(rows, P.saved) : ""}</div>`); }
    if (c === "33") return A.ACT.pnlWhy({ c: "net" });
    if (n.kids) return A.openModal(`${n.code} · ${n.name}`, `<div class="pdf">${note(`<b>${esc(n.name)} = مجموع الحسابات اللي تحته = ${fm(n.bal)}</b><br>بيدخل في: ${upOf(c, n)}`)}${U.table(["الحساب", "المبلغ"], C.leaves.filter((x) => x.code.startsWith(c) && x.code !== c).map((x) => `<tr class="click" data-act="pnlWhy" data-c="${x.code}"><td>${x.code} · ${esc(x.path.slice(1).join(" ← "))}</td><td class="n">${fm(x.bal)}</td></tr>`))}</div>`);
    let rows = [], how = "";
    const deals = st.deals.filter(A.countsRevenue), firstPay = (x) => (x.payments || []).slice().sort((a, b) => a.at.localeCompare(b.at))[0], firstTcr = (x) => ((x.tcrs || [])[0] || {}).code;
    if (c.startsWith("41")) { how = "عمولة Places (من الـ Owner + من الـ Client) لكل صفقة من النوع ده، وبتتسجّل كاملة من أول تحصيل. الباقي اللي لسه ماتحصّلش بيفضل على حساب العميل تحت «العملاء» (113).";
      rows = deals.filter((x) => x.kind === n.name).map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(x.client)} · ${fm(x.commOwner || 0)} + ${fm(x.commClient || 0)}`, path: `اتوافق عليها ← أول تحصيل ${firstPay(x) ? A.fmtDate(firstPay(x).at) : ""} ${firstTcr(x) ? `(${firstTcr(x)})` : ""} ← ح/ ${c}`, v: A.placesComm(x), act: "dealOpen", id: x.id })); }
    else if (c === "42") { how = "كل إذن توريد خزنة مصدره مش «عمولة من عميل» (إيراد آخر، استرداد…).";
      rows = st.moves.filter((m) => m.kind === "receive" && m.source !== "عمولة من عميل").map((m) => ({ src: `${KIND.receive[0]} <span class="mono">${m.id}</span> · ${A.fmtDate(m.at)} · ${esc(m.source)} · ${esc(m.note || "")}`, path: `${m.id} ← ${jvOf(m)} ← ح/ 42`, v: m.amount, act: "mvView", id: m.id })); }
    else if (n.name === "عمولة مبيعات") { how = "نصيب كل سيلز من عمولة كل صفقة اتحصّل منها (نسبته × نصيبه في الصفقة).";
      rows = deals.flatMap((x) => A.salesShares(x).map((sh) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(A.person(sh.sales))}`, path: `${sh.rate}% × ${sh.pct}% ← ح/ ${c}`, v: sh.amount, act: "dealOpen", id: x.id }))); }
    else if (n.name === "عمولة اوبريشن") { how = "5% من عمولة Places في الصفقات اللي اتحصّل منها (نسبة الديمو).";
      rows = deals.map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(x.client)}`, path: `${fm(A.placesComm(x))} × 5% ← ح/ ${c}`, v: A.placesComm(x) * 0.05, act: "dealOpen", id: x.id })); }
    else if (n.name === "عمولة تيم ليدر") { how = "نسبة كل Team Leader حسب شريحة تحقيق فريقه.";
      rows = st.people.filter((x) => x.role === "tl").map((x) => ({ src: esc(x.name), path: `تحقيق الفريق ← الشريحة ← ح/ ${c}`, v: A.tlStats(x.id).comm })).filter((x) => x.v); }
    else if (n.key && n.key.startsWith("عميل:")) { const nm = n.name; how = "كل صفقة للعميل ده اتحصّل منها: عمولة Places − اللي اتحصّل = الباقي عليه. كل تحصيل (إذن توريد) بينزّل حسابه.";
      rows = st.deals.filter((x) => x.client === nm && LIVE(x)).map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · العمولة ${fm(A.placesComm(x))} − اتحصّل ${fm(A.collected(x))}${A.countsRevenue(x) ? "" : " · لسه مااتحصّلش منها حاجة فمادخلتش الحساب"}`, path: `${(x.tcrs || []).map((t) => t.code).join("، ") || "—"} ← ح/ ${c}`, v: dueOf(x), act: "dealOpen", id: x.id })); }
    else if (c === "114") { how = "كل سلفة اتصرفت لموظف (إذن سلفة) ولسه ماتخصمتش.";
      rows = st.advances.map((x) => ({ src: `${esc(A.person(x.emp))} · ${A.fmtDate(x.date)}`, path: `إذن سلفة ← ح/ 114`, v: x.amount })); }
    else if (c === "115") { how = "كل عهدة مع موظف ولسه ماتسوّتش (صرف عهدة − التسويات).";
      rows = st.custody.map((x) => ({ src: `${esc(A.person(x.emp))} · من ${A.fmtDate(x.date)}`, path: `إذن صرف عهدة ← تسوية ← ح/ 115`, v: x.amount })); }
    else if (c === "211") { how = "نصيب السيلز من عمولة كل صفقة اتحصّلت بالكامل، ولسه ماتصرفش مع المرتب.";
      rows = st.deals.filter((x) => A.dealStatus(x) === "Fully Collected").map((x) => ({ src: `صفقة <span class="mono">${x.id}</span> · ${esc(x.client)}`, path: `اتحصّلت بالكامل ← عمولة السيلز ← ح/ 211`, v: A.salesComm(x), act: "dealOpen", id: x.id })); }
    else if (c === "32") { how = "أرباح السنين اللي فاتت (من الميزانية الافتتاحية): الأصول − الخصوم − رأس المال − نتيجة السنة دي.";
      rows = [{ src: "الأصول", path: "1", v: C.byCode["1"].bal }, { src: "ناقص الخصوم", path: "2", v: -C.byCode["2"].bal }, { src: "ناقص رأس المال", path: "31", v: -C.byCode["31"].bal }, { src: "ناقص أرباح وخسائر العام", path: "33", v: -C.byCode["33"].bal }]; }
    else if (["12", "212", "31"].includes(c)) how = "رصيد افتتاحي ثابت في الديمو، وأرصدة البداية الحقيقية هتتدخل وقت الإطلاق.";
    else if (n.key) { const mv = st.moves.filter((m) => entry(m).some((e) => e[0] === n.key)), paid = st.purchases.filter((x) => x.line === n.key && x.status === "Paid");
      rows = mv.map((m) => { const e = entry(m).filter((x) => x[0] === n.key).reduce((s, x) => s + x[1] - x[2], 0); return { src: `${KIND[m.kind][0]} <span class="mono">${m.id}</span> · ${A.fmtDate(m.at)} · ${esc(m.note || "")}`, path: `${m.from ? `${esc(m.from)} ← ` : ""}${m.id} ← ${jvOf(m)} ← ح/ ${c}`, v: e, act: "mvView", id: m.id }; })
        .concat(paid.map((x) => ({ src: `طلب شراء <span class="mono">${x.id}</span> · ${esc(x.item)}`, path: `المشتريات ← اتدفع ← ح/ ${c}`, v: x.amount })));
      how = c[0] === "1" ? "رصيد أول المدة + كل إذن توريد أو تحويل داخل − كل إذن صرف أو تحويل خارج، وأي قيد يدوي عليه." : "كل إذن صرف أو تسوية عهدة أو طلب شراء اتدفع على البند ده، وأي قيد يدوي عليه."; }
    rows = rows.concat(manualRows(n));
    const known = rows.reduce((s, x) => s + x.v, 0);
    if (c !== "32" && Math.round(n.bal - known)) rows.unshift({ src: c[0] === "5" ? "رصيد البند من شيت المصروفات (قبل الحركات اللي اتسجّلت على السيستم)" : "رصيد أول المدة (من البيانات الافتتاحية)", path: `أول المدة ← ح/ ${c}`, v: n.bal - known });
    A.openModal(`${n.code} · ${n.name}`, `<div class="pdf">${note(`<b>${esc(n.path.join(" ← "))} = ${fm(n.bal)}</b><br>بيتحسب من: ${how || "القيود اليدوية على الحساب ده."}<br>وبيدخل في: ${upOf(c, n)}`)}${whyTable(rows, n.bal)}${Math.round(rows.reduce((s, x) => s + x.v, 0) - n.bal) ? note("فيه فرق بين التفاصيل والرصيد", "warn") : ""}</div>`);
  };
  A.ACT.closeMonth = () => { const pr = S().periods[S().periods.length - 1]; pr.status = "مقفول شهرياً"; A.toast(`${pr.name} اتقفل · اتطلعت قايمة الدخل`); A.render(); };
  A.ACT.closeQuarter = () => { const pr = S().periods[S().periods.length - 1]; pr.status = "مقفول ربع سنوي"; A.toast("الربع اتقفل · اتطلعت الميزانية العمومية"); A.render(); };
})();
