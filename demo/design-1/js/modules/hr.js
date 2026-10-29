/* M-05 HR: fingerprint attendance (device link or uploaded fingerprint sheet), deduction tiers, Excuse, Visit, Weekly Delay, employee file & 1-to-1, leaves. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const days = () => [...new Set(S().attendance.map((a) => a.day))].sort();
  const LV_LVL = { "Pending TL": "warn", "Approved by TL": "info", "Rejected": "bad", "Closed by HR": "ok" };

  V.hr = {
    sub: () => "البصمة (ربط الجهاز أو شيت البصمة) · الشرايح · Excuse · Weekly Delay · فايل الموظف و1-to-1 · الإجازات",
    render() {
      const r = A.role, t = r === "tl" ? "leaves" : (ui("hrTab") || "att");
      const st = S(), forgot = st.attendance.filter((a) => a.status === "forgot" && !a.confirmed).length;
      const tabs = r === "tl" ? [["leaves", "طلبات فريقي", st.leaves.filter((l) => l.status === "Pending TL").length + st.requests.filter((q) => q.status === "Pending").length]] : [["att", "Attendance", forgot || null], ["history", "History"], ["delay", "Weekly Delay"], ["emps", "الموظفين"], ["leaves", "الإجازات والطلبات"], ["saving", "التوفير"], ["rules", "الشرايح والإعدادات"]];
      return `<div class="row">${U.tabs("hrTab", tabs, t)}<span class="spacer"></span>${A.canDo("hr", "import") ? `<button class="btn ghost" data-act="demoFinger">${I("fingerprint")}سحب من جهاز البصمة</button><label class="btn ghost">${I("upload")}ارفع شيت البصمة<input type="file" id="fp-sheet" accept=".xlsx,.xls,.csv" data-change="fpSheet" hidden></label>` : ""}</div>${HR[t]()}`;
    }
  };
  // the ideal employee & team fund (client's sheet): within each team, among those with total KPIs ≥ 80% and no administrative
  // penalty this month: 40% early-arrival days (more is better) + 30% lateness hours (less) + 30% days off without permission (less).
  // Tie: higher target achievement, then higher KPI. They receive the attendance & lateness deductions of the rest of the team.
  function teams() {
    const st = S(), T = {}, add = (k, id) => { const e = st.employees.find((x) => x.id === id); if (e) (T[k] = T[k] || []).includes(e) || T[k].push(e); };
    st.people.filter((p) => p.tl).forEach((p) => add("فريق " + A.person(p.tl), p.id));
    const C = (st.kpis || {}).cards || {}; Object.keys(C).forEach((id) => { if (C[id].by && C[id].by !== "owners") add("فريق " + A.person(C[id].by), id); });
    return Object.entries(T).filter(([, m]) => m.length > 1);
  }
  function idealOf(members, month) {
    const st = S(), rows = members.map((e) => {
      const att = st.attendance.filter((a) => a.emp === e.id && a.day.startsWith(month)), r = att.map(A.attRow);
      const kpi = A.kpiScore && (st.kpis || {}).cards && st.kpis.cards[e.id] ? A.kpiScore(e.id) : null, g = A.targetGoal(e.id);
      const pen = (st.penalties || []).filter((p) => p.emp === e.id && p.day.startsWith(month));
      return { e, early: att.filter((a) => a.inMin != null && a.inMin < 0).length, lateH: r.reduce((s, x) => s + x.late, 0) / 60, absent: att.filter((a) => a.status === "absent").length,
        ded: r.reduce((s, x) => s + x.ded, 0) * A.dayRate(e), kpi, tgt: g ? (A.targetOf(e.id) / g) * 100 : 0, pen, ok: (kpi == null || kpi >= 80) && !pen.length };
    });
    const mx = (k) => Math.max(0, ...rows.map((x) => x[k]));
    const E = mx("early"), L = mx("lateH"), B = mx("absent");
    rows.forEach((x) => { x.score = 40 * (E ? x.early / E : 1) + 30 * (L ? 1 - x.lateH / L : 1) + 30 * (B ? 1 - x.absent / B : 1); });
    const win = rows.filter((x) => x.ok).sort((a, b) => b.score - a.score || b.tgt - a.tgt || (b.kpi || 0) - (a.kpi || 0))[0];
    return { rows: rows.sort((a, b) => b.score - a.score), win, fund: win ? rows.filter((x) => x !== win).reduce((s, x) => s + x.ded, 0) : 0 };
  }
  function idealFund(month) {
    const st = S(), can = A.canDo("hr", "edit"), open = A.ui.idealOpen;
    return `<section class="card">${head("الموظف المثالي وصندوق الفريق", "star", "", "خصومات الحضور والتأخير لباقي الفريق بتروح للموظف المثالي آخر الشهر")}
      <div class="kpis sm">${U.kpi("40%", "الحضور بدري", "أيام قبل الميعاد · الأكتر أحسن", "clock", "ok")}${U.kpi("30%", "ساعات التأخير", "الأقل أحسن", "alert", "warn")}${U.kpi("30%", "غياب من غير إذن", "الأقل أحسن", "x", "bad")}</div>
      ${table(["الفريق", "الموظف المثالي", "الصندوق (هيستلمه)", ""], teams().map(([k, m]) => { const x = idealOf(m, month); return `<tr><td><b>${esc(k)}</b><span class="sub">${m.length} موظف</span></td><td>${x.win ? A.who(x.win.e.id) : chip("warn", "مفيش حد مستوفي الشروط")}</td><td class="n">${A.money(x.fund)}</td><td><button class="btn ghost sm" data-act="idealToggle" data-v="${esc(k)}">${open === k ? "اقفل" : "التفاصيل"}</button></td></tr>${open === k ? `<tr><td colspan="4">${table(["الموظف", "بدري", "ساعات تأخير", "غياب", "الـ KPIs", "التارجت", "النقاط", ""], x.rows.map((r) => `<tr><td>${esc(A.person(r.e.id))}</td><td class="n">${r.early}</td><td class="n">${r.lateH.toFixed(1)}</td><td class="n">${r.absent}</td><td class="n">${r.kpi == null ? "—" : Math.round(r.kpi) + "%"}</td><td class="n">${r.tgt ? Math.round(r.tgt) + "%" : "—"}</td><td class="n"><b>${r.score.toFixed(1)}</b></td><td>${r === x.win ? chip("ok", "المثالي") : r.pen.length ? chip("bad", "جزاء إداري") : r.kpi != null && r.kpi < 80 ? chip("warn", "KPIs أقل من 80%") : ""}</td></tr>`))}</td></tr>` : ""}`; }))}
      ${note("الشروط: الـ KPIs الكلية 80% أو أكتر، ومفيش جزاء إداري في الشهر. لو اتعادلوا: الأعلى في التارجت، وبعدين الأعلى في نسبة الـ KPI. القيمة = مجموع خصومات الحضور والتأخير لباقي الفريق في الشهر (مثال: فريق من 5، خصومات الـ 4 = 3,000 جنيه، يستلمها الموظف المثالي).")}
      <h4 class="mini-h">الجزاءات الإدارية الشهر ده</h4>${(st.penalties || []).filter((p) => p.day.startsWith(month)).map((p, i) => `<div class="line-item"><span>${A.who(p.emp)} · ${esc(p.text)} <small class="hint">${A.fmtDate(p.day)}</small></span>${can ? `<button class="btn ghost sm" data-act="penDel" data-i="${st.penalties.indexOf(p)}">${I("x")}</button>` : ""}</div>`).join("") || `<p class="hint">مفيش</p>`}
      ${can ? `<form class="row" data-form="penAdd"><select name="emp" aria-label="الموظف">${st.employees.map((e) => `<option value="${e.id}">${esc(A.person(e.id))}</option>`).join("")}</select><input name="text" required placeholder="الجزاء"><button class="btn ghost sm">${I("plus")}سجّل جزاء</button></form>` : ""}</section>`;
  }
  A.ACT.idealToggle = (d) => { A.ui.idealOpen = A.ui.idealOpen === d.v ? "" : d.v; A.render(); };
  A.FORM.penAdd = (f) => { (S().penalties = S().penalties || []).push({ emp: f.emp, day: A.today(), text: f.text, by: A.me() }); A.audit("hr", `جزاء إداري لـ ${A.person(f.emp)}: ${f.text}`); A.toast("الجزاء اتسجّل · مش هيدخل الموظف المثالي الشهر ده"); A.render(); };
  A.ACT.penDel = (d) => { S().penalties.splice(+d.i, 1); A.render(); };
  A.idealOf = idealOf; A.idealTeams = teams;
  A.ACT.hrTab = (d) => { ui("hrTab", d.v); A.render(); };
  A.ACT.dedApprove = () => { const st = S(), month = A.today().slice(0, 7); (st.dedApproved = st.dedApproved || {})[month] = { by: A.me(), at: A.nowIso() }; A.audit("hr", `اعتماد خصومات ${month} وترحيلها للمالية`); A.notify(["accountant"], `الـ HR اعتمدت خصومات ${month}`); A.toast("الخصومات اتعتمدت واترحّلت للمالية"); A.render(); };
  // fingerprint sheet exported from the device: name/id, date, in, out → attendance rows; unknown names wait for HR
  const normName = (t) => String(t || "").replace(/^(أ|م|د)\.\s*/, "").replace(/\s+/g, " ").trim();
  const toMin = (t) => { const m = String(t || "").match(/(\d{1,2}):(\d{2})/); return m ? (+m[1] - 11) * 60 + +m[2] : null; };
  A.CHANGE.fpSheet = (v, el) => {
    const file = el.files && el.files[0]; if (!file) return;
    U.readSheet(file).then((lines) => {
      const st = S(); st.fpUnmatched = st.fpUnmatched || []; let added = 0, dup = 0, miss = 0;
      lines.filter((c) => c.length >= 3 && toMin(c[2]) != null).forEach(([who, day, tin, tout]) => {
        const e = st.employees.find((x) => x.id === who || normName(x.name) === normName(who)), d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : A.today(), row = { day: d, inMin: toMin(tin), outAt: tout || "" };
        if (!e) { st.fpUnmatched.push(Object.assign({ name: who }, row)); miss++; return; }
        if (st.attendance.some((a) => a.emp === e.id && a.day === d)) { dup++; return; }
        st.attendance.push(Object.assign({ emp: e.id, status: "auto" }, row)); added++;
      });
      A.audit("hr", `اترفع شيت البصمة ${file.name}: ${added} بصمة${dup ? ` · ${dup} مكررة` : ""}${miss ? ` · ${miss} اسم مش متطابق` : ""}`);
      A.toast(`اتقرا الشيت: ${added} بصمة اتضافت${dup ? ` · ${dup} مكررة اتسابت` : ""}${miss ? ` · ${miss} اسم محتاج يتربط` : ""}`); A.render();
    }).catch((e) => A.toast(e.message));
  };
  A.CHANGE.fpLink = (v, el) => { if (!v) return; const st = S(), x = st.fpUnmatched.splice(+el.dataset.i, 1)[0]; if (!st.attendance.some((a) => a.emp === v && a.day === x.day)) st.attendance.push({ emp: v, day: x.day, inMin: x.inMin, outAt: x.outAt, status: "auto" }); A.audit("hr", `«${x.name}» من شيت البصمة اتربط بـ ${A.person(v)}`); A.toast(`اتربط بـ ${A.person(v)} واتحسب`); A.render(); };
  const HR = {
    att() {
      const st = S(), all = days(), day = ui("attDay") || A.today(), q = (ui("attQ") || "").toLowerCase();
      const rows = st.attendance.filter((a) => a.day === day).map((a) => ({ a, x: A.attRow(a) })).filter(({ x }) => !q || x.e.name.toLowerCase().includes(q));
      const partTime = st.employees.filter((e) => e.kind === "Part-time");
      const ded = rows.reduce((s, { x }) => s + x.ded * A.dayRate(x.e), 0);
      const cnt = (fn) => rows.filter(fn).length;
      const um = st.fpUnmatched || [];
      const sample = "data:text/csv;charset=utf-8," + encodeURIComponent("name,date,in,out\n" + st.employees.slice(0, 3).map((e, i) => `${e.name},${A.today()},11:0${i * 4},19:00`).join("\n") + `\nاسم مش موجود,${A.today()},11:20,19:00`);
      const unmatched = um.length ? `<section class="card attn">${head("أسامي في شيت البصمة مش متطابقة", "alert", chip("warn", um.length), "اربط كل اسم بالموظف الصح عشان يتحسب")}${um.map((x, i) => `<div class="line-item"><span><b>${esc(x.name)}</b> · ${esc(x.day)} · ${A.hm(x.inMin)}</span><select data-change="fpLink" data-i="${i}" aria-label="اربط بموظف">${opt("", "اربط بـ…")}${st.employees.map((e) => opt(e.id, e.name)).join("")}</select></div>`).join("")}</section>` : "";
      return `${unmatched}${note(`البصمة بتوصل بطريقتين: الجهاز مربوط بالسيستم وبيتسحب لوحده، أو الـ HR ترفع شيت البصمة (Excel / CSV) اللي بيطلع من الجهاز. <a class="lnk" download="fingerprint-sample.csv" href="${sample}">${I("file")}نموذج الشيت</a>`)}<div class="kpis">${U.kpi("حضروا", cnt(({ x }) => !["نسي البصمة"].includes(x.status)), `من ${rows.length}`, "fingerprint", "ok")}${U.kpi("في الميعاد", cnt(({ x }) => x.status === "في الميعاد"), "لحد 11:16", "check", "ok")}${U.kpi("متأخرين", cnt(({ x }) => x.status === "متأخر"), "بعد 11:16", "clock", "warn")}${U.kpi("خصومات اليوم ده", A.money(ded), "بتسمع في المالية", "wallet", "bad")}</div>
        <div class="toolbar">${U.exportBtn("attendance", "الحضور")}<label class="field inline"><span>اليوم</span><select id="att-day" data-change="attDay">${all.slice().reverse().map((d) => opt(d, new Date(d).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" }), day)).join("")}</select></label><label class="search">${I("search")}<input type="search" id="att-q" placeholder="اسم الموظف" value="${esc(ui("attQ") || "")}" data-change="attQ"></label></div>
        ${table(["الموظف", "Check-in", "Check-out", "دقايق التأخير", "الحالة", "الخصم", ""], rows.map(({ a, x }) => `<tr><td>${A.who(a.emp)}${x.e.schedule ? `<span class="sub">${chip("info", "مواعيد خاصة: " + esc(x.e.schedule), 1)}</span>` : ""}${x.e.deduction ? `<span class="sub">${chip("info", "شرايح خاصة")}</span>` : ""}</td><td class="n">${a.status === "visit" ? `Visit ${esc(a.visitAt)}` : a.status === "outside" ? "—" : A.hm(a.inMin)}</td><td class="n">${a.outAt ? esc(a.outAt) : "—"}</td><td class="n">${x.late ? `<b>${x.late}</b> د` : "0"}</td><td>${chip(x.level, x.status)}</td><td>${esc(x.dedText)}</td><td>${a.status === "forgot" && !a.confirmed ? `<button class="btn sm" data-act="attConfirm" data-emp="${a.emp}" data-day="${a.day}">Confirm خصم يوم</button>` : ""}</td></tr>`))}
        ${partTime.length ? note(`الـ Part-time مش مطلوب منهم بصمة، والـ HR بتحدد لكل واحد عليه خصومات ولا لأ: ${partTime.map((e) => `${esc(e.name)} (${e.ptDeduct ? "عليه خصومات" : "من غير خصومات"})`).join("، ")}.`) : ""}
        ${note("لحد 11:16 في الميعاد · 11:17 لـ 11:29 ربع يوم · 11:30 لـ 11:59 نص يوم · 12:00 وبعدها يوم. الـ Visit لحد الساعة 12 بتتحسب Check-in من غير تأخير. الشغل من بره بموافقة الـ Head من غير خصم.")}`;
    },
    history() {
      const st = S(), all = days(), emp = ui("hsEmp") || st.employees[5].id, from = ui("hsFrom") || all[0], to = ui("hsTo") || all[all.length - 1];
      const rows = st.attendance.filter((a) => a.emp === emp && a.day >= from && a.day <= to).map((a) => ({ a, x: A.attRow(a) }));
      return `<div class="toolbar"><label class="field inline"><span>الموظف</span><select id="hs-emp" data-change="hsEmp">${st.employees.filter((e) => e.kind !== "Part-time").map((e) => opt(e.id, e.name, emp)).join("")}</select></label><label class="date-f"><span>من</span><input type="date" id="hs-from" value="${from}" data-change="hsFrom"></label><label class="date-f"><span>لحد</span><input type="date" id="hs-to" value="${to}" data-change="hsTo"></label></div>
        <div class="kpis">${U.kpi("أيام", rows.length, "في الفترة", "calendar")}${U.kpi("في الميعاد", rows.filter(({ x }) => x.status === "في الميعاد").length, "", "check", "ok")}${U.kpi("دقايق التأخير", rows.reduce((s, { x }) => s + x.late, 0) + " د", "كل الدقايق", "clock", "warn")}${U.kpi("أيام خصم", rows.reduce((s, { x }) => s + x.ded, 0), "ربع / نص / يوم", "wallet", "bad")}</div>
        ${table(["اليوم", "Check-in", "Check-out", "دقايق", "الحالة", "الخصم"], rows.slice().reverse().map(({ a, x }) => `<tr><td>${new Date(a.day).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "short" })}</td><td class="n">${a.status === "visit" ? "Visit " + esc(a.visitAt) : A.hm(a.inMin)}</td><td class="n">${a.outAt || "—"}</td><td class="n">${x.late}</td><td>${chip(x.level, x.status)}</td><td>${esc(x.dedText)}</td></tr>`))}`;
    },
    delay() {
      const st = S(), all = days(), preset = ui("dlP") || "week";
      const to = ui("dTo") || all[all.length - 1], from = preset === "week" ? all[Math.max(0, all.length - 6)] : preset === "2w" ? all[Math.max(0, all.length - 12)] : (ui("dFrom") || all[0]);
      const range = all.filter((d) => d >= from && d <= to);
      const per = st.employees.filter((e) => e.kind !== "Part-time").map((e) => { const rows = st.attendance.filter((a) => a.emp === e.id && a.day >= from && a.day <= to); return { e, rows, mins: rows.reduce((s, a) => s + A.attRow(a).late, 0), all: st.attendance.filter((a) => a.emp === e.id).reduce((s, a) => s + A.attRow(a).late, 0) }; }).sort((a, b) => b.mins - a.mins);
      const max = Math.max(1, ...per.map((p) => p.mins));
      return `<div class="toolbar">${U.seg("dlP", [["week", "الأسبوع ده"], ["2w", "آخر أسبوعين"], ["custom", "فترة مخصصة"]], preset)}${preset === "custom" ? `<label class="date-f"><span>من</span><input type="date" id="d-from" value="${from}" data-change="dFrom"></label><label class="date-f"><span>لحد</span><input type="date" id="d-to" value="${to}" data-change="dTo"></label>` : ""}</div>
        <div class="tbl-wrap"><table class="heat"><thead><tr><th>الموظف</th>${range.map((d) => `<th class="n">${new Date(d).toLocaleDateString("ar-EG", { weekday: "short" })}<br><small>${+d.slice(8)}</small></th>`).join("")}<th>الفترة</th><th>التراكمي</th></tr></thead><tbody>
          ${per.map((p) => `<tr><td>${A.who(p.e.id)}</td>${range.map((d) => { const a = p.rows.find((x) => x.day === d), x = a && A.attRow(a); return `<td class="n hc ${!x ? "" : x.late > 30 ? "h3" : x.late > 10 ? "h2" : x.late > 0 ? "h1" : "h0"}" title="${x ? esc(x.status) : ""}">${x ? x.late : "·"}${x && x.status !== "في الميعاد" && x.status !== "متأخر" ? `<i>${esc(x.status.split(" ")[0])}</i>` : ""}</td>`; }).join("")}<td><div class="cell-bar"><b class="num">${p.mins} د</b>${U.bar((p.mins / max) * 100, p.mins > 60 ? "bad" : p.mins > 20 ? "warn" : "")}</div></td><td class="n">${p.all} د</td></tr>`).join("")}
        </tbody></table></div>
        ${note("دقايق التأخير = Check-in − 11:16 (مثلاً 11:18 = دقيقتين). بتتحسب كل الدقايق من غير استثناء، حتى الـ Excuse والـ Visit وبعد 12، وجنب كل يوم حالته.")}`;
    },
    emps() {
      const st = S(), q = (ui("empQ") || "").toLowerCase();
      return `<div class="toolbar"><label class="search">${I("search")}<input type="search" id="emp-q" placeholder="اسم أو قسم" value="${esc(ui("empQ") || "")}" data-change="empQ"></label></div>
        ${table(["الموظف", "القسم", "الدوام", "المرتب", "التارجت", "العمولة", "رصيد الإجازات", "آخر 1-to-1", "حل HR"], st.employees.filter((e) => !q || (e.name + e.dept).toLowerCase().includes(q)).map((e) => { const o = st.oneOnOnes.filter((x) => x.emp === e.id).sort((a, b) => b.date.localeCompare(a.date))[0], open = st.oneOnOnes.filter((x) => x.emp === e.id && x.action && !x.actionDone); return `<tr class="click" data-act="empFile" data-id="${e.id}"><td>${A.who(e.id)}</td><td>${esc(e.dept)}</td><td>${e.kind === "Part-time" ? chip("info", "Part-time") : "Full-time"}</td><td class="n">${A.money(e.salary)}</td><td class="n">${e.target ? A.short(e.target) : "—"}</td><td class="n">${e.commissionPct ? e.commissionPct + "%" : "—"}</td><td class="n">${e.leaveBalance - e.leaveUsed} / ${e.leaveBalance}</td><td>${o ? A.fmtDate(o.date) : chip("warn", "مفيش")}</td><td>${open.length ? chip(open.some((x) => x.actionDue <= A.today()) ? "bad" : "warn", A.fmtDate(open[0].actionDue)) : ""}</td></tr>`; }))}`;
    },
    leaves() {
      const st = S(), r = A.role, isTl = r === "tl";
      const list = isTl ? st.leaves.filter((l) => (st.people.find((p) => p.id === l.emp) || {}).tl === A.me() || l.status === "Pending TL") : st.leaves.filter((l) => l.status !== "Pending TL");
      const off = st.employees.filter((e) => A.onLeave(e.id));
      const month = A.today().slice(0, 7), byDay = {};
      st.leaves.filter((l) => ["Approved by TL", "Closed by HR"].includes(l.status)).forEach((l) => { for (let d = new Date(l.from); d <= new Date(l.to); d.setDate(d.getDate() + 1)) { const k = d.toISOString().slice(0, 10); (byDay[k] = byDay[k] || []).push({ title: A.person(l.emp).split(" ")[0], tone: "warn" }); } });
      return `${isTl ? note("الطلب مايوصلش للـ HR غير بعد موافقتك. لو رفضت، بيرجع للموظف بالسبب.") : note("الطلبات اللي لسه عند الـ Team Leader مش بتظهر هنا.")}
        <div class="cols wide"><section class="card">${head("طلبات الإجازة", "calendar")}${table(["الطلب", "الموظف", "النوع", "من → لحد", "أيام", "السبب", "الحالة", ""], list.map((l) => { const n = Math.round((new Date(l.to) - new Date(l.from)) / 864e5) + 1; return `<tr><td class="mono">${l.id}</td><td>${A.who(l.emp)}</td><td>${esc(l.type)}</td><td>${A.fmtDate(l.from)} → ${A.fmtDate(l.to)}</td><td class="n">${n}</td><td class="wrap">${esc(l.reason)}${l.rejectReason ? `<span class="sub">رفض: ${esc(l.rejectReason)}</span>` : ""}</td><td>${chip(LV_LVL[l.status], l.status)}</td><td>${isTl && l.status === "Pending TL" ? `<button class="btn sm" data-act="leave" data-id="${l.id}" data-v="Approved by TL">موافقة</button><button class="btn ghost sm" data-act="leaveReject" data-id="${l.id}">رفض</button>` : !isTl && l.status === "Approved by TL" ? `<button class="btn sm" data-act="leave" data-id="${l.id}" data-v="Closed by HR">سجّل</button>` : ""}</td></tr>`; }))}</section>
          <section class="card">${head("مين في إجازة النهارده", "users")}<div class="row">${off.map((e) => A.who(e.id)).join("") || `<span class="hint">مفيش حد</span>`}</div><p class="hint">السيلز اللي في إجازة بيتشال من التوزيع الآلي لليدز لوحده.</p>${U.calendar(month + "-15", byDay)}</section></div>
        <section class="card">${head("طلبات شغل من بره / عذر غياب", "pin", "", "الـ Head بيوافق، وبعدين الـ HR تراجع وتأكد · بعد التأكيد مفيش خصم حتى لو البصمة بتقول غير كده")}${table(["الطلب", "الموظف", "النوع", "اليوم", "السبب", "الحالة", ""], st.requests.map((q) => `<tr><td class="mono">${q.id}</td><td>${A.who(q.emp)}</td><td>${esc(q.kind)}</td><td>${A.fmtDate(q.day)}</td><td>${esc(q.reason)}</td><td>${chip(q.status === "Approved" ? "ok" : q.status === "Rejected" ? "bad" : "warn", q.status === "Head Approved" ? "الـ Head وافق · مستني الـ HR" : q.status)}</td><td>${q.status === "Pending" && A.canDo("hr", "approve") && ["tl", "admin", "salesdir"].includes(r) ? `<button class="btn sm" data-act="reqDecide" data-id="${q.id}" data-v="Head Approved">موافقة</button><button class="btn ghost sm" data-act="reqDecide" data-id="${q.id}" data-v="Rejected">رفض</button>` : q.status === "Head Approved" && A.canDo("hr", "approve") && r === "hr" ? `<button class="btn sm" data-act="reqDecide" data-id="${q.id}" data-v="Approved">${I("check")}أكّدي</button><button class="btn ghost sm" data-act="reqDecide" data-id="${q.id}" data-v="Rejected">رفض</button>` : ""}</td></tr>`))}</section>`;
    },
    saving() {
      const st = S(), month = A.today().slice(0, 7), rows = st.employees.map((e) => { const att = st.attendance.filter((a) => a.emp === e.id && a.day.startsWith(month)).map(A.attRow), dd = att.reduce((s, x) => s + x.ded, 0); return { e, dd, amt: dd * A.dayRate(e), late: att.reduce((s, x) => s + x.late, 0) }; }).filter((x) => x.dd || x.late).sort((a, b) => b.amt - a.amt);
      const total = rows.reduce((s, x) => s + x.amt, 0), payroll = st.employees.reduce((s, e) => s + e.salary, 0);
      return `<div class="kpis">${U.kpi("موازنة المرتبات / شهر", A.money(payroll), `${st.employees.length} موظف`, "id")}${U.kpi("الخصومات الشهر ده", A.money(total), "تأخير وغياب ونسيان بصمة", "wallet", "bad")}${U.kpi("المرتبات بعد الخصم", A.money(payroll - total), "بتسمع في المالية M-07", "bank", "ok")}${U.kpi("وفّرنا", ((total / payroll) * 100).toFixed(1) + "%", "من الموازنة", "trend", "warn")}</div>
        ${table(["الموظف", "المرتب", "أيام الخصم", "مبلغ الخصم", "المرتب بعد الخصم", "دقايق التأخير"], rows.map((x) => `<tr><td>${A.who(x.e.id)}</td><td class="n">${A.money(x.e.salary)}</td><td class="n">${x.dd}</td><td class="n">${A.money(x.amt)}</td><td class="n">${A.money(x.e.salary - x.amt)}</td><td class="n">${x.late} د</td></tr>`))}
        ${(st.dedApproved || {})[month] ? note(`خصومات الشهر اتعتمدت من ${esc(A.person(st.dedApproved[month].by))} ${A.ago(st.dedApproved[month].at)} واترحّلت للمالية.`) : `<div class="note warn">${I("alert")}<span class="spacer">خصومات الشهر لسه مااتعتمدتش، فمش ظاهرة في المالية.</span>${A.canDo("hr", "approve") && A.canDo("hr", "edit") ? `<button class="btn sm" data-act="dedApprove">${I("check")}اعتمد الخصومات وابعتها للمالية</button>` : ""}</div>`}
        ${note("الخصم = أيام الخصم × (المرتب ÷ 26). والإعدادات الخاصة بكل موظف بتغيّر شرايح الخصم بس، ودقايق الـ Weekly Delay بتتحسب بنفس الطريقة للكل.")}
        ${idealFund(month)}`;
    },
    rules() {
      const st = S(), D = A.DEFAULT_DED;
      return `<div class="cols"><section class="card">${head("الشرايح الافتراضي", "clock", "", "ميعاد الشغل 11:00 لكل الناس")}<div class="tiers"><div class="tier ok"><b>لحد 11:16</b><span>في الميعاد</span></div><div class="tier warn"><b>11:17 – 11:29</b><span>ربع يوم</span></div><div class="tier warn2"><b>11:30 – 11:59</b><span>نص يوم</span></div><div class="tier bad"><b>12:00 وبعدها</b><span>يوم</span></div></div></section>
        <section class="card">${head("Excuse", "ticket", "", "بيتطلب بتذكرة للـ HR · كل Excuse بيروح عليه Alarm")}<div class="tiers"><div class="tier ok"><b>1 و 2</b><span>من غير خصم</span></div><div class="tier warn"><b>التالت</b><span>نص يوم</span></div><div class="tier warn"><b>الرابع</b><span>نص يوم</span></div><div class="tier bad"><b>الخامس</b><span>رفد</span></div></div></section></div>
        <section class="card">${head("شرايح خاصة لموظف", "id", "", "الـ HR تختار من الدقيقة كام يبدأ الخصم لكل موظف")}<form data-form="dedSet" class="grid">
          ${field("الموظف", `<select name="emp" id="ds-emp">${st.employees.filter((e) => e.kind !== "Part-time").map((e) => opt(e.id, e.name)).join("")}</select>`, 1)}
          ${field("ربع يوم من الدقيقة", `<input name="quarterMin" id="ds-q" type="number" value="${D.quarterMin}">`)}${field("نص يوم من الدقيقة", `<input name="halfMin" id="ds-h" type="number" value="${D.halfMin}">`)}${field("يوم من الدقيقة", `<input name="dayMin" id="ds-d" type="number" value="${D.dayMin}">`)}
          <div class="row end wide"><button type="button" class="btn ghost" data-act="dedReset">رجّعه للافتراضي</button><button class="btn">حفظ للموظف ده</button></div></form>
          ${table(["الموظف", "ربع", "نص", "يوم"], st.employees.filter((e) => e.deduction).map((e) => `<tr><td>${A.who(e.id)}</td><td class="n">من ${e.deduction.quarterMin} د</td><td class="n">من ${e.deduction.halfMin} د</td><td class="n">من ${e.deduction.dayMin} د</td></tr>`))}</section>
        <section class="card">${head("أسئلة الـ 1-to-1", "list", "", "بتتدخّل مرة واحدة وتظهر في كل 1-to-1")}${st.oneQuestions.map((q, i) => `<div class="line-item"><span>${i + 1}. ${esc(q)}</span><button class="btn ghost sm" data-act="qDel" data-i="${i}">${I("x")}</button></div>`).join("")}<form class="row" data-form="qAdd"><input name="q" id="q-new" placeholder="سؤال جديد" required><button class="btn ghost">${I("plus")}إضافة</button></form></section>`;
    }
  };
  A.CHANGE.attDay = (v) => { ui("attDay", v); A.render(); };
  A.CHANGE.attQ = (v) => { ui("attQ", v); A.render(); };
  A.CHANGE.hsEmp = (v) => { ui("hsEmp", v); A.render(); };
  A.CHANGE.hsFrom = (v) => { ui("hsFrom", v); A.render(); };
  A.CHANGE.hsTo = (v) => { ui("hsTo", v); A.render(); };
  A.ACT.dlP = (d) => { ui("dlP", d.v); A.render(); };
  A.CHANGE.dFrom = (v) => { ui("dFrom", v); A.render(); };
  A.CHANGE.dTo = (v) => { ui("dTo", v); A.render(); };
  A.CHANGE.empQ = (v) => { ui("empQ", v); A.render(); };
  A.ACT.attConfirm = (d) => { const a = S().attendance.find((x) => x.emp === d.emp && x.day === d.day); a.confirmed = true; A.audit("hr", `أكّدت خصم يوم لـ ${A.person(a.emp)} (نسيان بصمة ${a.day})`); A.toast("خصم يوم اتأكد · بيسمع في المالية", () => (a.confirmed = false)); A.render(); };
  A.ACT.leave = (d) => { const l = S().leaves.find((x) => x.id === d.id); l.status = d.v; if (d.v === "Approved by TL") A.notify(["hr"], `طلب إجازة ${A.person(l.emp)} اتوافق عليه من الـ Team Leader`); if (d.v === "Closed by HR") { const e = S().employees.find((x) => x.id === l.emp); e.leaveUsed += Math.round((new Date(l.to) - new Date(l.from)) / 864e5) + 1; } A.notify(["sales"], `طلب إجازتك: ${d.v}`); A.render(); };
  A.ACT.leaveReject = (d) => A.openModal("رفض طلب الإجازة", `<form data-form="leaveReject" class="grid"><input type="hidden" name="id" value="${d.id}">${field("سبب الرفض", `<input name="reason" id="lr-r" required>`, 1, 1)}<div class="row end wide"><button class="btn danger">رفض ورجّعه للموظف</button></div></form>`);
  A.FORM.leaveReject = (f) => { const l = S().leaves.find((x) => x.id === f.id); l.status = "Rejected"; l.rejectReason = f.reason; A.notify(["sales"], `طلب إجازتك اترفض: ${f.reason}`); A.closeModal(); A.render(); };
  // the Head approves first, then HR reviews and confirms; only HR's confirmation removes the deduction
  A.ACT.reqDecide = (d) => { const q = S().requests.find((x) => x.id === d.id); q.status = d.v; q.by = A.me(); if (d.v === "Head Approved") { A.notify(["hr"], `${A.person(q.emp)}: ${q.kind} ${q.day} · الـ Head وافق ومستني تأكيدك`); A.toast("اتوافق · راح للـ HR تأكد"); A.render(); return; } if (d.v === "Approved") { const a = S().attendance.find((x) => x.emp === q.emp && x.day === q.day); if (a) { a.status = "outside"; a.inMin = null; } } A.toast(d.v === "Approved" ? "الـ HR أكدت · مفيش خصم على اليوم ده" : "اترفض"); A.render(); };
  A.FORM.dedSet = (f) => { const e = S().employees.find((x) => x.id === f.emp); e.deduction = { graceMin: +f.quarterMin - 1, quarterMin: +f.quarterMin, halfMin: +f.halfMin, dayMin: +f.dayMin }; A.toast(`شرايح ${e.name} اتحفظت`); A.render(); };
  A.ACT.dedReset = () => { const e = S().employees.find((x) => x.id === document.getElementById("ds-emp").value); e.deduction = null; A.toast(`${e.name} رجع للشرايح الافتراضي`); A.render(); };
  A.FORM.qAdd = (f) => { S().oneQuestions.push(f.q); A.render(); };
  A.ACT.qDel = (d) => { S().oneQuestions.splice(+d.i, 1); A.render(); };

  /* employee file */
  A.ACT.empFile = (d) => { ui("eftab", "file"); A.openDrawer(() => empDrawer(d.id)); };
  function empDrawer(id) {
    const st = S(), e = st.employees.find((x) => x.id === id); if (!e) return "";
    const tab = ui("eftab") || "file", list = st.oneOnOnes.filter((x) => x.emp === id).sort((a, b) => b.date.localeCompare(a.date)), last = list[0];
    const month = A.today().slice(0, 7), att = st.attendance.filter((a) => a.emp === id && a.day.startsWith(month)).map(A.attRow);
    const exN = Math.max(0, ...st.excuses.filter((x) => x.emp === id && x.day.startsWith(month)).map((x) => x.n));
    let body = U.tabs("eftab", [["file", "الفايل"], ["one", "1-to-1", list.length], ["edit", "البيانات"]], tab);
    if (tab === "file") body += `<div class="kpis sm">${U.kpi("دقايق التأخير الشهر ده", att.reduce((s, x) => s + x.late, 0), "", "clock", "warn")}${U.kpi("أيام خصم", att.reduce((s, x) => s + x.ded, 0), "", "wallet", "bad")}${U.kpi("Excuse الشهر ده", exN, exN >= 3 ? "عليه خصم" : "", "ticket", exN >= 3 ? "bad" : "")}${U.kpi("رصيد الإجازات", e.leaveBalance - e.leaveUsed, `من ${e.leaveBalance}`, "calendar", "ok")}</div>
      ${kv([["القسم", esc(e.dept)], ["الدوام", esc(e.kind)], ["المرتب", A.money(e.salary)], ["التارجت", e.target ? A.money(e.target) : "—"], ["نسبة العمولة", e.commissionPct ? e.commissionPct + "%" : "—"], ["الـ Team Leader", e.tl ? A.who(e.tl) : "—"], ["بدأ", A.fmtDate(e.joined)], ["سلفة", A.money((st.advances.find((a) => a.emp === id) || {}).amount || 0)], ["شرايح الخصم", e.deduction ? `خاصة: ربع من ${e.deduction.quarterMin} د` : "الافتراضي"]])}`;
    if (tab === "one") body += `${last ? `<section class="card flat">${head("تقرير الـ 1-to-1 اللي فات", "file", "", A.fmtDate(last.date))}${Object.entries(last.answers).map(([q, a]) => `<div class="qa"><small>${esc(q)}</small><p>${esc(a || "—")}</p></div>`).join("")}${last.action ? `<div class="row">${chip(last.actionDone ? "ok" : last.actionDue <= A.today() ? "bad" : "warn", "حل الـ HR: " + last.action + " · " + A.fmtDate(last.actionDue))}${!last.actionDone ? `<button class="btn ghost sm" data-act="actionDone" data-id="${id}">خلص</button>` : ""}</div>` : ""}</section>` : note("أول 1-to-1 مع الموظف ده.")}
      <form data-form="oneNew" class="card flat">${head("1-to-1 جديد", "plus", "", "مرة كل شهر")}<input type="hidden" name="emp" value="${id}">
        ${field("التاريخ", `<input name="date" id="oo-date" type="date" value="${A.today()}" required>`, 1)}
        ${st.oneQuestions.map((q, i) => field(q, `<textarea name="q${i}" id="oo-q${i}"></textarea>`)).join("")}
        ${field("حل الـ HR", `<input name="action" id="oo-act" data-input="ooAct" placeholder="لو فيه حاجة محتاجة تتعمل">`)}
        <label class="field" id="oo-due-wrap" hidden><span>ميعاد تنفيذ حل الـ HR (هيجيلك Alarm)</span><input name="actionDue" id="oo-due" type="date"></label>
        <div class="row end"><button class="btn">حفظ في فايل الموظف</button></div></form>
      ${list.length > 1 ? `<section class="card flat">${head("History", "clock")}${list.slice(1).map((x) => `<details class="hist"><summary>${A.fmtDate(x.date)}${x.action ? ` · ${esc(x.action)}` : ""}</summary>${Object.entries(x.answers).map(([q, a]) => `<div class="qa"><small>${esc(q)}</small><p>${esc(a)}</p></div>`).join("")}</details>`).join("")}</section>` : ""}`;
    if (tab === "edit") body += `<form data-form="empEdit" class="grid"><input type="hidden" name="id" value="${id}">
      ${field("المرتب", `<input name="salary" id="ee-s" type="number" value="${e.salary}">`, 1)}${field("التارجت", `<input name="target" id="ee-t" type="number" value="${e.target}">`)}${field("الـ Scheme % (من نصيبه في الكوميشن)", `<input name="commissionPct" id="ee-c" type="number" step="0.1" value="${e.commissionPct}">`)}
      ${field("الدوام", `<select name="kind" id="ee-k">${opt("Full-time", "Full-time", e.kind)}${opt("Part-time", "Part-time (من غير بصمة)", e.kind)}</select>`)}${e.kind === "Part-time" ? field("خصومات الـ Part-time", `<select name="ptDeduct" id="ee-pt">${opt("no", "من غير خصومات", e.ptDeduct ? "yes" : "no")}${opt("yes", "عليه خصومات بالشرايح", e.ptDeduct ? "yes" : "no")}</select>`) : ""}${field("رصيد الإجازات السنوي", `<input name="leaveBalance" id="ee-lb" type="number" value="${e.leaveBalance}">`)}
      <div class="row end wide"><span class="hint spacer">التعديلات بتسمع أوتوماتيك في المالية والمبيعات.</span><button class="btn">حفظ</button></div></form>`;
    return U.drawer(e.name, `${e.dept} · فايل الموظف`, `${e.kind === "Part-time" ? chip("info", "Part-time") : chip("", "Full-time", 1)}${A.onLeave(id) ? chip("warn", "في إجازة") : ""}`, body);
  }
  A.ACT.eftab = (d) => { ui("eftab", d.v); A.refreshDrawer(); };
  A.CHANGE.ooAct = (v) => { document.getElementById("oo-due-wrap").hidden = !v; document.getElementById("oo-due").required = !!v; };
  A.FORM.oneNew = (f) => { const st = S(), answers = {}; st.oneQuestions.forEach((q, i) => (answers[q] = f["q" + i] || "")); st.oneOnOnes.push({ emp: f.emp, date: f.date, answers, action: f.action || "", actionDue: f.actionDue || "", actionDone: false }); if (f.action) A.notify(["hr"], `هيجيلك Alarm يوم ${A.fmtDate(f.actionDue)}: ${f.action}`); A.toast("الـ 1-to-1 اتحفظ في الفايل"); A.render(); };
  A.ACT.actionDone = (d) => { const o = S().oneOnOnes.filter((x) => x.emp === d.id).sort((a, b) => b.date.localeCompare(a.date))[0]; o.actionDone = true; A.render(); };
  A.FORM.empEdit = (f) => { const e = S().employees.find((x) => x.id === f.id); A.audit("hr", `${e.name}: مرتب ${e.salary} ← ${f.salary} · تارجت ${e.target} ← ${f.target}`); Object.assign(e, { salary: +f.salary, target: +f.target, commissionPct: +f.commissionPct, kind: f.kind, leaveBalance: +f.leaveBalance, ptDeduct: f.ptDeduct === "yes" }); A.toast("اتحفظ · اتحدّث في المالية"); A.render(); };
})();
