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
    st.tasks.filter((t) => t.status !== "done" && t.to === m && t.kind !== "team").forEach((t) => add(t.due < A.today() ? "bad" : "", t.kind === "photo" ? "camera" : t.kind === "retouch" ? "image" : "check", `${({ photo: "تصوير", retouch: "Retouch", followup: "متابعة مع المالك", toResale: "ابديت للبيع", marketing: "مهمة تسويق" })[t.kind]}: ${t.title || t.unit}`, `ميعادها ${A.fmtDate(t.due)}${t.note ? " · " + t.note : ""}`, "goTasks", {}, "المهام"));
    if (r === "inventory") {
      st.tasks.filter((t) => t.status === "uploaded").forEach((t) => add("warn", "image", `Retouch ${t.unit} مستني موافقتك`, "المصمم رفع الصور على صفحة الوحدة", "goTasks", {}, "راجع"));
      st.units.filter((u) => u.pdf === "draft").forEach((u) => add("warn", "file", `PDF ${u.code} مستني Confirm`, u.project, "unitOpen", { code: u.code }, "راجع"));
      st.imports.filter((x) => x.status === "pending").forEach((x) => add("warn", "upload", `استيراد Excel: ${x.rows.length} صف`, `${x.rows.filter((r_) => r_.dupe).length} متكرر محتاج قرارك`, "importReview", { id: x.id }, "راجع"));
    }
    // units saved with empty columns: Manar completes the Rent ones, Randa the Resale and Income ones
    if (["inventory", "resale", "admin"].includes(r)) { const mine = st.units.filter((u) => !u.archived && A.missingOf(u).length && (r === "admin" || (u.type === "Rent") === (r === "inventory")));
      mine.slice(0, 5).forEach((u) => { const m = A.missingOf(u); add("warn", "alert", `${u.code} ناقصها ${m.length} خانة`, m.slice(0, 4).join("، ") + (m.length > 4 ? "…" : ""), "unitOpen", { code: u.code }, "كمّل"); });
      if (mine.length > 5) add("warn", "alert", `${mine.length - 5} وحدة تانية ناقصها بيانات`, "افتح الشيت بفلتر «ناقصها بيانات»", "invMissing", {}, "افتح"); }
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
    if (A.reportInbox) A.reportInbox(add);
    if (A.financeInbox) A.financeInbox(add); // purchases waiting for Finance to post them // reports due today that this person hands in
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

  /* ---------- design-lab: the modern bento dashboard (replaces the render above) ---------- */
  A.ACT.mdPeriod = (d) => { A.ui.mdPeriod = d.v; A.render(); };
  const PERIODS = [["day", "النهارده", 1], ["week", "الأسبوع", 7], ["month", "الشهر", 30], ["quarter", "الربع", 91]];
  const inWin = (iso, from, to) => { const t = new Date(iso).getTime(); return t >= from && t < to; };
  const dl = (v) => v == null || !isFinite(v) ? "" : `<span class="md-delta ${v >= 0 ? "up" : "down"}">${I(v >= 0 ? "trend" : "trend")}${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}%</span>`;
  const mini = (label, val, delta, ic, act, hot) => `<button class="md-mini ${hot ? "hot" : ""}" data-act="${act}"><div class="md-mini-top"><span>${esc(label)}</span><span class="md-ic">${I(ic)}</span></div><strong class="num">${val}</strong><div class="md-mini-foot">${dl(delta)}<small>عن الفترة اللي فاتت</small></div></button>`;

  V.home.render = function () {
    const st = S(), r = A.role, items = inbox(), manager = ["admin", "salesdir", "marketing", "tl"].includes(r);
    const hour = new Date(A.NOW()).getHours(), hello = hour < 12 ? "صباح الخير" : "مساء الخير";
    const first = esc(A.person(A.me()).split(" ")[0]), urgent = items.filter((x) => x.tone === "bad").length;
    const dateTxt = new Date(A.NOW()).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
    const pk = A.ui.mdPeriod || "month", days = PERIODS.find((p) => p[0] === pk)[2], span = days * 864e5, now = A.NOW();
    const cur = (iso) => iso && inWin(iso, now - span, now + 1), prev = (iso) => iso && inWin(iso, now - 2 * span, now - span);
    const pays = st.deals.flatMap((d) => (["Rejected", "Cancelled"].includes(d.status) ? [] : d.payments || []));
    const sum = (f) => pays.filter((p) => f(p.at)).reduce((s, p) => s + p.amount, 0);
    const visits = st.leads.flatMap((l) => l.visits), cnt = (arr, key, f) => arr.filter((x) => f(x[key])).length;
    const isMeet = (v) => /meeting/i.test(v.kind || ""), d = U.delta;
    const money = sum(cur), moneyPrev = sum(prev);
    const show = visits.filter((v) => !isMeet(v)), meet = visits.filter(isMeet);
    const deals = st.deals.filter(A.countsRevenue);

    const header = `<section class="md-hello">
      <div><span class="md-date">${esc(dateTxt)}</span><h2>${hello}، ${first}</h2>
        <p>${items.length ? `عندك <b>${items.length}</b> حاجة محتاجة أكشن${urgent ? `، منهم <b class="t-bad">${urgent} متأخرين</b>` : ""}` : "مفيش حاجة مستنياك دلوقتي"}</p></div>
      <div class="md-hello-act">${manager ? U.seg("mdPeriod", PERIODS.map(([k, l]) => [k, l]), pk) : ""}${A.can("leads") ? `<button class="btn" data-act="leadNew">${I("plus")}ليد جديد</button>` : ""}</div>
    </section>`;

    const tasks = `<section class="card md-tasks">${U.head("مهامي النهارده", "check", U.chip(urgent ? "bad" : "ok", urgent ? `${urgent} متأخر` : "كله في الميعاد"))}
      ${items.length ? `<ul class="inbox">${items.sort((a, b) => (b.tone === "bad") - (a.tone === "bad")).slice(0, 6).map((x) => `<li class="${x.tone}"><span class="ib-ico">${I(x.ic)}</span><div class="ib-txt"><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></div><button class="btn sm ${x.tone === "bad" ? "" : "ghost"}" data-act="${x.act}" ${Object.entries(x.data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")}>${esc(x.btn || "افتح")}</button></li>`).join("")}</ul>` : U.empty("مفيش مهام النهارده", "check")}</section>`;
    if (!manager) return header + `<div class="md-grid md-two">${tasks}<section class="card">${U.head("آخر الإشعارات", "bell")}<div class="timeline">${st.notifications.filter(A.forMe).slice(0, 7).map((n) => `<div>${esc(n.text)}<small>${A.ago(n.at)}</small></div>`).join("") || U.empty("مفيش إشعارات", "bell")}</div></section></div>`;

    // collections per week, last 8 weeks: solid = collected, hatched = Places commission of deals closed that week
    const W = 7 * 864e5, months = Array.from({ length: 8 }, (_, i) => now - (8 - i) * W);
    const inW = (iso, w) => iso && inWin(iso, w, w + W);
    const paid = months.map((w) => pays.filter((p) => inW(p.at, w)).reduce((s, p) => s + p.amount, 0));
    const exp = months.map((w) => st.deals.filter((x) => !["Rejected", "Cancelled"].includes(x.status) && inW(x.closed || x.created, w)).reduce((s, x) => s + A.placesComm(x), 0));
    const top = Math.max(1, ...paid, ...exp);
    const bars = months.map((m, i) => `<div class="md-bar" title="${A.money(paid[i])}"><div class="md-bar-col"><i class="exp" style="height:${(Math.max(exp[i], paid[i]) / top) * 100}%"></i><i class="paid" style="height:${(paid[i] / top) * 100}%"></i></div><small>${new Date(m + W).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</small></div>`).join("");

    // funnel
    const L = st.leads, stages = [["Fresh", L.length], ["Interested", L.filter((l) => l.everInterested).length], ["Visit", L.filter((l) => l.visits.some((v) => !isMeet(v))).length], ["Meeting", L.filter((l) => l.visits.some(isMeet)).length], ["Done Deal", deals.length]];
    const fmax = Math.max(1, stages[0][1]);
    const funnel = stages.map(([s, n], i) => `<a class="md-fn" href="#leads"><span class="md-fn-l">${s}</span><div class="md-fn-bar"><i style="width:${Math.max(4, (n / fmax) * 100)}%"></i></div><b class="num">${n}</b><small>${i < stages.length - 1 && n ? Math.round((stages[i + 1][1] / n) * 100) + "%" : ""}</small></a>`).join("");

    // quarter target ring
    const goal = st.employees.reduce((s, e) => s + (A.targetGoal(e.id) || 0), 0), got = deals.reduce((s, x) => s + A.collected(x), 0);
    const pct = goal ? Math.min(100, Math.round((got / goal) * 100)) : 0, R = 52, C = Math.PI * R;
    const ring = `<svg viewBox="0 0 130 74" class="md-gauge"><path d="M13 66 A52 52 0 0 1 117 66" class="trk"/><path d="M13 66 A52 52 0 0 1 117 66" class="val" stroke-dasharray="${((pct / 100) * C).toFixed(1)} ${C.toFixed(1)}"/></svg>`;

    // teams
    const sales = st.employees.filter((e) => ["sales", "tl"].includes(e.role)).map((e) => ({ e, got: A.targetOf(e.id), goal: A.targetGoal(e.id) })).map((x) => ({ ...x, p: x.goal ? Math.round((x.got / x.goal) * 100) : 0 })).sort((a, b) => b.p - a.p).slice(0, 5);
    const team = U.table(["السيلز", "التارجت", "المحقق", ""], sales.map((x) => `<tr><td><span class="md-person">${A.avatar ? A.avatar(x.e.id) : ""}<b>${esc(A.person(x.e.id))}</b></span></td><td class="n">${A.short ? A.short(x.goal) : A.num(x.goal)}</td><td class="n">${A.short ? A.short(x.got) : A.num(x.got)}</td><td>${U.chip(x.p >= 100 ? "ok" : x.p >= 70 ? "warn" : "bad", x.p + "%")}</td></tr>`));

    return header + `
      <div class="md-grid md-top">
        <section class="card md-balance">
          <div class="md-cap">${I("wallet")}<span>المحصّل ${esc(PERIODS.find((p) => p[0] === pk)[1])}</span></div>
          <strong class="md-big num">${A.money(money)}</strong>
          <div class="md-row">${dl(d(money, moneyPrev))}<small>مقارنة بنفس الفترة اللي قبلها</small></div>
          <div class="md-actions"><button class="btn" data-act="go" data-v="finance">${I("wallet")}المالية</button><button class="btn ghost" data-act="go" data-v="deals">${I("handshake")}الصفقات</button></div>
          <div class="md-sub">${[["Rent", "إيجار"], ["Resale", "Resale"], ["Primary", "Primary"]].map(([k, l]) => { const n = st.units.filter((u) => u.type === k && !u.archived).length; return `<div><span>${l}</span><b class="num">${n}</b><small>وحدة متاحة</small></div>`; }).join("")}</div>
        </section>
        <div class="md-minis">
          ${mini("Done Deals", A.num(deals.filter((x) => cur(x.closed || x.created)).length), d(deals.filter((x) => cur(x.closed || x.created)).length, deals.filter((x) => prev(x.closed || x.created)).length), "handshake", "go\" data-v=\"deals", true)}
          ${mini("ليدز جديدة", A.num(cnt(L, "created", cur)), d(cnt(L, "created", cur), cnt(L, "created", prev)), "users", "go\" data-v=\"leads")}
          ${mini("Showings", A.num(cnt(show, "at", cur)), d(cnt(show, "at", cur), cnt(show, "at", prev)), "pin", "go\" data-v=\"leads")}
          ${mini("Meetings", A.num(cnt(meet, "at", cur)), d(cnt(meet, "at", cur), cnt(meet, "at", prev)), "calendar", "go\" data-v=\"leads")}
        </div>
        <section class="card md-chart">${U.head("التحصيل", "", `<span class="md-legend"><i class="paid"></i>اتحصّل <i class="exp"></i>عمولة متوقعة</span>`, "آخر 8 أسابيع")}
          <div class="md-bars">${bars}</div></section>
      </div>
      <div class="md-grid md-mid">
        <section class="card">${U.head("مراحل الليدز", "layers", `<a class="md-link" href="#leads">كل الليدز ${I("send")}</a>`, "من Fresh لحد Done Deal")}<div class="md-funnel">${funnel}</div></section>
        <section class="card md-target">${U.head("تارجت الربع", "star")}
          <div class="md-gauge-w">${ring}<div class="md-gauge-t"><strong class="num">${pct}%</strong><small>${A.short ? A.short(got) : A.num(got)} من ${A.short ? A.short(goal) : A.num(goal)}</small></div></div>
          <div class="md-pace"><span>المفروض نكون</span><b class="num">${Math.round(((now - new Date(new Date(now).getFullYear(), Math.floor(new Date(now).getMonth() / 3) * 3, 1)) / (91 * 864e5)) * 100)}%</b></div></section>
        ${tasks}
      </div>
      <section class="card md-team">${U.head("أداء السيلز", "users", `<a class="md-link" href="#kpis">كل الأداء ${I("send")}</a>`, "الأعلى الأول · من تارجت الربع")}${team}</section>`;
  };
  A.ACT.go = A.ACT.go || ((d) => (location.hash = d.v));
})();
