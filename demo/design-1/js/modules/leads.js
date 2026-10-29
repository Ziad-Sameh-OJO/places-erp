/* M-01 Leads & Telesales + routing settings. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const campName = (id) => (S().campaigns.find((c) => c.id === id) || {}).name || "—";
  const LVL = { "Fresh": "info", "Not Interested": "bad", "No Answer": "warn", "Done Deal": "ok", "Cancellation": "bad", "Hold": "" };
  const stageChip = (s) => chip(LVL[s] == null ? "acc" : LVL[s], s);
  const PIPE = ["Fresh", "Interested", "Follow up to Visit", "Visit", "Follow up after Visit", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal"];
  const visible = () => {
    const r = A.role, m = A.me();
    return S().leads.filter((l) => {
      if (l.archived) return false;
      if (r === "sales") return l.sales === m && l.owner !== "telesales";
      if (r === "telesales") return l.owner === "telesales"; // a lead she sent to sales leaves her list
      if (r === "tl") return A.S.people.find((p) => p.id === l.sales && p.tl === m) || l.owner === "telesales" ? true : false;
      return true;
    });
  };
  function filtered() {
    const f = ui("lf") || {};
    let list = visible();
    if (f.stage) list = list.filter((l) => l.stage === f.stage);
    if (f.channel) list = list.filter((l) => l.channel === f.channel);
    if (f.campaign) list = list.filter((l) => l.campaign === f.campaign);
    if (f.sales) list = list.filter((l) => l.sales === f.sales);
    if (f.area) list = list.filter((l) => l.area === f.area);
    if (f.qual) list = list.filter((l) => (f.qual === "yes") === !!l.everInterested);
    if (f.from) list = list.filter((l) => l.created.slice(0, 10) >= f.from);
    if (f.to) list = list.filter((l) => l.created.slice(0, 10) <= f.to);
    if (f.q) { const q = f.q.toLowerCase(), qd = A.normPhone(f.q); list = list.filter((l) => (l.name + " " + l.company + " " + l.id).toLowerCase().includes(q) || (qd.length > 3 && l.phones.some((p) => A.normPhone(p).includes(qd)))); }
    return list.sort((a, b) => (a.stage === "Fresh") === (b.stage === "Fresh") ? b.created.localeCompare(a.created) : a.stage === "Fresh" ? -1 : 1);
  }

  V.leads = {
    sub: () => "Create lead · توزيع بالـ area · SLA · المراحل · Qualified · روتيشن No Answer",
    render() {
      const st = S(), r = A.role, f = ui("lf") || {}, mode = ui("lmode") || "list";
      const all = visible(), list = filtered(), qn = all.filter((l) => l.everInterested).length;
      const pendBulk = st.bulk.filter((b) => b.status === "pending"), pendNew = st.leads.filter((l) => l.newLeadReq === "pending"), dupes = st.dupes || [];
      const approvals = A.canDo("leads", "approve") && (pendBulk.length || pendNew.length || dupes.length) ? `<section class="card attn">${head("طلبات مستنية الأوبريشن", "alert", chip("warn", pendBulk.length + pendNew.length + dupes.length))}
        ${dupes.map((x) => `<div class="line-item"><span>${I("users")}عميل مكرر: <b>${esc(x.data.name)}</b> دخّله ${esc(A.person(x.by))} · موجود في ${x.lead}</span><button class="btn sm" data-act="dupeReview" data-id="${x.id}">قرّري</button></div>`).join("")}
        ${pendBulk.map((b) => `<div class="line-item"><span>${I("upload")}إدخال جماعي من Telesales: <b class="num">${b.numbers.length}</b> رقم · ${esc(b.channel)} / ${esc(campName(b.campaign))}</span><button class="btn sm" data-act="bulkReview" data-id="${b.id}">راجع التوزيع</button></div>`).join("")}
        ${pendNew.map((l) => `<div class="line-item"><span>${I("send")}Telesales بعتت <b>${esc(l.name)}</b> كـ New Lead (بقى Interested)</span><button class="btn sm" data-act="newLeadDecide" data-id="${l.id}">قرّر</button></div>`).join("")}</section>` : "";
      const tele = r === "telesales" && st.pendingCompanies.length ? note(`فيه ${st.pendingCompanies.length} شركة جديدة محتاجة تتضاف لشيت الشركات. <button class="btn sm" data-act="companies">افتح شيت الشركات</button>`, "warn") : "";
      const camps = st.campaigns.filter((c) => !f.channel || c.channel === f.channel);
      const nFilters = ["stage", "channel", "campaign", "sales", "area", "qual", "from", "to", "q"].filter((k) => f[k]).length;
      // KPI data: verification calls (Heba checks 10% of the week's new leads) and each person's own call count
      const wk = new Date(A.NOW() - 7 * 864e5).toISOString(), newWk = st.leads.filter((l) => l.created >= wk && l.sales), need = Math.ceil(newWk.length * 0.1), sample = newWk.slice().sort((x, y) => x.id.localeCompare(y.id)).slice(0, Math.max(need, newWk.filter((l) => l.verify).length));
      const verifyCard = ["ops", "admin"].includes(r) && newWk.length ? `<section class="card">${head("مكالمات التحقق (Second Calls)", "phone", chip(sample.filter((l) => l.verify).length >= need ? "ok" : "warn", `${sample.filter((l) => l.verify).length} من ${need}`), `10% من الليدز الجديدة الأسبوع ده (${newWk.length} ليد): السيلز كلّم العميل؟ وبعتله اللي محتاجه؟`)}
        ${sample.map((l) => `<div class="line-item"><span><button class="link" data-act="leadOpen" data-id="${l.id}"><b>${esc(l.name)}</b></button> · ${esc(A.person(l.sales))}</span>${l.verify ? `${chip(l.verify.called ? "ok" : "bad", l.verify.called ? "كلّمه" : "مكلّموش")}${chip(l.verify.sent ? "ok" : "bad", l.verify.sent ? "بعتله" : "مبعتلوش")}` : `<button class="btn ghost sm" data-act="verifyCall" data-id="${l.id}" data-v="11">كلّمه وبعتله</button><button class="btn ghost sm" data-act="verifyCall" data-id="${l.id}" data-v="10">كلّمه بس</button><button class="btn ghost sm" data-act="verifyCall" data-id="${l.id}" data-v="00">مكلّموش</button>`}</div>`).join("")}</section>` : "";
      const myCalls = (days) => { const t = new Date(A.NOW() - days * 864e5).toISOString(); return st.leads.reduce((n, l) => n + l.comments.filter((c) => c.by === A.uid && c.text === "مكالمة اتسجّلت" && c.at >= t).length, 0); };
      const listBtn = r === "tl" ? `<div class="row end"><button class="btn ghost sm" data-act="listReqs">${I("list")}اطلب List من الانفنتوري</button></div>` : "";
      const calls = ["telesales", "sales", "tl"].includes(r) ? note(r === "telesales" ? `مكالماتك النهارده: <b>${myCalls(1)}</b> من 100 (بند في الـ KPIs بتاعتك).` : `مكالماتك آخر 7 أيام: <b>${myCalls(7)}</b> من 50 (بند Calls & Broadcast في الـ KPIs بتاعتك).`) : "";
      return `${approvals}${tele}${verifyCard}${calls}${listBtn}
        ${savedViews(f)}
        <div class="kpis">${U.kpi("كل الليدز", A.num(all.length), "في نطاقك · مقارنة بالأسبوع اللي فات", "users", "", "lfReset", U.trend(all, "created", 7))}${U.kpi("Fresh", A.num(all.filter((l) => l.stage === "Fresh").length), "لسه محدش كلّمهم", "sparkle")}${U.kpi("Qualified", A.num(qn), `${all.length ? Math.round((qn / all.length) * 100) : 0}% نسبة التأهيل`, "star", "ok")}${U.kpi("No Answer", A.num(all.filter((l) => l.stage === "No Answer").length), "بتتنقل بالروتيشن كل يوم", "clock", "warn")}</div>
        <div class="toolbar">
          <label class="search">${I("search")}<input id="lq" type="search" placeholder="اسم، موبايل، شركة، كود" value="${esc(f.q || "")}" data-change="lf" data-k="q" aria-label="بحث في الليدز"></label>
          <select id="lf-ch" data-change="lf" data-k="channel" aria-label="Channel">${opt("", "كل الـ channels", f.channel)}${st.channels.map((c) => opt(c, c, f.channel)).join("")}</select>
          <select id="lf-cp" data-change="lf" data-k="campaign" aria-label="Campaign">${opt("", "كل الكامبينز", f.campaign)}${camps.map((c) => opt(c.id, c.name, f.campaign)).join("")}</select>
          ${r !== "sales" ? `<select id="lf-s" data-change="lf" data-k="sales" aria-label="Sales">${opt("", "كل السيلز", f.sales)}${A.sales().map((s) => opt(s.id, s.name, f.sales)).join("")}</select>` : ""}
          <select id="lf-a" data-change="lf" data-k="area" aria-label="Area">${opt("", "كل المناطق", f.area)}${st.areas.map((a) => opt(a, a, f.area)).join("")}</select>
          <select id="lf-q" data-change="lf" data-k="qual" aria-label="Qualified">${opt("", "Qualified؟ الكل", f.qual)}${opt("yes", "Qualified بس", f.qual)}${opt("no", "مش Qualified", f.qual)}</select>
          <label class="date-f"><span>من</span><input id="lf-from" type="date" value="${esc(f.from || "")}" data-change="lf" data-k="from"></label>
          <label class="date-f"><span>لحد</span><input id="lf-to" type="date" value="${esc(f.to || "")}" data-change="lf" data-k="to"></label>
          ${nFilters ? `<button class="btn ghost sm" data-act="lfReset">${I("x")}مسح ${nFilters} فلتر</button>` : ""}
        </div>
        <div class="row">
          ${U.seg("lmode", [["list", "قايمة", "list"], ["board", "Kanban", "board"]], mode)}
          <span class="hint num">${list.length} ليد</span><span class="spacer"></span>
          ${r === "telesales" || A.canDo("leads", "import") ? `<button class="btn ghost" data-act="companies">${I("building")}شيت الشركات</button>` : ""}${A.canDo("leads", "import") ? `<button class="btn ghost" data-act="bulkNew">${I("upload")}إدخال جماعي (Import)</button>` : ""}
          ${U.exportBtn("leads", "الليدز")}${A.canDo("leads", "create") ? `<button class="btn" data-act="leadNew">${I("plus")}ليد جديد</button>` : ""}
        </div>
        ${mode === "board" ? board(list) : listView(list)}
        ${note(`الـ SLA ${S().holiday ? "<b>(وضع الإجازة)</b>: تنبيه للـ Team Leader بعد 22 ساعة، وسحب بعد 24 ساعة" : ": تنبيه للـ Team Leader بعد ساعتين ونص من غير أكشن، والليد بيتسحب أوتوماتيك بعد 3 ساعات للسيلز اللي عليه الدور"}. جرّب «تحكم الديمو» فوق عشان تقدّم الوقت.`)}`;
    }
  };
  function listView(list) {
    const pick = A.canDo("leads", "edit") || A.canDo("leads", "approve"), sel = A.ui.lsel || [];
    const all = pick && list.length && list.every((l) => sel.includes(l.id));
    return table([...(pick ? [`<input type="checkbox" data-change="lselAll" ${all ? "checked" : ""} aria-label="حدد الكل">`] : []), "الليد", "Area · Type", "Budget", "Channel · Campaign", "Sales", "Stage", "SLA"], list.map((l) => {
      const s = A.sla(l), on = sel.includes(l.id);
      return `<tr class="click ${on ? "selected" : ""}" data-act="leadOpen" data-id="${l.id}">${pick ? `<td class="pick" data-act="noop"><input type="checkbox" class="l-pick" data-id="${l.id}" data-change="lsel" ${on ? "checked" : ""} aria-label="حدد ${esc(l.name)}"></td>` : ""}
        <td><b>${esc(l.name)}</b><span class="sub">${l.company ? esc(l.company) + " · " : ""}<span class="mono">${l.id}</span>${l.tlFlag ? " · " + I("star") : ""}</span><span class="sub mono">${l.phones.map(esc).join(" · ")}</span></td>
        <td>${esc(l.area || "—")}<span class="sub">${esc(l.type)} · <span class="num">${A.num(l.space)}</span> م</span></td>
        <td class="n">${A.money(l.budget)}</td><td>${esc(l.channel)}<span class="sub">${esc(campName(l.campaign))}</span></td>
        <td>${A.who(l.sales)}${l.owner === "telesales" ? `<span class="sub">مع Telesales</span>` : ""}</td>
        <td><div class="row">${stageChip(l.stage)}${l.everInterested ? chip("ok", "Qualified") : ""}</div></td>
        <td>${s ? `<div class="sla ${s.level}"><span>${esc(s.text)}</span>${U.bar(s.pct, s.level === "ok" ? "" : s.level)}</div>` : `<span class="hint">${A.ago(l.created)}</span>`}</td></tr>`;
    }));
  }
  function board(list) {
    return `<div class="board leads-board">${S().stages.map((s) => { const items = list.filter((l) => l.stage === s); return `<div class="lane" data-drop="stage:${esc(s)}"><h4><i class="ld-${(LVL[s] == null ? "acc" : LVL[s]) || "neutral"}"></i>${esc(s)}<span class="num">${items.length}</span></h4>
      ${items.slice(0, 30).map((l) => { const sl = A.sla(l); return `<article class="tcard lead-card ${sl ? "sla-" + sl.level : ""}" draggable="true" data-drag="${l.id}" data-act="leadOpen" data-id="${l.id}"><div class="row"><b class="spacer">${esc(l.name)}</b>${l.everInterested ? I("star") : ""}</div><span class="hint">${esc(l.area || "—")} · ${esc(l.type)} · <span class="num">${A.num(l.space)}</span> م · ${A.short(l.budget)}</span><div class="row">${A.avatar(l.sales, 1)}<span class="hint spacer">${esc(l.channel)}</span>${sl ? chip(sl.level, sl.text) : `<span class="hint">${A.ago(l.created)}</span>`}</div></article>`; }).join("") || `<p class="lane-empty">اسحب ليد هنا</p>`}</div>`; }).join("")}</div>`;
  }
  // saved views: built-in presets + the user's own filters, per role
  const PRESETS = [["كل الليدز", {}], ["Fresh", { stage: "Fresh" }], ["Qualified", { qual: "yes" }], ["No Answer", { stage: "No Answer" }], ["Interested", { stage: "Interested" }]];
  const myViews = () => { const st = S(); st.savedViews = st.savedViews || {}; return (st.savedViews[A.role] = st.savedViews[A.role] || []); };
  const clean = (f) => JSON.stringify(Object.fromEntries(Object.entries(f || {}).filter(([, v]) => v).sort()));
  function savedViews(f) {
    const cur = clean(f), cnt = (vf) => visible().filter((l) => (!vf.stage || l.stage === vf.stage) && (!vf.qual || (vf.qual === "yes") === !!l.everInterested)).length;
    return `<div class="views-bar" role="toolbar" aria-label="العروض المحفوظة"><span class="lbl">العروض:</span>${PRESETS.map(([n, vf], i) => `<button class="vchip" data-act="lvGo" data-p="${i}" aria-pressed="${clean(vf) === cur}">${esc(n)}<b>${A.num(cnt(vf))}</b></button>`).join("")}${myViews().map((v, i) => `<button class="vchip" data-act="lvGo" data-u="${i}" aria-pressed="${clean(v.f) === cur}">${I("star")}${esc(v.name)}<span class="vx" data-act="lvDel" data-u="${i}" aria-label="امسح العرض">×</span></button>`).join("")}${cur !== "{}" && !PRESETS.concat(myViews().map((v) => [v.name, v.f])).some(([, vf]) => clean(vf) === cur) ? `<button class="vchip add" data-act="lvSave">${I("plus")}احفظ الفلتر ده كعرض</button>` : ""}</div>`;
  }
  A.ACT.lvGo = (d) => { ui("lf", Object.assign({}, d.p != null ? PRESETS[+d.p][1] : myViews()[+d.u].f)); A.render(); };
  A.ACT.lvDel = (d, el, e) => { e && e.stopPropagation(); myViews().splice(+d.u, 1); A.toast("اتمسح العرض"); A.render(); };
  A.ACT.lvSave = () => A.openModal("احفظ الفلتر كعرض", `<form data-form="lvSave" class="grid">${field("اسم العرض", `<input name="name" id="lv-n" required placeholder="مثلاً: التجمع · Qualified">`, 1)}<div class="row end wide"><button class="btn">${I("star")}احفظ</button></div></form>`);
  A.FORM.lvSave = (f) => { myViews().push({ name: f.name, f: Object.assign({}, ui("lf")) }); A.closeModal(); A.toast(`اتحفظ «${f.name}» · هتلاقيه فوق الفلاتر`); A.render(); };
  A.CHANGE.lf = (v, el) => { ui("lf", Object.assign({}, ui("lf"), { [el.dataset.k]: v }, el.dataset.k === "channel" ? { campaign: "" } : {})); A.render(); };
  A.ACT.lfReset = () => { ui("lf", {}); A.render(); };
  A.ACT.lmode = (d) => { ui("lmode", d.v); A.render(); };
  A.DROP.stage = (id, stage) => {
    const l = S().leads.find((x) => x.id === id); if (!l || l.stage === stage) return;
    if (A.role === "telesales" && l.owner !== "telesales") return;
    if (stage === "Visit") { ui("ltab", "visits"); openLead(id); A.toast("حدد ميعاد الـ Visit والوحدات"); return; }
    const prev = { stage: l.stage, ev: l.everInterested }, was = l.everInterested;
    A.setStage(l, stage); A.log(l, `المرحلة بقت ${stage}`);
    A.toast(!was && l.everInterested ? `${l.name} بقى ${stage} واتعلّم Qualified` : `${l.name} بقى ${stage}`, () => { l.stage = prev.stage; l.everInterested = prev.ev; l.comments.pop(); });
    if (stage === "Done Deal") A.ACT.dealNew({ lead: l.id });
    if (stage === "No Answer") askWa(l);
    A.render();
  };
  function askWa(l) { A.openModal(`No Answer · ${l.name}`, `${note("الليد هيفضل عندك يوم، وهيجيلك Alarm كل 4 ساعات تكلّمه.")}<p>بعتله واتساب؟</p><div class="row end"><button class="btn ghost" data-act="naWa" data-id="${l.id}" data-v="no">لأ</button><button class="btn" data-act="naWa" data-id="${l.id}" data-v="yes">${I("send")}اه بعتله</button></div>`); }
  A.ACT.naWa = (d) => { const l = S().leads.find((x) => x.id === d.id); A.log(l, d.v === "yes" ? "No Answer · بعتله واتساب" : "No Answer · مابعتلوش واتساب"); A.closeModal(); A.toast("اتسجّلت كومنت على الليد"); A.render(); };

  /* ---------- lead drawer ---------- */
  A.ACT.leadOpen = (d) => { ui("ltab", ui("ltab") || "overview"); openLead(d.id); };
  function openLead(id) { A.openDrawer(() => leadDrawer(id)); }
  function leadDrawer(id) {
    const st = S(), l = st.leads.find((x) => x.id === id); if (!l) return "";
    const r = A.role, tab = ui("ltab") || "overview", s = A.sla(l), edit = r !== "telesales" || l.owner === "telesales";
    const recs = A.recommend(l, l.answers);
    const chips = `${stageChip(l.stage)}${l.everInterested ? chip("ok", "Qualified") : ""}${s ? chip(s.level, s.text) : ""}${l.owner === "telesales" ? chip("info", "مع Telesales") : ""}${l.noAnswer ? chip("warn", `No Answer ×${l.noAnswer} · روتيشن ${l.rotation}`) : ""}`;
    const tabs = U.tabs("ltab", [["overview", "نظرة عامة"], ["units", "الوحدات", recs.length], ["visits", "الزيارات", l.visits.length], ["activity", "Activity", l.comments.length]], tab);
    let body = "";
    if (tab === "overview") body = `
      ${l.stage !== "Not Interested" && l.stage !== "Cancellation" && l.stage !== "Hold" && l.stage !== "No Answer" ? U.stepper(PIPE, PIPE.includes(l.stage) ? l.stage : "Fresh") : ""}
      ${l.tlFlag ? note(`<b>ملاحظة الـ Team Leader:</b> ${esc(l.tlFlag)}`, "warn") : ""}
      ${kv([["الشركة", esc(l.company || "—")], ["الموبايل", l.phones.map((p) => `<span class="mono">${esc(p)}</span>`).join("<br>")], ["Area", esc(l.area || "—")], ["Type", esc(l.type)], ["Space", A.num(l.space) + " م"], ["Condition", esc(l.condition || "—")], ["Budget", A.money(l.budget)], ["Channel", esc(l.channel)], ["Campaign", esc(campName(l.campaign))], ["البوست اللي جابه", esc((st.posts.find((p) => p.id === l.post) || {}).title || "—")], ["Sales", A.who(l.sales)], ["دخل", `${A.fmtDate(l.created)} · ${A.ago(l.created)}`]])}
      ${l.note ? `<div class="quote">${esc(l.note)}</div>` : ""}
      ${edit ? `<section class="card flat">${head("غيّر المرحلة", "layers")}
        <div class="stage-grid">${st.stages.map((x) => `<button class="stage-btn ${x === l.stage ? "on" : ""}" data-act="leadStage" data-id="${l.id}" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <p class="hint">أول ما الليد يوصل Interested أو أي مرحلة بعدها بيتعلّم Qualified أوتوماتيك، ويفضل محسوب في الكامبين والـ channel. Visit بتفتح تاب الزيارات عشان تحدد الميعاد والوحدات.</p></section>` : ""}
      <div class="row">
        <button class="btn ghost" data-act="leadCall" data-id="${l.id}">${I("phone")}سجّل مكالمة</button>
        ${A.canDo("leads", "edit") && edit ? `<button class="btn ghost" data-act="leadEdit" data-id="${l.id}">تعديل البيانات</button>` : ""}
        ${A.canDo("leads", "delete") ? `<button class="btn ghost" data-act="leadArchive" data-id="${l.id}">${I("x")}أرشفة</button>` : ""}
        ${l.owner === "telesales" && l.stage === "Interested" && l.newLeadReq !== "pending" ? `<button class="btn" data-act="sendNewLead" data-id="${l.id}">${I("send")}ابعته كـ New Lead</button>` : ""}
        ${l.newLeadReq === "pending" ? chip("warn", "مستني قرار الأوبريشن") : ""}
        ${l.stage === "Done Deal" && !st.deals.some((x) => x.lead === l.id) && r !== "telesales" ? `<button class="btn" data-act="dealNew" data-lead="${l.id}">${I("handshake")}سجّل الصفقة</button>` : ""}
      </div>
      ${["tl", "admin", "salesdir"].includes(r) ? `<form class="card flat" data-form="tlFlag">${head("ملاحظة الـ Team Leader على الليد", "star")}<input type="hidden" name="id" value="${l.id}"><div class="row"><input name="flag" id="tl-flag" value="${esc(l.tlFlag || "")}" placeholder="حاجة محتاجينها في الليد ده"><button class="btn ghost">حفظ</button></div></form>` : ""}
      ${A.canDo("leads", "approve") ? `<form class="card flat" data-form="reassign">${head("اسحب الليد وحوّله", "swap", "", "مدير المبيعات والإدارة")}<input type="hidden" name="id" value="${l.id}"><div class="row"><select name="to" id="ra-to">${A.sales().map((x) => opt(x.id, x.name + (A.onLeave(x.id) ? " (إجازة)" : ""), l.sales)).join("")}</select><button class="btn ghost">${I("swap")}حوّل</button></div></form>` : ""}`;
    if (tab === "units") {
      const ans = l.answers || {}, projects = [...new Set(st.units.map((u) => u.project))];
      body = `${note(`الـ Recommendations بتطابق بيانات الكلاينت: <b>${esc(l.type)} · ${A.num(l.space)} م · ${esc(l.condition)} · ${A.money(l.budget)} · ${esc(l.area)}</b> (±20%). والمساحات الكبيرة اللي «تنفع تتقسم» بتظهر كمان.`)}
        <div class="qs"><span class="qs-t">${I("filter")}جاوب عشان الـ Recommendations تقل:</span>
          <select id="ra-floor" data-change="recAns" data-k="floor" data-id="${l.id}">${opt("", "الدور: أي دور", ans.floor)}${opt("G", "دور أرضي بس", ans.floor)}</select>
          <select id="ra-park" data-change="recAns" data-k="parking" data-id="${l.id}">${opt("", "Parking: مش مهم", ans.parking)}${[1, 2, 3, 4].map((n) => opt(n, `Parking ${n}+`, ans.parking)).join("")}</select>
          <select id="ra-proj" data-change="recAns" data-k="project" data-id="${l.id}">${opt("", "المشروع: أي مشروع", ans.project)}${projects.map((p) => opt(p, p, ans.project)).join("")}</select>
          <select id="ra-area" data-change="recAns" data-k="area" data-id="${l.id}">${opt("", "المنطقة: أي منطقة", ans.area)}${opt("same", "نفس منطقة الكلاينت", ans.area)}</select>
          <select id="ra-split" data-change="recAns" data-k="split" data-id="${l.id}">${opt("", "مساحة متقسمة: تنفع", ans.split)}${opt("no", "مش عايز مساحة متقسمة", ans.split)}</select>
          ${l.type === "Resale" ? `<select id="ra-pay" data-change="recAns" data-k="payment" data-id="${l.id}">${opt("", "الدفع: أي طريقة", ans.payment)}${["كاش", "تقسيط 3 سنين", "تقسيط 5 سنين"].map((p) => opt(p, p, ans.payment)).join("")}</select>` : ""}
          ${Object.values(ans).some(Boolean) ? `<button class="btn ghost sm" data-act="recReset" data-id="${l.id}">مسح الإجابات</button>` : ""}
        </div>
        <div class="rec-list">${recs.map((x) => `<label class="rec"><input type="checkbox" class="rec-pick" value="${x.u.code}"><span class="rec-match num">${x.match}%</span><div class="rec-main"><b>${x.u.code} · ${esc(x.u.project)}</b><small>${esc(x.u.area)} · الدور ${esc(x.u.floor || "—")} · ${A.num(x.u.space)} م · ${esc(x.u.condition)} · Parking ${x.u.parking || 0}</small></div><div class="rec-price"><b class="num">${A.money(x.price)}</b><small>${x.u.type === "Rent" ? "في الشهر" : "إجمالي"}</small></div>${x.split ? chip("info", `تتقسم · من ${A.num(x.u.minSplit)} م`) : x.u.area === l.area ? chip("ok", "نفس المنطقة") : ""}</label>`).join("") || U.empty("مفيش وحدات مطابقة. جرّب تشيل إجابة من الأسئلة.", "building")}</div>
        ${edit && recs.length ? `<div class="row end"><button class="btn" data-act="sendList" data-id="${l.id}">${I("file")}اعمل PDF list وابعتها</button></div>` : ""}`;
    }
    if (tab === "visits") body = `
      ${l.visits.map((v, i) => { const due = !v.done && v.at <= A.nowIso(); return `<div class="visit ${v.done ? "done" : due ? "due" : ""}"><div class="v-date"><b>${new Date(v.at).getDate()}</b><small>${new Date(v.at).toLocaleDateString("ar-EG", { month: "short" })}</small></div><div class="v-main"><b>${A.fmtTime(v.at)} · ${v.units.map(esc).join("، ") || "وحدات هتتحدد"}</b>${v.extra ? `<small>مساحات مش في الشيت: ${esc(v.extra)}</small>` : ""}${due ? `<small class="bad-t">${I("bell")}Alarm: ميعاد الـ Visit جه · دوس Done</small>` : ""}</div>${v.done ? chip("ok", "Done · اتحسبت في الـ activity") : v.notDone ? chip("bad", "معملهاش · ظاهرة للـ HR") : `<button class="btn sm" data-act="visitDone" data-id="${l.id}" data-i="${i}">Done</button><button class="btn ghost sm" data-act="visitNotDone" data-id="${l.id}" data-i="${i}">معملتهاش</button><button class="btn ghost sm" data-act="visitEdit" data-id="${l.id}" data-i="${i}">تعديل</button>`}</div>`; }).join("") || U.empty("مفيش زيارات لسه", "pin")}
      ${edit ? `<form class="card flat" data-form="visitNew">${head(ui("visitEditIdx") != null ? "تعديل الـ Visit" : "Visit جديدة", "pin", "", "بتنقل الليد لمرحلة Visit وبتتحسب Check-in للسيلز عند الـ HR")}<input type="hidden" name="id" value="${l.id}">
        <div class="grid">${field("الميعاد", `<input name="at" id="vs-at" type="datetime-local" required value="${esc((l.visits[ui("visitEditIdx")] || {}).at ? new Date(l.visits[ui("visitEditIdx")].at).toISOString().slice(0, 16) : "")}">`, 1)}
        ${field("الوحدات (من الانفنتوري)", `<select name="units" id="vs-units" multiple size="4">${S().units.filter((u) => A.isAvailable(u) || u.status === "available").map((u) => opt(u.code, `${u.code} · ${u.project} · ${u.space} م`, ((l.visits[ui("visitEditIdx")] || {}).units || []).includes(u.code) ? u.code : "")).join("")}</select>`)}
        ${field("مساحات مش موجودة في الشيت", `<input name="extra" id="vs-extra" placeholder="مثلاً: دور 4 في مبنى B6" value="${esc((l.visits[ui("visitEditIdx")] || {}).extra || "")}">`)}</div>
        <div class="row end">${ui("visitEditIdx") != null ? `<button type="button" class="btn ghost" data-act="visitEditCancel">إلغاء</button>` : ""}<button class="btn">${I("pin")}حفظ الـ Visit</button></div></form>` : ""}`;
    if (tab === "activity") body = `<form class="row" data-form="leadComment"><input type="hidden" name="id" value="${l.id}"><input name="text" id="ld-cm" placeholder="اكتب كومنت أو نتيجة مكالمة" required><button class="btn ghost">إضافة</button></form>
      <div class="timeline">${l.comments.slice().reverse().map((c) => `<div>${esc(c.text)}<small>${esc(A.person(c.by))} · ${A.fmtDate(c.at)} ${A.fmtTime(c.at)}</small></div>`).join("") || U.empty("مفيش Activity لسه", "clock")}</div>`;
    return U.drawer(l.name, `${l.id} · ${l.channel}`, chips, tabs + body);
  }
  A.ACT.ltab = (d) => { ui("ltab", d.v); A.refreshDrawer(); };
  A.CHANGE.recAns = (v, el) => { const l = S().leads.find((x) => x.id === el.dataset.id); l.answers = Object.assign({}, l.answers, { [el.dataset.k]: v }); A.refreshDrawer(); };
  A.ACT.recReset = (d) => { S().leads.find((x) => x.id === d.id).answers = {}; A.refreshDrawer(); };
  A.ACT.leadStage = (d) => {
    const l = S().leads.find((x) => x.id === d.id);
    if (d.v === "Visit") { ui("ltab", "visits"); A.refreshDrawer(); A.toast("حدد ميعاد الـ Visit والوحدات"); return; }
    const was = l.everInterested; A.audit("leads", `${l.id}: ${l.stage} ← ${d.v}`); A.setStage(l, d.v); A.log(l, `المرحلة بقت ${d.v}`);
    A.toast(!was && l.everInterested ? `${d.v} · واتعلّم Qualified في الكامبين والـ channel` : `المرحلة بقت ${d.v}`);
    if (d.v === "Done Deal" && !S().deals.some((x) => x.lead === l.id)) A.ACT.dealNew({ lead: l.id });
    if (d.v === "No Answer") askWa(l);
    A.render();
  };
  A.ACT.leadCall = (d) => { const l = S().leads.find((x) => x.id === d.id); l.touched = true; l.activity = (l.activity || 0) + 1; l.naCallAt = A.nowIso(); A.log(l, "مكالمة اتسجّلت"); A.toast("المكالمة اتسجّلت · الـ SLA وقف"); A.render(); };
  A.FORM.leadComment = (f) => { const l = S().leads.find((x) => x.id === f.id); l.touched = true; A.log(l, f.text); A.render(); };
  A.FORM.tlFlag = (f) => { const l = S().leads.find((x) => x.id === f.id); l.tlFlag = f.flag; if (f.flag) { A.log(l, `ملاحظة TL: ${f.flag}`); A.notify(["sales"], `الـ Team Leader كتب على ${l.name}: ${f.flag}`); } A.toast("اتحفظت"); A.render(); };
  A.FORM.reassign = (f) => { const l = S().leads.find((x) => x.id === f.id), from = l.sales; if (from === f.to) return; A.audit("leads", `${l.id}: اتسحب يدوي من ${A.person(from)} لـ ${A.person(f.to)}`); l.sales = f.to; l.owner = "sales"; l.assignedAt = A.nowIso(); l.touched = false; l.alerted = false; A.assignByHand(f.to); A.log(l, `اتسحب يدوي من ${A.person(from)} واتحوّل لـ ${A.person(f.to)}`); A.notify(["sales"], `ليد ${l.name} اتحوّلك من ${A.person(from)}`); A.toast(`اتحوّل لـ ${A.person(f.to)}`); A.render(); };
  A.ACT.sendNewLead = (d) => { const l = S().leads.find((x) => x.id === d.id); l.newLeadReq = "pending"; A.log(l, "Telesales بعتته كـ New Lead للأوبريشن"); A.notify(["ops"], `Telesales بعتت ${l.name} كـ New Lead`); A.toast("اتبعت للأوبريشن"); A.render(); };
  A.ACT.visitDone = (d) => { const l = S().leads.find((x) => x.id === d.id); l.visits[+d.i].done = true; l.activity = (l.activity || 0) + 1; A.log(l, "الـ Visit خلصت · اتحسبت في الـ activity"); A.render(); };
  A.ACT.visitNotDone = (d) => { const st = S(), l = st.leads.find((x) => x.id === d.id), v = l.visits[+d.i], a = st.attendance.find((x) => x.emp === l.sales && x.day === v.at.slice(0, 10) && x.status === "visit"); v.notDone = true; if (a) a.visitNotDone = true; A.log(l, "الـ Visit اتعلّمت إنها محصلتش"); A.notify(["hr"], `${A.person(l.sales)}: Visit ${A.fmtDate(v.at)} اتعلّمت إنها محصلتش`); A.toast("اتسجّلت إنها محصلتش · ظاهرة للـ HR في الحضور"); A.render(); };
  A.ACT.visitEdit = (d) => { ui("visitEditIdx", +d.i); A.refreshDrawer(); };
  A.ACT.visitEditCancel = () => { ui("visitEditIdx", null); A.refreshDrawer(); };
  A.FORM.visitNew = (f, form) => {
    const l = S().leads.find((x) => x.id === f.id), units = [...form.querySelector("#vs-units").selectedOptions].map((o) => o.value);
    const v = { at: new Date(f.at).toISOString(), units, extra: f.extra || "", done: false }, idx = ui("visitEditIdx");
    if (idx != null) { l.visits[idx] = v; A.log(l, `اتعدّلت الـ Visit: ${A.fmtDate(v.at)} ${A.fmtTime(v.at)}`); ui("visitEditIdx", null); }
    else { l.visits.push(v); const was = l.everInterested; A.setStage(l, "Visit"); A.log(l, `Visit ${A.fmtDate(v.at)} ${A.fmtTime(v.at)} على: ${units.join("، ") || "—"}${v.extra ? " · " + v.extra : ""}`); if (!was) A.toast("Visit · واتعلّم Qualified"); }
    const hh = new Date(v.at).getHours() * 60 + new Date(v.at).getMinutes();
    A.toast(`الـ Visit اتحفظت · ${hh <= 12 * 60 ? "هتتحسب Check-in من غير تأخير" : "بعد 12: التأخير بيتحسب لحد ميعادها"}`);
    A.render();
  };
  A.ACT.sendList = (d) => {
    const l = S().leads.find((x) => x.id === d.id), picks = [...document.querySelectorAll(".rec-pick:checked")].map((x) => x.value);
    if (!picks.length) { A.toast("اختار وحدة واحدة على الأقل"); return; }
    const units = picks.map((c) => S().units.find((x) => x.code === c));
    A.openModal("List of options · PDF", `<div class="pdf">
      <div class="pdf-head"><span class="brand-mark sm">${I("building")}</span><div><b>Places · List of options</b><small>لـ ${esc(l.name)} · ${A.fmtDate(A.nowIso())}</small></div></div>
      ${units.map((u) => `<div class="pdf-row"><div class="pdf-img">${I("image")}</div><div><b>${esc(u.project)} · ${u.code}</b><small>${esc(u.area)} · الدور ${esc(u.floor || "—")} · ${A.num(u.space)} م · ${esc(u.condition)}</small></div><b class="num">${A.money(A.unitTotal(u))}${u.type === "Rent" ? "<small> / شهر</small>" : ""}</b></div>`).join("")}
      <p class="hint">الـ PDF بيتعمل أوتوماتيك من صور الوحدات وبياناتها، ومحدش يقدر يعدّل عليه.</p></div>
      <div class="row end"><button class="btn ghost" data-close="modal">رجوع</button><button class="btn" data-act="sendListGo" data-id="${l.id}" data-units="${picks.join(",")}">${I("send")}ابعت للعميل وسجّل كومنت</button></div>`);
  };
  A.ACT.sendListGo = (d) => { const l = S().leads.find((x) => x.id === d.id), desc = d.units.split(",").map((c) => { const u = S().units.find((x) => x.code === c); return `${c} (${u.project} · ${u.space} م)`; }); l.touched = true; A.log(l, `تم إرسال الوحدات التالية للعميل (PDF): ${desc.join("، ")}`); A.closeModal(); A.toast("الـ list اتبعتت واتسجّلت كومنت عند العميل"); A.render(); };

  A.ACT.leadEdit = (d) => {
    const st = S(), l = st.leads.find((x) => x.id === d.id);
    A.openModal(`تعديل · ${l.name}`, `<form data-form="leadEdit" class="grid"><input type="hidden" name="id" value="${l.id}">
      ${field("الاسم", `<input name="name" id="le-n" value="${esc(l.name)}" required>`, 1)}${field("الشركة", `<input name="company" id="le-c" value="${esc(l.company)}">`)}
      ${field("الموبايل (رقم في كل سطر)", `<textarea name="phones" id="le-p">${esc(l.phones.join("\n"))}</textarea>`, 1)}
      ${field("Area", `<select name="area" id="le-a">${st.areas.map((a) => opt(a, a, l.area)).join("")}</select>`)}${field("Type", `<select name="type" id="le-t">${["Rent", "Resale", "Income"].map((t) => opt(t, t, l.type)).join("")}</select>`)}
      ${field("Space", `<input name="space" id="le-s" type="number" value="${l.space}">`)}${field("Condition", `<select name="condition" id="le-co">${["متشطب", "نص تشطيب", "Core & Shell"].map((t) => opt(t, t, l.condition)).join("")}</select>`)}
      ${field("Budget", `<input name="budget" id="le-b" type="number" value="${l.budget}">`)}${field("Note", `<textarea name="note" id="le-no">${esc(l.note)}</textarea>`, 0, 1)}
      <div class="row end wide"><button class="btn">حفظ</button></div></form>`);
  };
  A.FORM.leadEdit = (f) => { const l = S().leads.find((x) => x.id === f.id), before = JSON.stringify([l.name, l.budget, l.space]); Object.assign(l, { name: f.name, company: f.company, phones: f.phones.split(/\n|,/).map((s) => s.trim()).filter(Boolean), area: f.area, type: f.type, space: +f.space || 0, condition: f.condition, budget: +f.budget || 0, note: f.note }); A.audit("leads", `${l.id}: اتعدّلت البيانات (${before} ← ${JSON.stringify([l.name, l.budget, l.space])})`); A.log(l, "اتعدّلت بيانات الليد"); A.closeModal(); A.toast("اتحفظ · واتسجّل في الـ Audit Log"); A.render(); };
  A.ACT.leadArchive = (d) => { const l = S().leads.find((x) => x.id === d.id); l.archived = true; A.audit("leads", `${l.id} اتأرشف`); A.closeDrawer(); A.toast(`${l.name} اتأرشف`, () => { l.archived = false; }); A.render(); };

  /* ---------- new lead ---------- */
  A.ACT.leadNew = () => {
    const st = S(), r = A.role;
    A.openModal("ليد جديد", `<form data-form="leadNew" class="grid" id="fLead">
      ${field("الاسم", `<input name="name" id="nl-name" required>`, 1)}
      ${field("الشركة", `<input name="company" id="nl-company" list="coList" data-change="nlCompany" placeholder="اكتب أو اختار من شيت الشركات"><datalist id="coList">${st.companies.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist>`)}
      <div class="field wide" id="nl-newco" hidden></div>
      ${field("الموبايل (رقم في كل سطر)", `<textarea name="phones" id="nl-phones" required placeholder="01xxxxxxxxx" data-input="nlPhones"></textarea>`, 1)}
      <div class="field wide" id="nl-dupe" hidden></div>
      ${field("Area", `<select name="area" id="nl-area" data-change="nlArea" required>${opt("", "اختار")}${st.areas.map((a) => opt(a)).join("")}</select><small class="hint" id="nl-route"></small>`, 1)}
      ${field("Type", `<select name="type" id="nl-type">${["Rent", "Resale", "Income"].map((t) => opt(t)).join("")}</select>`)}
      ${field("Space (م)", `<input name="space" id="nl-space" type="number" min="0">`)}
      ${field("Condition", `<select name="condition" id="nl-cond">${["متشطب", "نص تشطيب", "Core & Shell"].map((t) => opt(t)).join("")}</select>`)}
      ${field("Budget", `<input name="budget" id="nl-budget" type="number" min="0">`)}
      ${field("Channel", `<select name="channel" id="nl-channel" data-change="nlChannel" required>${opt("", "اختار")}${st.channels.map((c) => opt(c)).join("")}</select>`, 1)}
      ${field("Campaign name", `<select name="campaign" id="nl-campaign"><option value="">اختار الـ channel الأول</option></select>`)}
      ${r === "sales" ? `<p class="hint wide">الليد اللي بتدخّله بنفسك بيفضل بتاعك ومش بيدخل التوزيع.</p>` : field("Sales", `<select name="sales" id="nl-sales"><option value="">أوتوماتيك من الـ area</option>${A.sales().map((s) => opt(s.id, s.name + (A.onLeave(s.id) ? " (إجازة)" : ""))).join("")}</select><small class="hint">لو اخترت سيلز بالاسم، بيتعدّى دوره في التوزيع الجاي.</small>`)}
      ${r === "telesales" ? field("الليد يروح لـ", `<select name="keep" id="nl-keep">${opt("route", "التوزيع (حسب الـ area)")}${opt("keep", "يفضل عندي (بكلّمه أنا)")}</select>`) : ""}
      ${field("Note", `<textarea name="note" id="nl-note"></textarea>`, 0, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn" id="nl-save">حفظ الليد</button></div></form>`);
  };
  A.CHANGE.nlChannel = (v) => { document.getElementById("nl-campaign").innerHTML = `<option value="">—</option>` + S().campaigns.filter((c) => c.channel === v).map((c) => opt(c.id, c.name)).join(""); };
  A.CHANGE.nlArea = (v) => { const p = (S().areaRouting[v] || []).filter((x) => !A.onLeave(x)); document.getElementById("nl-route").textContent = p.length ? `بتروح لـ: ${p.map(A.person).join("، ")}` : "مفيش سيلز محدد · هتتوزع على الكل"; };
  A.CHANGE.nlPhones = (v) => {
    const box = document.getElementById("nl-dupe"), phones = v.split(/\n|,/).map((s) => s.trim()).filter((s) => s.length >= 8), d = phones.length && A.findDupe(phones);
    box.hidden = !d;
    box.innerHTML = d ? note(`الرقم ده موجود قبل كده في ليد <b>${esc(d.name)}</b> (${d.id}) عند ${esc(A.person(d.sales))}. العميل ده مكرر: الأوبريشن هتشوف تفاصيل الاتنين وتقرر أنهي بيانات تفضل وأنهي channel يتحسب.`, "warn") : "";
    document.getElementById("nl-save").textContent = d ? "ابعته للأوبريشن تقرر" : "حفظ الليد";
  };
  A.CHANGE.nlCompany = (v) => {
    const box = document.getElementById("nl-newco"), st = S(), isNew = v && !st.companies.some((c) => c.name.toLowerCase() === v.toLowerCase());
    box.hidden = !isNew;
    box.innerHTML = !isNew ? "" : A.role === "telesales"
      ? `<div class="note warn">${I("building")}<span class="spacer">«${esc(v)}» مش موجودة في شيت الشركات.</span><label class="row"><input type="checkbox" name="addco" id="nl-addco"> أضيفها لشيت الشركات</label><select name="cat" id="nl-cat" style="max-width:160px">${st.companyCats.map((c) => opt(c)).join("")}</select></div>`
      : note(`«${esc(v)}» شركة جديدة. هيروح إشعار لـ Telesales تضيفها لشيت الشركات.`);
  };
  A.FORM.leadNew = (f) => {
    const st = S(), phones = f.phones.split(/\n|,/).map((s) => s.trim()).filter(Boolean), dupe = A.findDupe(phones);
    if (dupe) { (st.dupes = st.dupes || []).push({ id: "DP-" + Date.now().toString(36), lead: dupe.id, by: A.me(), at: A.nowIso(), data: { name: f.name, company: f.company || "", phones, area: f.area, type: f.type, space: +f.space || 0, condition: f.condition, budget: +f.budget || 0, channel: f.channel, campaign: f.campaign || "" } }); A.log(dupe, `${A.person(A.me())} حاول يدخّل العميل ده تاني (${phones.join(" / ")}) · مستني قرار الأوبريشن`); A.notify(["ops"], `عميل مكرر: ${f.name} موجود في ${dupe.id} · قرّري أنهي بيانات تفضل`); A.closeModal(); A.toast(`العميل ده موجود (${dupe.id}) · اتبعت للأوبريشن تقرر`); A.render(); return; }
    const keep = f.keep === "keep", mine = A.role === "sales", salesId = keep ? "u5" : mine ? A.me() : (f.sales || A.routeArea(f.area)), id = "L-" + st.leadSeq++;
    if (f.sales && !mine && !keep) A.assignByHand(f.sales);
    const l = { id, name: f.name, company: f.company || "", phones, area: f.area, type: f.type, space: +f.space || 0, condition: f.condition, budget: +f.budget || 0, channel: f.channel, campaign: f.campaign || "", post: "", sales: salesId, stage: "Fresh", created: A.nowIso(), note: f.note || "", comments: [], visits: [], answers: {}, noAnswer: 0, rotation: 1, everInterested: false, owner: keep ? "telesales" : "sales", tlFlag: "", activity: 0 };
    A.log(l, `اتعمل بواسطة ${A.person(A.me())}${keep ? " · فضل عند Telesales" : mine ? " · فضل عنده (هو اللي دخّله)" : ` · اتوزع لـ ${A.person(salesId)}`}`);
    st.leads.unshift(l);
    if (f.company && !st.companies.some((c) => c.name.toLowerCase() === f.company.toLowerCase())) {
      if (A.role === "telesales" && f.addco) { st.companies.push({ name: f.company, cat: f.cat }); A.toast(`الشركة اتضافت لشيت الشركات تحت ${f.cat}`); }
      else { st.pendingCompanies.push({ name: f.company, lead: id, by: A.me() }); A.notify(["telesales"], `شركة جديدة «${f.company}» اتضافت في ليد ${id} · محتاجة تتضاف لشيت الشركات`); }
    }
    if (!keep && !mine) A.notify(["sales", "tl"], `ليد جديد ${l.name} راح لـ ${A.person(salesId)} (${l.area})`);
    A.closeModal(); A.toast(keep || mine ? "الليد اتحفظ عندك" : `الليد راح لـ ${A.person(salesId)}`); A.render();
  };

  /* ---------- companies sheet ---------- */
  // «شيت الشركات»: one tab per category (62), the same 13 columns in each, and a filter for contracts ending soon (an opportunity)
  const CO_COLS = [["feedback", "feedback"], ["name", "company name"], ["number", "number"], ["contact", "name"], ["title", "title"], ["email", "email"], ["location", "current location"], ["space", "current space"], ["start", "start contract date"], ["end", "end contract date"], ["rent", "average current price rent"], ["escalation", "annual escalation"], ["date", "date"]];
  A.ACT.verifyCall = (d) => { const l = S().leads.find((x) => x.id === d.id); l.verify = { called: d.v[0] === "1", sent: d.v[1] === "1", by: A.uid, at: A.nowIso() }; A.log(l, `مكالمة تحقق: ${l.verify.called ? "السيلز كلّمه" : "السيلز مكلّموش"} · ${l.verify.sent ? "بعتله اللي محتاجه" : "مبعتلوش"}`); if (!l.verify.called || !l.verify.sent) A.notify(["tl"], `مكالمة تحقق على ${l.name}: ${A.person(l.sales)} ${l.verify.called ? "مبعتش للعميل اللي محتاجه" : "مكلّمش العميل"}`); A.toast("اتسجّلت"); A.render(); };
  A.ACT.companies = (d) => {
    const st = S(), cat = (d && d.cat) || A.ui.coCat || "", soon = (d && d.soon) || A.ui.coSoon, in90 = new Date(A.NOW() + 90 * 864e5).toISOString().slice(0, 10);
    A.ui.coCat = cat; A.ui.coSoon = soon;
    const list = st.companies.filter((x) => (!cat || x.cat === cat) && (!soon || (x.end && x.end <= in90 && x.end >= A.today())));
    const fmt = (x, k) => k === "rent" ? (x.rent ? A.money(x.rent) : "—") : k === "space" ? (x.space ? A.num(x.space) + " م" : "—") : k === "escalation" ? (x.escalation ? x.escalation + "%" : "—") : ["start", "end", "date"].includes(k) ? (x[k] ? A.fmtDate(x[k]) : "—") : esc(x[k] || "—");
    A.openModal("شيت الشركات", `
      ${st.pendingCompanies.length ? `<section class="card flat attn">${head("شركات جديدة محتاجة تتضاف", "alert")}${st.pendingCompanies.map((p, i) => `<div class="line-item"><span><b>${esc(p.name)}</b> · ليد ${esc(p.lead)} · أضافها ${esc(A.person(p.by))}</span><select id="pc-${i}" style="max-width:170px">${st.companyCats.map((c) => opt(c)).join("")}</select><button class="btn sm" data-act="coAdd" data-i="${i}">أضف للشيت</button></div>`).join("")}</section>` : ""}
      ${["telesales", "admin"].includes(A.role) ? `<form class="row" data-form="coNew"><input name="name" required placeholder="شركة جديدة (Outbound)" aria-label="اسم الشركة"><select name="cat" aria-label="الكاتيجوري" style="max-width:160px">${st.companyCats.map((c) => opt(c)).join("")}</select><input name="number" placeholder="الرقم" style="max-width:130px" aria-label="الرقم"><button class="btn sm">${I("plus")}أضف</button><span class="hint">Outbound الأسبوع ده: <b>${st.companies.filter((x) => x.outbound && x.date >= new Date(A.NOW() - 7 * 864e5).toISOString().slice(0, 10)).length}</b> من 15</span></form>` : ""}
      <div class="toolbar"><select data-change="coCat" aria-label="الكاتيجوري">${opt("", `كل الكاتيجوريز (${st.companyCats.length})`, cat)}${st.companyCats.map((c) => opt(c, `${c} · ${st.companies.filter((x) => x.cat === c).length}`, cat)).join("")}</select><label class="tog"><input type="checkbox" ${soon ? "checked" : ""} data-change="coSoon"><span>عقدهم بيخلص خلال 90 يوم</span></label><span class="hint spacer">${list.length} شركة</span></div>
      ${table(CO_COLS.map((c) => c[1]).concat(cat ? [] : ["category"]), list.map((x) => `<tr>${CO_COLS.map(([k]) => `<td${k === "end" && x.end && x.end <= in90 && x.end >= A.today() ? ' class="bad-t"' : ""}>${fmt(x, k)}</td>`).join("")}${cat ? "" : `<td>${esc(x.cat)}</td>`}</tr>`))}`);
  };
  A.FORM.coNew = (f) => { const st = S(); if (st.companies.some((x) => x.name.toLowerCase() === f.name.trim().toLowerCase() || (f.number && x.number === f.number))) return A.toast("الشركة دي موجودة في الشيت"); st.companies.push({ name: f.name.trim(), cat: f.cat, number: f.number, date: A.today(), outbound: true, by: A.uid }); A.audit("leads", `شركة Outbound جديدة: ${f.name} (${f.cat})`); A.toast("اتضافت · بتتحسب في الـ Outbound بتاعك"); A.ACT.companies(); };
  A.CHANGE.coCat = (v) => A.ACT.companies({ cat: v });
  A.CHANGE.coSoon = (v) => { A.ui.coSoon = v; A.ACT.companies(); };
  A.ACT.coAdd = (d) => { const st = S(), p = st.pendingCompanies[+d.i], cat = document.getElementById("pc-" + d.i).value; st.companies.push({ name: p.name, cat }); st.pendingCompanies.splice(+d.i, 1); A.toast(`${p.name} اتضافت تحت ${cat}`); A.ACT.companies(); A.render(); };

  /* ---------- bulk entry ---------- */
  A.ACT.bulkNew = () => A.openModal("إدخال جماعي (شيت أرقام)", `${note("مثال: أرقام دخلت على كامبين ومردّوش. الأرقام بتتوزع على سيلز اليوم بالترتيب بعد موافقة الأوبريشن.")}
    <form data-form="bulkNew" class="grid">
      ${field("الأرقام (رقم في كل سطر، أو انسخ عمود من Excel)", `<textarea name="numbers" id="bk-num" required style="min-height:150px" placeholder="01012345678&#10;01198765432"></textarea>`, 1, 1)}
      ${field("أو ارفع ملف Excel / CSV", `<input type="file" id="bk-file" accept=".xlsx,.xls,.csv,.txt" data-change="bkFile">`, 0, 1)}
      ${field("Channel", `<select name="channel" id="bk-ch" data-change="bkChannel" required>${opt("", "اختار")}${S().channels.map((c) => opt(c)).join("")}</select>`, 1)}
      ${field("Campaign", `<select name="campaign" id="bk-camp" required><option value="">اختار الـ channel الأول</option></select>`, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("send")}ابعت للأوبريشن</button></div></form>`);
  A.CHANGE.bkChannel = (v) => { document.getElementById("bk-camp").innerHTML = S().campaigns.filter((c) => c.channel === v).map((c) => opt(c.id, c.name)).join("") || `<option value="">مفيش كامبينز</option>`; };
  A.CHANGE.bkFile = (v, el) => { const f = el.files && el.files[0]; if (!f) return; U.readSheet(f).then((rows) => { const nums = rows.flat().join(" ").match(/0?1[0125]\d{8}/g) || []; document.getElementById("bk-num").value = [...new Set(nums.map((n) => (n.length === 10 ? "0" + n : n)))].join("\n"); A.toast(nums.length ? `اتقرا ${nums.length} رقم من الملف` : "مقريتش أرقام من الملف"); }).catch((e) => A.toast(e.message)); };
  A.FORM.bulkNew = (f) => {
    const numbers = [...new Set(f.numbers.split(/\s|,|;/).map((s) => s.trim()).filter((s) => /^\d{8,}$/.test(s)))];
    if (!numbers.length) { A.toast("مفيش أرقام صحيحة في الشيت"); return; }
    const dupes = numbers.filter((n) => A.findDupe([n])).length;
    S().bulk.push({ id: "BK-" + Date.now(), numbers, channel: f.channel, campaign: f.campaign, status: "pending", exclude: [], dupes, by: A.me() });
    A.notify(["ops"], `Telesales بعتت إدخال جماعي فيه ${numbers.length} رقم · محتاج موافقتك`);
    A.closeModal(); A.toast(`اتبعت للأوبريشن: ${numbers.length} رقم${dupes ? ` (${dupes} موجودين قبل كده)` : ""}`); A.render();
  };
  const distribute = (n, pool) => { const out = {}; pool.forEach((p) => (out[p] = 0)); for (let i = 0; i < n; i++) out[pool[i % pool.length]]++; return out; };
  A.ACT.bulkReview = (d) => {
    const b = S().bulk.find((x) => x.id === d.id), pool = A.activeSales().filter((id) => !b.exclude.includes(id)), fresh = b.numbers.filter((n) => !A.findDupe([n])), dist = distribute(fresh.length, pool);
    A.openModal(`مراجعة التوزيع · ${b.numbers.length} رقم`, `${note(`${esc(b.channel)} / ${esc(campName(b.campaign))} · ${b.dupes ? `<b>${b.dupes}</b> رقم موجود قبل كده ومش هيتوزع · ` : ""}هيتوزع <b>${fresh.length}</b> رقم على <b>${pool.length}</b> سيلز بترتيب اليوم.`)}
      ${table(["السيلز", "هينزله", ""], A.sales().map((s) => `<tr><td>${A.who(s.id)}${A.onLeave(s.id) ? chip("warn", "إجازة النهارده") : ""}</td><td class="n">${b.exclude.includes(s.id) || A.onLeave(s.id) ? "—" : dist[s.id]}</td><td>${A.onLeave(s.id) ? "" : `<button class="btn ghost sm" data-act="bulkToggle" data-id="${b.id}" data-s="${s.id}">${b.exclude.includes(s.id) ? "رجّعه" : "شيله"}</button>`}</td></tr>`))}
      <div class="row end"><button class="btn danger" data-act="bulkDecide" data-id="${b.id}" data-ok="0">ارفض الطلب</button><button class="btn" data-act="bulkDecide" data-id="${b.id}" data-ok="1">وافق ووزّع</button></div>`);
  };
  A.ACT.bulkToggle = (d) => { const b = S().bulk.find((x) => x.id === d.id), i = b.exclude.indexOf(d.s); if (i >= 0) b.exclude.splice(i, 1); else if (b.exclude.length < A.activeSales().length - 1) b.exclude.push(d.s); A.ACT.bulkReview(d); };
  A.ACT.bulkDecide = (d) => {
    const st = S(), b = st.bulk.find((x) => x.id === d.id);
    if (d.ok !== "1") { b.status = "rejected"; A.notify(["telesales"], "الأوبريشن رفضت الإدخال الجماعي"); A.closeModal(); A.render(); return; }
    const pool = A.activeSales().filter((id) => !b.exclude.includes(id)), fresh = b.numbers.filter((n) => !A.findDupe([n]));
    fresh.forEach((n, i) => { const l = { id: "L-" + st.leadSeq++, name: `رقم من ${campName(b.campaign)}`, company: "", phones: [n], area: "", type: "Rent", space: 0, condition: "", budget: 0, channel: b.channel, campaign: b.campaign, post: "", sales: pool[i % pool.length], stage: "Fresh", created: A.nowIso(), note: "إدخال جماعي", comments: [], visits: [], answers: {}, noAnswer: 0, rotation: 1, everInterested: false, owner: "sales", tlFlag: "", activity: 0 }; A.log(l, "اتوزع من إدخال جماعي بموافقة الأوبريشن", "system"); st.leads.unshift(l); });
    b.status = "approved"; A.notify(["sales", "telesales"], `اتوزع ${fresh.length} رقم على ${pool.length} سيلز`);
    A.closeModal(); A.toast(`اتوزع ${fresh.length} رقم`); A.render();
  };
  const DUPE_F = [["name", "الاسم"], ["company", "الشركة"], ["area", "Area"], ["type", "Type"], ["space", "Space"], ["budget", "Budget"]];
  A.ACT.dupeReview = (d) => {
    const st = S(), x = st.dupes.find((y) => y.id === d.id), l = st.leads.find((y) => y.id === x.lead), camp = (id) => (st.campaigns.find((c) => c.id === id) || {}).name || "—";
    A.openModal(`عميل مكرر · ${l.id}`, `<form data-form="dupeDecide" class="grid"><input type="hidden" name="id" value="${x.id}">${note("اختاري لكل خانة البيانات اللي تفضل، والليد يتحسب على أنهي channel. الأرقام بتتجمّع من الاتنين.")}
      ${table(["الخانة", "الموجود", "الجديد"], DUPE_F.map(([k, lb]) => `<tr><td><b>${lb}</b></td><td><label class="tog"><input type="radio" name="${k}" value="old" checked> ${esc(String(l[k] || "—"))}</label></td><td><label class="tog"><input type="radio" name="${k}" value="new"> ${esc(String(x.data[k] || "—"))}</label></td></tr>`).concat(`<tr><td><b>Channel · Campaign</b></td><td><label class="tog"><input type="radio" name="channel" value="old" checked> ${esc(l.channel)} · ${esc(camp(l.campaign))}</label></td><td><label class="tog"><input type="radio" name="channel" value="new"> ${esc(x.data.channel)} · ${esc(camp(x.data.campaign))}</label></td></tr>`))}
      <div class="row end wide"><span class="hint spacer">الليد يفضل عند ${esc(A.person(l.sales))}.</span><button class="btn">${I("check")}احفظ القرار</button></div></form>`);
  };
  A.FORM.dupeDecide = (f) => {
    const st = S(), x = st.dupes.find((y) => y.id === f.id), l = st.leads.find((y) => y.id === x.lead), took = [];
    DUPE_F.forEach(([k, lb]) => { if (f[k] === "new") { l[k] = x.data[k]; took.push(lb); } });
    if (f.channel === "new") { l.channel = x.data.channel; l.campaign = x.data.campaign; took.push("الـ channel"); }
    l.phones = [...new Set([...l.phones, ...x.data.phones])];
    st.dupes = st.dupes.filter((y) => y.id !== x.id); A.audit("leads", `${l.id}: قرار تكرار · ${took.length ? "اتاخد من الجديد: " + took.join("، ") : "فضلت البيانات القديمة"}`);
    A.log(l, `الأوبريشن قررت في التكرار: ${took.length ? "اتاخد من الجديد " + took.join("، ") : "البيانات القديمة فضلت"}`); A.closeModal(); A.toast("اتحفظ القرار"); A.render();
  };
  A.ACT.newLeadDecide = (d) => {
    const l = S().leads.find((x) => x.id === d.id);
    A.openModal(`New Lead من Telesales · ${l.name}`, `${note("الليد بقى Interested عند Telesales بعد الروتيشن التالت. يروح فين؟")}
      <div class="choice"><button class="choice-card" data-act="newLeadGo" data-id="${l.id}" data-to="rotation">${I("route")}<b>الروتيشن العادي</b><small>حسب الـ area وترتيب اليوم</small></button>
      <div class="choice-card">${I("users")}<b>سيلز معيّن</b><select id="nlg-s">${A.sales().map((s) => opt(s.id, s.name)).join("")}</select><button class="btn sm" data-act="newLeadGo" data-id="${l.id}" data-to="pick">ابعته</button></div></div>`);
  };
  A.ACT.newLeadGo = (d) => {
    const l = S().leads.find((x) => x.id === d.id);
    l.sales = d.to === "pick" ? document.getElementById("nlg-s").value : (l.area ? A.routeArea(l.area) : A.activeSales()[0]);
    if (d.to === "pick") A.assignByHand(l.sales);
    Object.assign(l, { owner: "sales", newLeadReq: "done", rotation: 1, noAnswer: 0, assignedAt: A.nowIso(), touched: false, alerted: false, stage: "Fresh" });
    A.log(l, `الأوبريشن بعتت الليد كـ New Lead لـ ${A.person(l.sales)}`);
    A.closeModal(); A.toast(`راح لـ ${A.person(l.sales)}`); A.render();
  };

  /* ---------- routing settings ---------- */
  V.settings = {
    sub: () => "كل area تروح لأنهي سيلز · قواعد الـ SLA والروتيشن",
    render() {
      const st = S(), edit = A.canDo("settings", "edit");
      return `<div class="cols wide"><section class="card">${head("إعدادات توزيع المناطق", "route", edit ? "" : chip("", "عرض بس"), "لما حد يختار area في الليد، الليد بيروح دايركت للسيلز دول")}
        ${table(["Area", ...A.sales().map((s) => `<span class="who">${A.avatar(s.id, 1)}${esc(s.name.split(" ")[0])}</span>`)], st.areas.map((a) => `<tr><td><b>${esc(a)}</b><span class="sub num">${(st.areaRouting[a] || []).length} سيلز</span></td>${A.sales().map((s) => `<td><label class="tick"><input type="checkbox" ${(st.areaRouting[a] || []).includes(s.id) ? "checked" : ""} ${edit ? "" : "disabled"} data-change="route" data-a="${esc(a)}" data-s="${s.id}" aria-label="${esc(a)} · ${esc(s.name)}"><span></span></label></td>`).join("")}</tr>`))}
        <p class="hint">لو الـ area ليها أكتر من سيلز، الليدز بتتوزع بالترتيب بينهم. والسيلز اللي في إجازة معتمدة بيتشال من التوزيع لوحده.</p></section>
        <section class="card">${head("قواعد التوزيع", "clock")}
          <ul class="rules"><li><b>أيام الشغل</b><span>تنبيه TL بعد ساعتين ونص · سحب بعد 3 ساعات</span></li><li><b>الإجازات</b><span>تنبيه قبل السحب بساعتين · سحب بعد 24 ساعة</span></li><li><b>No Answer</b><span>يوم عند كل سيلز · الروتيشن التالت لـ Telesales</span></li><li><b>الإدخال الجماعي</b><span>عدد الأرقام ÷ سيلز اليوم · بموافقة الأوبريشن</span></li><li><b>منع التكرار</b><span>بأرقام الموبايل</span></li></ul>
          <div class="row"><span class="spacer">وضع الإجازة دلوقتي: <b>${st.holiday ? "شغال" : "مقفول"}</b></span><button class="btn ghost sm" data-act="demoHoliday">${st.holiday ? "اقفله" : "شغّله"}</button></div>
          <h4 class="mini-h">سيلز في إجازة النهارده</h4><div class="row">${A.sales().filter((s) => A.onLeave(s.id)).map((s) => A.who(s.id)).join("") || `<span class="hint">مفيش</span>`}</div>
        </section></div>`;
    }
  };
  A.CHANGE.route = (v, el) => { const st = S(), p = (st.areaRouting[el.dataset.a] = st.areaRouting[el.dataset.a] || []), i = p.indexOf(el.dataset.s); if (v && i < 0) p.push(el.dataset.s); if (!v && i >= 0) p.splice(i, 1); A.toast("اتحفظ"); A.render(); };
})();
