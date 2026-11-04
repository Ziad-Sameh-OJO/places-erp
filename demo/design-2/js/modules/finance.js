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
      return `<div class="row">${U.tabs("fnTab", [["dash", "Dashboard"], ["cash", "الخزن والحركات"], ["custody", "العهد والسلف"], ["journal", "القيود"], ["pnl", "قايمة الدخل"], ["bs", "الميزانية العمومية"], ["cost", "Cost Center"], ["payroll", "المرتبات"], ["tree", "شجرة الحسابات"]], t)}</div>${FN[t]()}`;
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
          { code: "113", name: "العملاء (عمولات مستحقة)", bal: ar, key: "عملاء" }, { code: "114", name: "سلف الموظفين", bal: adv, key: "سلف موظفين" }, { code: "115", name: "العهد", bal: cust, key: "عهد" }] },
        { code: "12", name: "الأصول الثابتة (صافي)", bal: 420000 }] },
      { code: "2", name: "الخصوم", nat: "cr", kids: [{ code: "21", name: "الخصوم المتداولة", kids: [{ code: "211", name: "عمولة مبيعات مستحقة", bal: comPay }, { code: "212", name: "ضرائب قيمة مضافة", bal: 86000 }] }] },
      { code: "3", name: "حقوق الملكية", nat: "cr", kids: [{ code: "31", name: "رأس المال", bal: 1500000 }, { code: "32", name: "الأرباح المحتجزة", bal: assets - liab - 1500000 - p.net - other }, { code: "33", name: "أرباح وخسائر العام", bal: p.net }] },
      { code: "4", name: "الإيرادات", nat: "cr", kids: [{ code: "41", name: "عمولات تسويق عقاري", kids: kids("41", Object.entries(p.byKind).map(([k, v]) => ({ name: k, bal: v }))) }, { code: "42", name: "إيرادات أخرى", bal: other, key: "إيرادات أخرى" }] },
      { code: "5", name: "المصروفات", nat: "dr", kids: [
        { code: "51", name: "مصروفات مباشرة (العمولات)", kids: kids("51", p.direct.map(([k, v]) => ({ name: k, bal: v }))) },
        { code: "52", name: "مصروفات إدارية", kids: kids("52", p.admin.map(([k, v]) => ({ name: k, bal: v, key: k }))) },
        { code: "53", name: "مصروفات بيعية", kids: kids("53", p.selling.map(([k, v]) => ({ name: k, bal: v, key: k }))) }] }];
    const idx = {}, walk = (n, path, nat) => { n.nat = n.nat || nat; n.path = [...path, n.name]; if (n.kids) n.bal = n.kids.reduce((s, k) => s + walk(k, n.path, n.nat), 0); if (n.key) idx[n.key] = n; return n.bal; };
    T.forEach((n) => walk(n, [], n.nat));
    return { T, idx };
  }
  const acctLabel = (key, C) => { const n = (C || coa()).idx[key]; return n ? `${n.code} · ${n.path.join(" ← ")}` : key; };
  // how much a movement changes one account (+ in, − out)
  const effect = (m, name) => (m.to === name ? (m.kind === "settle" ? m.returned : m.amount) : 0) - (m.from === name ? m.amount : 0);
  // the journal entry of a movement: debit / credit lines
  const entry = (m) => ({
    pay: [[m.line, m.amount, 0], [m.from, 0, m.amount]], receive: [[m.to, m.amount, 0], [m.source === "عمولة من عميل" ? "عملاء" : "إيرادات أخرى", 0, m.amount]],
    transfer: [[m.to, m.amount, 0], [m.from, 0, m.amount]], advance: [["سلف موظفين", m.amount, 0], [m.from, 0, m.amount]],
    custody: [["عهد", m.amount, 0], [m.from, 0, m.amount]],
    settle: [[m.line, m.spent, 0], ...(m.returned ? [[m.to, m.returned, 0]] : []), ["عهد", 0, m.spent + m.returned]]
  })[m.kind];
  const jvOf = (m) => "JV-" + m.id.slice(3);
  const entryTable = (m, C) => U.table(["كود الحساب · الحساب", "مدين", "دائن"], entry(m).map(([a, dr, cr]) => `<tr><td>${esc(acctLabel(a, C))}${["سلف موظفين", "عهد"].includes(a) || (a === "عملاء" && m.party) ? `<span class="sub">${esc(partyName(m))}</span>` : ""}</td><td class="n">${dr ? A.money(dr) : ""}</td><td class="n">${cr ? A.money(cr) : ""}</td></tr>`));
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
  A.financeInbox = (add) => { if (!canPost()) return; prQueue().forEach((p) => add("warn", "cart", `اصرف طلب شراء ${p.id}`, `${p.item} · ${A.money(p.amount)} · المشتريات سوّته`, "goFinPay", {}, "افتح")); };
  A.ACT.goFinPay = () => { ui("fnTab", "cash"); location.hash = "#finance"; A.render(); };
  // one form for every voucher kind; the fields follow the kind
  A.ACT.mvNew = (d) => {
    const k = d.k, F = U.field, pr = d.pr && S().purchases.find((x) => x.id === d.pr);
    const C = coa(), expOpts = ["52", "53"].map((pc) => { const g = C.T[4].kids.find((x) => x.code === pc); return `<optgroup label="${g.code} · ${g.name}">${g.kids.map((n) => opt(n.key, `${n.code} · ${n.name}`, pr && pr.line)).join("")}</optgroup>`; }).join("");
    const body = { pay: (pr ? `<input type="hidden" name="pr" value="${pr.id}">${note(`من طلب الشراء <b>${pr.id}</b> · ${esc(pr.item)} · المبلغ المعتمد ${A.money(pr.amount)}`)}` : "") + F("التاريخ", `<input name="date" type="date" value="${A.today()}" max="${A.today()}" required>`, 1) + F("من خزنة / بنك", `<select name="from" required>${accOpts(pr && pr.suggestedAccount)}</select>`, 1) + F("نوع المصروف (من شجرة الحسابات)", `<select name="line" required>${expOpts}</select>`, 1)
        + F("المستلم", `<input name="party" list="pp-list" required placeholder="اسم اللي هيستلم الفلوس" value="${esc(pr ? pr.vendor || "" : "")}"><datalist id="pp-list">${S().employees.map((e) => `<option value="${esc(A.person(e.id))}">`).join("")}${S().vendors.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`, 1) + F("رقم الفاتورة / المرجع", `<input name="ref" placeholder="اختياري" value="${pr ? pr.id : ""}">`),
      receive: F("لخزنة / بنك", `<select name="to" required>${accOpts()}</select>`, 1) + F("المصدر", `<select name="source">${["عمولة من عميل", "إيراد آخر", "استرداد"].map((x) => opt(x)).join("")}</select>`) + F("من مين", `<input name="party" placeholder="اسم العميل أو الشركة">`),
      transfer: F("من", `<select name="from" required>${accOpts()}</select>`, 1) + F("لـ", `<select name="to" required>${accOpts("خزينة رئيسية")}</select>`, 1),
      advance: F("من خزنة / بنك", `<select name="from" required>${accOpts()}</select>`, 1) + F("الموظف", `<select name="party" required>${people()}</select>`, 1),
      custody: F("من خزنة / بنك", `<select name="from" required>${accOpts()}</select>`, 1) + F("العهدة مع", `<select name="party" required>${people()}</select>`, 1) }[k];
    A.openModal(KIND[k][0], `<form data-form="mvSave" class="grid"><input type="hidden" name="kind" value="${k}">${body}
      ${U.field("المبلغ", `<input name="amount" type="number" min="1" step="any" required ${pr ? `value="${pr.amount}" readonly` : ""}>`, 1)}${U.field("البيان", `<input name="note" required placeholder="مثلاً: فاتورة كهرباء أكتوبر" value="${esc(pr ? pr.item : "")}">`, 1, 1)}
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
    const at = f.date && f.date !== A.today() ? new Date(`${f.date}T12:00:00`).toISOString() : A.nowIso();
    const m = { id: "MV-" + (109 + st.moves.length), at, kind: k, amount: amt, note: f.note.trim(), by: A.me(), ...(f.ref ? { ref: f.ref.trim() } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.party ? { party: f.party } : {}), ...(f.line ? { line: f.line } : {}), ...(f.source ? { source: f.source } : {}) };
    if (from) from.balance -= amt; if (to) to.balance += amt;
    if (f.pr) { const pr = st.purchases.find((x) => x.id === f.pr); if (pr.status !== "Settled") return A.toast("الطلب ده اترحّل قبل كده"); Object.assign(pr, { status: "Posted", account: f.from, postedAt: A.nowIso(), move: m.id, paidAt: pr.settledAt }); A.notify(["procurement"], `المالية رحّلت ${pr.id} من ${f.from}`); }
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
      return `${openPeriod() ? "" : note("الشهر مقفول · مفيش حركات جديدة لحد ما يتفتح شهر جديد", "warn")}${prCard()}
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
      const dr = st.moves.reduce((s, m) => s + entry(m).reduce((x, e) => x + e[1], 0), 0), cr = st.moves.reduce((s, m) => s + entry(m).reduce((x, e) => x + e[2], 0), 0);
      return `${note(`كل سند بيعمل قيده لوحده (مدين = دائن). إجمالي المدين ${A.money(dr)} · إجمالي الدائن ${A.money(cr)}${dr === cr ? " · متوازن ✓" : " · مش متوازن!"}`, dr === cr ? "" : "warn")}
        ${table(["قيد اليومية", "التاريخ", "كود الحساب · الحساب", "مدين", "دائن", "البيان"], rows)}`;
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
      const st = S(), p = figures(), close = A.canDo("finance", "approve");
      return `<div class="row"><span class="hint spacer">قايمة الدخل · ${esc(st.periods[st.periods.length - 1].name)} · دوس على أي بند عشان تشوف تفاصيله</span>${close ? `<button class="btn ghost" data-act="closeMonth">${I("lock")}اقفل الشهر</button>` : ""}</div>
        <div class="tbl-wrap pnl"><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>
        ${row("4 · إيرادات النشاط الرئيسي", p.rev, "", "rev")}${Object.entries(p.byKind).map(([k, v]) => row(k, v, "sub")).join("")}
        ${row("ناقص: المصاريف المباشرة (العمولات)", -p.d, "", "direct")}${p.direct.map(([k, v]) => row(k, -v, "sub")).join("")}${row("ربح الصفقات", p.gross, "total")}
        ${row("ناقص: 5 · مصروفات بيعية", -p.se, "", "selling")}${p.selling.map(([k, v]) => row(k, -v, "sub")).join("")}${row("ربح النشاط", p.contrib, "total")}
        ${row("ناقص: 5 · مصروفات إدارية", -p.ad, "", "admin")}${p.admin.map(([k, v]) => row(k, -v, "sub")).join("")}
        ${row("زائد: خصومات التأخير والغياب", p.saved)}${row("صافي الربح", p.net, "total grand")}</tbody></table></div>
        ${note("قايمة الدخل كل شهر، والميزانية العمومية كل 3 شهور، وصافي الربح في أي وقت. المصاريف البيعية هي اللي بتتحمّل على الصفقات.")}`;
    },
    bs() {
      const st = S(), p = figures(), cash = st.accounts.reduce((s, a) => s + a.balance, 0), ar = st.deals.filter(A.countsRevenue).reduce((s, d) => s + Math.max(0, A.placesComm(d) - A.collected(d)), 0);
      const adv = st.advances.reduce((s, a) => s + a.amount, 0), fixed = 420000, assets = cash + ar + adv + fixed;
      const comPay = st.deals.filter((d) => A.dealStatus(d) === "Fully Collected").reduce((s, d) => s + A.salesComm(d), 0), sal = 0, vat = 86000, liab = comPay + sal + vat;
      const capital = 1500000, curr = p.net, retained = assets - liab - capital - curr;
      const blk = (title, rows, tot) => `<section class="card">${head(title, "layers", chip("acc", A.money(tot)))}${rows.map(([l, v]) => `<div class="acct"><span class="spacer">${esc(l)}</span><b class="num">${A.money(v)}</b></div>`).join("")}</section>`;
      return `<div class="row"><span class="hint spacer">الميزانية العمومية · آخر Quarter (Q3 2026) · من شجرة الحسابات</span>${A.canDo("finance", "approve") ? `<button class="btn ghost" data-act="closeQuarter">${I("lock")}اقفل الربع</button>` : ""}</div>
        <div class="cols">${blk("1 · الأصول", [["الخزينة وأرصدة البنوك", cash], ["عملاء (عمولات مستحقة)", ar], ["سلف موظفين", adv], ["الأصول الثابتة (صافي)", fixed]], assets)}
        ${blk("2 · الخصوم", [["عمولة مبيعات مستحقة", comPay], ["ضرائب قيمة مضافة", vat]], liab)}
        ${blk("3 · حقوق الملكية", [["رأس المال", capital], ["الأرباح المحتجزة", retained], ["أرباح وخسائر العام", curr]], capital + retained + curr)}</div>
        ${note(`الأصول (${A.short(assets)}) = الخصوم (${A.short(liab)}) + حقوق الملكية (${A.short(capital + retained + curr)}). الأرقام تجريبية، وأرصدة البداية الحقيقية هتيجي من د. علي.`)}`;
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
    tree() {
      const C = coa(), node = (n, depth) => n.kids ? `<details ${depth < 2 ? "open" : ""}><summary><b class="mono">${n.code}</b> <b>${esc(n.name)}</b><span class="spacer"></span><span class="hint">${n.nat === "dr" ? "مدين" : "دائن"}</span><b class="num">${A.money(n.bal)}</b></summary><div class="kids">${n.kids.map((k) => node(k, depth + 1)).join("")}</div></details>`
        : `<div class="kid ${n.key ? "click" : ""}" ${n.key ? `data-act="acctLedger" data-k="${esc(n.key)}"` : ""}><span class="mono">${n.code}</span><span class="spacer">${esc(n.name)}</span><b class="num">${A.money(n.bal)}</b></div>`;
      const tot = (c) => C.T.find((n) => n.code === c).bal;
      return `${note(`كل حساب بكوده وطبيعته ورصيده دلوقتي. أي إذن صرف أو توريد أو تحويل بيعمل قيد يومية بيتسمّع هنا لوحده. الأصول ${A.short(tot("1"))} = الخصوم ${A.short(tot("2"))} + حقوق الملكية ${A.short(tot("3"))}.`)}<div class="tree coa">${C.T.map((n) => node(n, 0)).join("")}</div>
        ${note("الأكواد والحسابات ملخص من «شجرة الحسابات.xlsx». أرصدة البداية الحقيقية هتتدخل وقت الإطلاق.")}`;
    }
  };
  A.CHANGE.mvF = (v) => { ui("mvF", v); A.render(); };
  // one account's movements from the journal (حركات الحساب)
  A.ACT.acctLedger = (d) => { const C = coa(), n = C.idx[d.k], ms = S().moves.filter((m) => entry(m).some((e) => e[0] === d.k));
    A.openModal(`حركات الحساب · ${n.code} ${n.name}`, `<div class="pdf">${note(`${esc(n.path.join(" ← "))} · الرصيد ${A.money(n.bal)} (${n.nat === "dr" ? "مدين" : "دائن"})`)}${U.table(["قيد اليومية", "التاريخ", "البيان", "مدين", "دائن"], ms.map((m) => { const e = entry(m).filter((x) => x[0] === d.k).reduce((s, x) => [s[0] + x[1], s[1] + x[2]], [0, 0]); return `<tr class="click" data-act="mvView" data-id="${m.id}"><td class="mono">${jvOf(m)}</td><td>${A.fmtDate(m.at)}</td><td>${esc(m.note || "")}</td><td class="n">${e[0] ? A.money(e[0]) : ""}</td><td class="n">${e[1] ? A.money(e[1]) : ""}</td></tr>`; }))}</div><div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع</button></div>`); };
  A.CHANGE.ccf = (v, el) => { ui("ccf", Object.assign({}, ui("ccf"), { [el.dataset.k]: v })); A.render(); };
  A.ACT.advances = () => A.openModal("سلف الموظفين", U.table(["الموظف", "التاريخ", "رصيد السلفة"], S().advances.map((a) => `<tr><td>${A.who(a.emp)}</td><td>${A.fmtDate(a.date)}</td><td class="n">${A.money(a.amount)}</td></tr>`)));
  A.ACT.drill = (d) => {
    const st = S(), p = figures();
    const html = d.k === "rev" ? U.table(["الصفقة", "العميل", "النوع", "عمولة Places"], st.deals.filter(A.countsRevenue).map((x) => `<tr><td class="mono">${x.id}</td><td>${esc(x.client)}</td><td>${esc(x.kind)}</td><td class="n">${A.money(A.placesComm(x))}</td></tr>`))
      : d.k === "direct" ? U.table(["الصفقة", "السيلز", "النسبة", "العمولة"], st.deals.filter(A.countsRevenue).flatMap((x) => A.salesShares(x).map((s) => `<tr><td class="mono">${x.id}</td><td>${A.who(s.sales)}</td><td class="n">${s.rate}% × ${s.pct}%</td><td class="n">${A.money(s.amount)}</td></tr>`)))
      : U.table(["البند", "المبلغ", "من المشتريات"], p[d.k].map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${A.money(v)}</td><td>${st.purchases.filter((x) => x.line === k && x.status === "Paid").map((x) => x.id).join("، ") || "—"}</td></tr>`));
    A.openModal({ rev: "الإيرادات", direct: "المصاريف المباشرة", selling: "المصروفات البيعية", admin: "المصروفات الإدارية" }[d.k], html);
  };
  A.ACT.closeMonth = () => { const pr = S().periods[S().periods.length - 1]; pr.status = "مقفول شهرياً"; A.toast(`${pr.name} اتقفل · اتطلعت قايمة الدخل`); A.render(); };
  A.ACT.closeQuarter = () => { const pr = S().periods[S().periods.length - 1]; pr.status = "مقفول ربع سنوي"; A.toast("الربع اتقفل · اتطلعت الميزانية العمومية"); A.render(); };
})();
