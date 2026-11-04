/* «مهامي النهارده»: every role opens on the things that need its action now. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S;
  const V = (window.VIEWS = window.VIEWS || {});

  function inbox() {
    const st = S(), r = A.role, m = A.me(), out = [];
    const add = (tone, ic, title, sub, act, data, btn) => out.push({ tone, ic, title, sub, act, data: data || {}, btn });
    // leads
    if (A.can("leads")) {
      st.leads.filter((l) => { const s = A.sla(l); return s && s.level !== "ok" && (r !== "sales" || l.sales === m); }).forEach((l) => add("bad", "clock", `${l.name} من غير أكشن`, `${A.sla(l).text} · ${A.person(l.sales)}`, "leadOpen", { id: l.id }, "افتح الليد"));
      if (["ops", "admin"].includes(r)) {
        st.bulk.filter((b) => b.status === "pending").forEach((b) => add("warn", "upload", `إدخال جماعي: ${b.numbers.length} رقم`, "مستني موافقتك على التوزيع", "bulkReview", { id: b.id }, "راجع"));
        st.leads.filter((l) => l.newLeadReq === "pending").forEach((l) => { const left = A.newLeadMins() - (l.newLeadReqAt ? A.minsSince(l.newLeadReqAt) : 0); add(left < 0 ? "bad" : "warn", "send", `New Lead من Telesales: ${l.name}`, left < 0 ? `اتأخرت ${-left} دقيقة · بيتحسب عليكي في الـ KPIs` : `باقي ${left} دقيقة عشان يتحسب في الميعاد`, "newLeadDecide", { id: l.id }, "قرّر"); });
      }
      if (r === "telesales") {
        st.pendingCompanies.forEach((p, i) => add("warn", "building", `شركة جديدة: ${p.name}`, "محتاجة تتضاف لشيت الشركات بكاتيجوري", "companies", {}, "شيت الشركات"));
        st.leads.filter((l) => l.owner === "telesales" && l.rotation >= st.leadRules.noAnswer.toTelesalesAt && l.newLeadReq !== "pending").forEach((l) => add("", "phone", `رجعلك في الروتيشن التالت: ${l.name}`, "كلّميه تاني", "leadOpen", { id: l.id }, "افتح"));
      }
      // the day's Not Interested / Cancellation for whoever runs the Draft Admin (Heba): decide each one
      if (A.isIn(st.leadRules.draftAdmin.see) || r === "admin") { const w = st.leads.filter((l) => l.owner === "draftAdmin" && l.draftAdmin && !l.draftAdmin.reviewed), t = w.filter((l) => l.draftAdmin.at.slice(0, 10) === A.today());
        if (w.length) add("bad", "alert", `Alarm: ${w.length} Not Interested / Cancellation مستنيين قرارك${t.length ? ` · ${t.length} النهارده` : ""}`, w.slice(0, 4).map((l) => `${l.name} (${l.stage} · ${A.person(l.draftAdmin.from)})`).join("، ") + (w.length > 4 ? "…" : ""), "goDraftAdmin", {}, "راجعي"); }
      // postponements wait for whoever the rules name for that lead (the salesperson's Team Leader by default)
      st.leads.forEach((l) => l.visits.forEach((v) => { if (v.postpone === "pending" && (r === "admin" || A.ruleHas(st.leadRules.visit.postpone, l))) add("warn", "pin", `تأجيل ${v.kind || "Visit"}: ${l.name}`, `${A.person(l.sales)} · ${A.fmtDate(v.at)} ${A.fmtTime(v.at)} · السبب: ${v.postponeReason || "—"}`, "leadOpen", { id: l.id }, "قرّر"); }));
      const mine = st.leads.filter((l) => (r === "sales" ? l.sales === m : true));
      mine.forEach((l) => l.visits.forEach((v, i) => { if (!v.done && !v.postpone && v.at.slice(0, 10) <= A.today() && (r === "sales" || r === "admin" || r === "tl")) add(v.at.slice(0, 10) < A.today() ? "bad" : "", "pin", `${v.kind || "Visit"}: ${l.name}`, `${A.fmtDate(v.at)} ${A.fmtTime(v.at)} · لازم تدوس Done`, "leadOpen", { id: l.id }, "افتح"); }));
      if (r === "tl") st.leads.filter((l) => l.tlFlag).forEach((l) => add("", "star", `ملاحظة TL على ${l.name}`, l.tlFlag, "leadOpen", { id: l.id }, "افتح"));
    }
    // Q5: every 4 hours the salesperson is reminded to call the leads they marked No Answer
    if (r === "sales") st.leads.filter((l) => l.sales === m && l.stage === "No Answer" && A.minsSince(l.naCallAt || l.noAnswerAt || l.created) >= st.leadRules.noAnswer.remindH * 60).slice(0, 5).forEach((l) => add("warn", "phone", `كلّم ${l.name} (No Answer)`, "تنبيه كل 4 ساعات · سجّل المكالمة عشان يتقفل", "leadOpen", { id: l.id }, "افتح"));
    // Q16: a closed deal's unit is marked Rented/Sold only after Manar (rent) or Randa (resale & income) confirms
    if (["inventory", "resale", "admin"].includes(r)) st.units.filter((u) => u.closeReq && (r === "admin" || (u.type === "Rent") === (r === "inventory"))).forEach((u) => add("warn", "building", `اقفل ${u.code}؟`, `Done Deal ${u.closeReq} اتوافق عليها · محتاجة تأكيدك`, "unitOpen", { code: u.code }, "راجع"));
    // the unit's agent becomes the deal's Seller only after Manar approves
    if (["inventory", "admin"].includes(r)) st.deals.filter((d) => (d.sellers || []).length && !d.sellerApproved && !["Rejected", "Cancelled"].includes(d.status)).forEach((d) => add("warn", "users", `Seller للصفقة ${d.id}`, `${A.person(d.sellers[0])} · Agent ${d.unit} · محتاج موافقتك`, "dealOpen", { id: d.id }, "راجعي"));
    // every TCR waits for each salesperson on the deal to sign it
    if (r === "sales") st.deals.forEach((d) => (d.tcrs || []).forEach((x) => { if (A.buyersOf(d).concat(A.sellersOf(d)).includes(m) && !(x.signed || {})[m]) add("warn", "file", `امضي على ${x.code}`, `${d.id} · ${A.money(x.amount)}`, "dealOpen", { id: d.id }, "افتح"); }));
    if (r === "officemgr") Object.entries(st.statements || {}).filter(([, x]) => x.status === "draft").forEach(([k]) => add("warn", "file", `ورق ${k} للسيلز`, "مستني موافقتك عشان يتبعت على الإيميل", "goReports", {}, "راجعي"));
    if (r === "inventory_staff") { const n = st.naSheets.reduce((s, sh) => s + sh.rows.filter((x) => x.to === m && !x.status).length, 0); if (n) add("warn", "layers", `${n} رقم مستنيين تصنيفك`, "من شيتات الـ Not Active Inventory", "goNA", {}, "افتح"); }
    if (["inventory", "admin"].includes(r)) st.naSheets.forEach((sh) => { const n = sh.rows.filter((x) => x.dup && !x.dupSeen).length; if (n) add("bad", "alert", `${n} رقم في ${sh.name} موجود في الانفنتوري`, "حددي حالتهم", "goNA", {}, "افتح"); });
    if (["officemgr", "admin"].includes(r)) st.deals.filter((d) => d.status === "Pending Review").forEach((d) => add(A.suspicious(d) ? "bad" : "warn", "handshake", `صفقة ${d.id} مستنية مراجعة`, `${d.client} · ${A.money(d.value)}${A.suspicious(d) ? " · Alarm: اتسجّلت وقت القفل" : ""}`, "dealOpen", { id: d.id }, "راجع"));
    if (r === "sales") st.broadcasts.filter((b) => b.approved && !b.sent.includes(m)).forEach((b) => add("", "megaphone", "رسالة Broadcast مستنياك", b.text, "bcDone", { id: b.id }, "بعتها · Done"));
    // tasks
    st.tasks.filter((t) => t.status !== "done" && t.to === m).forEach((t) => add(t.due < A.today() ? "bad" : "", t.kind === "photo" ? "camera" : t.kind === "retouch" ? "image" : "check", `${({ photo: "تصوير", retouch: "Retouch", followup: "متابعة مع المالك", toResale: "ابديت للبيع", marketing: "مهمة تسويق" })[t.kind]}: ${t.title || t.unit}`, `ميعادها ${A.fmtDate(t.due)}${t.note ? " · " + t.note : ""}`, "goTasks", {}, "المهام"));
    if (r === "inventory") {
      st.tasks.filter((t) => t.status === "uploaded").forEach((t) => add("warn", "image", `Retouch ${t.unit} مستني موافقتك`, "المصمم رفع الصور على صفحة الوحدة", "goTasks", {}, "راجع"));
      st.units.filter((u) => u.pdf === "draft").forEach((u) => add("warn", "file", `PDF ${u.code} مستني Confirm`, u.project, "unitOpen", { code: u.code }, "راجع"));
      st.imports.filter((x) => x.status === "pending").forEach((x) => add("warn", "upload", `استيراد Excel: ${x.rows.length} صف`, `${x.rows.filter((r_) => r_.dupe).length} متكرر محتاج قرارك`, "importReview", { id: x.id }, "راجع"));
    }
    if (["inventory", "resale"].includes(r)) st.units.filter(A.stale).slice(0, 4).forEach((u) => add("bad", "clock", `${u.code} محتاجة ابديت مع المالك`, `آخر ابديت ${A.fmtDate(u.lastUpdate)}`, "unitOpen", { code: u.code }, "افتح"));
    if (r === "marketing") {
      st.posts.filter((p) => p.status !== "published" && p.at.slice(0, 10) === A.today()).forEach((p) => add("warn", "bell", `Reminder: ${p.title}`, `ميعاد النشر ${A.fmtTime(p.at)} · ${p.channel}`, "goMarketing", { tab: "content" }, "Content plan"));
      st.units.filter((u) => u.created === A.today() || u.pdf === "draft").forEach((u) => add("", "bolt", `Live Alert: وحدة جديدة ${u.code}`, `${u.project} · جاهزة للحملات`, "unitOpen", { code: u.code }, "افتح"));
      st.broadcasts.filter((b) => !b.approved).forEach((b) => add("warn", "megaphone", "Broadcast مستني موافقتك", b.text, "goMarketing", { tab: "broadcast" }, "راجع"));
    }
    if (r === "hr") {
      st.attendance.filter((a) => a.status === "forgot" && !a.confirmed).forEach((a) => add("bad", "fingerprint", `${A.person(a.emp)} نسي البصمة`, `${A.fmtDate(a.day)} · محتاج Confirmation لخصم يوم`, "goHr", { tab: "att" }, "Attendance"));
      st.leaves.filter((l) => l.status === "Approved by TL").forEach((l) => add("warn", "calendar", `إجازة ${A.person(l.emp)} اتوافق عليها من الـ TL`, `${l.type} · ${A.fmtDate(l.from)}`, "goHr", { tab: "leaves" }, "سجّل"));
      st.oneOnOnes.filter((o) => o.action && !o.actionDone && o.actionDue <= A.today()).forEach((o) => add("bad", "bell", `Alarm حل HR: ${o.action}`, `${A.person(o.emp)} · ${A.fmtDate(o.actionDue)}`, "empFile", { id: o.emp }, "الفايل"));
      st.excuses.filter((x) => x.day === A.today()).forEach((x) => add(x.n >= 5 ? "bad" : "warn", "alert", `Excuse #${x.n} لـ ${A.person(x.emp)}`, x.n >= 5 ? "الخامس = رفد" : x.n >= 3 ? "خصم نص يوم" : "من غير خصم", "goHr", { tab: "att" }, "Attendance"));
    }
    if (r === "tl") {
      st.leaves.filter((l) => l.status === "Pending TL").forEach((l) => add("warn", "calendar", `طلب إجازة ${A.person(l.emp)}`, `${l.type} · ${A.fmtDate(l.from)} → ${A.fmtDate(l.to)}`, "goHr", { tab: "leaves" }, "قرّر"));
      st.requests.filter((q) => q.status === "Pending").forEach((q) => add("warn", "pin", `${q.kind}: ${A.person(q.emp)}`, `${A.fmtDate(q.day)} · ${q.reason}`, "goHr", { tab: "leaves" }, "قرّر"));
    }
    const dept = A.deptOf(r);
    if (dept) st.tickets.filter((t) => t.dept === dept && ["Open", "In Progress"].includes(t.status)).forEach((t) => add(A.minsSince(t.created) / 60 > (t.priority === "عالية" ? 4 : 24) ? "bad" : "", "ticket", `تذكرة: ${t.title}`, `${t.id} · من ${A.person(t.from)} · ${A.ago(t.created)}`, "tkOpen", { id: t.id }, "رد"));
    if (A.can("contracts") && st.contracts) st.contracts.filter((c) => c.status === "Active" && (new Date(c.end) - A.NOW()) / 864e5 <= 30 && (new Date(c.end) - A.NOW()) / 864e5 >= 0 && (r !== "sales" || (st.deals.find((d) => d.id === c.deal) || {}).sales === m)).forEach((c) => add("warn", "file", `عقد ${c.client} بينتهي قريب`, `${c.unit} · ${A.fmtDate(c.end)} · فرصة تجديد`, "ctOpen", { id: c.id }, "افتح العقد"));
    if (["approver", "admin"].includes(r)) st.purchases.filter((p) => p.status === "Pending").forEach((p) => add("warn", "cart", `طلب شراء: ${p.item}`, `${A.money(p.amount)} · ${p.line}`, "goProc", {}, "قرّر"));
    if (r === "procurement") st.purchases.filter((p) => p.status === "Approved").forEach((p) => add("", "wallet", `اتوافق: ${p.item}`, "جاهز للصرف", "goProc", {}, "صرف"));
    if (A.kpiInbox) A.kpiInbox(add);
    if (A.reportInbox) A.reportInbox(add); // reports due today that this person hands in
    if (A.invInbox) A.invInbox(add); // inventory team: Manar's tasks, list requests, the daily report // KPI cards: what I hand in, and what my team waits on me for
    return out;
  }
  A.ACT.goTasks = () => (location.hash = "tasks");
  A.ACT.goProc = () => (location.hash = "procurement");
  A.ACT.goMarketing = (d) => { A.ui.mkTab = d.tab; location.hash = "marketing"; A.render(); };
  A.ACT.goHr = (d) => { A.ui.hrTab = d.tab; location.hash = "hr"; A.render(); };
  A.ACT.goNA = () => { location.hash = "notactive"; };
  A.ACT.goReports = () => { A.ui.rpTab = "pdf"; location.hash = "reports"; };
  A.ACT.bcDone = (d) => A.openModal("بعت الـ Broadcast · Done", `<form data-form="bcDone" class="grid"><input type="hidden" name="id" value="${d.id}">${U.note("Done يعني إنك بعت الرسالة بنفسك لعملائك.")}${U.field("عملت Broadcast لوحدات تانية كمان؟ (اختياري)", `<select name="units" id="bd-units" multiple size="5">${S().units.filter((u) => u.status === "available" && u.pdf === "confirmed").map((u) => U.opt(u.code, `${u.code} · ${u.project}`)).join("")}</select>`, 0, 1)}<div class="row end wide"><button class="btn">${I("check")}Done</button></div></form>`);
  A.FORM.bcDone = (f, form) => { const st = S(), b = st.broadcasts.find((x) => x.id === f.id), units = [...form.querySelector("#bd-units").selectedOptions].map((o) => o.value); b.sent.push(A.me()); st.waSentToday += 25; if (units.length) (st.selfBroadcasts = st.selfBroadcasts || []).unshift({ by: A.me(), units, at: A.nowIso() }); A.closeModal(); A.toast(units.length ? `اتسجّل · ورحمة هتشوف إنك عملت Broadcast لـ ${units.length} وحدة تانية` : "اتسجّل إنك بعت الرسالة لعملائك"); A.render(); };

  V.home = {
    sub: () => "كل حاجة مستنياك النهارده في مكان واحد",
    render() {
      const st = S(), r = A.role, items = inbox();
      const hour = new Date(A.NOW()).getHours(), hello = hour < 12 ? "صباح الخير" : "مساء الخير";
      const dateTxt = new Date(A.NOW()).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
      const urgent = items.filter((x) => x.tone === "bad").length;
      const allLeads = st.leads, q = allLeads.filter((l) => l.everInterested).length;
      const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(A.NOW() - (29 - i) * 864e5).toISOString().slice(0, 10); return { label: String(+d.slice(8)), value: allLeads.filter((l) => l.created.slice(0, 10) === d).length }; });
      const chCount = {}; allLeads.forEach((l) => (chCount[l.channel] = (chCount[l.channel] || 0) + 1));
      const COLORS = ["#0037ff", "#5a7dff", "#08875c", "#f2b64d", "#c22a37", "#6a3df0", "#0a7f9e"];
      const showCharts = ["admin", "salesdir", "marketing", "tl"].includes(r);
      return `
        <section class="hero">
          <div class="hero-txt"><span class="eyebrow">${esc(dateTxt)}</span><h2>${hello}، ${esc(A.person(A.me()).split(" ")[0])}</h2>
            <p>${items.length ? `عندك <b>${items.length}</b> حاجة محتاجة أكشن النهارده${urgent ? `، منهم <b>${urgent}</b> متأخرين` : ""}.` : "مفيش حاجة مستنياك دلوقتي."} ده ديمو تفاعلي بالبيانات التجريبية، غيّر الدور من القايمة عشان تشوف السيستم بعين كل يوزر.</p>
            <div class="hero-actions">${A.can("leads") ? `<button class="btn" data-act="leadNew">${I("plus")}ليد جديد</button>` : ""}<button class="btn ghost" data-act="openCmd">${I("search")}بحث سريع <kbd>⌘K</kbd></button></div>
          </div>
          <div class="hero-stats">
            <div><b class="num">${items.length}</b><span>مهام النهارده</span></div>
            <div><b class="num">${urgent}</b><span>متأخر</span></div>
            <div><b class="num">${st.notifications.filter((n) => A.forMe(n) && !n.read).length}</b><span>إشعار جديد</span></div>
          </div>
        </section>
        ${A.kpiMine ? A.kpiMine() : ""}
        ${A.actCard ? A.actCard() : ""}
        <div class="cols wide">
          <section class="card">${U.head("مهامي النهارده", "check", U.chip(urgent ? "bad" : "ok", urgent ? `${urgent} متأخر` : "كله في الميعاد"), "مترتبة: المتأخر الأول")}
            ${items.length ? `<ul class="inbox">${items.sort((a, b) => (b.tone === "bad") - (a.tone === "bad")).map((x) => `<li class="${x.tone}"><span class="ib-ico">${I(x.ic)}</span><div class="ib-txt"><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></div><button class="btn sm ${x.tone === "bad" ? "" : "ghost"}" data-act="${x.act}" ${Object.entries(x.data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}>${esc(x.btn)}</button></li>`).join("")}</ul>` : U.empty("مفيش حاجة مستنياك. يوم هادي!", "check")}
          </section>
          <section class="card">${U.head("آخر الإشعارات", "bell")}
            <div class="timeline">${st.notifications.filter(A.forMe).slice(0, 7).map((n) => `<div>${esc(n.text)}<small>${A.ago(n.at)}</small></div>`).join("") || U.empty("مفيش إشعارات", "bell")}</div>
          </section>
        </div>
        ${showCharts ? `<div class="kpis">${U.kpi("ليدز آخر 30 يوم", A.num(days.reduce((s, d) => s + d.value, 0)), "من كل الـ channels", "users", "", "", U.trend(allLeads, "created", 30))}${U.kpi("Qualified", A.num(q), `${Math.round((q / allLeads.length) * 100)}% نسبة التأهيل`, "star", "ok")}${U.kpi("صفقات مقفولة", A.num(st.deals.filter(A.countsRevenue).length), A.money(st.deals.filter(A.countsRevenue).reduce((s, d) => s + d.value, 0)), "handshake")}${U.kpi("وحدات متاحة", A.num(st.units.filter((u) => u.status === "available").length), `${st.units.filter(A.stale).length} محتاجة ابديت`, "building", "warn")}</div>
        <div class="cols wide">
          <section class="card">${U.head("الليدز اليومية", "trend", "", "آخر 30 يوم")}${U.area(days, { label: "الليدز اليومية" })}</section>
          <section class="card">${U.head("الليدز حسب الـ channel", "layers")}${U.donut(Object.entries(chCount).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: k, value: v, color: COLORS[i % COLORS.length] })), A.num(allLeads.length), "ليد")}</section>
        </div>` : ""}`;
    }
  };
  A.ACT.openCmd = () => A.openCmd();
})();
