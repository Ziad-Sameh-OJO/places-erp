/* M-02 Done Deals: the «admin done deal» sheet, the per-deal split sheet, Office Manager review, Manar's seller approval,
   collections by side with a TCR per collection, Transactions and Achievements. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const ST_LVL = { "Pending Review": "warn", "Approved": "info", "Partially Collected": "warn", "Fully Collected": "ok", "Rejected": "bad", "Cancelled": "bad" };
  const TYPES = ["Rent", "Resale", "Primary", "Income"];
  const stChip = (d) => chip(ST_LVL[A.dealStatus(d)], A.dealStatus(d));
  const com = (d) => A.placesComm(d);
  const names = (ids) => ids.map(A.person).join(" · ") || "—";
  const firstPay = (d) => (d.payments || []).map((p) => p.at).sort()[0];
  const monthOf = (iso) => (iso ? new Date(iso).toLocaleDateString("ar-EG", { month: "long", year: "numeric" }) : "—");
  const recorded = (d) => !["Pending Review", "Rejected"].includes(d.status); // «لما توافق عليها تبان وتتسجل في الشيت»
  const canNote = () => A.canDo("deals", "edit"); // the note (Office Manager / Finance) needs deal edit rights
  const scope = () => { const r = A.role, m = A.me(), st = S(); return st.deals.filter((d) => r === "sales" ? A.buyersOf(d).concat(d.sellers || []).includes(m) : r === "tl" ? A.buyersOf(d).concat(d.sellers || []).some((id) => (st.people.find((p) => p.id === id) || {}).tl === m) : true); };
  const sideRate = (d, side) => A.salesShares(d).filter((x) => x.side === side);

  V.deals = {
    sub: () => "شيت الـ Done Deals · مراجعة الـ Office Manager · التحصيل والـ TCR · التارجت والـ Transactions",
    render() {
      const st = S(), r = A.role, t = ui("dlTab") || (r === "sales" ? "me" : "board"), list = scope(), rev = list.filter(A.countsRevenue);
      const v = rev.reduce((s, d) => s + com(d), 0), c = rev.reduce((s, d) => s + A.collected(d), 0), cm = rev.reduce((s, d) => s + A.salesComm(d), 0);
      const tabs = U.tabs("dlTab", [r === "sales" ? ["me", "إنجازاتي"] : null, ["board", "Done Deals board"], ["sheet", "شيت الـ Done Deals"], ["split", "تفاصيل الصفقات"], ["achv", "Achievements"]].filter(Boolean), t);
      let body = "";
      if (t === "board") body = `<div class="board">${["Pending Review", "Approved", "Partially Collected", "Fully Collected"].map((s) => { const items = list.filter((d) => A.dealStatus(d) === s); return `<div class="lane"><h4><i class="ld-${ST_LVL[s]}"></i>${s}<span class="num">${items.length}</span></h4>${items.map((d) => `<article class="tcard" data-act="dealOpen" data-id="${d.id}"><div class="row"><b class="spacer">${esc(d.company || d.client)}</b>${A.suspicious(d) ? chip("bad", "Alarm") : ""}${d.sellers && d.sellers.length && !d.sellerApproved ? chip("warn", "Seller مستني منار") : ""}</div><span class="hint mono">${d.id} · ${d.unit} · ${esc(d.type)}</span><b class="num">${A.money(com(d))}</b>${U.bar((A.collected(d) / (com(d) || 1)) * 100, A.collected(d) >= com(d) ? "" : "warn")}<div class="row"><span class="hint spacer">Buyer: ${esc(names(A.buyersOf(d)))}</span><span class="hint">${A.fmtDate(d.closed)}</span></div></article>`).join("") || `<p class="lane-empty">—</p>`}</div>`; }).join("")}</div>`;
      if (t === "sheet") {
        // the client's «admin done deal 2026» sheet, column for column
        const q = (ui("dlq") || "").toLowerCase(), rows = list.filter(recorded).filter((d) => !q || (d.company + d.client + d.unit + d.id + names(A.buyersOf(d))).toLowerCase().includes(q));
        const pc = (d, side) => sideRate(d, side).map((x) => x.rate + "%").join(" / ") || "—", pm = (d, side) => sideRate(d, side).map((x) => A.short(x.amount)).join(" / ") || "—";
        body = `<div class="toolbar"><label class="search">${I("search")}<input id="dlq" type="search" placeholder="الشركة، الوحدة، السيلز" value="${esc(ui("dlq") || "")}" data-change="dlq"></label><span class="hint">بتظهر هنا بعد موافقة الـ Office Manager</span></div>
          ${table(["Date", "company", "space", "type", "location", "buyer", "seller", "source", "owner side", "client side", "net commission", "buyer %", "buyer commission", "seller %", "seller commission", "tcr", "note", "deal date"], rows.map((d) => `<tr class="click" data-act="dealOpen" data-id="${d.id}"><td>${monthOf(firstPay(d))}</td><td><b>${esc(d.company || d.client)}</b><span class="sub mono">${d.id}</span></td><td class="n">${A.num(d.space)} م</td><td>${esc(d.type)}</td><td>${esc(d.location)}</td><td>${esc(names(A.buyersOf(d)))}</td><td>${esc(names(d.sellers || []))}${d.sellers && d.sellers.length && !d.sellerApproved ? `<span class="sub">${chip("warn", "مستني منار")}</span>` : ""}</td><td>${esc(d.source)}</td><td class="n">${A.money(A.collectedFrom(d, "owner"))}</td><td class="n">${A.money(A.collectedFrom(d, "client"))}</td><td class="n"><b>${A.money(A.collected(d))}</b></td><td class="n">${pc(d, "buyer")}</td><td class="n">${pm(d, "buyer")}</td><td class="n">${pc(d, "seller")}</td><td class="n">${pm(d, "seller")}</td><td class="mono">${(d.tcrs || []).map((x) => x.code).join(" · ") || "—"}</td><td class="wrap">${esc(d.note || "")}${d.targetBase != null && d.targetBase !== "" ? `<span class="sub">التارجت بـ ${A.money(+d.targetBase)}</span>` : ""}</td><td>${A.fmtDate(d.closed)}</td></tr>`))}`;
      }
      if (t === "split") {
        // second sheet: every deal, every salesperson: share, what entered their target, their commission
        const rows = list.filter(A.countsRevenue).flatMap((d) => A.salesShares(d).map((x) => ({ d, x })));
        body = `${note("لكل صفقة: الكوميشن اللي اتحصّل بيتقسم نصين (Buyer / Seller)، وكل نص بيتقسم على عدد السيلز اللي في الجهة دي. نصيب السيلز هو اللي بيدخل التارجت بتاعه، وعمولته = نسبته × نصيبه.")}
          ${table(["الصفقة", "السيلز", "الجهة", "نصيبه من الكوميشن", "دخل في التارجت", "نسبته", "عمولته", "الـ Team Leader"], rows.map(({ d, x }) => `<tr class="click" data-act="dealOpen" data-id="${d.id}"><td class="mono">${d.id}<span class="sub">${esc(d.company || d.client)}</span></td><td>${A.who(x.sales)}</td><td>${chip(x.side === "buyer" ? "info" : "acc", x.side === "buyer" ? "Buyer" : "Seller")} <span class="hint">${x.pct}%</span></td><td class="n">${A.money(x.share)}</td><td class="n">${d.offTarget ? chip("warn", "خارج التارجت") : A.money(x.targetShare)}</td><td class="n">${x.rate}%</td><td class="n"><b>${A.money(x.amount)}</b></td><td>${A.person((st.people.find((p) => p.id === x.sales) || {}).tl || "") || "—"}</td></tr>`))}`;
      }
      if (t === "achv" || t === "me") {
        const board = A.sales().map((s) => ({ s, n: A.transactions(s.id), v: A.targetOf(s.id), target: A.targetGoal(s.id) || 1, units: st.units.filter((u) => u.agent === s.id).length, visits: st.leads.filter((l) => l.sales === s.id).reduce((x, l) => x + l.visits.filter((vv) => vv.done).length, 0), act: st.leads.filter((l) => l.sales === s.id).reduce((x, l) => x + (l.activity || 0), 0) })).sort((a, b) => b.v - a.v);
        if (t === "me") {
          const mine = board.find((b) => b.s.id === A.me()) || board[0], rank = board.indexOf(mine) + 1, pct = Math.min(100, (mine.v / mine.target) * 100);
          body = `<section class="achv-hero"><div class="ring" style="--p:${pct}"><b class="num">${Math.round(pct)}%</b><small>من التارجت</small></div><div><span class="eyebrow">ترتيبك بين ${board.length} سيلز</span><h2>#${rank} · ${esc(mine.s.name)}</h2><p>دخلك في التارجت ${A.money(mine.v)} من ${A.money(mine.target)}</p></div></section>
            <div class="kpis">${U.kpi("Transactions", mine.n, "صفقة اسمك فيها واتحصّل منها", "handshake")}${U.kpi("وحدات جبتها", mine.units, "متسجّلة باسمك كـ agent", "building", "ok")}${U.kpi("زيارات خلصت", mine.visits, "Visit Done", "pin")}${U.kpi("Activity", mine.act, "مكالمات ومراحل وزيارات", "bolt", "warn")}</div>`;
        }
        const max = Math.max(1, ...board.map((b) => b.v));
        body += `<section class="card">${head("Leaderboard", "star", "", "مترتب باللي دخل في التارجت (نصيب كل سيلز من الكوميشن)")}${table(["#", "السيلز", "Transactions", "دخل في التارجت", "التارجت", "وحدات جابها", "زيارات", "Activity"], board.map((b, i) => `<tr class="${b.s.id === A.me() ? "me-row" : ""}"><td class="n"><span class="rank r${i + 1}">${i + 1}</span></td><td>${A.who(b.s.id)}</td><td class="n">${b.n}</td><td><div class="cell-bar"><span class="num">${A.short(b.v)}</span>${U.bar((b.v / max) * 100)}</div></td><td class="n">${Math.round((b.v / b.target) * 100)}% <span class="sub">من ${A.short(b.target)}</span></td><td class="n">${b.units}</td><td class="n">${b.visits}</td><td class="n">${b.act}</td></tr>`))}</section>`;
      }
      return `<div class="kpis">${U.kpi("صافي الكوميشن", A.money(c), `${rev.length} صفقة اتحصّل منها · Owner + Client`, "handshake", "", "", U.trend(rev, "created", 30, (x) => A.collected(x)))}${U.kpi("الكوميشن المتوقع", A.money(v), `${v ? Math.round((c / v) * 100) : 0}% اتحصّل`, "wallet", "ok")}${U.kpi("المتبقي", A.money(v - c), "لسه متحصّلش", "clock", "warn")}${U.kpi("عمولات السيلز", A.money(cm), "نسبة كل سيلز من نصيبه", "trend")}</div>
        <div class="row">${tabs}<span class="spacer"></span>${U.exportBtn("deals", "الصفقات")}${A.canDo("deals", "create") ? `<button class="btn" data-act="dealNew">${I("plus")}سجّل صفقة</button>` : ""}</div>${body}`;
    }
  };
  A.ACT.dlTab = (d) => { ui("dlTab", d.v); A.render(); };
  A.CHANGE.dlq = (v) => { ui("dlq", v); A.render(); };

  A.ACT.dealOpen = (d) => A.openDrawer(() => dealDrawer(d.id));
  function dealDrawer(id) {
    const st = S(), d = st.deals.find((x) => x.id === id); if (!d) return "";
    const r = A.role, rem = com(d) - A.collected(d), u = st.units.find((x) => x.code === d.unit) || {};
    const review = d.status === "Pending Review" && A.canDo("deals", "approve"), live = !["Pending Review", "Rejected", "Cancelled"].includes(d.status);
    const sellerWait = (d.sellers || []).length && !d.sellerApproved, manar = A.canDo("inventory", "approve");
    const sales = A.sales(), others = sales.filter((s) => !(d.sellers || []).includes(s.id));
    const body = `${A.suspicious(d) ? note("<b>Alarm للـ Office Manager:</b> الصفقة اتسجّلت وقت القفل بس (اتعملت واتقفلت في خلال ${A.dur(S().leadRules.close.alarmH * 60)})، يعني ممكن السيلز كان شغال عليها من غير ما يسجّلها. بتتحسب Done Deal عادي، بس متدخلش في تارجت السيلز.", "warn") : ""}
      ${d.status === "Cancelled" ? note(`<b>الصفقة اتلغت:</b> ${esc(d.cancelNote || "")} · الإيرادات والـ Achievements والعمولات اتخصمت أوتوماتيك.`, "warn") : ""}
      ${sellerWait ? note(`<b>الـ Seller:</b> ${esc(names(d.sellers))} (الـ Agent بتاع ${esc(d.unit)}) مستني موافقة منار قبل ما يتسجّل. ${manar ? `<button class="btn sm" data-act="sellerOk" data-id="${d.id}">${I("check")}وافقي على الـ Seller</button>` : ""}`, "warn") : ""}
      ${U.stepper(["Pending Review", "Approved", "Partially Collected", "Fully Collected"], A.dealStatus(d) === "Rejected" ? "Pending Review" : A.dealStatus(d))}
      ${kv([["الشركة (company)", esc(d.company || d.client)], ["الوحدة", `<span class="mono">${d.unit}</span> · ${esc(d.location)}`], ["المساحة (space)", A.num(d.space) + " م"], ["النوع (type)", esc(d.type)], ["Buyer", esc(names(A.buyersOf(d)))], ["Seller", esc(names(d.sellers || []))], ["المصدر (source)", esc(d.source)], ["عمولة متوقعة من الـ Owner", A.money(d.commOwner || 0)], ["عمولة متوقعة من الـ Client", A.money(d.commClient || 0)], ["المحصّل (owner side / client side)", `${A.money(A.collectedFrom(d, "owner"))} / ${A.money(A.collectedFrom(d, "client"))}`], ["صافي الكوميشن", A.money(A.collected(d))], ["المتبقي", A.money(rem)], ["Date (أول تحصيل)", monthOf(firstPay(d))], ["deal date", A.fmtDate(d.closed)]])}
      ${d.note || (d.targetBase != null && d.targetBase !== "") ? note(`<b>note:</b> ${esc(d.note || "")}${d.targetBase != null && d.targetBase !== "" ? ` · التارجت بيتحسب بـ ${A.money(+d.targetBase)} بدل ${A.money(A.collected(d))}` : ""}`) : ""}
      <section class="card flat">${head("تقسيم الكوميشن", "users", "", "نص للـ Buyer ونص للـ Seller، وكل نص على عدد السيلز في الجهة دي")}${A.salesShares(d).map((x) => `<div class="line-item"><span>${A.who(x.sales)} · ${x.side === "buyer" ? "Buyer" : "Seller"} · نصيبه ${A.money(x.share)} · نسبته ${x.rate}%</span><b class="num">${A.money(x.amount)}</b></div>`).join("") || `<p class="hint">التقسيم بيبدأ من أول تحصيل.</p>`}${sellerWait ? `<p class="hint">نص الـ Seller بيتوزّع بعد موافقة منار.</p>` : ""}</section>
      ${d.reviewNote ? note(`سبب الرفض: ${esc(d.reviewNote)}`, "warn") : ""}
      ${review ? `<form class="card flat" data-form="dealReview"><input type="hidden" name="id" value="${d.id}">${head("مراجعة الـ Office Manager", "check", "", "تقدري تعدّلي أي خانة قبل ما توافقي")}
        <div class="grid">${field("المساحة", `<input name="space" type="number" value="${d.space}">`)}${field("النوع", `<select name="type">${TYPES.map((x) => opt(x, x, d.type)).join("")}</select>`)}${field("المبنى / المشروع", `<input name="location" value="${esc(d.location)}">`)}${field("عمولة من الـ Owner", `<input name="commOwner" type="number" value="${d.commOwner || 0}">`)}${field("عمولة من الـ Client", `<input name="commClient" type="number" value="${d.commClient || 0}">`)}${field("سيلز الـ Buyer", `<select name="buyers" multiple size="3">${others.map((s) => opt(s.id, s.name, A.buyersOf(d).includes(s.id) ? s.id : "")).join("")}</select>`)}</div>
        <div class="row"><input name="note" id="dr-note" placeholder="سبب الرفض (لو هترفضي)"><button class="btn danger" name="v" value="reject">رفض</button><button class="btn" name="v" value="ok">موافقة وتسجيل في الشيت</button></div></form>` : d.status === "Pending Review" ? note("مستنية مراجعة الـ Office Manager.") : ""}
      ${live ? execPapers(d) : ""}
      ${live && canNote() ? `<form class="card flat" data-form="dealNote"><input type="hidden" name="id" value="${d.id}">${head("note (Office Manager / المالية)", "file", "", "بيغيّر اللي متحدد فيها بس")}<div class="grid">${field("الملاحظة", `<input name="note" value="${esc(d.note || "")}" placeholder="مثلاً: التارجت يتحسب بمبلغ تاني">`)}${field("التارجت يتحسب بمبلغ (اختياري)", `<input name="targetBase" type="number" min="0" value="${d.targetBase != null ? esc(String(d.targetBase)) : ""}">`)}</div><div class="row end"><button class="btn ghost sm">احفظ</button></div></form>` : ""}
      ${A.claimsBlock ? A.claimsBlock(d) : ""}
      <section class="card flat">${head("التحصيل والـ TCR", "wallet", chip(rem <= 0 ? "ok" : "warn", rem <= 0 ? "اتحصّلت بالكامل" : `باقي ${A.money(rem)}`))}
        ${(d.tcrs || []).map((x, i) => { const ids = A.buyersOf(d).concat(A.sellersOf(d)), left = ids.filter((id) => !(x.signed || {})[id]); return `<div class="line-item"><span><b class="mono">${x.code}</b> · ${A.fmtDate(x.at)} · ${x.side === "owner" ? "من الـ Owner" : "من الـ Client"} · <b class="num">${A.money(x.amount)}</b></span>${left.length ? chip("warn", `مستني إمضاء ${left.length}`) : chip("ok", "اتمضت")}<button class="btn ghost sm" data-act="tcrView" data-id="${d.id}" data-i="${i}">${I("file")}TCR</button>${ids.includes(A.me()) && !(x.signed || {})[A.me()] ? `<button class="btn sm" data-act="tcrSign" data-id="${d.id}" data-i="${i}">امضي</button>` : ""}${A.canDo("finance", "edit") ? `<button class="btn ghost sm" data-act="payEdit" data-id="${d.id}" data-i="${i}" title="تعديل يدوي">تعديل</button>` : ""}${x.edited ? `<span class="sub">اتعدّل يدوي: ${esc(x.edited)}</span>` : ""}</div>`; }).join("") || `<p class="hint">مفيش تحصيل لسه · المالية (أحمد أشرف) هي اللي بتسجّل التحصيل</p>`}
        ${live && rem > 0 && A.canDo("finance", "create") /* Finance records collections, from the Owner side or the Client side */ ? `<form class="row" data-form="dealPay"><input type="hidden" name="id" value="${d.id}"><select name="side" id="dp-side">${opt("client", "من الـ Client")}${opt("owner", "من الـ Owner")}</select><select name="to" aria-label="لخزنة / بنك">${S().accounts.map((a) => opt(a.name, a.name, "بنك CIB")).join("")}</select><input name="amount" id="dp-amt" type="number" min="1" max="${rem}" placeholder="المبلغ" required><button class="btn ghost">${I("plus")}سجّل تحصيل</button></form>` : ""}</section>
      ${live && A.canDo("deals", "approve") ? `<form class="card flat" data-form="dealCancel"><input type="hidden" name="id" value="${d.id}">${head("إلغاء الصفقة", "x")}<div class="row"><input name="note" id="dc-note" required placeholder="سبب الإلغاء"><button class="btn danger">إلغاء الصفقة</button></div></form>` : ""}`;
    return U.drawer(d.company || d.client, `${d.id} · Done Deal`, stChip(d) + (A.suspicious(d) ? chip("bad", "Alarm") : "") + (d.offTarget ? chip("warn", "خارج التارجت") : ""), body);
  }
  A.FORM.dealReview = (f, form) => {
    const st = S(), d = st.deals.find((x) => x.id === f.id), v = f.v || "ok";
    if (v === "reject") { if (!f.note) { A.toast("اكتبي سبب الرفض"); return; } d.status = "Rejected"; d.reviewNote = f.note; A.audit("deals", `${d.id}: اترفضت`); A.notify(["sales"], `الصفقة ${d.id} اترفضت: ${f.note}`); A.toast("الصفقة رجعت للسيلز بالسبب"); A.render(); return; }
    // the Office Manager can correct the sales data before approving
    const buyers = [...form.querySelector("[name=buyers]").selectedOptions].map((o) => o.value), ch = [];
    [["space", +f.space], ["type", f.type], ["location", f.location], ["commOwner", +f.commOwner || 0], ["commClient", +f.commClient || 0]].forEach(([k, val]) => { if (String(d[k]) !== String(val)) { ch.push(`${k}: ${d[k]} ← ${val}`); d[k] = val; } });
    if (buyers.length && buyers.join() !== A.buyersOf(d).join()) { ch.push(`buyer: ${names(A.buyersOf(d))} ← ${names(buyers)}`); d.buyers = buyers; d.sales = buyers[0]; }
    const u = st.units.find((x) => x.code === d.unit);
    d.status = "Approved"; d.approvedAt = A.nowIso(); if (A.suspicious(d)) d.offTarget = true;
    A.audit("deals", `${d.id}: الـ Office Manager وافقت${ch.length ? " بعد تعديل: " + ch.join(" · ") : ""}`);
    if (u) { u.closeReq = d.id; A.notify([u.type === "Rent" ? "inventory" : "resale"], `Done Deal ${d.id} على ${u.code} اتوافق عليها · أكّد قفل الوحدة`); }
    A.notify(["accountant"], `صفقة اتقفلت ${d.id} · ${d.client} · العمولة ${A.money(A.placesComm(d))} · اتفتحله حساب تحت «العملاء» · مستنية التحصيل`);
    A.notify(["marketing"], `Done Deal اتسجّلت في الشيت: ${d.type} · ${d.location} · ${A.num(d.space)} م · ${d.company || d.client}`);
    A.toast(d.offTarget ? "اتسجّلت في الشيت · بس خارج تارجت السيلز (Alarm)" : "اتسجّلت في شيت الـ Done Deals · والتسويق وصلها Alarm");
    A.render();
  };
  // Manar approves the unit's agent as the deal's Seller
  A.ACT.sellerOk = (d) => { const x = S().deals.find((y) => y.id === d.id); x.sellerApproved = true; A.audit("deals", `${x.id}: منار وافقت على الـ Seller ${names(x.sellers)}`); A.notify(["sales"], `اتسجّلت Seller في الصفقة ${x.id}`); A.toast("الـ Seller اتسجّل في الصفقة"); A.render(); };
  // KPI data: when the deal is due to be carried out (Office Manager) and Finance's check of its papers (contract, mandate, registration)
  function execPapers(d) {
    const om = A.canDo("deals", "edit"), fin = A.canDo("finance", "edit") || A.canDo("finance", "create"), P = d.papers, late = d.execDue && !d.executed && d.execDue < A.today();
    return `<section class="card flat">${head("التنفيذ والأوراق", "check", d.executed ? chip(d.executed <= (d.execDue || d.executed) ? "ok" : "warn", d.executed <= (d.execDue || d.executed) ? "اتنفذت في ميعادها" : "اتنفذت متأخر") : late ? chip("bad", "متأخرة عن ميعاد التنفيذ") : "")}
      <div class="row">${om ? `<label class="row hint">ميعاد التنفيذ <input type="date" value="${d.execDue || ""}" data-change="dealExec" data-id="${d.id}" data-k="execDue"></label>${d.executed ? `<span class="hint">اتنفذت ${A.fmtDate(d.executed)}</span>` : `<button class="btn ghost sm" data-act="dealExecuted" data-id="${d.id}">${I("check")}اتنفذت</button>`}` : `<span class="hint">ميعاد التنفيذ: ${d.execDue ? A.fmtDate(d.execDue) : "—"}</span>`}</div>
      <div class="row"><span class="hint">أوراق الصفقة (عقد · تفويض · تسجيل):</span>${P ? `${chip(P.ok ? "ok" : "bad", P.ok ? "سليمة" : "فيها خطأ")}${P.note ? `<small class="hint">${esc(P.note)}</small>` : ""}` : chip("", "لسه ماتراجعتش", 1)}${fin ? `<button class="btn ghost sm" data-act="dealPapers" data-id="${d.id}" data-v="1">سليمة</button><button class="btn ghost sm" data-act="dealPapers" data-id="${d.id}" data-v="0">فيها خطأ</button>` : ""}</div></section>`;
  }
  A.CHANGE.dealExec = (v, el) => { const d = S().deals.find((x) => x.id === el.dataset.id); d.execDue = v; A.audit("deals", `${d.id}: ميعاد التنفيذ ${v}`); A.refreshDrawer(); };
  A.ACT.dealExecuted = (d) => { const x = S().deals.find((y) => y.id === d.id); x.executed = A.today(); A.audit("deals", `${x.id} اتنفذت${x.execDue && x.executed > x.execDue ? " (متأخر عن الميعاد)" : ""}`); A.toast("اتسجّل التنفيذ"); A.render(); A.refreshDrawer(); };
  A.ACT.dealPapers = (d) => { const x = S().deals.find((y) => y.id === d.id), ok = d.v === "1", note = ok ? "" : (prompt("الخطأ إيه؟") || "").trim(); if (!ok && !note) return; x.papers = { ok, note, by: A.uid, at: A.nowIso() }; A.audit("deals", `${x.id}: أوراق الصفقة ${ok ? "سليمة" : "فيها خطأ · " + note}`); if (!ok) A.notify(["officemgr"], `أوراق ${x.id} فيها خطأ: ${note}`); A.toast("المراجعة اتسجّلت"); A.render(); A.refreshDrawer(); };
  A.FORM.dealNote = (f) => { const d = S().deals.find((x) => x.id === f.id); d.note = f.note; d.targetBase = f.targetBase === "" ? null : +f.targetBase; A.audit("deals", `${d.id}: note «${f.note}»${d.targetBase != null ? ` · التارجت بـ ${d.targetBase}` : ""}`); A.toast("اتحفظت · بتغيّر التارجت بس"); A.render(); };
  // Q12: cancelling takes the deal out of revenue, Achievements and commissions automatically (they're all computed from status)
  A.FORM.dealCancel = (f) => { const st = S(), d = st.deals.find((x) => x.id === f.id), u = st.units.find((x) => x.code === d.unit); d.status = "Cancelled"; d.cancelNote = f.note; if (u && u.closeReq === d.id) u.closeReq = ""; if (u && u.closedBy === d.id) { u.status = "available"; u.closedBy = ""; } if (u && u.alsoClosedBy === d.id) { u.alsoStatus = "available"; u.alsoClosedBy = ""; } A.audit("deals", `${d.id} اتلغت: ${f.note}`); A.notify(["sales", "accountant"], `الصفقة ${d.id} اتلغت · الأرقام والعمولات اتخصمت`); A.toast("الصفقة اتلغت · الإيرادات والـ Achievements والعمولات اتخصمت أوتوماتيك"); A.render(); };
  // every collection prints a TCR with a sequential code for each salesperson on the deal to sign
  A.FORM.dealPay = (f) => {
    const st = S(), d = st.deals.find((x) => x.id === f.id), at = A.nowIso(), code = "T" + (st.tcrSeq = (st.tcrSeq || 180) + 1);
    d.payments = d.payments || []; d.payments.push({ at, amount: +f.amount, side: f.side }); (d.tcrs = d.tcrs || []).push({ code, at, amount: +f.amount, side: f.side, signed: {} });
    const m = A.finReceive({ to: f.to || "بنك CIB", amount: +f.amount, party: d.client, deal: d.id, side: f.side, ref: code, note: f.note || `تحصيل عمولة ${d.id} ${f.side === "owner" ? "من الـ Owner" : "من الـ Client"} · ${code}`, at });
    A.audit("deals", `${d.id}: تحصيل ${A.money(+f.amount)} ${f.side === "owner" ? "من الـ Owner" : "من الـ Client"} · ${code}`); A.notify(["sales"], `${code}: TCR جديدة على ${d.id} · امضي عليها`);
    A.toast(`اتسجّل التحصيل · ${m.id} و ${code} للإمضاء`); A.render(); return m;
  };
  A.ACT.payEdit = (d) => { const deal = S().deals.find((y) => y.id === d.id), x = deal.tcrs[+d.i]; A.openModal(`تعديل يدوي · ${x.code}`, `<form data-form="payEdit" class="grid"><input type="hidden" name="id" value="${deal.id}"><input type="hidden" name="i" value="${d.i}">${note("التعديل اليدوي مسموح للـ user اللي معاه صلاحية تعديل في المالية بس، وبيتسجّل في الـ Audit Log بالقيمة القديمة والجديدة.")}${field("المبلغ الصح", `<input name="amount" type="number" min="0" required value="${x.amount}">`, 1)}${field("السبب", `<input name="why" required placeholder="مثلاً: المبلغ اتسجّل غلط">`, 1)}<div class="row end wide"><button class="btn">احفظ التعديل</button></div></form>`); };
  A.FORM.payEdit = (f) => { if (!A.canDo("finance", "edit")) { A.toast("مالكش صلاحية تعدّل في المالية"); return; } const deal = S().deals.find((y) => y.id === f.id), x = deal.tcrs[+f.i], p = deal.payments.find((y) => y.at === x.at && y.side === x.side && y.amount === x.amount) || deal.payments[+f.i]; const old = x.amount; x.amount = +f.amount; if (p) p.amount = +f.amount; x.edited = `${A.money(old)} ← ${A.money(+f.amount)} · ${f.why}`; A.audit("finance", `${deal.id} · ${x.code}: تعديل يدوي ${A.money(old)} ← ${A.money(+f.amount)} (${f.why})`); A.closeModal(); A.toast("التعديل اتسجّل في الـ Audit Log"); A.render(); };
  A.ACT.tcrSign = (d) => { const x = S().deals.find((y) => y.id === d.id).tcrs[+d.i]; (x.signed = x.signed || {})[A.me()] = true; A.toast(`مضيت على ${x.code}`); A.render(); };
  A.ACT.tcrView = (d) => {
    const deal = S().deals.find((y) => y.id === d.id), x = deal.tcrs[+d.i], part = Object.assign({}, deal, { payments: [{ amount: x.amount }] }), rows = A.salesShares(part);
    A.openModal(`TCR · ${x.code}`, `<div class="pdf"><div class="pdf-head"><span class="brand-mark sm">${I("file")}</span><div><b>Places · TCR ${esc(x.code)}</b><small>${esc(deal.id)} · ${A.fmtDate(x.at)} · ${x.side === "owner" ? "تحصيل من الـ Owner" : "تحصيل من الـ Client"} · ${A.money(x.amount)}</small></div></div>
      ${rows.map((y) => `<div class="pdf-row"><div><b>${esc(A.person(y.sales))}</b><small>${y.side === "buyer" ? "Buyer" : "Seller"} · نصيبه ${A.money(y.share)} · نسبته ${y.rate}%</small></div><b class="num">${A.money(y.amount)}</b><span>${(x.signed || {})[y.sales] ? chip("ok", "مضى") : chip("warn", "لسه")}</span></div>`).join("")}
      <div class="pdf-row"><div><b>إمضاء السيلز</b><small>${rows.map((y) => esc(A.person(y.sales))).join(" · ")}</small></div><span>.................</span></div>
      <p class="hint">الـ TCR بتتعمل أوتوماتيك بعد كل تحصيل بكود تسلسلي، ولو اتحصّل باقي المبلغ بعدين بتتعمل TCR تانية لنفس الديل.</p></div><div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع / PDF</button></div>`);
  };

  A.ACT.dealNew = (d) => {
    const st = S(), l = d && d.lead ? st.leads.find((x) => x.id === d.lead) : null, me = A.role === "sales" ? A.me() : l && (l.draft ? l.draft.from : l.sales);
    const withCo = (x) => `${x.name} · ${x.company || "من غير شركة"}`; // the company always shows next to the lead's name
    const leadOpts = st.leads.filter((x) => x.owner !== "draft" && (A.role !== "sales" || x.sales === A.me()) && x.everInterested).map((x) => opt(x.id, `${withCo(x)} · ${x.id}`, l && l.id));
    // a salesperson can't see the Draft tab, but can still close a deal on their own lead that was pulled there
    const draftOpts = st.leads.filter((x) => x.owner === "draft" && !x.archived && x.everInterested && (A.role !== "sales" || x.draft.from === A.me())).map((x) => opt(x.id, `${withCo(x)} · ${x.id}${A.role === "sales" ? "" : ` · كان عند ${A.person(x.draft.from)}`}`, l && l.id));
    const units = st.units.filter((u) => A.isAvailable(u) && u.pdf === "confirmed");
    A.openModal(l ? `سجّل صفقة · ${withCo(l)}` : "سجّل صفقة", `<form data-form="deal" class="grid">
      ${field("العميل (من الليدز)", `<select name="lead" id="dl-lead" required>${draftOpts.length ? `<optgroup label="${A.role === "sales" ? "ليدزك" : "الليدز"}">${leadOpts.join("")}</optgroup><optgroup label="من الـ Draft (اتسحبت من غير أكشن)">${draftOpts.join("")}</optgroup>` : leadOpts.join("")}</select>`, 1)}
      ${field("الوحدة (من الانفنتوري)", `<select name="unit" id="dl-unit" required data-change="dlUnit">${units.map((u) => opt(u.code, `${u.code} · ${u.project}`)).join("")}</select><small class="hint" id="dl-seller">${units[0] ? `الـ Seller: ${esc(A.person(units[0].agent))} (الـ Agent بتاع الوحدة · بعد موافقة منار)` : ""}</small>`, 1)}
      ${field("المساحة اللي اتقفلت (م)", `<input name="space" id="dl-space" type="number" min="1" required value="${units[0] ? units[0].space : ""}">`, 1)}
      ${field("النوع", `<select name="type" id="dl-type">${TYPES.map((x) => opt(x, x, units[0] && units[0].type)).join("")}</select>`, 1)}
      ${field("عمولة متوقعة من الـ Owner", `<input name="commOwner" id="dl-co" type="number" min="0" value="0">`)}
      ${field("عمولة متوقعة من الـ Client", `<input name="commClient" id="dl-cc" type="number" min="0" value="0">`)}
      ${field("حد معاك في الديل Buyer؟", `<select name="buyer2" id="dl-b2" multiple size="3">${A.sales().filter((s) => s.id !== me).map((s) => opt(s.id, s.name)).join("")}</select>`, 0, 1)}
      <div class="row end wide"><span class="hint spacer">الشركة والـ source بيتسجّلوا من بيانات العميل. الصفقة بتوصل للـ Office Manager الأول، والتحصيل بتسجّله المالية.</span><button class="btn">حفظ الصفقة</button></div></form>`);
  };
  A.CHANGE.dlUnit = (v) => { const u = S().units.find((x) => x.code === v); if (!u) return; document.getElementById("dl-seller").textContent = `الـ Seller: ${A.person(u.agent)} (الـ Agent بتاع الوحدة · بعد موافقة منار)`; document.getElementById("dl-space").value = u.space; document.getElementById("dl-type").value = u.type; };
  A.FORM.deal = (f, form) => {
    const st = S(), l = st.leads.find((x) => x.id === f.lead), u = st.units.find((x) => x.code === f.unit), me = A.role === "sales" ? A.me() : l.draft ? l.draft.from : l.sales;
    const buyers = [me, ...[...form.querySelector("#dl-b2").selectedOptions].map((o) => o.value)];
    if (!(+f.commOwner + +f.commClient)) { A.toast("اكتب العمولة المتوقعة من الـ Owner أو الـ Client"); return; }
    const d = { id: "D-" + (300 + st.deals.length + 1), lead: l.id, client: l.name, company: l.company || l.name, unit: u.code, space: +f.space, type: f.type, location: u.project, source: l.channel, sales: me, buyers, sellers: u.agent && !buyers.includes(u.agent) ? [u.agent] : [], sellerApproved: false,
      value: A.unitTotal(u), commOwner: +f.commOwner || 0, commClient: +f.commClient || 0, created: l.created, closed: A.nowIso(), channel: l.channel, campaign: l.campaign, area: l.area, kind: u.type === "Resale" ? "عمولات تسويق عقاري resale" : u.type === "Income" ? "عمولات تسويق عقاري تجاري" : "عمولات تسويق عقاري اداري", payments: [], tcrs: [], note: "", targetBase: null, status: "Pending Review", reviewNote: "" };
    if (l.owner === "draft") { // a deal brings the lead back from the Draft to the salesperson who had it
      const from = l.draft.from; Object.assign(l, { owner: "sales", sales: from, assignedAt: A.nowIso(), draft: null });
      A.log(l, `رجع من الـ Draft لـ ${A.person(from)} بصفقة ${d.id}`); A.notify(A.ruleTo(st.leadRules.draft.notify, l), `${A.person(from)} فتح صفقة ${d.id} على ${l.name} من الـ Draft · الليد رجعله`);
    }
    st.deals.unshift(d); // Q16: the unit closes only after the Office Manager approves and Manar / Randa confirm
    if (l.stage !== "Done Deal") A.setStage(l, "Done Deal"); A.log(l, `اتسجّلت صفقة ${d.id} على ${u.code}`);
    A.notify(A.ruleTo(st.leadRules.close.notify, l), `${A.suspicious(d) ? "Alarm: " : ""}Done Deal جديدة ${d.id} مستنية مراجعتك · ${d.company}`);
    if (d.sellers.length) A.notify(["inventory"], `الصفقة ${d.id}: ${A.person(d.sellers[0])} Seller (Agent ${u.code}) · محتاج موافقتك`);
    A.closeModal(); A.toast(A.suspicious(d) ? "اتسجّلت · Alarm للـ Office Manager: اتسجّلت وقت القفل، هتتحسب بس خارج التارجت" : "اتسجّلت ومستنية مراجعة الـ Office Manager"); A.render();
  };
})();
