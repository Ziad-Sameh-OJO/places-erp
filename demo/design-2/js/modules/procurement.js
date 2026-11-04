/* M-08 Procurement: request → approval (management / Nancy / Ahmed / Safwat) → payment → line budget. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const LV = { Pending: "warn", Approved: "info", Rejected: "bad", Settled: "warn", Paid: "ok", Posted: "ok" };
  const SL = { Settled: "اتسوّى · مستني المالية", Posted: "اترحّل في المالية" };
  const isApprover = () => A.canDo("procurement", "approve");
  // Q44: any approver can release up to 50,000; above that only Ahmed or Safwat. Q45: over the budget, only management (Super Admin)
  const LIMIT = 50000, BIG = ["u1", "u2", "u18"]; // أحمد إسلام · محمد صفوت · أحمد أشرف
  const blocker = (p) => over(p) && A.role !== "admin" ? "الطلب ده هيعدّي الـ Budget · مايتصرفش غير بموافقة الإدارة" : p.amount > LIMIT && !BIG.includes(A.me()) ? `المبلغ أكتر من ${A.money(LIMIT)} · الموافقة لأحمد أو صفوت بس` : "";
  const isBuyer = () => A.canDo("procurement", "create");
  const over = (p) => { const b = S().budgets.find((x) => x.line === p.line); return b && p.status === "Pending" && A.budSpent(b) + p.amount > b.budget; };

  V.procurement = {
    sub: () => "Request ← موافقة (لحد 50,000 أي معتمد · أكتر من كده أحمد أو صفوت) ← مختار يصرف ← Budget البند بعد الدفع",
    render() {
      const st = S(), f = ui("prF") || {};
      let list = st.purchases.slice();
      if (f.status) list = list.filter((p) => p.status === f.status); if (f.line) list = list.filter((p) => p.line === f.line); if (f.vendor) list = list.filter((p) => p.vendor === f.vendor);
      if (f.from) list = list.filter((p) => p.created.slice(0, 10) >= f.from); if (f.to) list = list.filter((p) => p.created.slice(0, 10) <= f.to);
      const tb = st.budgets.reduce((s, b) => s + b.budget, 0), ts = st.budgets.reduce((s, b) => s + A.budSpent(b), 0);
      return `<div class="kpis">${U.kpi("مستنية موافقة", st.purchases.filter((p) => p.status === "Pending").length, "الإدارة / نانسي / أحمد / صفوت", "clock", "warn")}${U.kpi("جاهزة للصرف", st.purchases.filter((p) => p.status === "Approved").length, "اتوافق عليها", "check", "ok")}${U.kpi("إجمالي الـ Budget", A.money(tb), `${st.budgets.length} بنود`, "wallet")}${U.kpi("فاضل", A.money(tb - ts), `اتصرف ${Math.round((ts / tb) * 100)}%`, "chart", ts / tb > 0.8 ? "bad" : "ok")}</div>
        <div class="toolbar"><select id="pf-s" data-change="prF" data-k="status">${opt("", "كل الحالات", f.status)}${Object.keys(LV).map((k) => opt(k, k, f.status)).join("")}</select><select id="pf-l" data-change="prF" data-k="line">${opt("", "كل البنود", f.line)}${st.budgets.map((b) => opt(b.line, b.line, f.line)).join("")}</select><select id="pf-v" data-change="prF" data-k="vendor">${opt("", "كل الموردين", f.vendor)}${st.vendors.map((v) => opt(v, v, f.vendor)).join("")}</select><label class="date-f"><span>من</span><input type="date" id="pf-f" value="${esc(f.from || "")}" data-change="prF" data-k="from"></label><label class="date-f"><span>لحد</span><input type="date" id="pf-t" value="${esc(f.to || "")}" data-change="prF" data-k="to"></label><span class="spacer"></span>${U.exportBtn("purchases", "الطلبات")}${isBuyer() ? `<button class="btn" data-act="prNew">${I("plus")}طلب شراء / دفع</button>` : ""}</div>
        <div class="cols wide"><div>${table(["الطلب", "الحاجة", "المبلغ", "البند", "المورد", "الحالة"], list.map((p) => `<tr class="click" data-act="prOpen" data-id="${p.id}"><td class="mono">${p.id}</td><td><b>${esc(p.item)}</b><span class="sub">${A.ago(p.created)}${p.attach ? " · " + I("file") + esc(p.attach) : ""}</span></td><td class="n">${A.money(p.amount)}</td><td>${esc(p.line)}${over(p) ? `<span class="sub">${chip("bad", "هيعدّي الـ Budget")}</span>` : ""}</td><td>${esc(p.vendor)}</td><td>${chip(LV[p.status], SL[p.status] || p.status)}${p.approver ? `<span class="sub">${esc(A.person(p.approver))}</span>` : ""}</td></tr>`))}</div>
          <section class="card">${head("Budget لكل بند", "wallet", "", "اتصرف كام وفاضل كام")}${st.budgets.map((b) => { const pct = Math.min(100, (A.budSpent(b) / b.budget) * 100); return `<div class="bud"><div class="row"><b class="spacer">${esc(b.line)}</b><span class="num hint">${A.short(A.budSpent(b))} / ${A.short(b.budget)}</span></div>${U.bar(pct, pct > 90 ? "bad" : pct > 70 ? "warn" : "")}<small class="hint">${esc(b.kind)} · فاضل ${A.money(b.budget - A.budSpent(b))}</small></div>`; }).join("")}</section></div>
        ${officeCards()}
        ${note("الفاضل في البند = Budget البند − اللي اتصرف عليه. مثال: Budget 100,000 واتصرف 65,000، يبقى فاضل 35,000. أي مصروف معتمد بيتحمّل على بنده في شجرة الحسابات في المالية.")}`;
    }
  };
  // KPI data for Mokhtar: requests done within 48h, the petty-cash ceiling, the office assets register, the office boys' rota by area
  function officeCards() {
    const st = S(), box = st.accounts.find((x) => /مختار/.test(x.name)) || { balance: 0 }, cap = st.pettyCap || 50000, paid = st.purchases.filter((p) => p.paidAt), in48 = paid.filter((p) => (new Date(p.paidAt) - new Date(p.created)) / 36e5 <= 48).length, me = A.role === "procurement" || A.role === "admin";
    const AS = st.officeAssets || [], rev = st.assetsReviewed;
    return `<div class="cols"><section class="card">${head("عهدة مختار والتنفيذ", "wallet")}<div class="kpis sm">${U.kpi("رصيد العهدة", A.money(box.balance), `السقف ${A.money(cap)}`, "wallet", box.balance <= cap ? "ok" : "bad")}${U.kpi("اتنفذ خلال 48 ساعة", paid.length ? Math.round((in48 / paid.length) * 100) + "%" : "—", `${in48} من ${paid.length} طلب`, "clock", in48 / Math.max(1, paid.length) >= 0.9 ? "ok" : "warn")}</div><p class="hint">فوق 10,000 جنيه لازم إيصال أو عرضين أسعار قبل ما الطلب يتبعت.</p></section>
      <section class="card">${head("سجل أصول المكتب", "building", rev ? chip(rev.slice(0, 7) === A.today().slice(0, 7) ? "ok" : "warn", `اتراجع ${A.fmtDate(rev)}`) : chip("warn", "ماتراجعش"))}${table(["الأصل", "المكان", "الحالة"], AS.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.place)}</td><td>${chip(x.ok ? "ok" : "warn", x.ok ? "سليم" : "محتاج صيانة", 1)}</td></tr>`))}${me ? `<form class="row" data-form="assetAdd"><input name="name" required placeholder="أصل جديد"><input name="place" placeholder="المكان" style="max-width:120px"><button class="btn ghost sm">${I("plus")}ضيف</button><button type="button" class="btn ghost sm" data-act="assetsReviewed">${I("check")}اتراجع الشهر ده</button></form>` : ""}</section>
      <section class="card">${head("جدول الـ Office Boys", "users", "", "متقسّم على المناطق · نانسي بتقيّم الالتزام")}${table(["المنطقة", "المسؤول", "المواعيد"], (st.officeBoys || []).map((x) => `<tr><td>${esc(x.area)}</td><td>${esc(x.name)}</td><td>${esc(x.slots)}</td></tr>`))}</section></div>`;
  }
  A.FORM.assetAdd = (f) => { (S().officeAssets = S().officeAssets || []).push({ name: f.name, place: f.place || "", ok: true }); A.audit("procurement", `أصل جديد: ${f.name}`); A.render(); };
  A.ACT.assetsReviewed = () => { S().assetsReviewed = A.today(); A.audit("procurement", "سجل أصول المكتب اتراجع"); A.toast("اتسجّلت المراجعة"); A.render(); };
  A.CHANGE.prF = (v, el) => { ui("prF", Object.assign({}, ui("prF"), { [el.dataset.k]: v })); A.render(); };
  A.ACT.prOpen = (d) => A.openDrawer(() => prDrawer(d.id));
  function prDrawer(id) {
    const st = S(), p = st.purchases.find((x) => x.id === id); if (!p) return "";
    const b = st.budgets.find((x) => x.line === p.line);
    const body = `${U.stepper(["Pending", "Approved", "اتسوّى", "اترحّل في المالية"], p.status === "Rejected" ? "Pending" : { Settled: "اتسوّى", Paid: "اترحّل في المالية", Posted: "اترحّل في المالية" }[p.status] || p.status)}
      ${over(p) ? note(`<b>تنبيه:</b> الطلب ده هيعدّي الـ Budget الفاضل في بند ${esc(p.line)} (فاضل ${A.money(b.budget - A.budSpent(b))}). مايتصرفش غير بموافقة الإدارة.`, "warn") : ""}
      ${p.amount > LIMIT && p.status === "Pending" ? note(`المبلغ أكتر من ${A.money(LIMIT)}: الموافقة لأحمد أو صفوت بس.`) : ""}
      ${p.rejectReason ? note(`سبب الرفض: ${esc(p.rejectReason)}`, "warn") : ""}
      ${kv([["الحاجة", esc(p.item)], ["المبلغ", A.money(p.amount)], ["البند", esc(p.line)], ["المورد", esc(p.vendor)], ["المرفقات", p.attach ? `${I("file")} ${esc(p.attach)}` : "—"], ["المعتمد", p.approver ? A.who(p.approver) : "—"], ["اتصرف من", esc(p.account || "—")], ["اتطلب", A.ago(p.created)], b ? ["الـ Budget بعد الصرف", A.money(b.budget - A.budSpent(b) - (p.status === "Paid" ? 0 : p.amount))] : null])}
      ${isApprover() && p.status === "Pending" && blocker(p) ? note(blocker(p), "warn") : ""}
      ${isApprover() && p.status === "Pending" && !blocker(p) ? `<form class="card flat" data-form="prDecide"><input type="hidden" name="id" value="${p.id}">${head("قرارك", "check")}<input name="reason" id="pr-r" placeholder="سبب الرفض (لو هترفض)"><div class="row end"><button class="btn danger" name="v" value="Rejected">رفض</button><button class="btn" name="v" value="Approved">موافقة</button></div></form>` : ""}
      ${isBuyer() && p.status === "Approved" ? `<form class="card flat" data-form="prPay"><input type="hidden" name="id" value="${p.id}">${head("التسوية", "wallet", "", "المشتريات بتبلّغ المالية بس · الأرصدة والقيد بيعملهم المحاسب")}${field("اتدفع من (معلومة للمالية)", `<select name="acc" id="pp-acc">${st.accounts.map((a) => opt(a.name, a.name, /مختار/.test(a.name) ? a.name : "")).join("")}</select>`, 1)}${field("المبلغ وقت الدفع", `<input name="amount" id="pp-amt" type="number" value="${p.amount}">`)}<div class="row end"><button class="btn">اتسوّى · ابعته للمالية</button></div></form>` : ""}
      ${p.status === "Settled" ? note(`اتسوّى يوم ${A.fmtDate(p.settledAt)} · مستني المالية تصرفه من الخزنة وتعمل القيد`, "warn") : p.status === "Posted" ? note(`المالية رحّلته · ${esc(p.move || "")} من ${esc(p.account || "")}`) : ""}`;
    return U.drawer(p.item, `${p.id} · طلب شراء`, chip(LV[p.status], SL[p.status] || p.status), body);
  }
  A.ACT.prNew = () => A.openModal("طلب شراء / دفع", `<form data-form="prNew" class="grid">
    ${field("الحاجة", `<input name="item" id="pr-item" required>`, 1)}${field("المبلغ", `<input name="amount" id="pr-amt" type="number" required min="1">`, 1)}
    ${field("البند (من شجرة الحسابات)", `<select name="line" id="pr-line">${S().budgets.map((b) => opt(b.line, `${b.line} · فاضل ${A.short(b.budget - A.budSpent(b))}`)).join("")}</select>`, 1)}${field("المورد", `<input name="vendor" id="pr-v" list="vendorList"><datalist id="vendorList">${S().vendors.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`)}
    ${field("المرفقات (فاتورة / عرض سعر)", `<input type="file" id="pr-att" name="att">`)}
    <div class="row end wide"><span class="hint spacer">لحد 50,000 أي معتمد يوافق، وأكتر من كده أحمد أو صفوت. والـ Budget بيتخصم بعد الدفع.</span><button class="btn">${I("send")}ابعت للموافقة</button></div></form>`);
  A.FORM.prNew = (f, form) => { const st = S(), file = form.querySelector("#pr-att").files[0]; if (+f.amount > 10000 && !file) return A.toast("فوق 10,000 جنيه لازم إيصال أو عرضين أسعار مرفقين"); st.purchases.unshift({ id: "PR-" + (23 + st.purchases.length), item: f.item, amount: +f.amount, line: f.line, vendor: f.vendor, attach: file ? file.name : "", status: "Pending", created: A.nowIso() }); if (f.vendor && !st.vendors.includes(f.vendor)) st.vendors.push(f.vendor); A.notify(["approver", "admin"], `طلب شراء جديد: ${f.item} · ${A.money(+f.amount)}`); A.closeModal(); A.toast("اتبعت للمعتمدين"); A.render(); };
  A.FORM.prDecide = (f) => { const p = S().purchases.find((x) => x.id === f.id); if (f.v === "Approved" && blocker(p)) { A.toast(blocker(p)); return; } if (f.v === "Rejected" && !f.reason) { A.toast("اكتب سبب الرفض"); return; } p.status = f.v; p.approver = A.me(); A.audit("procurement", `${p.id}: ${f.v}${f.reason ? " · " + f.reason : ""}`); p.rejectReason = f.v === "Rejected" ? f.reason : ""; A.notify(["procurement"], `${p.item}: ${f.v === "Approved" ? "اتوافق عليه · جاهز للصرف" : "اترفض · " + f.reason}`); A.toast(f.v === "Approved" ? "اتوافق · مختار يقدر يصرف" : "اترفض ورجع لمختار بالسبب"); A.render(); };
  A.FORM.prPay = (f) => {
    const st = S(), p = st.purchases.find((x) => x.id === f.id);
    if (+f.amount !== p.amount) { p.amount = +f.amount; p.status = "Pending"; p.approver = ""; A.notify(["approver", "admin"], `${p.item}: المبلغ اتغير وقت الدفع · محتاج موافقة تاني`); A.toast("المبلغ اتغير · الطلب رجع للموافقة تاني"); A.render(); return; }
    Object.assign(p, { status: "Settled", suggestedAccount: f.acc, settledAt: A.nowIso(), settledBy: A.me() });
    A.audit("procurement", `${p.id}: اتسوّى ${A.money(p.amount)} (اتدفع من ${f.acc}) · راح للمالية`);
    A.notify(["accountant"], `طلب شراء ${p.id} (${p.item}) اتسوّى بـ ${A.money(p.amount)} · مستني تصرفه من الخزنة`);
    A.toast("اتبعت للمالية · الأرصدة مااتغيرتش"); A.render();
  };
})();
