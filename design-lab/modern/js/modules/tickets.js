/* M-06 Internal tickets: thread + Audit Trail, transfer, escalation, response rate. Also self-service requests. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  // response time by request type (KPI cards read the share answered in time): dispute 48h · HR letter 24h · purchase/maintenance 48h · otherwise 24h (4h if urgent)
  const SLA_H = { dispute: 48, hr_letter: 24, purchase: 48 };
  const LIMIT = (t) => (SLA_H[t.type] || (t.priority === "عالية" ? 4 : 24)) * 60;
  A.ticketLate = (t) => LIMIT(t) < (t.firstReply ? (new Date(t.firstReply) - new Date(t.created)) / 6e4 : A.minsSince(t.created));
  const late = (t) => ["Open", "In Progress"].includes(t.status) && !t.firstReply && A.minsSince(t.created) > LIMIT(t);
  const ST = { "Pending TL": "warn", Open: "warn", "In Progress": "info", Resolved: "ok", Closed: "ok", Rejected: "bad" };
  const myTeam = (id) => (S().people.find((p) => p.id === id) || {}).tl === A.me();
  const scope = () => { const r = A.role, m = A.me(), dept = A.deptOf(r); return S().tickets.filter((t) => r === "admin" || t.from === m || (t.dept === dept && t.status !== "Pending TL") || (r === "tl" && t.status === "Pending TL" && myTeam(t.from))); };
  const respMins = (dept) => { const ts = S().tickets.filter((t) => t.dept === dept && t.firstReply); return ts.length ? Math.round(ts.reduce((s, t) => s + (new Date(t.firstReply) - new Date(t.created)) / 60000, 0) / ts.length) : null; };

  V.tickets = {
    sub: () => "الطلبات بين الأقسام بدل الواتساب · Audit Trail · Excuse للـ HR",
    render() {
      const r = A.role, f = ui("tkF") || "mine", dept = A.deptOf(r), all = scope();
      const list = (f === "team" ? all.filter((t) => t.status === "Pending TL") : f === "assigned" ? all.filter((t) => t.dept === dept) : f === "late" ? all.filter(late) : f === "closed" ? all.filter((t) => ["Resolved", "Closed"].includes(t.status)) : f === "mine" ? all.filter((t) => t.from === A.me() || r === "admin") : all)
        .sort((a, b) => (late(b) - late(a)) || ((b.priority === "عالية") - (a.priority === "عالية")) || a.created.localeCompare(b.created));
      return `<div class="kpis">${U.kpi("مفتوحة", all.filter((t) => ["Open", "In Progress"].includes(t.status)).length, "Open · In Progress", "ticket")}${U.kpi("متأخرة", all.filter(late).length, "اتصعّدت لمدير القسم", "alert", "bad", "tkLate")}${U.kpi("متوسط وقت الرد", dept && respMins(dept) != null ? A.num(respMins(dept)) + " د" : "—", dept ? `قسم ${dept}` : "", "clock", "warn")}${U.kpi("اتقفلت", all.filter((t) => t.status === "Closed").length, "القسم اللي نفّذ بيقفلها", "check", "ok")}</div>
        <div class="row">${U.tabs("tkF", [["mine", "طلباتي"], r === "tl" ? ["team", "Excuse فريقي", all.filter((t) => t.status === "Pending TL").length || null] : null, dept ? ["assigned", `مسندة لقسم ${dept}`] : null, ["late", "متأخرة"], ["closed", "اتقفلت"], ["all", "الكل"]].filter(Boolean), f)}<span class="spacer"></span>
          <button class="btn ghost" data-act="selfReq" data-k="leave">${I("calendar")}طلب إجازة</button><button class="btn ghost" data-act="selfReq" data-k="outside">${I("pin")}شغل من بره</button><button class="btn" data-act="tkNew">${I("plus")}تذكرة جديدة</button></div>
        <div class="tk-list">${list.map((t) => `<article class="tk ${late(t) ? "late" : ""}" data-act="tkOpen" data-id="${t.id}"><div class="tk-side">${A.avatar(t.from)}</div><div class="tk-main"><div class="row"><b class="spacer">${esc(t.title)}</b>${t.type === "excuse" ? chip("info", "Excuse") : ""}${t.type === "dispute" ? chip("bad", "نزاع") : ""}${t.priority === "عالية" ? chip("warn", "عالية") : ""}${chip(ST[t.status], t.status)}</div><small>${t.id} · من ${esc(A.person(t.from))} → ${esc(t.dept)} · ${A.ago(t.created)} · ${t.log.length} حركة${late(t) ? ` · <b class="bad-t">اتأخرت · اتصعّدت</b>` : ""}</small></div></article>`).join("") || U.empty("مفيش تذاكر هنا", "ticket")}</div>
        ${note("الرد خلال 24 ساعة عمل (4 ساعات لو الأولوية عالية)، ولو اتأخرت بتتصعّد لمدير القسم. كل تذكرة ليها سجل زمني رسمي (Audit Trail) ومعدل استجابة لكل قسم.")}
        <section class="card">${head("معدل الاستجابة لكل قسم", "chart")}${U.hbars(S().ticketDepts.map((d) => ({ label: d, sub: `${S().tickets.filter((t) => t.dept === d).length} تذكرة`, value: respMins(d) || 0 })), (v) => (v ? v + " د" : "—"))}</section>`;
    }
  };
  A.ACT.tkF = (d) => { ui("tkF", d.v); A.render(); };
  A.ACT.tkLate = () => { ui("tkF", "late"); A.render(); };
  A.ACT.tkOpen = (d) => A.openDrawer(() => tkDrawer(d.id));
  function tkDrawer(id) {
    const t = S().tickets.find((x) => x.id === id); if (!t) return "";
    const r = A.role, mine = t.from === A.me(), handler = t.dept === A.deptOf(r) || r === "admin", open = ["Open", "In Progress"].includes(t.status);
    const KIND = { open: ["فتح", "ticket"], reply: ["رد", "send"], transfer: ["تحويل", "swap"], status: ["حالة", "check"], close: ["قفل", "lock"], escalate: ["تصعيد", "alert"] };
    const body = `${late(t) ? note(`<b>اتأخرت:</b> عدّى ${Math.floor(A.minsSince(t.created) / 60)} ساعة من غير رد · اتصعّدت لمدير قسم ${esc(t.dept)}.`, "warn") : ""}
      ${U.stepper(["Open", "In Progress", "Resolved", "Closed"], t.status)}
      ${kv([["من", A.who(t.from)], ["القسم", esc(t.dept)], ["الأولوية", esc(t.priority)], ["اتفتحت", `${A.fmtDate(t.created)} ${A.fmtTime(t.created)}`], ["أول رد", t.firstReply ? `بعد ${Math.round((new Date(t.firstReply) - new Date(t.created)) / 60000)} د` : "لسه"]])}
      <h4 class="mini-h">Audit Trail</h4><div class="thread">${t.log.map((x) => `<div class="msg ${x.by === t.from ? "me" : ""} k-${x.kind}">${A.avatar(x.by, 1)}<div><small>${esc(A.person(x.by))} · ${(KIND[x.kind] || ["", ""])[0]} · ${A.fmtDate(x.at)} ${A.fmtTime(x.at)}</small><p>${esc(x.text)}</p></div></div>`).join("")}</div>
      ${open && (handler || mine) ? `<form class="card flat" data-form="tkReply"><input type="hidden" name="id" value="${t.id}"><textarea name="text" id="tk-r" required placeholder="اكتب رد"></textarea><div class="row end">${handler ? `<select name="status" id="tk-s">${opt("", "من غير تغيير الحالة")}${opt("In Progress", "In Progress")}${opt("Resolved", "Resolved · خلّصت")}</select>` : ""}<button class="btn">${I("send")}ابعت</button></div></form>` : ""}
      ${open && handler ? `<form class="row" data-form="tkTransfer"><input type="hidden" name="id" value="${t.id}"><span class="hint">اتبعتت للقسم الغلط؟</span><select name="dept" id="tk-tr">${S().ticketDepts.filter((d) => d !== t.dept).map((d) => opt(d)).join("")}</select><button class="btn ghost sm">${I("swap")}حوّلها</button></form>` : ""}
      ${t.status === "Pending TL" && r === "tl" && myTeam(t.from) ? `<div class="row end"><button class="btn danger" data-act="tkTl" data-id="${t.id}" data-v="no">رفض</button><button class="btn" data-act="tkTl" data-id="${t.id}" data-v="ok">${I("check")}موافقة · ابعتها للـ HR</button></div>` : t.status === "Pending TL" ? note("مستنية موافقة الـ Team Leader الأول.") : ""}
      ${handler && t.status === "Resolved" ? `<button class="btn" data-act="tkClose" data-id="${t.id}">${I("check")}الطلب اتنفّذ · اقفلها</button>` : ""}`;
    return U.drawer(t.title, `${t.id} · ${t.dept}`, chip(ST[t.status], t.status) + (t.type === "excuse" ? chip("info", "Excuse") : ""), body);
  }
  const push = (t, kind, text) => t.log.push({ at: A.nowIso(), by: A.me(), kind, text });
  A.FORM.tkReply = (f) => { const t = S().tickets.find((x) => x.id === f.id); push(t, "reply", f.text); if (t.from !== A.me() && !t.firstReply) t.firstReply = A.nowIso(); if (f.status) { t.status = f.status; push(t, "status", `الحالة بقت ${f.status}`); } else if (t.status === "Open" && t.from !== A.me()) t.status = "In Progress"; A.render(); };
  A.FORM.tkTransfer = (f) => { const t = S().tickets.find((x) => x.id === f.id); push(t, "transfer", `اتحوّلت من ${t.dept} لـ ${f.dept}`); t.dept = f.dept; A.notify([{ HR: "hr", Inventory: "inventory", Marketing: "marketing", Accounts: "accountant", Operations: "ops" }[f.dept]], `تذكرة اتحوّلت لقسمك: ${t.title}`); A.toast(`اتحوّلت لـ ${f.dept} · السجل محفوظ`); A.render(); };
  A.ACT.tkClose = (d) => { const t = S().tickets.find((x) => x.id === d.id); t.status = "Closed"; push(t, "close", `قسم ${t.dept} نفّذ الطلب وقفل التذكرة`); A.render(); };
  A.ACT.tkNew = () => A.openModal("تذكرة جديدة", `<form data-form="tkNew" class="grid">
    ${field("للقسم", `<select name="dept" id="tk-dept">${S().ticketDepts.map((d) => opt(d)).join("")}</select>`, 1)}
    ${field("النوع", `<select name="type" id="tk-type">${opt("", "طلب عادي")}${opt("excuse", "Excuse (الـ Team Leader الأول ثم الـ HR)")}${opt("hr_letter", "HR Letter (للـ HR على طول · 24 ساعة)")}${opt("dispute", "نزاع (للـ Office Manager · يتحسم في 48 ساعة)")}${opt("purchase", "شراء / صيانة (لمختار · 48 ساعة)")}${opt("finance", "فيه بيانات مالية أو صلاحيات")}</select>`)}
    ${field("الأولوية", `<select name="priority" id="tk-pr">${opt("عادية")}${opt("عالية")}</select>`)}
    ${field("الطلب", `<textarea name="title" id="tk-title" required></textarea>`, 1, 1)}
    <div class="row end wide"><span class="hint spacer">الطلبات المالية أو الصلاحيات بتحتاج موافقة مدير القسم الأول.</span><button class="btn">${I("send")}ابعت</button></div></form>`);
  A.FORM.tkNew = (f) => {
    // Q34: an Excuse goes to the Team Leader first, then to HR (Basant) to record; Q36: an HR Letter goes straight to HR
    const st = S(), toHR = ["excuse", "hr_letter"].includes(f.type), dept = toHR ? "HR" : f.type === "dispute" ? "الإدارة" : f.type === "purchase" ? "Accounts" : f.dept, tlFirst = f.type === "excuse" && (st.people.find((p) => p.id === A.me()) || {}).tl, t = { id: "TK-" + (75 + st.tickets.length), from: A.me(), dept, type: f.type, title: f.title, priority: f.priority, status: tlFirst ? "Pending TL" : "Open", created: A.nowIso(), log: [] };
    push(t, "open", f.type === "finance" ? "اتفتحت · مستنية موافقة مدير القسم" : tlFirst ? "اتفتحت · مستنية موافقة الـ Team Leader" : "اتفتحت"); st.tickets.unshift(t);
    if (tlFirst) A.notify(["tl"], `Excuse من ${A.person(A.me())} مستني موافقتك`);
    else if (f.type === "excuse") excuseToHR(t, A.me());
    else A.notify([{ HR: "hr", Inventory: "inventory", Marketing: "marketing", Accounts: "accountant", Operations: "ops" }[dept]], `تذكرة جديدة لقسمك: ${f.title}`);
    A.closeModal(); A.toast(tlFirst ? "اتبعتت للـ Team Leader الأول" : "التذكرة اتبعتت"); A.render();
  };
  A.ACT.tkTl = (d) => { const t = S().tickets.find((x) => x.id === d.id); if (d.v === "ok") { t.status = "Open"; push(t, "status", "الـ Team Leader وافق · وصلت للـ HR تسجّلها"); excuseToHR(t, t.from); A.toast("اتوافق · وصلت للـ HR"); } else { t.status = "Rejected"; push(t, "status", "الـ Team Leader رفض"); A.notify(["sales"], `الـ Excuse بتاعك اترفض`); A.toast("اترفضت"); } A.render(); };
  function excuseToHR(t, emp) {
    const st = S(), n = st.excuses.filter((x) => x.emp === emp && x.day.slice(0, 7) === A.today().slice(0, 7)).length + 1;
    st.excuses.push({ emp, day: A.today(), n }); push(t, "status", "وصلت لبسنت (الـ HR) تسجّلها · وقت الوصول بيتسجّل من البصمة");
    const a = st.attendance.find((x) => x.emp === emp && x.day === A.today()); if (a && a.status === "auto") a.status = "excuse";
    // Q31: the 5th Excuse is not accepted; management and HR get an alert and decide
    A.notify(["hr", ...(n >= 5 ? ["admin"] : [])], `Alarm: ${A.person(emp)} طلب Excuse رقم ${n} الشهر ده${n >= 5 ? " · الخامس: الـ Excuse ميتقبلش، والإدارة والـ HR ياخدوا القرار" : n >= 3 ? " · خصم نص يوم" : ""}`);
  };
  A.ACT.selfReq = (d) => A.openModal(d.k === "leave" ? "طلب إجازة" : "طلب شغل من بره / عذر غياب", d.k === "leave" ? `<form data-form="leaveNew" class="grid">${field("النوع", `<select name="type" id="lv-t">${["سنوية", "عارضة", "مرضية"].map((x) => opt(x)).join("")}</select>`, 1)}${field("من", `<input type="date" name="from" id="lv-f" required>`, 1)}${field("لحد", `<input type="date" name="to" id="lv-to" required>`, 1)}${field("السبب", `<input name="reason" id="lv-r">`)}<div class="row end wide"><span class="hint spacer">الطلب بيروح للـ Team Leader الأول، ومايظهرش للـ HR غير بعد موافقته.</span><button class="btn">ابعت</button></div></form>`
    : `<form data-form="reqNew" class="grid">${field("النوع", `<select name="kind" id="rq-k">${opt("شغل من بره")}${opt("عذر غياب")}</select>`, 1)}${field("اليوم", `<input type="date" name="day" id="rq-d" required value="${A.today()}">`, 1)}${field("السبب", `<input name="reason" id="rq-r" required>`, 1, 1)}<div class="row end wide"><span class="hint spacer">لو الـ Head وافق مفيش خصم حتى لو البصمة بتقول غير كده.</span><button class="btn">ابعت</button></div></form>`);
  A.FORM.leaveNew = (f) => { const st = S(); st.leaves.unshift({ id: "LV-" + (14 + st.leaves.length), emp: A.me(), type: f.type, from: f.from, to: f.to, reason: f.reason, status: "Pending TL", created: A.nowIso() }); A.notify(["tl"], `طلب إجازة جديد من ${A.person(A.me())}`); A.closeModal(); A.toast("اتبعت للـ Team Leader"); A.render(); };
  A.FORM.reqNew = (f) => { const st = S(); st.requests.unshift({ id: "RQ-" + (6 + st.requests.length), emp: A.me(), kind: f.kind, day: f.day, reason: f.reason, status: "Pending", by: "" }); A.notify(["tl"], `${f.kind}: ${A.person(A.me())} · ${A.fmtDate(f.day)}`); A.closeModal(); A.toast("اتبعت للـ Head"); A.render(); };
})();
