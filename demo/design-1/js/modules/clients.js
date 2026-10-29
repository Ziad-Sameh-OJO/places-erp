/* M-10 Clients & owners · M-11 contracts, renewals & collections · M-12 reports, targets & KPIs. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };

  /* one record per person: deal clients + unit owners, keyed by phone */
  function people() {
    const st = S(), map = {};
    const put = (key, o) => { map[key] = Object.assign(map[key] || { kinds: [], deals: [], units: [], phones: [] }, o, { kinds: [...new Set([...(map[key] ? map[key].kinds : []), ...o.kinds])] }); };
    st.deals.forEach((d) => { const l = st.leads.find((x) => x.id === d.lead) || st.leads.find((x) => x.name === d.client) || {}; const key = A.normPhone((l.phones || [])[0]) || d.client; put(key, { key, name: d.client, kinds: ["عميل"], phones: l.phones || [], company: l.company || "" }); map[key].deals.push(d.id); });
    st.units.forEach((u) => { const nm = u.contact || u.owner || u.name, ph = u.number; if (!nm) return; const key = A.normPhone(ph) || nm; put(key, { key, name: nm, kinds: ["مالك"], phones: [ph] }); if (!map[key].units.includes(u.code)) map[key].units.push(u.code); });
    return Object.values(map);
  }
  A.clientList = () => people();
  V.clients = {
    sub: () => "ملف واحد لكل عميل ومالك · كل التعامل معاه في مكان واحد",
    render() {
      const f = ui("clF") || "", q = (ui("clQ") || "").toLowerCase();
      let list = people(); if (f) list = list.filter((p) => p.kinds.includes(f)); if (q) list = list.filter((p) => (p.name + p.phones.join(" ") + p.company).toLowerCase().includes(q));
      const all = people();
      return `<div class="kpis">${U.kpi("العملاء", all.filter((p) => p.kinds.includes("عميل")).length, "عملوا صفقة", "handshake")}${U.kpi("الملاك", all.filter((p) => p.kinds.includes("مالك")).length, "عندنا وحداتهم", "building", "ok")}${U.kpi("ملاك محتاجين ابديت", all.filter((p) => p.units.some((c) => { const u = S().units.find((x) => x.code === c); return u && A.stale(u); })).length, "last update أكتر من شهر", "clock", "bad")}${U.kpi("عميل ومالك", all.filter((p) => p.kinds.length > 1).length, "نفس الشخص", "users", "warn")}</div>
        <div class="toolbar"><label class="search">${I("search")}<input type="search" id="cl-q" placeholder="الاسم، الرقم، الشركة" value="${esc(ui("clQ") || "")}" data-change="clQ"></label>${U.seg("clF", [["", "الكل"], ["عميل", "عملاء"], ["مالك", "ملاك"]], f)}<span class="spacer"></span>${U.exportBtn("clients", "العملاء والملاك")}</div>
        ${table(["الاسم", "النوع", "الأرقام", "الوحدات", "الصفقات", "آخر تواصل"], list.map((p) => { const last = S().interactions.filter((x) => x.key === p.key).slice(-1)[0]; return `<tr class="click" data-act="clOpen" data-k="${esc(p.key)}"><td><b>${esc(p.name)}</b>${p.company ? `<span class="sub">${esc(p.company)}</span>` : ""}</td><td><div class="row">${p.kinds.map((k) => chip(k === "عميل" ? "acc" : "ok", k)).join("")}</div></td><td class="mono">${p.phones.map(esc).join(" · ")}</td><td class="n">${p.units.length}</td><td class="n">${p.deals.length}</td><td>${last ? A.ago(last.at) : "—"}</td></tr>`; }))}
        ${note("العميل بيتعمل أوتوماتيك أول ما ليد يوصل Done Deal، والمالك مع أول وحدة ليه. والرقم بيمنع إن نفس الشخص يتسجّل مرتين.")}`;
    }
  };
  A.CHANGE.clQ = (v) => { ui("clQ", v); A.render(); };
  A.ACT.clF = (d) => { ui("clF", d.v); A.render(); };
  A.ACT.clOpen = (d) => A.openDrawer(() => clDrawer(d.k));
  function clDrawer(key) {
    const st = S(), p = people().find((x) => x.key === key); if (!p) return "";
    const deals = st.deals.filter((d) => p.deals.includes(d.id)), units = st.units.filter((u) => p.units.includes(u.code)), conts = st.contracts.filter((c) => p.deals.includes(c.deal));
    const due = deals.filter((d) => d.status !== "Cancelled").reduce((s, d) => s + Math.max(0, A.placesComm(d) - A.collected(d)), 0);
    const tl = [...st.interactions.filter((x) => x.key === key).map((x) => ({ at: x.at, t: `${x.kind}: ${x.text}`, by: x.by })), ...deals.map((d) => ({ at: d.closed, t: `صفقة ${d.id} على ${d.unit} · ${A.money(d.value)}`, by: d.sales })), ...units.map((u) => ({ at: u.lastUpdate + "T12:00:00", t: `ابديت ${u.code} · ${u.project}`, by: u.agent }))].sort((a, b) => b.at.localeCompare(a.at));
    const body = `${kv([["النوع", p.kinds.join(" + ")], ["الأرقام", p.phones.map((x) => `<span class="mono">${esc(x)}</span>`).join("<br>")], ["الشركة", esc(p.company || "—")], ["الوحدات", units.length], ["الصفقات", deals.length], ["عليه", A.money(due)]])}
      ${units.length ? `<section class="card flat">${head("وحداته", "building")}${units.map((u) => `<div class="line-item"><span><b class="mono">${u.code}</b> · ${esc(u.project)} · ${A.num(u.space)} م</span>${A.stale(u) ? chip("bad", "محتاجة ابديت") : chip("ok", A.fmtDate(u.lastUpdate))}<button class="btn ghost sm" data-act="unitOpen" data-code="${u.code}">افتح</button></div>`).join("")}</section>` : ""}
      ${conts.length ? `<section class="card flat">${head("العقود", "file")}${conts.map((c) => `<div class="line-item"><span><b class="mono">${c.id}</b> · ينتهي ${A.fmtDate(c.end)}</span><button class="btn ghost sm" data-act="ctOpen" data-id="${c.id}">افتح</button></div>`).join("")}</section>` : ""}
      <form class="card flat" data-form="clLog"><input type="hidden" name="key" value="${esc(key)}">${head("سجّل تواصل", "phone")}<div class="row"><select name="kind" id="cl-k">${["مكالمة", "زيارة", "طلب", "شكوى", "ابديت مع المالك"].map((x) => opt(x)).join("")}</select><input name="text" id="cl-t" required placeholder="التفاصيل"><button class="btn ghost">${I("plus")}سجّل</button></div></form>
      <h4 class="mini-h">التاريخ كله</h4><div class="timeline">${tl.map((x) => `<div>${esc(x.t)}<small>${esc(A.person(x.by))} · ${A.fmtDate(x.at)}</small></div>`).join("") || U.empty("مفيش", "clock")}</div>`;
    return U.drawer(p.name, `ملف ${p.kinds.join(" + ")}`, p.kinds.map((k) => chip(k === "عميل" ? "acc" : "ok", k)).join(""), body);
  }
  A.FORM.clLog = (f) => { S().interactions.push({ key: f.key, kind: f.kind, text: f.text, at: A.nowIso(), by: A.me() }); if (f.kind === "ابديت مع المالك") { const p = people().find((x) => x.key === f.key); S().units.filter((u) => p.units.includes(u.code)).forEach((u) => (u.lastUpdate = A.today())); } A.toast("اتسجّل"); A.render(); };

  /* ---------- M-11 contracts ---------- */
  const paidOf = (c) => c.paidAmt || 0; // the tenant's / buyer's installments, separate from Places' commission collection
  const instRows = (c) => { let left = paidOf(c); return c.inst.map((x) => { const paid = Math.min(left, x.amount); left -= paid; const st_ = paid >= x.amount ? "paid" : paid > 0 ? "partial" : x.due < A.today() ? "late" : "due"; return Object.assign({}, x, { paid, st: st_ }); }); };
  const daysLeft = (c) => Math.round((new Date(c.end) - A.NOW()) / 864e5);
  V.contracts = {
    sub: () => "العقود · تنبيهات التجديد 90/60/30 · الأقساط والمتأخرات · الفواتير",
    render() {
      const st = S(), cs = st.contracts, ren = cs.filter((c) => daysLeft(c) <= 90 && daysLeft(c) >= 0 && c.status === "Active");
      const late = cs.flatMap((c) => instRows(c).filter((x) => x.st === "late" || (x.st === "partial" && x.due < A.today())).map((x) => ({ c, x })));
      const aging = [[0, 30], [31, 60], [61, 90], [91, 9999]].map(([a, b]) => late.filter(({ x }) => { const dd = Math.round((A.NOW() - new Date(x.due)) / 864e5); return dd >= a && dd <= b; }).reduce((s, { x }) => s + x.amount - x.paid, 0));
      return `<div class="kpis">${U.kpi("عقود شغالة", cs.filter((c) => c.status === "Active").length, "إيجار وبيع", "file")}${U.kpi("قرّبت تخلص", ren.length, "خلال 90 يوم · فرصة تجديد", "clock", "warn")}${U.kpi("أقساط متأخرة", late.length, A.money(aging.reduce((s, x) => s + x, 0)), "alert", "bad")}${U.kpi("اتحصّل", A.money(cs.reduce((s, c) => s + paidOf(c), 0)), "من كل العقود", "wallet", "ok")}</div>
        ${ren.length ? `<section class="card attn">${head("تجديدات قرّبت", "bell")}${ren.map((c) => `<div class="line-item"><span><b>${esc(c.client)}</b> · ${c.unit} · ينتهي ${A.fmtDate(c.end)}</span>${chip(daysLeft(c) <= 30 ? "bad" : daysLeft(c) <= 60 ? "warn" : "info", `باقي ${daysLeft(c)} يوم`)}<button class="btn sm" data-act="ctRenew" data-id="${c.id}">${I("plus")}اعمل ليد تجديد</button></div>`).join("")}</section>` : ""}
        <div class="cols wide"><div>${table(["العقد", "العميل", "الوحدة", "البداية → النهاية", "القيمة", "اتحصّل", "الحالة"], cs.map((c) => `<tr class="click" data-act="ctOpen" data-id="${c.id}"><td class="mono">${c.id}</td><td>${esc(c.client)}</td><td class="mono">${c.unit}</td><td>${A.fmtDate(c.start)} → ${A.fmtDate(c.end)}</td><td class="n">${A.money(c.value)}</td><td><div class="cell-bar"><span class="num">${Math.round((paidOf(c) / c.value) * 100)}%</span>${U.bar((paidOf(c) / c.value) * 100)}</div></td><td>${chip(c.status === "Active" ? (daysLeft(c) <= 90 ? "warn" : "ok") : "", c.status === "Active" ? (daysLeft(c) <= 90 ? "قرّب يخلص" : "Active") : c.status)}</td></tr>`))}</div>
          <section class="card">${head("أعمار المديونيات (Aging)", "chart")}${U.hbars([["0–30 يوم", 0], ["31–60 يوم", 1], ["61–90 يوم", 2], ["+90 يوم", 3]].map(([l, i]) => ({ label: l, value: aging[i], tone: i >= 2 ? "bad" : i ? "warn" : "" })), (v) => A.money(v))}</section></div>`;
    }
  };
  A.ACT.ctOpen = (d) => A.openDrawer(() => ctDrawer(d.id));
  function ctDrawer(id) {
    const c = S().contracts.find((x) => x.id === id); if (!c) return "";
    const rows = instRows(c), dl = daysLeft(c);
    const body = `${dl <= 90 && dl >= 0 ? note(`العقد بينتهي بعد <b>${dl}</b> يوم. التنبيهات بتتبعت 90 و60 و30 يوم قبل النهاية.`, "warn") : ""}
      ${kv([["العميل", esc(c.client)], ["الوحدة", `<span class="mono">${c.unit}</span>`], ["النوع", esc(c.kind)], ["البداية", A.fmtDate(c.start)], ["النهاية", A.fmtDate(c.end)], ["القيمة", A.money(c.value)], ["الزيادة السنوية", c.escalation + "%"], ["قيمة السنة الجاية", A.money(c.value * (1 + c.escalation / 100))], ["ملف العقد", `${I("file")} ${esc(c.file)}`]])}
      <section class="card flat">${head("جدول الأقساط", "calendar")}${table(["الميعاد", "المبلغ", "المدفوع", "الحالة", ""], rows.map((x, i) => `<tr><td>${A.fmtDate(x.due)}</td><td class="n">${A.money(x.amount)}</td><td class="n">${A.money(x.paid)}</td><td>${chip({ paid: "ok", partial: "warn", late: "bad", due: "" }[x.st], { paid: "اتدفع", partial: "جزء", late: "متأخر", due: "لسه" }[x.st])}</td><td>${x.st === "paid" ? `<button class="btn ghost sm" data-act="invoice" data-id="${c.id}" data-i="${i}">${I("file")}إيصال</button>` : A.canDo("contracts", "edit") ? `<button class="btn sm" data-act="ctPay" data-id="${c.id}" data-i="${i}">سجّل دفعة</button>` : ""}</td></tr>`))}</section>
      ${A.canDo("contracts", "approve") && c.status === "Active" ? `<div class="row"><button class="btn ghost" data-act="ctRenew" data-id="${c.id}">${I("plus")}ليد تجديد</button><button class="btn ghost" data-act="ctEnd" data-id="${c.id}">${I("x")}فسخ العقد</button></div>` : ""}`;
    return U.drawer(`عقد ${c.id}`, `${c.client} · ${c.unit}`, chip(c.status === "Active" ? "ok" : "", c.status), body);
  }
  A.ACT.ctPay = (d) => { const c = S().contracts.find((x) => x.id === d.id), r = instRows(c)[+d.i], amt = r.amount - r.paid; c.paidAmt = (c.paidAmt || 0) + amt; A.audit("contracts", `دفعة ${A.money(amt)} على ${c.id}`); A.toast("الدفعة اتسجّلت على العقد"); A.render(); };
  A.ACT.invoice = (d) => { const c = S().contracts.find((x) => x.id === d.id), r = instRows(c)[+d.i]; A.openModal(`إيصال · ${c.id}`, `<div class="pdf"><div class="pdf-head"><span class="brand-mark sm">${I("file")}</span><div><b>Places · إيصال استلام</b><small>${A.fmtDate(A.nowIso())} · ${c.id}-${+d.i + 1}</small></div></div><div class="pdf-row"><div><b>${esc(c.client)}</b><small>الوحدة ${c.unit} · قسط ${+d.i + 1} من ${c.inst.length}</small></div><b class="num">${A.money(r.amount)}</b></div><p class="hint">الإيصال بيتعمل أوتوماتيك. لو مطلوب فاتورة إلكترونية (ETA) اتطبع من هنا.</p></div><div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع / PDF</button></div>`); };
  A.ACT.ctRenew = (d) => { const st = S(), c = st.contracts.find((x) => x.id === d.id), old = st.leads.find((l) => l.name === c.client) || {}; const l = { id: "L-" + st.leadSeq++, name: c.client, company: old.company || "", phones: old.phones || ["—"], area: old.area || "", type: c.kind, space: old.space || 0, condition: old.condition || "", budget: c.value * (1 + c.escalation / 100), channel: "Referral", campaign: "", post: "", sales: (st.deals.find((x) => x.id === c.deal) || {}).sales || A.activeSales()[0], stage: "Fresh", created: A.nowIso(), note: `تجديد العقد ${c.id} · ينتهي ${c.end}`, comments: [], visits: [], answers: {}, noAnswer: 0, rotation: 1, everInterested: false, owner: "sales", tlFlag: "", activity: 0 }; A.log(l, `ليد تجديد من العقد ${c.id}`, "system"); st.leads.unshift(l); A.toast(`اتعمل ليد تجديد لـ ${A.person(l.sales)}`); A.render(); };
  A.ACT.ctEnd = (d) => { const st = S(), c = st.contracts.find((x) => x.id === d.id), u = st.units.find((x) => x.code === c.unit); c.status = "اتفسخ"; if (u) u.status = "available"; A.audit("contracts", `العقد ${c.id} اتفسخ · الوحدة رجعت متاحة`); A.toast("العقد اتفسخ · الوحدة رجعت متاحة في الانفنتوري"); A.render(); };

  /* ---------- M-12 reports & KPIs ---------- */
  V.reports = {
    sub: () => "التارجت الشهري · KPIs لكل وظيفة · تقارير متجدولة · تصدير",
    render() {
      const st = S(), t = ui("rpTab") || "targets", ed = A.canDo("reports", "edit");
      let body = "";
      if (t === "targets") {
        // a salesperson's target counts their share of each deal's commission (M-02); Transactions = deals their name is on, after collection
        const rows = A.sales().map((s) => { const tg = Object.assign({ deals: 1, visits: 1 }, st.targets[s.id], { value: A.targetGoal(s.id) || 1 }), v = A.targetOf(s.id), vis = st.leads.filter((l) => l.sales === s.id).reduce((x, l) => x + l.visits.filter((y) => y.done).length, 0); return { s, tg, v, n: A.transactions(s.id), vis, pct: (v / tg.value) * 100 }; });
        const dayPct = (new Date(A.NOW()).getDate() / 30) * 100;
        body = `${note(`النهارده عدّى <b>${Math.round(dayPct)}%</b> من الشهر. اللي تحت المعدل ده بيوصل للـ TL بتاعه تنبيه.`)}
          ${table(["السيلز", "التارجت (نصيبه من الكوميشن)", "دخل في التارجت", "", "Transactions", "زيارات", ""], rows.map((x) => `<tr><td>${A.who(x.s.id)}</td><td>${ed ? `<input type="number" value="${x.tg.value}" data-change="tgSet" data-id="${x.s.id}" style="max-width:140px">` : A.money(x.tg.value)}</td><td class="n">${A.money(x.v)}</td><td><div class="cell-bar"><b class="num">${Math.round(x.pct)}%</b>${U.bar(x.pct, x.pct < dayPct * 0.6 ? "bad" : x.pct < dayPct ? "warn" : "")}</div></td><td class="n">${x.n} / ${x.tg.deals}</td><td class="n">${x.vis} / ${x.tg.visits}</td><td>${x.pct < dayPct * 0.6 ? chip("bad", "تحت المعدل") : x.pct >= 100 ? chip("ok", "حقق التارجت") : ""}</td></tr>`))}`;
      }
      if (t === "kpis") {
        const leads = st.leads, q = leads.filter((l) => l.everInterested).length, done = leads.filter((l) => l.stage === "Done Deal").length;
        const firstResp = Math.round(leads.filter((l) => l.comments.length).reduce((s, l) => s + Math.max(0, (new Date(l.comments[0].at) - new Date(l.created)) / 60000), 0) / Math.max(1, leads.filter((l) => l.comments.length).length));
        const upd = st.units.filter((u) => u.status === "available"), fresh = upd.filter((u) => !A.stale(u)).length;
        const att = st.attendance.filter((a) => a.day.startsWith(A.today().slice(0, 7))).map(A.attRow), onTime = att.filter((x) => x.status === "في الميعاد").length;
        const tk = st.tickets.filter((x) => x.firstReply);
        body = `${A.kpiBoard()}<h3 class="mini-h">مؤشرات عامة من السيستم</h3><div class="kpi-groups">
          <section class="card">${head("المبيعات", "users")}<div class="kpis sm">${U.kpi("Conversion", ((done / Math.max(1, q)) * 100).toFixed(1) + "%", "Done Deal ÷ Qualified", "trend")}${U.kpi("متوسط أول رد", A.num(firstResp) + " د", "من دخول الليد", "clock", "warn")}${U.kpi("Qualified", ((q / leads.length) * 100).toFixed(0) + "%", "من كل الليدز", "star", "ok")}</div></section>
          <section class="card">${head("الانفنتوري (منار ورندا)", "building")}<div class="kpis sm">${U.kpi("ابديت الشهر ده", Math.round((fresh / Math.max(1, upd.length)) * 100) + "%", `${fresh} من ${upd.length} وحدة`, "check", fresh / upd.length > 0.8 ? "ok" : "warn")}${U.kpi("وحدات جديدة", st.units.filter((u) => u.created >= A.today().slice(0, 7) + "-01").length, "الشهر ده", "plus")}</div></section>
          <section class="card">${head("التسويق", "megaphone")}<div class="kpis sm">${U.kpi("تكلفة الليد", A.money(st.campaigns.reduce((s, c) => s + c.spent, 0) / Math.max(1, leads.filter((l) => l.campaign).length)), "صرف ÷ ليدز", "wallet")}${U.kpi("تكلفة الـ Qualified", A.money(st.campaigns.reduce((s, c) => s + c.spent, 0) / Math.max(1, leads.filter((l) => l.campaign && l.everInterested).length)), "", "star", "warn")}</div></section>
          <section class="card">${head("الـ HR والتذاكر", "id")}<div class="kpis sm">${U.kpi("الحضور في الميعاد", Math.round((onTime / Math.max(1, att.length)) * 100) + "%", "الشهر ده", "fingerprint", "ok")}${U.kpi("وقت رد التذاكر", A.num(Math.round(tk.reduce((s, x) => s + (new Date(x.firstReply) - new Date(x.created)) / 60000, 0) / Math.max(1, tk.length))) + " د", "متوسط", "ticket")}</div></section></div>`;
      }
      if (t === "tl") {
        // voice note 6: who is on each Team Leader's team, the team target (sum of its salespeople's), how much is achieved, and the TL's tier
        const tls = st.people.filter((p) => p.role === "tl"), canSet = A.canDo("reports", "edit"), tiers = (st.tlTiers || []).slice().sort((a, b) => a.upTo - b.upTo);
        body = `${tls.map((p) => { const x = A.tlStats(p.id), L = (st.people.find((m) => m.tl === p.id && m.team) || {}).team; return `<section class="card">${head(L ? `فريق ${L} · ${p.name}` : p.name, "users", chip(x.pct >= 100 ? "ok" : x.pct >= 70 ? "info" : "warn", `${Math.round(x.pct)}% · شريحة ${x.tier.pct}%`), `${x.team.length} سيلز · تارجت الفريق ${A.money(x.goal)}`)}
            ${table(["السيلز", "التارجت", "دخل في التارجت", "النسبة"], x.team.map((id) => { const g = A.targetGoal(id), v = A.targetOf(id); return `<tr><td>${A.who(id)}</td><td class="n">${A.money(g)}</td><td class="n">${A.money(v)}</td><td><div class="cell-bar"><b class="num">${g ? Math.round((v / g) * 100) : 0}%</b>${U.bar(g ? (v / g) * 100 : 0)}</div></td></tr>`; }))}
            <div class="kpis sm">${U.kpi("تارجت الفريق", A.money(x.goal), "مجموع تارجت السيلز", "trend")}${U.kpi("الفريق محقق", A.money(x.got), `${Math.round(x.pct)}% من تارجت الفريق`, "check", x.pct >= 70 ? "ok" : "warn")}${U.kpi("نسبة الـ TL", x.tier.pct + "%", "من نصيب كل سيلز في فريقه", "star")}${U.kpi("عمولة الـ TL", A.money(x.comm), "لحد دلوقتي", "wallet", "ok")}</div></section>`; }).join("")}
          <div class="cols"><section class="card">${head("شرايح الـ Scheme بتاعة الـ TL", "chart", "", "حسب نسبة تحقيق تارجت الفريق")}${table(["لو الفريق محقق أقل من", "نسبة الـ TL", ""], tiers.map((t, i) => `<tr><td>${canSet ? `<input type="number" value="${t.upTo >= 100000 ? "" : t.upTo}" placeholder="وأكتر" data-change="tierSet" data-i="${i}" data-k="upTo" style="max-width:110px">` : t.upTo >= 100000 ? "وأكتر" : t.upTo + "%"}</td><td>${canSet ? `<input type="number" value="${t.pct}" data-change="tierSet" data-i="${i}" data-k="pct" style="max-width:90px">` : t.pct + "%"}</td><td>${canSet && tiers.length > 1 ? `<button class="btn ghost sm" data-act="tierDel" data-i="${i}">${I("x")}</button>` : ""}</td></tr>`))}${canSet ? `<div class="row end"><button class="btn ghost sm" data-act="tierAdd">${I("plus")}شريحة</button></div>` : ""}</section>
          <section class="card">${head("مين مع مين", "id", "", "كل سيلز مع أنهي Team Leader")}${table(["السيلز", "الـ Team Leader"], A.sales().map((sl) => `<tr><td>${A.who(sl.id)}</td><td>${canSet ? `<select data-change="teamSet" data-id="${sl.id}">${tls.map((p) => opt(p.id, p.name, sl.tl)).join("")}</select>` : esc(A.person(sl.tl))}</td></tr>`))}</section></div>`;
      }
      if (t === "pdf") {
        // voice note 8: an automatic sheet per salesperson every quarter, sent by email after the Office Manager approves
        const q = quarter(), rec = (st.statements || {})[q.key], F = st.pdfFields || [], canMake = A.canDo("reports", "create");
        body = `${note(`ورقة كل سيلز بتتعمل أوتوماتيك كل Quarter بالخانات اللي متعلّمة تحت، ومابتتبعتش على الإيميل غير بعد موافقة الـ Office Manager.`)}
          <div class="cols"><section class="card">${head(`ورق ${q.label}`, "file", rec ? chip(rec.status === "sent" ? "ok" : "warn", rec.status === "sent" ? "اتبعت على الإيميل" : "مستني موافقة الـ Office Manager") : chip("", "لسه ماتعملش"))}
            ${rec ? table(["السيلز", "الإيميل", ""], A.sales().map((sl) => `<tr><td>${A.who(sl.id)}</td><td class="mono">${esc(((st.users || []).find((u) => u.id === sl.id) || {}).email || "—")}</td><td><button class="btn ghost sm" data-act="pdfView" data-id="${sl.id}">${I("file")}افتح الورقة</button></td></tr>`)) : `<p class="hint">اعمل ورق الـ Quarter عشان تتراجع.</p>`}
            <div class="row end">${!rec && canMake ? `<button class="btn" data-act="pdfMake">${I("file")}اعمل ورق الـ Quarter</button>` : ""}${rec && rec.status === "draft" && A.canDo("reports", "approve") ? `<button class="btn" data-act="pdfApprove">${I("send")}موافقة وابعت على الإيميل</button>` : ""}</div></section>
          <section class="card">${head("الخانات اللي في الورقة", "filter")}${[["salary", "المرتب"], ["target", "التارجت"], ["achieved", "دخل في التارجت"], ["scheme", "الـ Scheme %"], ["commission", "العمولة"], ["transactions", "الـ Transactions"], ["bonus", "الجوايز"]].map(([k, l]) => `<label class="tog"><input type="checkbox" ${F.includes(k) ? "checked" : ""} ${canMake ? "" : "disabled"} data-change="pdfField" data-k="${k}">${l}</label>`).join("")}
            <h4 class="mini-h">الجوايز</h4>${table(["لو حقق من التارجت", "الجايزة", ""], (st.bonuses || []).map((b, i) => `<tr><td class="n">${b.minPct}%</td><td class="n">${A.money(b.amount)}</td><td>${canMake ? `<button class="btn ghost sm" data-act="bonusDel" data-i="${i}">${I("x")}</button>` : ""}</td></tr>`))}${canMake ? `<form class="row" data-form="bonusAdd"><input name="minPct" type="number" min="1" placeholder="% من التارجت" required style="max-width:120px"><input name="amount" type="number" min="1" placeholder="الجايزة" required style="max-width:120px"><button class="btn ghost sm">${I("plus")}ضيف</button></form>` : ""}</section></div>`;
      }
      if (t === "sched") body = `${table(["التقرير", "كل قد إيه", "لمين", "الشكل", ""], st.schedReports.map((r, i) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.every)}</td><td><div class="avs">${r.to.map((id) => A.avatar(id, 1)).join("")}</div></td><td>${chip("", r.fmt, 1)}</td><td><button class="btn ghost sm" data-act="rpRun" data-i="${i}">${I("send")}ابعته دلوقتي</button></td></tr>`))}
        ${A.canDo("reports", "create") ? `<form class="row" data-form="srAdd"><input name="name" id="sr-n" placeholder="اسم التقرير" required><select name="every" id="sr-e">${["كل يوم 9 الصبح", "كل أحد", "أول كل شهر", "كل Quarter"].map((x) => opt(x)).join("")}</select><select name="fmt" id="sr-f">${opt("PDF")}${opt("Excel")}</select><button class="btn ghost">${I("plus")}جدوِل</button></form>` : ""}`;
      return `<div class="row">${U.tabs("rpTab", [["targets", "التارجت والـ Transactions"], ["tl", "الـ Team Leaders"], ["pdf", "ورقة الموظف (PDF)"], ["kpis", "الـ KPIs"], ["sched", "تقارير متجدولة", st.schedReports.length]], t)}<span class="spacer"></span>${U.exportBtn("deals", "الصفقات")}${U.exportBtn("leads", "الليدز")}</div>${body}`;
    }
  };
  A.ACT.rpTab = (d) => { ui("rpTab", d.v); A.render(); };
  A.CHANGE.tgSet = (v, el) => { S().targets[el.dataset.id].value = +v; (S().employees.find((e) => e.id === el.dataset.id) || {}).target = +v; A.audit("reports", `تارجت ${A.person(el.dataset.id)} بقى ${v}`); A.toast("التارجت اتحفظ"); A.render(); };
  const quarter = () => { const d = new Date(A.NOW()), q = Math.floor(d.getMonth() / 3) + 1; return { key: `${d.getFullYear()}-Q${q}`, label: `Q${q} ${d.getFullYear()}` }; };
  A.CHANGE.tierSet = (v, el) => { const t = S().tlTiers[+el.dataset.i]; t[el.dataset.k] = el.dataset.k === "upTo" && v === "" ? 100000 : +v; A.audit("reports", "شرايح الـ TL اتعدّلت"); A.render(); };
  A.ACT.tierAdd = () => { S().tlTiers.push({ upTo: 90, pct: 5 }); A.render(); };
  A.ACT.tierDel = (d) => { S().tlTiers.splice(+d.i, 1); A.render(); };
  A.CHANGE.teamSet = (v, el) => { const p = S().people.find((x) => x.id === el.dataset.id), e = S().employees.find((x) => x.id === el.dataset.id); A.audit("reports", `${p.name} اتنقل لفريق ${A.person(v)}`); p.tl = v; if (e) e.tl = v; A.toast(`${p.name} بقى في فريق ${A.person(v)}`); A.render(); };
  A.CHANGE.pdfField = (v, el) => { const st = S(), F = (st.pdfFields = st.pdfFields || []), i = F.indexOf(el.dataset.k); if (v && i < 0) F.push(el.dataset.k); if (!v && i >= 0) F.splice(i, 1); };
  A.FORM.bonusAdd = (f) => { (S().bonuses = S().bonuses || []).push({ minPct: +f.minPct, amount: +f.amount }); A.render(); };
  A.ACT.bonusDel = (d) => { S().bonuses.splice(+d.i, 1); A.render(); };
  const sheetOf = (id) => { const st = S(), e = st.employees.find((x) => x.id === id) || {}, g = A.targetGoal(id), v = A.targetOf(id), pct = g ? (v / g) * 100 : 0, bonus = (st.bonuses || []).filter((b) => pct >= b.minPct).reduce((s, b) => Math.max(s, b.amount), 0); return { salary: A.money(e.salary || 0), target: A.money(g), achieved: `${A.money(v)} · ${Math.round(pct)}%`, scheme: (e.commissionPct || 0) + "%", commission: A.money(st.deals.filter(A.countsRevenue).reduce((s, d) => s + A.salesComm(d, id), 0)), transactions: A.transactions(id), bonus: bonus ? A.money(bonus) : "—" }; };
  A.ACT.pdfMake = () => { const st = S(), q = quarter(); (st.statements = st.statements || {})[q.key] = { status: "draft", at: A.nowIso(), by: A.me() }; A.audit("reports", `اتعمل ورق ${q.label}`); A.notify(["officemgr"], `ورق ${q.label} للسيلز جاهز · مستني موافقتك`); A.toast("الورق اتعمل · مستني موافقة الـ Office Manager"); A.render(); };
  A.ACT.pdfApprove = () => { const st = S(), q = quarter(), rec = st.statements[q.key]; rec.status = "sent"; rec.approvedBy = A.me(); const L = { salary: "المرتب", target: "التارجت", achieved: "دخل في التارجت", scheme: "الـ Scheme %", commission: "العمولة", transactions: "الـ Transactions", bonus: "الجوايز" };
    A.sales().forEach((sl) => { const u = (st.users || []).find((x) => x.id === sl.id); if (!u || u.status !== "active") return; const x = sheetOf(sl.id); A.sendMail(u.email, `ورقتك بتاعة ${q.label} · Places`, (st.pdfFields || []).map((k) => `${L[k]}: ${x[k]}`).join(" · "), { kind: "statement" }); }); A.audit("reports", `الـ Office Manager وافقت على ورق ${q.label} · اتبعت على الإيميل`); A.notify(["sales"], `ورقتك بتاعة ${q.label} اتبعتت على إيميلك`); A.toast(`اتبعت ورق ${q.label} لكل السيلز على الإيميل`); A.render(); };
  A.ACT.pdfView = (d) => { const F = S().pdfFields || [], x = sheetOf(d.id), L = { salary: "المرتب", target: "التارجت", achieved: "دخل في التارجت", scheme: "الـ Scheme %", commission: "العمولة", transactions: "الـ Transactions", bonus: "الجوايز" }; A.openModal(`ورقة ${A.person(d.id)} · ${quarter().label}`, `<div class="pdf"><div class="pdf-head"><span class="brand-mark sm">${I("file")}</span><div><b>Places · ${esc(A.person(d.id))}</b><small>${quarter().label}</small></div></div>${F.map((k) => `<div class="pdf-row"><div><b>${L[k]}</b></div><b class="num">${esc(String(x[k]))}</b></div>`).join("")}</div><div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع / PDF</button></div>`); };
  A.ACT.rpRun = (d) => { const r = S().schedReports[+d.i]; A.notify(["admin"], `اتبعت تقرير «${r.name}» (${r.fmt})`); A.toast(`اتبعت «${r.name}» لـ ${r.to.map(A.person).join("، ")}`); };
  A.FORM.srAdd = (f) => { S().schedReports.push({ id: "SR-" + Date.now(), name: f.name, every: f.every, to: [A.me()], fmt: f.fmt }); A.render(); };
})();
