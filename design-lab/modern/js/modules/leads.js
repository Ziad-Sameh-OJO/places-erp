/* M-01 Leads & Telesales + routing settings. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const campName = (id) => (S().campaigns.find((c) => c.id === id) || {}).name || "—";
  const LVL = { "Fresh": "info", "Not Interested": "bad", "No Answer": "warn", "Done Deal": "ok", "Cancellation": "bad", "Hold": "" };
  const stageChip = (s) => chip(LVL[s] == null ? "acc" : LVL[s], s);
  const PIPE = ["Fresh", "Interested", "Follow up to Visit", "Visit", "Follow up after Visit", "Follow up to Meeting", "Meeting", "Follow up after Meeting", "Near to Close", "Done Deal"];
  // scheduling a Visit/Meeting moves the lead to «Follow up to …», marking it Done moves it to Visit/Meeting; never backwards in the pipeline
  const advance = (l, to) => { const i = PIPE.indexOf(l.stage); if (i >= 0 && PIPE.indexOf(to) <= i) return; A.setStage(l, to); A.log(l, `المرحلة اتنقلت لوحدها لـ ${to}`); };
  const isBroker = (l) => l.kind === "broker";
  const visible = () => visibleAll().filter((l) => isBroker(l) === (ui("ldTab") === "brokers")); // Leads tab = clients, Brokers tab = brokers
  const visibleAll = () => {
    const r = A.role, m = A.me();
    return S().leads.filter((l) => {
      if (l.archived || l.owner === "draft" || l.owner === "draftAdmin") return false; // these show only in their Draft tabs
      if (r === "sales") return l.sales === m && l.owner !== "telesales";
      if (r === "telesales") return l.owner === "telesales"; // a lead she sent to sales leaves her list
      if (r === "tl") return A.S.people.find((p) => p.id === l.sales && p.tl === m) || l.owner === "telesales" ? true : false;
      return true;
    });
  };
  const ownerOf = (l) => (l.draft && l.draft.from) || (l.draftAdmin && l.draftAdmin.from) || l.sales;
  function filtered(src) {
    const f = ui("lf") || {};
    let list = src || visible();
    if (f.stage) list = list.filter((l) => l.stage === f.stage);
    if (f.channel) list = list.filter((l) => l.channel === f.channel);
    if (f.campaign) list = list.filter((l) => l.campaign === f.campaign);
    if (f.sales) list = list.filter((l) => ownerOf(l) === f.sales);
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
        ${pendNew.map((l) => `<div class="line-item"><span>${I("send")}Telesales بعتت <b>${esc(l.name)}</b> كـ New Lead (بقى Interested)</span>${A.newLeadClock(l)}<button class="btn sm" data-act="newLeadDecide" data-id="${l.id}">قرّر</button></div>`).join("")}</section>` : "";
      const tele = r === "telesales" && st.pendingCompanies.length ? note(`فيه ${st.pendingCompanies.length} شركة جديدة محتاجة تتضاف لشيت الشركات. <button class="btn sm" data-act="companies">افتح شيت الشركات</button>`, "warn") : "";
      const camps = st.campaigns.filter((c) => !f.channel || c.channel === f.channel);
      const nFilters = ["stage", "channel", "campaign", "sales", "area", "qual", "from", "to", "q"].filter((k) => f[k]).length;
      // KPI data: verification calls (Heba checks 10% of the week's new leads) and each person's own call count
      const sc = A.secondCallsFor ? A.secondCallsFor() : { due: [], late: [] }, scList = [...sc.late, ...sc.due];
      const verifyCard = ["ops", "admin"].includes(r) && scList.length ? `<section class="card">${head("مكالمات التحقق (Second Calls)", "phone", chip(sc.due.some((l) => !l.verify) ? "warn" : "ok", `${sc.due.filter((l) => l.verify).length} من ${sc.due.length} النهارده`) + (sc.late.length ? " " + chip("bad", `${sc.late.length} من أيام فاتت`) : ""), "كل الليدز اللي دخلت النهارده (ماعدا اللي السيلز نزّلها بنفسه والـ Channels المستثناة) · لازم تخلص النهارده")}
        ${scList.map((l) => `<div class="line-item"><span><button class="link" data-act="leadOpen" data-id="${l.id}"><b>${esc(l.name)}</b></button> · ${esc(A.person(l.sales))} · ${esc(l.channel)}${sc.late.includes(l) ? " " + chip("bad", `من ${A.fmtDate(l.created)} · اتأخرت`, 1) : ""}</span>${l.verify ? `${chip("ok", "Second Call Done")}<small class="hint">${esc(l.verify.note || "")}</small>` : `<button class="btn sm" data-act="verifyCall" data-id="${l.id}">${I("phone")}Second Call Done</button>`}</div>`).join("")}</section>` : "";
      const myCalls = (days) => { const t = new Date(A.NOW() - days * 864e5).toISOString(); return st.leads.reduce((n, l) => n + l.comments.filter((c) => c.by === A.uid && c.text === "مكالمة اتسجّلت" && c.at >= t).length, 0); };
      const listBtn = r === "tl" ? `<div class="row end"><button class="btn ghost sm" data-act="listReqs">${I("list")}اطلب List من الانفنتوري</button></div>` : "";
      const calls = ["telesales", "sales", "tl"].includes(r) ? note(r === "telesales" ? `مكالماتك النهارده: <b>${myCalls(1)}</b> من 100 (بند في الـ KPIs بتاعتك).` : `مكالماتك آخر 7 أيام: <b>${myCalls(7)}</b> من 50 (بند Calls & Broadcast في الـ KPIs بتاعتك).`) : "";
      const canDraft = A.isIn(st.leadRules.draft.see) || r === "admin", drafts = canDraft ? st.leads.filter((l) => l.owner === "draft" && !l.archived) : [];
      const canDA = A.isIn(st.leadRules.draftAdmin.see) || r === "admin", das = canDA ? st.leads.filter((l) => l.owner === "draftAdmin" && !l.archived) : [];
      const va = filtered(visibleAll()), lt = ui("ldTab") || "all", fd = filtered(drafts), fda = filtered(das);
      const bar = `<div class="toolbar">
          <label class="search">${I("search")}<input id="lq" type="search" placeholder="اسم، موبايل، شركة، كود" value="${esc(f.q || "")}" data-change="lf" data-k="q" aria-label="بحث في الليدز"></label>
          <select id="lf-ch" data-change="lf" data-k="channel" aria-label="Channel">${opt("", "كل الـ channels", f.channel)}${st.channels.map((c) => opt(c, c, f.channel)).join("")}</select>
          <select id="lf-cp" data-change="lf" data-k="campaign" aria-label="Campaign">${opt("", "كل الكامبينز", f.campaign)}${camps.map((c) => opt(c.id, c.name, f.campaign)).join("")}</select>
          ${r !== "sales" ? `<select id="lf-s" data-change="lf" data-k="sales" aria-label="Sales">${opt("", "كل السيلز", f.sales)}${A.sales().map((s) => opt(s.id, s.name, f.sales)).join("")}${st.users.filter((u) => A.rolesOf(u.id).includes("telesales")).map((u) => opt(u.id, A.person(u.id) + " (Telesales)", f.sales)).join("")}</select>` : ""}
          <select id="lf-a" data-change="lf" data-k="area" aria-label="Area">${opt("", "كل المناطق", f.area)}${st.areas.map((a) => opt(a, a, f.area)).join("")}</select>
          <select id="lf-q" data-change="lf" data-k="qual" aria-label="Qualified">${opt("", "Qualified؟ الكل", f.qual)}${opt("yes", "Qualified بس", f.qual)}${opt("no", "مش Qualified", f.qual)}</select>
          <label class="date-f"><span>من</span><input id="lf-from" type="date" value="${esc(f.from || "")}" data-change="lf" data-k="from"></label>
          <label class="date-f"><span>لحد</span><input id="lf-to" type="date" value="${esc(f.to || "")}" data-change="lf" data-k="to"></label>
          ${nFilters ? `<button class="btn ghost sm" data-act="lfReset">${I("x")}مسح ${nFilters} فلتر</button>` : ""}
        </div>`;
      const ldTabs = U.tabs("ldTab", [["all", "الليدز", va.filter((l) => !isBroker(l)).length], ["brokers", "البروكرز", va.filter(isBroker).length], ...(canDraft ? [["draft", "Draft", fd.length]] : []), ...(canDA ? [["draftAdmin", "Draft Admin", nFilters ? fda.length : das.filter((l) => !l.draftAdmin.reviewed).length || das.length]] : [])], lt);
      if (canDraft && lt === "draft") return ldTabs + bar + draftView(fd);
      if (canDA && lt === "draftAdmin") return ldTabs + bar + draftAdminView(fda);
      return `${ldTabs}${approvals}${tele}${verifyCard}${calls}${listBtn}
        ${savedViews(f)}
        <div class="kpis">${U.kpi("كل الليدز", A.num(all.length), "في نطاقك · مقارنة بالأسبوع اللي فات", "users", "", "lfReset", U.trend(all, "created", 7))}${U.kpi("Fresh", A.num(all.filter((l) => l.stage === "Fresh").length), "لسه محدش كلّمهم", "sparkle")}${U.kpi("Qualified", A.num(qn), `${all.length ? Math.round((qn / all.length) * 100) : 0}% نسبة التأهيل`, "star", "ok")}${U.kpi("No Answer", A.num(all.filter((l) => l.stage === "No Answer").length), "بتتنقل بالروتيشن كل يوم", "clock", "warn")}</div>
        ${bar}
        <div class="row">
          ${U.seg("lmode", [["list", "قايمة", "list"], ["board", "Kanban", "board"]], mode)}
          <span class="hint num">${list.length} ليد</span><span class="spacer"></span>
          ${r === "telesales" || A.canDo("leads", "import") ? `<button class="btn ghost" data-act="companies">${I("building")}شيت الشركات</button>` : ""}${A.canDo("leads", "import") ? `<button class="btn ghost" data-act="bulkNew">${I("upload")}إدخال جماعي (Import)</button>` : ""}
          ${U.exportBtn("leads", "الليدز")}${A.canDo("leads", "create") ? `<button class="btn" data-act="leadNew">${I("plus")}ليد جديد</button>` : ""}
        </div>
        ${mode === "board" ? board(list) : listView(list)}
        ${note(`الـ SLA${A.isHolidayToday() ? " <b>(النهارده إجازة رسمية)</b>" : ""}: تنبيه بعد ${A.dur(A.slaLimits().warn)} من غير أكشن، والليد بيتسحب أوتوماتيك بعد ${A.dur(A.slaLimits().pull)} للسيلز اللي عليه الدور. جرّب «تحكم الديمو» فوق عشان تقدّم الوقت.`)}`;
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
    if (stage === "Visit" || stage === "Meeting") { ui("ltab", "visits"); ui("visitKind", stage); openLead(id); A.toast(`حدد ميعاد الـ ${stage} والوحدات`); return; }
    const prev = { stage: l.stage, ev: l.everInterested, owner: l.owner, sales: l.sales, draftAdmin: l.draftAdmin }, was = l.everInterested;
    A.setStage(l, stage); A.log(l, `المرحلة بقت ${stage}`);
    A.toast(!was && l.everInterested ? `${l.name} بقى ${stage} واتعلّم Qualified` : `${l.name} بقى ${stage}`, () => { Object.assign(l, { stage: prev.stage, everInterested: prev.ev, owner: prev.owner, sales: prev.sales, draftAdmin: prev.draftAdmin }); l.comments.pop(); });
    if (stage === "Done Deal") A.ACT.dealNew({ lead: l.id });
    if (stage === "No Answer") askWa(l);
    A.render();
  };
  function askWa(l) { A.openModal(`No Answer · ${l.name}`, `${note(`الليد هيفضل عندك ${A.dur(S().leadRules.noAnswer.hours * 60)}، وهيجيلك Alarm كل ${S().leadRules.noAnswer.remindH} ساعات تكلّمه. بعدها بيروح للسيلز اللي عليه الدور.`)}<p>بعتله واتساب؟</p><div class="row end"><button class="btn ghost" data-act="naWa" data-id="${l.id}" data-v="no">لأ</button><button class="btn" data-act="naWa" data-id="${l.id}" data-v="yes">${I("send")}اه بعتله</button></div>`); }
  A.ACT.naWa = (d) => { const l = S().leads.find((x) => x.id === d.id); A.log(l, d.v === "yes" ? "No Answer · بعتله واتساب" : "No Answer · مابعتلوش واتساب"); A.closeModal(); A.toast("اتسجّلت كومنت على الليد"); A.render(); };

  /* ---------- lead drawer ---------- */
  A.ACT.leadOpen = (d) => { ui("ltab", ui("ltab") || "overview"); openLead(d.id); };
  // the lead's Logs tab is hidden except for the roles the admin picks
  const logRoles = () => S().leadLogRoles || ["admin"];
  const canLogs = () => A.rolesOf(A.uid).some((r) => r === "admin" || logRoles().includes(r));
  A.CHANGE.logRole = (v, el) => { if (!A.canDo("access", "edit")) return; const st = S(), set = new Set(logRoles()); v ? set.add(el.dataset.r) : set.delete(el.dataset.r); st.leadLogRoles = [...set]; A.audit("access", `Logs الليدز ${v ? "اتفتحت" : "اتقفلت"} لـ ${A.roleLabel(el.dataset.r)}`); A.toast("اتحفظ"); A.refreshDrawer(); };
  // leads pulled for being idle: Heba (or whoever the rules name) hands each one to a salesperson or back to the rotation
  function draftView(drafts) {
    const D = S().leadRules.draft;
    return `<section class="card">${head("Draft", "layers", chip("warn", drafts.length), `ليدز اتسحبت أوتوماتيك: ${D.days} يوم من غير أي أكشن أو كومنت، والـ Hold بعد ${D.holdDays} يوم · ظاهرة ليكي بس`)}
      ${table(["الليد", "المرحلة", "كان عند", "اتسحب", "آخر أكشن", "وزّعه على"], drafts.sort((a, b) => b.draft.at.localeCompare(a.draft.at)).map((l) => `<tr><td><button class="link" data-act="leadOpen" data-id="${l.id}"><b>${esc(l.name)}</b></button><span class="sub">${esc(l.company || "من غير شركة")} · ${l.id}</span></td><td>${stageChip(l.stage)}</td><td>${A.who(l.draft.from)}</td><td>${A.fmtDate(l.draft.at)}<span class="sub">بعد ${l.draft.days} يوم</span></td><td>${A.ago(A.lastTouch(l))}</td>
        <td>${l.draft.keptAt ? `<span class="hint">اتراجع · فاضل هنا</span>` : A.draftClock(l.draft.at)}<select data-change="draftAssign" data-id="${l.id}" aria-label="وزّع ${esc(l.name)}">${opt("", l.draft.keptAt ? "ابعته لحد…" : "اختار…")}${l.draft.keptAt ? "" : opt("keep", "يفضل في الـ Draft")}${opt("route", "الروتيشن (حسب الـ area)")}${A.activeSales().filter((x) => x !== l.draft.from).map((x) => opt(x, A.person(x))).join("")}<option value="${l.draft.from}">${esc(A.person(l.draft.from))} (رجّعه)</option></select></td></tr>`))}
    </section>`;
  }
  A.ACT.ldTab = (d) => { ui("ldTab", d.v); A.render(); };
  const decided = (l, kind, x, decision) => (l.draftHist = l.draftHist || []).push({ kind, at: x.at, decidedAt: A.nowIso(), by: A.me(), decision });
  // every Not Interested / Cancellation lands here; Heba decides each one: keep it here, or send it to someone
  function draftAdminView(das) {
    const today = A.today(), list = das.sort((a, b) => (a.draftAdmin.reviewed - b.draftAdmin.reviewed) || b.draftAdmin.at.localeCompare(a.draftAdmin.at)), waiting = das.filter((l) => !l.draftAdmin.reviewed).length;
    return `<section class="card">${head("Draft Admin", "layers", waiting ? chip("warn", `${waiting} مستنيين قرارك`) : chip("ok", "كله اتراجع"), "كل Not Interested وCancellation بيتشال أوتوماتيك من عند اللي علّمه وييجي هنا · ظاهر ليكي بس")}
      ${table(["الليد", "بقى", "علّمه", "دخل", "قرارك"], list.map((l) => { const x = l.draftAdmin; return `<tr><td><button class="link" data-act="leadOpen" data-id="${l.id}"><b>${esc(l.name)}</b></button>${isBroker(l) ? " " + chip("info", "Broker") : ""}<span class="sub">${esc(l.company || "من غير شركة")} · ${l.id}</span></td>
        <td>${stageChip(l.stage)}</td><td>${A.who(x.from)}</td><td>${A.fmtDate(x.at)}${x.at.slice(0, 10) === today ? " " + chip("warn", "النهارده") : ""}</td>
        <td>${x.reviewed ? `<span class="hint">اتراجع · فاضل هنا</span>` : A.draftClock(x.at)}<select data-change="daAssign" data-id="${l.id}" aria-label="قرار ${esc(l.name)}">${opt("", x.reviewed ? "ابعته لحد…" : "اختار…")}${x.reviewed ? "" : opt("keep", "يفضل في الـ Draft Admin")}${opt("route", "الروتيشن (حسب الـ area)")}${opt("telesales", "Telesales · " + A.person(S().leadRules.noAnswer.telesales))}${A.activeSales().map((id) => opt(id, A.person(id))).join("")}</select></td></tr>`; }))}
    </section>`;
  }
  A.CHANGE.daAssign = (v, el) => {
    if (!v) return;
    const st = S(), l = st.leads.find((x) => x.id === el.dataset.id), x = l.draftAdmin;
    if (v === "keep") { Object.assign(x, { reviewed: true, reviewedAt: A.nowIso(), reviewedBy: A.me() }); A.log(l, `${A.person(A.me())} راجعته وقررت يفضل في الـ Draft Admin`); A.toast("فاضل في الـ Draft Admin"); A.render(); return; }
    const tele = v === "telesales", to = tele ? st.leadRules.noAnswer.telesales : v === "route" ? A.routeArea(l.area) : v;
    if (!tele && v !== "route") A.assignByHand(to);
    if (!x.reviewed) decided(l, "draftAdmin", x, to);
    Object.assign(l, { owner: tele ? "telesales" : "sales", sales: to, stage: "Fresh", assignedAt: A.nowIso(), touched: false, alerted: false, rotation: 1, draftAdmin: null });
    A.log(l, `اتبعت من الـ Draft Admin لـ ${A.person(to)} (كان ${x.stage} عند ${A.person(x.from)}) · رجع Fresh`); A.audit("leads", `${l.id}: من الـ Draft Admin لـ ${A.person(to)}`);
    A.notify([to], `ليد ${l.name} اتبعتلك من الـ Draft Admin`); A.toast(`راح لـ ${A.person(to)}`); A.render();
  };
  A.ACT.goDraftAdmin = () => { ui("ldTab", "draftAdmin"); location.hash = "#leads"; A.render(); };
  A.CHANGE.draftAssign = (v, el) => {
    if (!v) return;
    const l = S().leads.find((x) => x.id === el.dataset.id);
    if (v === "keep") { Object.assign(l.draft, { keptAt: A.nowIso(), keptBy: A.me() }); A.log(l, `${A.person(A.me())} راجعته وقررت يفضل في الـ Draft`); A.toast("فاضل في الـ Draft"); A.render(); return; }
    const to = v === "route" ? A.routeArea(l.area) : v;
    if (!l.draft.keptAt) decided(l, "draft", l.draft, to);
    if (v !== "route") A.assignByHand(to); // a hand-picked person uses up their turn in the rotation
    Object.assign(l, { sales: to, owner: "sales", assignedAt: A.nowIso(), alerted: false, draft: null });
    A.log(l, `اتوزع من الـ Draft لـ ${A.person(to)}${v === "route" ? " (بالروتيشن)" : ""}`); A.audit("leads", `${l.id}: من الـ Draft لـ ${A.person(to)}`);
    A.notify([to], `ليد ${l.name} اتحوّلك من الـ Draft`); A.toast(`راح لـ ${A.person(to)}`); A.render();
  };
  function openLead(id) { A.openDrawer(() => leadDrawer(id)); }
  function leadDrawer(id) {
    const st = S(), l = st.leads.find((x) => x.id === id); if (!l) return "";
    const r = A.role, tab = ui("ltab") || "overview", s = A.sla(l), edit = r !== "telesales" || l.owner === "telesales";
    const recs = A.recommend(l, l.answers);
    const chips = `${isBroker(l) ? chip("info", "Broker") : ""}${stageChip(l.stage)}${l.everInterested ? chip("ok", "Qualified") : ""}${s ? chip(s.level, s.text) : ""}${l.owner === "telesales" ? chip("info", "مع Telesales") : ""}${l.noAnswer ? chip("warn", `No Answer ×${l.noAnswer} · روتيشن ${l.rotation}`) : ""}`;
    const tabs = U.tabs("ltab", [["overview", "نظرة عامة"], ["units", "الوحدات", recs.length], ["visits", "الزيارات", l.visits.length], ["activity", "Activity", l.comments.filter((c) => c.note).length], ...(canLogs() ? [["logs", "Logs", l.comments.length + (st.audit || []).filter((a) => a.text.includes(l.id)).length]] : [])], tab);
    let body = "";
    if (tab === "overview") body = `
      ${l.stage !== "Not Interested" && l.stage !== "Cancellation" && l.stage !== "Hold" && l.stage !== "No Answer" ? U.stepper(PIPE, PIPE.includes(l.stage) ? l.stage : "Fresh") : ""}
      ${l.tlFlag ? note(`<b>ملاحظة الـ Team Leader:</b> ${esc(l.tlFlag)}`, "warn") : ""}
      ${kv([["الشركة", esc(l.company || "—")], ["الموبايل", l.phones.map((p) => `<span class="mono">${esc(p)}</span>`).join("<br>")], ["Area", esc(l.area || "—")], ["Type", esc(l.type)], ["Space", A.num(l.space) + " م"], ["Condition", esc(l.condition || "—")], ["Budget", A.money(l.budget)], ["Channel", esc(l.channel)], ["Campaign", esc(campName(l.campaign))], ["البوست اللي جابه", esc((st.posts.find((p) => p.id === l.post) || {}).title || "—")], ["Sales", A.who(l.sales)], ["دخل", `${A.fmtDate(l.created)} · ${A.ago(l.created)}`]])}
      ${l.note ? `<div class="quote">${esc(l.note)}</div>` : ""}
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
          ${l.type === "Resale" ? `<select id="ra-pay" data-change="recAns" data-k="payment" data-id="${l.id}">${opt("", "الدفع: أي طريقة", ans.payment)}${S().paymentPlans.map((p) => opt(p, p, ans.payment)).join("")}</select>` : ""}
          ${Object.values(ans).some(Boolean) ? `<button class="btn ghost sm" data-act="recReset" data-id="${l.id}">مسح الإجابات</button>` : ""}
        </div>
        <div class="rec-list">${recs.map((x) => `<label class="rec"><input type="checkbox" class="rec-pick" value="${x.u.code}"><span class="rec-match num">${x.match}%</span><div class="rec-main"><b>${x.u.code} · ${esc(x.u.project)}</b><small>${esc(x.u.area)} · الدور ${esc(x.u.floor || "—")} · ${A.num(x.u.space)} م · ${esc(x.u.condition)} · Parking ${x.u.parking || 0}</small></div><div class="rec-price"><b class="num">${A.money(x.price)}</b><small>${x.u.type === "Rent" ? "في الشهر" : "إجمالي"}</small></div>${x.split ? chip("info", `تتقسم · من ${A.num(x.u.minSplit)} م`) : x.u.area === l.area ? chip("ok", "نفس المنطقة") : ""}</label>`).join("") || U.empty("مفيش وحدات مطابقة. جرّب تشيل إجابة من الأسئلة.", "building")}</div>
        ${edit && recs.length ? `<div class="row end"><button class="btn" data-act="sendList" data-id="${l.id}">${I("file")}اعمل PDF list وابعتها</button></div>` : ""}`;
    }
    if (tab === "visits") body = `
      ${l.visits.map((v, i) => { const due = !v.done && v.at <= A.nowIso(); return `<div class="visit ${v.done ? "done" : due ? "due" : ""}"><div class="v-date"><b>${new Date(v.at).getDate()}</b><small>${new Date(v.at).toLocaleDateString("ar-EG", { month: "short" })}</small></div><div class="v-main"><b>${v.kind || "Visit"} · ${A.fmtTime(v.at)} · ${v.units.map(esc).join("، ") || "وحدات هتتحدد"}</b>${v.extra ? `<small>مساحات مش في الشيت: ${esc(v.extra)}</small>` : ""}${v.postponeReason && v.postpone ? `<small>سبب التأجيل: ${esc(v.postponeReason)}</small>` : ""}${due && !v.postpone ? `<small class="bad-t">${I("bell")}Alarm: ميعاد الـ ${v.kind || "Visit"} جه · دوس Done</small>` : ""}</div>${v.done ? chip("ok", "Done · اتحسبت في الـ activity") : v.notDone ? chip("bad", "معملهاش · ظاهرة للـ HR") : v.postpone === "approved" ? chip("info", "اتأجلت · الـ Team Leader وافق · من غير خصم")
          : v.postpone === "pending" ? `${chip("warn", "اتأجلت · مستنية موافقة الـ Team Leader")}${A.ruleHas(S().leadRules.visit.postpone, l) || A.role === "admin" ? `<button class="btn sm" data-act="visitPostpone" data-id="${l.id}" data-i="${i}" data-ok="1">وافق على التأجيل</button><button class="btn ghost sm" data-act="visitPostpone" data-id="${l.id}" data-i="${i}" data-ok="0">ارفض</button>` : ""}`
          : `<button class="btn sm" data-act="visitDone" data-id="${l.id}" data-i="${i}">Done</button><button class="btn ghost sm" data-act="visitNotDone" data-id="${l.id}" data-i="${i}">معملتهاش</button><button class="btn ghost sm" data-act="visitAskPostpone" data-id="${l.id}" data-i="${i}">اتأجلت</button><button class="btn ghost sm" data-act="visitEdit" data-id="${l.id}" data-i="${i}">تعديل</button>`}</div>`; }).join("") || U.empty("مفيش زيارات لسه", "pin")}
      ${edit ? `<form class="card flat" data-form="visitNew">${head(ui("visitEditIdx") != null ? "تعديل الميعاد" : "Visit / Meeting جديدة", "pin", "", "بتنقل الليد لمرحلة Visit أو Meeting وبتتحسب Check-in للسيلز عند الـ HR")}<input type="hidden" name="id" value="${l.id}">
        <div class="grid">${field("النوع", `<select name="kind" id="vs-kind">${["Visit", "Meeting"].map((k) => opt(k, k, (l.visits[ui("visitEditIdx")] || {}).kind || ui("visitKind") || "Visit")).join("")}</select>`, 1)}
        ${field("الميعاد", `<input name="at" id="vs-at" type="datetime-local" required value="${esc((l.visits[ui("visitEditIdx")] || {}).at ? new Date(l.visits[ui("visitEditIdx")].at).toISOString().slice(0, 16) : "")}">`, 1)}
        ${field("الوحدات (من الانفنتوري)", `<div class="search">${I("search")}<input type="search" form="none" placeholder="دوّر بالكود، المشروع أو المساحة" aria-label="دوّر على وحدة" data-input="vsUnitQ"></div><select name="units" id="vs-units" multiple size="6">${S().units.filter((u) => A.isAvailable(u) || u.status === "available").map((u) => opt(u.code, `${u.code} · ${u.project} · ${u.space} م`, ((l.visits[ui("visitEditIdx")] || {}).units || []).includes(u.code) ? u.code : "")).join("")}</select>`)}
        ${field("مساحات مش موجودة في الشيت", `<input name="extra" id="vs-extra" placeholder="مثلاً: دور 4 في مبنى B6" value="${esc((l.visits[ui("visitEditIdx")] || {}).extra || "")}">`)}</div>
        <div class="row end">${ui("visitEditIdx") != null ? `<button type="button" class="btn ghost" data-act="visitEditCancel">إلغاء</button>` : ""}<button class="btn">${I("pin")}حفظ الميعاد</button></div></form>` : ""}`;
    if (tab === "activity") body = `
      ${edit ? `<section class="card flat">${head("غيّر المرحلة", "layers")}
        <div class="stage-grid">${st.stages.map((x) => `<button class="stage-btn ${x === l.stage ? "on" : ""}" data-act="leadStage" data-id="${l.id}" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>
        <p class="hint">أول ما الليد يوصل Interested أو أي مرحلة بعدها بيتعلّم Qualified أوتوماتيك، ويفضل محسوب في الكامبين والـ channel. Visit بتفتح تاب الزيارات عشان تحدد الميعاد والوحدات.</p></section>` : ""}
      <form class="row" data-form="leadComment"><input type="hidden" name="id" value="${l.id}"><input name="text" id="ld-cm" placeholder="اكتب كومنت أو نتيجة مكالمة" required><button class="btn ghost">إضافة</button></form>
      <div class="timeline">${l.comments.filter((c) => c.note).reverse().map((c) => `<div>${esc(c.text)}<small>${esc(A.person(c.by))} · ${A.fmtDate(c.at)} ${A.fmtTime(c.at)}</small></div>`).join("") || U.empty("مفيش كومنتات لسه", "clock")}</div>`;
    if (tab === "logs" && canLogs()) {
      // everything recorded on the lead by itself, plus its Audit Log lines (pulls, reassignments, postponements…)
      const rows = l.comments.map((c) => ({ ...c, src: c.note ? "كومنت" : "تلقائي" })).concat((st.audit || []).filter((a) => a.text.includes(l.id)).map((a) => ({ by: a.by, at: a.at, text: a.text, src: "Audit" }))).sort((a, b) => (a.at < b.at ? 1 : -1));
      const seen = logRoles();
      body = `${A.canDo("access", "edit") ? `<section class="card flat">${head("مين يشوف الـ Logs", "lock", "", "الأدمن بيشوفها دايماً · بيتطبّق على كل الليدز")}<div class="row">${Object.keys(st.perms).filter((k) => k !== "admin").map((k) => `<label class="tog"><input type="checkbox" ${seen.includes(k) ? "checked" : ""} data-change="logRole" data-r="${k}"><span>${esc(A.roleLabel(k))}</span></label>`).join("")}</div></section>` : ""}
        <div class="timeline">${rows.map((c) => `<div>${chip(c.src === "Audit" ? "warn" : c.src === "كومنت" ? "info" : "", c.src)} ${esc(c.text)}<small>${esc(A.person(c.by) || "السيستم")} · ${A.fmtDate(c.at)} ${A.fmtTime(c.at)}</small></div>`).join("") || U.empty("مفيش Logs لسه", "clock")}</div>`;
    }
    return U.drawer(l.name, `${l.id} · ${l.channel}`, chips, tabs + body);
  }
  A.ACT.ltab = (d) => { ui("ltab", d.v); A.refreshDrawer(); };
  A.CHANGE.recAns = (v, el) => { const l = S().leads.find((x) => x.id === el.dataset.id); l.answers = Object.assign({}, l.answers, { [el.dataset.k]: v }); A.refreshDrawer(); };
  A.ACT.recReset = (d) => { S().leads.find((x) => x.id === d.id).answers = {}; A.refreshDrawer(); };
  A.ACT.leadStage = (d) => {
    const l = S().leads.find((x) => x.id === d.id);
    if (d.v === "Visit" || d.v === "Meeting") { ui("ltab", "visits"); ui("visitKind", d.v); A.refreshDrawer(); A.toast(`حدد ميعاد الـ ${d.v} والوحدات`); return; }
    const was = l.everInterested; A.audit("leads", `${l.id}: ${l.stage} ← ${d.v}`); A.setStage(l, d.v); A.log(l, `المرحلة بقت ${d.v}`);
    A.toast(!was && l.everInterested ? `${d.v} · واتعلّم Qualified في الكامبين والـ channel` : `المرحلة بقت ${d.v}`);
    if (d.v === "Done Deal" && !S().deals.some((x) => x.lead === l.id)) A.ACT.dealNew({ lead: l.id });
    if (d.v === "No Answer") askWa(l);
    A.render();
  };
  A.ACT.leadCall = (d) => { const l = S().leads.find((x) => x.id === d.id); l.touched = true; l.activity = (l.activity || 0) + 1; l.naCallAt = A.nowIso(); A.log(l, "مكالمة اتسجّلت"); A.toast("المكالمة اتسجّلت · الـ SLA وقف"); A.render(); };
  A.FORM.leadComment = (f) => { const l = S().leads.find((x) => x.id === f.id); l.touched = true; l.comments.push({ by: A.me(), at: A.nowIso(), text: f.text, note: true }); A.render(); }; // a person's own comment: shows in Activity
  A.FORM.tlFlag = (f) => { const l = S().leads.find((x) => x.id === f.id); l.tlFlag = f.flag; if (f.flag) { A.log(l, `ملاحظة TL: ${f.flag}`); A.notify(["sales"], `الـ Team Leader كتب على ${l.name}: ${f.flag}`); } A.toast("اتحفظت"); A.render(); };
  A.FORM.reassign = (f) => { const l = S().leads.find((x) => x.id === f.id), from = l.sales; if (from === f.to) return; A.audit("leads", `${l.id}: اتسحب يدوي من ${A.person(from)} لـ ${A.person(f.to)}`); l.sales = f.to; l.owner = "sales"; l.assignedAt = A.nowIso(); l.touched = false; l.alerted = false; A.assignByHand(f.to); A.log(l, `اتسحب يدوي من ${A.person(from)} واتحوّل لـ ${A.person(f.to)}`); A.notify(["sales"], `ليد ${l.name} اتحوّلك من ${A.person(from)}`); A.toast(`اتحوّل لـ ${A.person(f.to)}`); A.render(); };
  A.ACT.sendNewLead = (d) => { const l = S().leads.find((x) => x.id === d.id); Object.assign(l, { newLeadReq: "pending", newLeadReqAt: A.nowIso(), newLeadReqBy: A.me(), newLeadRoutedAt: null, newLeadRoutedBy: null }); A.log(l, "Telesales بعتته كـ New Lead للأوبريشن"); A.notify(["ops"], `Telesales بعتت ${l.name} كـ New Lead`); A.toast("اتبعت للأوبريشن"); A.render(); };
  A.ACT.visitDone = (d) => { const l = S().leads.find((x) => x.id === d.id); l.visits[+d.i].done = true; advance(l, l.visits[+d.i].kind || "Visit"); l.activity = (l.activity || 0) + 1; A.log(l, "الـ Visit خلصت · اتحسبت في الـ activity"); A.render(); };
  A.ACT.visitNotDone = (d) => { const st = S(), l = st.leads.find((x) => x.id === d.id), v = l.visits[+d.i], a = st.attendance.find((x) => x.emp === l.sales && x.day === v.at.slice(0, 10) && x.status === "visit"); v.notDone = true; if (a) a.visitNotDone = true; A.log(l, "الـ Visit اتعلّمت إنها محصلتش"); A.notify(A.ruleTo(st.leadRules.visit.notDone, l), `${A.person(l.sales)}: ${v.kind || "Visit"} ${A.fmtDate(v.at)} اتعلّمت إنها محصلتش`); A.toast("اتسجّلت إنها محصلتش · ظاهرة للـ HR في الحضور"); A.render(); };
  // a postponed Visit goes to Operations (Heba) to confirm; once confirmed that day has no deduction
  // postponing needs a reason; the salesperson's Team Leader (by default) approves or refuses, and Heba is told what happened
  A.ACT.visitAskPostpone = (d) => { const l = S().leads.find((x) => x.id === d.id), v = l.visits[+d.i];
    A.openModal(`تأجيل الـ ${v.kind || "Visit"} · ${l.name}`, `<form data-form="visitPostponeAsk" class="grid"><input type="hidden" name="id" value="${l.id}"><input type="hidden" name="i" value="${d.i}">
      ${field("سبب التأجيل", `<textarea name="reason" id="pp-reason" required placeholder="مثلاً: العميل طلب يأجّل لبكره عشان مسافر"></textarea>`, 1, 1)}
      <p class="hint wide">الطلب هيروح لـ ${esc(A.ruleTo(S().leadRules.visit.postpone, l).map(whoName).join("، ") || "الـ Team Leader")} يوافق أو يرفض.</p>
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">ابعت الطلب</button></div></form>`); };
  A.FORM.visitPostponeAsk = (f) => {
    const st = S(), l = st.leads.find((x) => x.id === f.id), v = l.visits[+f.i], k = v.kind || "Visit", reason = f.reason.trim();
    if (!reason) { A.toast("اكتب سبب التأجيل"); return; }
    Object.assign(v, { postpone: "pending", postponeReason: reason, postponeBy: A.me() });
    A.log(l, `طلب تأجيل الـ ${k} بتاع ${A.fmtDate(v.at)} · السبب: ${reason}`);
    A.notify(A.ruleTo(st.leadRules.visit.postpone, l), `${A.person(l.sales)} عايز يأجّل ${k} ${l.name} (${A.fmtDate(v.at)}) · السبب: ${reason} · محتاج موافقتك`);
    A.closeModal(); A.toast("اتبعت للـ Team Leader يوافق"); A.render();
  };
  A.ACT.visitPostpone = (d) => {
    const st = S(), l = st.leads.find((x) => x.id === d.id), v = l.visits[+d.i], k = v.kind || "Visit", R = st.leadRules.visit, ok = d.ok === "1";
    if (!(A.role === "admin" || A.ruleHas(R.postpone, l))) return;
    const what = `${A.person(A.me())} ${ok ? "وافق على" : "رفض"} تأجيل ${k} ${l.name} بتاع ${A.person(l.sales)} (${A.fmtDate(v.at)}) · السبب: ${v.postponeReason || "—"}`;
    A.notify(A.ruleTo(R.postponeInfo, l).filter((x) => x !== A.me()), what); // Heba: told, not asked
    if (!ok) { v.postpone = null; A.log(l, `${what} · لازم يتعلّم Done أو معملتهاش`); A.notify([l.sales], `${l.name}: الـ Team Leader رفض تأجيل الـ ${k}`); A.toast("اترفض التأجيل"); A.render(); return; }
    v.postpone = "approved";
    const a = st.attendance.find((x) => x.emp === l.sales && x.day === v.at.slice(0, 10) && x.status === "visit"); if (a) a.visitPostponed = true;
    A.log(l, `${what} · اليوم ده من غير خصم`); A.audit("leads", `${l.id}: ${k} ${A.fmtDate(v.at)} اتأجل · ${A.person(l.sales)} من غير خصم · وافق ${A.person(A.me())}`);
    A.notify([l.sales, "hr"], `${A.person(l.sales)}: الـ ${k} بتاع ${A.fmtDate(v.at)} اتأجل واتوافق عليه · من غير خصم`); A.toast("اتوافق على التأجيل · من غير خصم"); A.render();
  };
  A.ACT.visitEdit = (d) => { ui("visitEditIdx", +d.i); A.refreshDrawer(); };
  A.ACT.visitEditCancel = () => { ui("visitEditIdx", null); A.refreshDrawer(); };
  A.FORM.visitNew = (f, form) => {
    const l = S().leads.find((x) => x.id === f.id), units = [...form.querySelector("#vs-units").selectedOptions].map((o) => o.value);
    const kind = f.kind === "Meeting" ? "Meeting" : "Visit", v = { kind, at: new Date(f.at).toISOString(), units, extra: f.extra || "", done: false }, idx = ui("visitEditIdx");
    ui("visitKind", null);
    if (idx != null) { l.visits[idx] = v; A.log(l, `اتعدّل الـ ${kind}: ${A.fmtDate(v.at)} ${A.fmtTime(v.at)}`); ui("visitEditIdx", null); }
    else { l.visits.push(v); const was = l.everInterested; advance(l, `Follow up to ${kind}`); A.log(l, `${kind} ${A.fmtDate(v.at)} ${A.fmtTime(v.at)} على: ${units.join("، ") || "—"}${v.extra ? " · " + v.extra : ""}`); if (!was && l.everInterested) A.toast(`${kind} · واتعلّم Qualified`); }
    const hh = new Date(v.at).getHours() * 60 + new Date(v.at).getMinutes();
    A.toast(`الـ ${kind} اتحفظ · ${hh <= 12 * 60 ? "هتتحسب Check-in من غير تأخير" : "بعد 12: التأخير بيتحسب لحد ميعادها"}`);
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
      ${field("ده", `<select name="kind" id="le-k">${opt("client", "Client (عميل)", l.kind || "client")}${opt("broker", "Broker", l.kind || "client")}</select>`, 1)}
      ${field("الاسم", `<input name="name" id="le-n" value="${esc(l.name)}" required>`, 1)}${field("الشركة", `<input name="company" id="le-c" value="${esc(l.company)}">`)}
      ${field("الموبايل (رقم في كل سطر)", `<textarea name="phones" id="le-p">${esc(l.phones.join("\n"))}</textarea>`, 1)}
      ${field("Area", `<select name="area" id="le-a">${st.areas.map((a) => opt(a, a, l.area)).join("")}</select>`)}${field("Type", `<select name="type" id="le-t">${S().unitPurposes.map((t) => opt(t, t, l.type)).join("")}</select>`)}
      ${field("Space", `<input name="space" id="le-s" type="number" value="${l.space}">`)}${field("Condition", `<select name="condition" id="le-co">${S().finishings.map((t) => opt(t, t, l.condition)).join("")}</select>`)}
      ${field("Budget", `<input name="budget" id="le-b" type="number" value="${l.budget}">`)}${field("Note", `<textarea name="note" id="le-no">${esc(l.note)}</textarea>`, 0, 1)}
      <div class="row end wide"><button class="btn">حفظ</button></div></form>`);
  };
  A.FORM.leadEdit = (f) => { const l = S().leads.find((x) => x.id === f.id), before = JSON.stringify([l.name, l.budget, l.space]); Object.assign(l, { kind: f.kind === "broker" ? "broker" : "client", name: f.name, company: f.company, phones: f.phones.split(/\n|,/).map((s) => s.trim()).filter(Boolean), area: f.area, type: f.type, space: +f.space || 0, condition: f.condition, budget: +f.budget || 0, note: f.note }); A.audit("leads", `${l.id}: اتعدّلت البيانات (${before} ← ${JSON.stringify([l.name, l.budget, l.space])})`); A.log(l, "اتعدّلت بيانات الليد"); A.closeModal(); A.toast("اتحفظ · واتسجّل في الـ Audit Log"); A.render(); };
  A.ACT.leadArchive = (d) => { const l = S().leads.find((x) => x.id === d.id); l.archived = true; A.audit("leads", `${l.id} اتأرشف`); A.closeDrawer(); A.toast(`${l.name} اتأرشف`, () => { l.archived = false; }); A.render(); };

  /* ---------- new lead ---------- */
  A.ACT.leadNew = () => {
    const st = S(), r = A.role;
    A.openModal("ليد جديد", `<form data-form="leadNew" class="grid" id="fLead">
      ${field("ده", `<select name="kind" id="nl-kind">${opt("client", "Client (عميل)", ui("ldTab") === "brokers" ? "broker" : "client")}${opt("broker", "Broker", ui("ldTab") === "brokers" ? "broker" : "client")}</select>`, 1)}
      ${field("الاسم", `<input name="name" id="nl-name" required>`, 1)}
      ${field("الشركة", `<input name="company" id="nl-company" list="coList" data-change="nlCompany" placeholder="اكتب أو اختار من شيت الشركات"><datalist id="coList">${st.companies.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist>`)}
      <div class="field wide" id="nl-newco" hidden></div>
      ${field("الموبايل (رقم في كل سطر)", `<textarea name="phones" id="nl-phones" required placeholder="01xxxxxxxxx" data-input="nlPhones"></textarea>`, 1)}
      <div class="field wide" id="nl-dupe" hidden></div>
      ${field("Area", `<select name="area" id="nl-area" data-change="nlArea" required>${opt("", "اختار")}${st.areas.map((a) => opt(a)).join("")}</select><small class="hint" id="nl-route"></small>`, 1)}
      ${field("Type", `<select name="type" id="nl-type">${S().unitPurposes.map((t) => opt(t)).join("")}</select>`)}
      ${field("Space (م)", `<input name="space" id="nl-space" type="number" min="0">`)}
      ${field("Condition", `<select name="condition" id="nl-cond">${S().finishings.map((t) => opt(t)).join("")}</select>`)}
      ${field("Budget", `<input name="budget" id="nl-budget" type="number" min="0">`)}
      ${field("Channel", `<select name="channel" id="nl-channel" data-change="nlChannel" required>${opt("", "اختار")}${st.channels.map((c) => opt(c)).join("")}</select>`, 1)}
      ${field("Campaign name", `<select name="campaign" id="nl-campaign"><option value="">اختار الـ channel الأول</option></select>`)}
      ${r === "sales" ? `<p class="hint wide">الليد اللي بتدخّله بنفسك بيفضل بتاعك ومش بيدخل التوزيع.</p>` : field("Sales", `<select name="sales" id="nl-sales"><option value="">أوتوماتيك من الـ area</option>${A.sales().map((s) => opt(s.id, s.name + (A.onLeave(s.id) ? " (إجازة)" : ""))).join("")}</select><small class="hint">لو اخترت سيلز بالاسم، بيتعدّى دوره في التوزيع الجاي.</small>`)}
      ${r === "telesales" ? field("الليد يروح لـ", `<select name="keep" id="nl-keep">${opt("route", "التوزيع (حسب الـ area)")}${opt("keep", "يفضل عندي (بكلّمه أنا)")}</select>`) : ""}
      ${field("Note", `<textarea name="note" id="nl-note"></textarea>`, 0, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn" id="nl-save">حفظ الليد</button></div></form>`);
  };
  A.CHANGE.nlChannel = (v) => { document.getElementById("nl-campaign").innerHTML = `<option value="">—</option>` + S().campaigns.filter((c) => c.channel === v).map((c) => opt(c.id, c.name)).join(""); };
  // filters the open visit form's unit list in place (a re-render would drop the picks); picked units always stay visible
  A.CHANGE.vsUnitQ = (v) => { const q = v.trim().toLowerCase(); document.querySelectorAll("#vs-units option").forEach((o) => { o.hidden = !!q && !o.selected && !o.textContent.toLowerCase().includes(q); }); };
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
    const l = { id, selfEntered: mine, kind: f.kind === "broker" ? "broker" : "client", name: f.name, company: f.company || "", phones, area: f.area, type: f.type, space: +f.space || 0, condition: f.condition, budget: +f.budget || 0, channel: f.channel, campaign: f.campaign || "", post: "", sales: salesId, stage: "Fresh", created: A.nowIso(), note: f.note || "", comments: [], visits: [], answers: {}, noAnswer: 0, rotation: 1, everInterested: false, owner: keep ? "telesales" : "sales", tlFlag: "", activity: 0 };
    A.log(l, `اتعمل بواسطة ${A.person(A.me())}${keep ? " · فضل عند Telesales" : mine ? " · فضل عنده (هو اللي دخّله)" : ` · اتوزع لـ ${A.person(salesId)}`}`);
    st.leads.unshift(l);
    if (f.company && !st.companies.some((c) => c.name.toLowerCase() === f.company.toLowerCase())) {
      if (A.role === "telesales" && f.addco) { st.companies.push({ name: f.company, cat: f.cat }); A.toast(`الشركة اتضافت لشيت الشركات تحت ${f.cat}`); }
      else { st.pendingCompanies.push({ name: f.company, lead: id, by: A.me() }); A.notify(["telesales"], `شركة جديدة «${f.company}» اتضافت في ليد ${id} · محتاجة تتضاف لشيت الشركات`); }
    }
    if (!keep && !mine) A.notify(A.ruleTo(st.leadRules.newLead, l), `ليد جديد ${l.name} راح لـ ${A.person(salesId)} (${l.area})`);
    A.closeModal(); A.toast(keep || mine ? "الليد اتحفظ عندك" : `الليد راح لـ ${A.person(salesId)}`); A.render();
  };

  /* ---------- companies sheet ---------- */
  // «شيت الشركات»: one tab per category (62), the same 13 columns in each, and a filter for contracts ending soon (an opportunity)
  const CO_COLS = [["feedback", "feedback"], ["name", "company name"], ["number", "number"], ["contact", "name"], ["title", "title"], ["email", "email"], ["location", "current location"], ["space", "current space"], ["start", "start contract date"], ["end", "end contract date"], ["rent", "average current price rent"], ["escalation", "annual escalation"], ["date", "date"]];
  A.ACT.verifyCall = (d) => { const l = S().leads.find((x) => x.id === d.id);
    A.openModal(`Second Call · ${l.name}`, `<form data-form="verifyDone" class="grid"><input type="hidden" name="id" value="${l.id}">
      <label class="tog"><input type="checkbox" name="called" checked><span>السيلز كلّمه</span></label><label class="tog"><input type="checkbox" name="sent" checked><span>بعتله اللي محتاجه</span></label>
      ${field("النوت", `<textarea name="note" id="vc-note" required placeholder="العميل قال إيه؟"></textarea>`, 1, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("check")}Second Call Done</button></div></form>`); };
  A.FORM.verifyDone = (f) => {
    const l = S().leads.find((x) => x.id === f.id), note = f.note.trim(); if (!note) { A.toast("اكتب النوت"); return; }
    l.verify = { done: true, called: !!f.called, sent: !!f.sent, note, by: A.uid, at: A.nowIso() };
    A.log(l, `Second Call Done · ${l.verify.called ? "السيلز كلّمه" : "السيلز مكلّموش"} · ${l.verify.sent ? "بعتله اللي محتاجه" : "مبعتلوش"} · ${note}`);
    if (!l.verify.called || !l.verify.sent) A.notify(["tl", "salesdir"], `مكالمة تحقق: ${l.name} عند ${A.person(l.sales)} · ${note}`);
    A.closeModal(); A.toast("Second Call Done"); A.render();
  };
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
    Object.assign(l, { owner: "sales", newLeadReq: "done", newLeadRoutedAt: A.nowIso(), newLeadRoutedBy: A.me(), rotation: 1, noAnswer: 0, assignedAt: A.nowIso(), touched: false, alerted: false, stage: "Fresh" });
    const took = l.newLeadReqAt ? A.minsSince(l.newLeadReqAt) : 0, lim = A.newLeadMins();
    A.log(l, `الأوبريشن بعتت الليد كـ New Lead لـ ${A.person(l.sales)} · بعد ${took} دقيقة من استلامه${took > lim ? ` (اتأخر عن ${lim} دقيقة)` : ""}`);
    A.closeModal(); A.toast(`راح لـ ${A.person(l.sales)}`); A.render();
  };

  /* ---------- lead rules: routing, SLA, No Answer, Visit, Done Deal · every number and person is editable ---------- */
  const RL = () => S().leadRules;
  const getP = (path) => path.split(".").reduce((o, k) => o[k], RL());
  const setP = (path, v) => { const ks = path.split("."), last = ks.pop(); ks.reduce((o, k) => o[k], RL())[last] = v; };
  const whoName = (x) => (x === "owner" ? "السيلز المسؤول عن الليد" : x === "ownerTl" ? "الـ Team Leader بتاع السيلز" : S().perms[x] ? A.roleLabel(x) : A.person(x));
  const names = (path) => getP(path).to.map(whoName).join("، ") || "محدش";
  const CH = [["app", "جوه السيستم"], ["push", "Push"], ["email", "إيميل"]];
  // who gets told / is responsible, and how
  const whoBox = (path, label, ed, noCh) => { const w = getP(path); return `<div class="field"><span>${esc(label)}</span>
    <div class="row">${w.to.map((x) => (ed ? `<button class="btn ghost sm" data-act="ruleWhoDel" data-p="${path}" data-v="${esc(x)}" aria-label="شيل ${esc(whoName(x))}">${esc(whoName(x))} ${I("x")}</button>` : chip("info", whoName(x)))).join("") || `<span class="hint">محدش</span>`}
      ${ed ? `<select data-change="ruleWhoAdd" data-p="${path}" aria-label="ضيف لـ ${esc(label)}" style="max-width:200px">${opt("", "+ ضيف دور أو شخص")}${opt("owner", "السيلز المسؤول عن الليد")}${opt("ownerTl", "الـ Team Leader بتاع السيلز")}<optgroup label="أدوار">${Object.keys(S().perms).filter((k) => !w.to.includes(k)).map((k) => opt(k, A.roleLabel(k))).join("")}</optgroup><optgroup label="أشخاص">${S().users.filter((u) => u.status === "active" && !w.to.includes(u.id)).map((u) => opt(u.id, A.person(u.id))).join("")}</optgroup></select>` : ""}</div>
    ${noCh ? "" : `<div class="row">${CH.map(([c, l]) => `<label class="tog"><input type="checkbox" ${w.ch.includes(c) ? "checked" : ""} ${ed ? "" : "disabled"} data-change="ruleCh" data-p="${path}" data-c="${c}"><span>${l}</span></label>`).join("")}</div>`}</div>`; };
  // k = "min": saved in minutes, typed in hours
  const numIn = (path, label, unit, ed, k) => field(label, `<div class="row"><input type="number" min="${k === "min" ? 0.25 : 1}" step="${k === "min" ? 0.25 : 1}" value="${k === "min" ? getP(path) / 60 : getP(path)}" ${ed ? "" : "disabled"} data-change="ruleNum" data-p="${path}" data-k="${k || ""}" aria-label="${esc(label)}" style="max-width:110px"><span class="hint">${unit}</span></div>`);
  const timeIn = (path, label, ed) => { const m = getP(path); return field(label, `<input type="time" value="${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}" ${ed ? "" : "disabled"} data-change="ruleTime" data-p="${path}" style="max-width:140px">`); };
  const says = (t) => `<p class="rule-says">${I("bolt")}<span>${t}</span></p>`;
  const DAYS = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];
  V.settings = {
    sub: () => "التوزيع والمواعيد والـ SLA والـ No Answer والإقفال · كل رقم وكل شخص مسؤول بيتعدّل من هنا",
    render() {
      const st = S(), edit = A.canDo("settings", "edit"), order = A.activeSales(), manual = !!A.manualOrder(), t = ui("rlTab") || "routing", r = st.leadRules, ed = edit;
      const tabs = U.tabs("rlTab", [["routing", "التوزيع"], ["sla", "المواعيد والـ SLA"], ["na", "No Answer"], ["draft", "Draft"], ["visit", "Visit و Meeting"], ["close", "الإقفال"]], t);
      const ro = edit ? "" : note("عرض بس · التعديل محتاج صلاحية «يعدّل» على إعدادات التوزيع");
      if (t === "routing") return tabs + ro + `<div class="cols wide"><section class="card">${head("إعدادات توزيع المناطق", "route", edit ? "" : chip("", "عرض بس"), "لما حد يختار area في الليد، الليد بيروح دايركت للسيلز دول")}
        ${table(["Area", ...A.sales().map((s) => `<span class="who">${A.avatar(s.id, 1)}${esc(s.name.split(" ")[0])}</span>`)], st.areas.map((a) => `<tr><td><b>${esc(a)}</b><span class="sub num">${(st.areaRouting[a] || []).length} سيلز</span></td>${A.sales().map((s) => `<td><label class="tick"><input type="checkbox" ${(st.areaRouting[a] || []).includes(s.id) ? "checked" : ""} ${edit ? "" : "disabled"} data-change="route" data-a="${esc(a)}" data-s="${s.id}" aria-label="${esc(a)} · ${esc(s.name)}"><span></span></label></td>`).join("")}</tr>`))}
        <p class="hint">لو الـ area ليها أكتر من سيلز، الليدز بتتوزع بينهم بترتيب الروتيشن النهارده. والسيلز اللي في إجازة معتمدة بيتشال من التوزيع لوحده.</p></section>
        <div class="stack"><section class="card">${head("ترتيب الروتيشن النهارده", "users", manual ? chip("warn", "متعدّل يدوي") : chip("ok", "أوتوماتيك بالبصمة"), "أول واحد بصم بياخد أول ليد، واللي عنده Visit بيتحسب من ميعادها. تقدر تغيّر الترتيب في أي وقت النهارده")}
          ${order.map((id, i) => { const v = A.dayVisit(id), t = v ? `${v.kind || "Visit"} ${A.hm(A.checkIn(id))}${v.done ? " · Done" : v.postpone === "approved" ? " · اتأجل" : ""}` : A.checkIn(id) == null ? "مابصمش لسه" : `بصم ${A.hm(A.checkIn(id))}`;
            return `<div class="line-item"><b class="num">${i + 1}</b><span>${A.who(id)}</span><small class="hint num">${t}</small>${edit ? `<button class="btn ghost sm" data-act="orderMove" data-id="${id}" data-dir="-1" ${i ? "" : "disabled"} aria-label="طلّع ${esc(A.person(id))} لفوق">↑</button><button class="btn ghost sm" data-act="orderMove" data-id="${id}" data-dir="1" ${i < order.length - 1 ? "" : "disabled"} aria-label="نزّل ${esc(A.person(id))} لتحت">↓</button>` : ""}</div>`; }).join("") || `<p class="hint">مفيش سيلز شغالين النهارده</p>`}
          ${manual && edit ? `<div class="row end"><button class="btn ghost sm" data-act="orderAuto">رجّعه أوتوماتيك بالبصمة</button></div>` : ""}
        </section>
        </div></div>`;
      if (t === "sla") return `${tabs}${ro}<div class="cols">
        <section class="card">${head("ساعات حساب الـ SLA", "clock", "", "الـ SLA بيعدّ في الساعات دي بس، والإجازات الرسمية مابتتحسبش")}
          <div class="grid">${timeIn("work.from", "من", ed)}${timeIn("work.to", "لحد", ed)}</div>
          <div class="field"><span>أيام الأجازة الأسبوعية</span><div class="row">${DAYS.map((d, i) => `<label class="tog"><input type="checkbox" ${r.work.off.includes(i) ? "checked" : ""} ${ed ? "" : "disabled"} data-change="ruleOff" data-d="${i}"><span>${d}</span></label>`).join("")}</div></div>
</section>
        <section class="card">${head("الليد الجديد من غير أكشن (SLA)", "alert", `<label class="tog"><input type="checkbox" ${r.sla.on ? "checked" : ""} ${ed ? "" : "disabled"} data-change="ruleOn" data-p="sla.on"><span>شغالة</span></label>`)}
          ${says(`ليد Fresh فضل <b>${A.dur(r.sla.warnMin)}</b> من غير أكشن ← تنبيه لـ <b>${names("sla.warn")}</b>. لو كمّل <b>${A.dur(r.sla.pullMin)}</b> ← يتسحب للي عليه الدور ويتبعت لـ <b>${names("sla.pull")}</b>. يوم الإجازة: تنبيه بعد ${A.dur(r.sla.holWarnMin)} وسحب بعد ${A.dur(r.sla.holPullMin)}.`)}
          <div class="grid">${numIn("sla.warnMin", "التنبيه بعد", "ساعة", ed, "min")}${numIn("sla.pullMin", "السحب بعد", "ساعة", ed, "min")}${numIn("sla.holWarnMin", "التنبيه يوم الإجازة", "ساعة", ed, "min")}${numIn("sla.holPullMin", "السحب يوم الإجازة", "ساعة", ed, "min")}</div>
          ${whoBox("sla.warn", "التنبيه بيروح لـ", ed)}${whoBox("sla.pull", "السحب بيتبعت لـ", ed)}</section>
        <section class="card">${head("الإجازات الرسمية", "calendar", A.isHolidayToday() ? chip("warn", "النهارده إجازة") : "", "من يوم لـ يوم (زي العيد) · في أيامها الـ SLA بيمشي بمواعيد يوم الإجازة")}${U.holidays(ed, true)}<p class="hint">ده اللي جاي بس · الكالندر كامل في الإعدادات ← الإجازات الرسمية</p></section>
        <section class="card">${head("ليد جديد اتوزع", "users")}${says(`أول ما ليد يتوزع، بيتبعت إشعار لـ <b>${names("newLead")}</b>.`)}${whoBox("newLead", "الإشعار بيروح لـ", ed)}</section></div>`;
      if (t === "na") return `${tabs}${ro}<section class="card">${head("No Answer", "phone")}
          ${says(`لما السيلز يعلّم No Answer، الليد بيفضل عنده <b>${A.dur(r.noAnswer.hours * 60)}</b>، وكل <b>${r.noAnswer.remindH} ساعات</b> بيجيله تنبيه يكلّمه. بعدها بيروح للسيلز اللي عليه الدور ويرجع Fresh، وبيتنقل تاني بس لو السيلز ده كمان علّمه No Answer. في الروتيشن رقم <b>${r.noAnswer.toTelesalesAt}</b> بيروح لـ <b>${esc(A.person(r.noAnswer.telesales))}</b> (Telesales)، والإشعار لـ <b>${names("noAnswer.notify")}</b>.`)}
          <div class="grid">${numIn("noAnswer.hours", "يفضل عند كل سيلز", "ساعة بعد ما يعلّمه No Answer", ed)}${numIn("noAnswer.remindH", "تنبيه المكالمة كل", "ساعات", ed)}${numIn("noAnswer.toTelesalesAt", "يروح لـ Telesales في الروتيشن رقم", "", ed)}
          ${field("الـ Telesales اللي بيستلم", `<select data-change="ruleSel" data-p="noAnswer.telesales" ${ed ? "" : "disabled"}>${st.users.filter((u) => A.rolesOf(u.id).includes("telesales")).map((u) => opt(u.id, A.person(u.id), r.noAnswer.telesales)).join("")}</select>`)}</div>
          ${whoBox("noAnswer.notify", "لما يروح لـ Telesales الإشعار بيروح لـ", ed)}</section>`;
      if (t === "draft") return `${tabs}${ro}<section class="card">${head("السحب للـ Draft", "layers", `<label class="tog"><input type="checkbox" ${r.draft.on ? "checked" : ""} ${ed ? "" : "disabled"} data-change="ruleOn" data-p="draft.on"><span>شغالة</span></label>`)}
          ${says(`ليد عدّى عليه <b>${r.draft.days} يوم</b> من غير أي أكشن أو كومنت (أو <b>${r.draft.holdDays} يوم</b> وهو على Hold) ← بيتسحب من السيلز ويروح Draft، والإشعار لـ <b>${names("draft.notify")}</b>. الـ Draft ظاهر لـ <b>${names("draft.see")}</b> بس. مابيتسحبش لو Done Deal أو Cancellation أو Not Interested أو No Answer (ليه روتيشن خاص بيه).`)}
          <div class="grid">${numIn("draft.days", "يتسحب بعد", "يوم من غير أكشن", ed)}${numIn("draft.holdDays", "الـ Hold يتسحب بعد", "يوم", ed)}</div>
          ${whoBox("draft.see", "مين يشوف الـ Draft ويوزّع منه", ed, 1)}${whoBox("draft.notify", "الإشعار لما ليد يتسحب بيروح لـ", ed)}</section>
        <section class="card">${head("Draft Admin", "layers", `<label class="tog"><input type="checkbox" ${r.draftAdmin.on ? "checked" : ""} ${ed ? "" : "disabled"} data-change="ruleOn" data-p="draftAdmin.on"><span>شغالة</span></label>`)}
          ${says(`أي ليد يتعلّم <b>Not Interested</b> أو <b>Cancellation</b> (من السيلز أو Telesales) بيتشال أوتوماتيك من عنده ويروح الـ Draft Admin. ظاهر لـ <b>${names("draftAdmin.see")}</b> بس، وكل يوم بيظهرلهم Alarm في الرئيسية باللي دخل عشان يقرروا.`)}
          ${whoBox("draftAdmin.see", "مين يشوف الـ Draft Admin ويقرر", ed, 1)}${whoBox("draftAdmin.notify", "الإشعار لما ليد يدخل بيروح لـ", ed)}</section>`;
      if (t === "visit") return `${tabs}${ro}<div class="cols">
        <section class="card">${head("تأجيل الـ Visit / Meeting", "pin")}${says(`لما السيلز يدوس «اتأجلت» لازم يكتب السبب، والطلب بيروح لـ <b>${names("visit.postpone")}</b> يوافق أو يرفض. لو وافق، اليوم ده من غير خصم. وفي الحالتين بيتبلّغ <b>${names("visit.postponeInfo")}</b> باللي حصل.`)}${whoBox("visit.postpone", "اللي بيوافق على التأجيل", ed)}${whoBox("visit.postponeInfo", "بيتبلّغ باللي حصل", ed)}</section>
        <section class="card">${head("Visit / Meeting معملهاش", "alert")}${says(`لما تتعلّم «معملتهاش»، بيرجع للبصمة بخصمها، والإشعار بيروح لـ <b>${names("visit.notDone")}</b>.`)}${whoBox("visit.notDone", "الإشعار بيروح لـ", ed)}</section></div>`;
      return `${tabs}${ro}<section class="card">${head("الإقفال (Done Deal)", "handshake")}
          ${says(`لو الصفقة اتقفلت في خلال <b>${A.dur(r.close.alarmH * 60)}</b> من ما الليد اتعمل، بيطلع Alarm إنها اتسجّلت وقت القفل بس، ومابتدخلش التارجت. الإشعار بيروح لـ <b>${names("close.notify")}</b>.`)}
          <div class="grid">${numIn("close.alarmH", "الـ Alarm لو اتقفلت في خلال", "ساعة", ed)}</div>${whoBox("close.notify", "الإشعار بيروح لـ", ed)}</section>`;
    }
  };
  A.ACT.rlTab = (d) => { ui("rlTab", d.v); A.render(); };
  // a rule change applies at once and goes to the Audit Log; bad combinations are refused
  const ruleSave = (path, v, text) => {
    if (!A.canDo("settings", "edit")) return;
    const before = JSON.stringify(getP(path)); setP(path, v);
    const r = RL(), bad = r.sla.warnMin >= r.sla.pullMin || r.sla.holWarnMin >= r.sla.holPullMin ? "التنبيه لازم ييجي قبل السحب" : r.work.from >= r.work.to ? "ميعاد البداية لازم يبقى قبل النهاية" : r.work.off.length > 6 ? "لازم يبقى فيه يوم شغل واحد على الأقل" : "";
    if (bad) { setP(path, JSON.parse(before)); A.toast(bad); A.render(); return; }
    A.audit("settings", `قواعد الليدز · ${text}`); A.toast("اتحفظ · بيتطبّق على طول"); A.render();
  };
  A.CHANGE.ruleNum = (v, el) => { const x = +v; if (!(x > 0)) { A.toast("الرقم لازم يبقى أكبر من صفر"); A.render(); return; } ruleSave(el.dataset.p, el.dataset.k === "min" ? Math.round(x * 60) : Math.round(x), `${el.getAttribute("aria-label")}: ${v}`); };
  A.CHANGE.ruleTime = (v, el) => { if (!v) return; const [h, m] = v.split(":").map(Number); ruleSave(el.dataset.p, h * 60 + m, `ساعات الـ SLA: ${el.dataset.p === "work.from" ? "من" : "لحد"} ${v}`); };
  A.CHANGE.ruleOff = (v, el) => { const d = +el.dataset.d, off = RL().work.off.filter((x) => x !== d); ruleSave("work.off", v ? [...off, d] : off, `${DAYS[d]} ${v ? "بقى أجازة" : "بقى يوم شغل"}`); };
  A.CHANGE.ruleOn = (v, el) => ruleSave(el.dataset.p, !!v, `${{ "draft.on": "السحب للـ Draft", "draftAdmin.on": "الـ Draft Admin" }[el.dataset.p] || "الـ SLA"} ${v ? "اتشغل" : "اتقفل"}`);
  A.CHANGE.ruleSel = (v, el) => ruleSave(el.dataset.p, v, `الـ Telesales اللي بيستلم بقى ${A.person(v)}`);
  A.CHANGE.ruleWhoAdd = (v, el) => { if (!v) return; const w = getP(el.dataset.p); ruleSave(el.dataset.p, { ...w, to: [...w.to, v] }, `${whoName(v)} اتضاف`); };
  A.ACT.ruleWhoDel = (d) => { const w = getP(d.p); ruleSave(d.p, { ...w, to: w.to.filter((x) => x !== d.v) }, `${whoName(d.v)} اتشال`); };
  A.CHANGE.ruleCh = (v, el) => { const w = getP(el.dataset.p), c = el.dataset.c; ruleSave(el.dataset.p, { ...w, ch: v ? [...new Set([...w.ch, c])] : w.ch.filter((x) => x !== c) }, `قناة ${c} ${v ? "اتفتحت" : "اتقفلت"}`); };
  A.ACT.orderMove = (d) => {
    const ids = A.activeSales(), i = ids.indexOf(d.id), j = i + +d.dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    S().dayOrder = { day: A.today(), ids };
    A.audit("leads", `ترتيب الروتيشن النهارده اتعدّل يدوي: ${ids.map(A.person).join("، ")}`);
    A.toast(`اتحفظ · الترتيب ده للنهارده بس`); A.render();
  };
  A.ACT.orderAuto = () => { delete S().dayOrder; A.audit("leads", "ترتيب الروتيشن رجع أوتوماتيك بالبصمة"); A.toast("رجع أوتوماتيك بالبصمة"); A.render(); };
  A.CHANGE.route = (v, el) => { const st = S(), p = (st.areaRouting[el.dataset.a] = st.areaRouting[el.dataset.a] || []), i = p.indexOf(el.dataset.s); if (v && i < 0) p.push(el.dataset.s); if (!v && i >= 0) p.splice(i, 1); A.toast("اتحفظ"); A.render(); };
})();
