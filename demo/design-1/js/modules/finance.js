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
    sub: () => "شجرة الحسابات · قايمة الدخل · الميزانية · Cost Center · المرتبات",
    render() {
      const t = ui("fnTab") || "dash";
      return `<div class="row">${U.tabs("fnTab", [["dash", "Dashboard"], ["pnl", "قايمة الدخل"], ["bs", "الميزانية العمومية"], ["cost", "Cost Center"], ["payroll", "المرتبات"], ["tree", "شجرة الحسابات"]], t)}</div>${FN[t]()}`;
    }
  };
  A.ACT.fnTab = (d) => { ui("fnTab", d.v); A.render(); };
  const row = (l, v, cls, drill) => `<tr class="${cls || ""} ${v < 0 ? "neg" : ""} ${drill ? "click" : ""}" ${drill ? `data-act="drill" data-k="${esc(drill)}"` : ""}><td>${esc(l)}${drill ? ` <span class="hint">${I("search")}</span>` : ""}</td><td class="n">${A.money(v)}</td></tr>`;
  const FN = {
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
      const T = [["1 · الأصول", ["الخزينة: رئيسية · نانسي · مختار · احمد اشرف", "أرصدة البنوك: CIB · QNB · Dopay", "عملاء (حسابات فرعية)", "مصروفات مقدمة", "تامينات لدى الغير", "الأصول الثابتة: أثاث · موبيلات · لابتوبات · أجهزة أخرى", "مجمع إهلاك الأصول", "سلف موظفين (حساب لكل موظف)", "مسحوبات جاري شركاء: أحمد إسلام · محمد صفوت", "عهد"]], ["2 · الخصوم", ["مصروفات مستحقة: مرتبات · إيجار · عمولة مبيعات · عمولة أوبريشن · تأمينات", "إيراد مقدم", "موردين", "قروض وأقساط طويلة الأجل", "ضرائب قيمة مضافة · خصم وإضافة · دخل", "دفعات وتأمينات من العملاء"]], ["3 · حقوق الملكية", ["رأس المال", "جاري الشركاء", "الأرباح المحتجزة", "أرباح وخسائر العام"]], ["4 · الإيرادات", ["عمولات تسويق عقاري: إداري · تجاري · resale · سكني", "عمولات إدارة عقارات", "إيرادات أخرى: بيع أجهزة · أثاث · استشارات"]], ["5 · المصروفات", ["مصروفات إدارية: إيجار · مرتبات إدارية · بوفيه · انتقالات · إنترنت · كهرباء · محاماة · تأمينات …", "مصروفات بيعية: مرتبات وعمولات مبيعات · سبونسر فيسبوك ولينكدإن · Google Ads · Lusha · CRM · منصات (دوبيزل، عقار ماب، بروبرتي فايندر) · بتتحمّل على الصفقات"]]];
      return `<div class="tree">${T.map(([h, k]) => `<details open><summary><b>${esc(h)}</b><span></span><span></span><span class="hint num">${k.length}</span></summary><div class="kids">${k.map((x) => `<div class="kid"><span>${esc(x)}</span></div>`).join("")}</div></details>`).join("")}</div>${note("ملخص من «شجرة الحسابات.xlsx» بتاعة د. علي. الشجرة ثابتة، والتقارير بتتسحب منها.")}`;
    }
  };
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
