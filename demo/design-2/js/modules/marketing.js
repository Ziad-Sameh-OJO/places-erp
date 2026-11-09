/* M-04 Marketing: channels → campaigns dashboard, campaigns, content calendar, Broadcast, live unit alerts. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const COLORS = ["#0037ff", "#5a7dff", "#08875c", "#f2b64d", "#c22a37", "#6a3df0", "#0a7f9e"];
  const isMgr = () => A.canDo("marketing", "approve");
  function range() {
    const p = ui("mkRange") || "all", f = ui("mkF") || {}, t = A.today();
    if (p === "custom") return [f.from || "0000", f.to || "9999"];
    const back = { today: 0, "7": 7, "30": 30, "month": new Date(A.NOW()).getDate() - 1 }[p];
    return back == null ? ["0000", "9999"] : [new Date(A.NOW() - back * 864e5).toISOString().slice(0, 10), t];
  }

  V.marketing = {
    sub: () => "الليدز لكل channel وكامبين · Qualified · المحتوى · Broadcast · وحدات جديدة",
    render() {
      const st = S(), t = ui("mkTab") || "dash";
      const newUnits = st.units.filter((u) => u.status === "available" && !u.mkDone && (u.created >= new Date(A.NOW() - 14 * 864e5).toISOString().slice(0, 10) || u.pdf === "draft"));
      const tabs = U.tabs("mkTab", [["dash", "Dashboard"], ["camps", "الكامبينز", st.campaigns.length], ["content", "Content plan", st.posts.filter((p) => p.status !== "published").length], ["broadcast", "Broadcast", st.broadcasts.length], ["units", "وحدات جديدة", newUnits.length], ["deals", "الصفقات", mkDeals().length]], t);
      let body = "";
      if (t === "dash") {
        const [from, to] = range(), leads = st.leads.filter((l) => l.created.slice(0, 10) >= from && l.created.slice(0, 10) <= to);
        const ch = {}; leads.forEach((l) => { const c = (ch[l.channel] = ch[l.channel] || { total: 0, q: 0 }); c.total++; if (l.everInterested) c.q++; });
        const tot = leads.length, q = leads.filter((l) => l.everInterested).length, spent = st.campaigns.reduce((s, c) => s + c.spent, 0);
        const posts = st.posts.map((p) => ({ p, n: leads.filter((l) => l.post === p.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
        body = `<div class="toolbar">${U.seg("mkRange", [["today", "النهارده"], ["7", "آخر 7 أيام"], ["30", "آخر 30 يوم"], ["month", "الشهر ده"], ["all", "كل الوقت"], ["custom", "فترة مخصصة"]], ui("mkRange") || "all")}
          ${ui("mkRange") === "custom" ? `<label class="date-f"><span>من</span><input type="date" id="mk-from" value="${esc((ui("mkDraft") || ui("mkF") || {}).from || "")}" data-change="mkDraft" data-k="from"></label><label class="date-f"><span>لحد</span><input type="date" id="mk-to" value="${esc((ui("mkDraft") || ui("mkF") || {}).to || "")}" data-change="mkDraft" data-k="to"></label><button class="btn" data-act="mkApply">${I("search")}بحث</button>` : ""}</div>
          <div class="kpis">${U.kpi("إجمالي الليدز", A.num(tot), "في الفترة دي", "users", "", "", U.trend(leads, "created", 7))}${U.kpi("Qualified", A.num(q), `${tot ? Math.round((q / tot) * 100) : 0}% نسبة التأهيل`, "star", "ok")}${U.kpi("صرف الكامبينز", A.money(spent), `${st.campaigns.length} كامبين`, "megaphone", "warn")}${U.kpi("تكلفة الـ Qualified", A.money(q ? spent / q : 0), "للّيد الواحد", "trend")}</div>
          <div class="cols wide"><section class="card">${head("Channels ← Campaigns", "layers", "", "إجمالي كل channel ومتفرع منه الكامبينز")}
            <div class="tree">${Object.entries(ch).sort((a, b) => b[1].total - a[1].total).map(([name, c]) => { const camps = st.campaigns.filter((x) => x.channel === name); return `<details open><summary><b>${esc(name)}</b><span class="num">${c.total} ليد</span>${chip("ok", c.q + " Qualified")}<span class="num hide-sm">${Math.round((c.q / c.total) * 100)}%</span></summary>
              <div class="kids">${camps.map((cp) => { const ls = leads.filter((l) => l.campaign === cp.id), cq = ls.filter((l) => l.everInterested).length; return `<div class="kid"><span>${esc(cp.name)}<small>${esc(cp.target)}</small></span><span class="num">${ls.length} ليد</span>${chip("ok", cq + " Qualified")}<span class="num hide-sm">${ls.length ? Math.round((cq / ls.length) * 100) : 0}% · ${A.money(ls.length ? cp.spent / ls.length : 0)}/ليد</span></div>`; }).join("")}${leads.filter((l) => l.channel === name && !l.campaign).length ? `<div class="kid"><span class="hint">من غير كامبين</span><span class="num">${leads.filter((l) => l.channel === name && !l.campaign).length} ليد</span><span></span><span></span></div>` : ""}</div></details>`; }).join("") || U.empty("مفيش ليدز في الفترة دي")}</div></section>
            <section class="card">${head("الليدز حسب الـ channel", "chart")}${U.donut(Object.entries(ch).sort((a, b) => b[1].total - a[1].total).map(([k, v], i) => ({ label: k, value: v.total, color: COLORS[i % COLORS.length] })), A.num(tot), "ليد")}
              <h4 class="mini-h">البوستات اللي جابت ليدز</h4>${posts.length ? U.hbars(posts.map((x) => ({ label: x.p.title, sub: x.p.channel, value: x.n }))) : `<p class="hint">مفيش ليدز متربطة ببوست في الفترة دي</p>`}</section></div>
          <div class="cols"><section class="card">${head("إعلانات الويبسايت", "trend", chip(webToday() >= 25 ? "ok" : "warn", `${webToday()} من 25 النهارده`), "الويبسايت متربط بالسيستم وبيتعد لوحده")}${U.hbars(Array.from({ length: 7 }, (_, i) => { const d = new Date(A.NOW() - i * 864e5).toISOString().slice(0, 10); return { label: A.fmtDate(d), value: (st.webAds || {})[d] || 0 }; }), (v) => v + " إعلان")}</section>
            <section class="card">${head("تقرير المنافسين الشهري", "file", compDue(), "بينزلوا إيه + تحليل · بيتسلّم يوم 30")}${(st.compReports || []).slice(0, 3).map((x) => `<div class="line-item"><span><b>${esc(x.month)}</b> · ${esc(x.name)}</span><small class="hint">${A.fmtDate(x.at)}</small></div>`).join("") || `<p class="hint">مفيش</p>`}${isMgr() ? `<form class="row" data-form="compNew"><input name="name" required placeholder="اسم الملف / اللينك"><button class="btn ghost sm">${I("upload")}سلّم تقرير الشهر ده</button></form>` : ""}</section></div>
          ${notQualified(leads)}
          ${note("Qualified = أول ما الليد يوصل Interested أو أي مرحلة بعدها بيتحسب أوتوماتيك هنا، وبيفضل محسوب حتى لو رجع Not Interested أو No Answer.")}`;
      }
      if (t === "camps") body = `<div class="row end">${isMgr() ? `<button class="btn" data-act="campNew">${I("plus")}كامبين جديدة</button>` : ""}</div>
        ${table(["الكامبين", "Channel · Page", "الفترة", "الميزانية", "اتصرف", "الليدز", "Qualified", "تكلفة الليد", ""], st.campaigns.map((c) => { const ls = st.leads.filter((l) => l.campaign === c.id), q = ls.filter((l) => l.everInterested).length, live = c.start <= A.today() && c.end >= A.today(); return `<tr><td><b>${esc(c.name)}</b><span class="sub">${esc(c.target)}</span></td><td>${esc(c.channel)}${c.page ? `<span class="sub">${esc(c.page)}</span>` : ""}</td><td>${A.fmtDate(c.start)} → ${A.fmtDate(c.end)}<span class="sub">${live ? chip("ok", "شغالة") : chip("", "خلصت")}</span></td><td class="n">${A.money(c.budget)}</td><td><div class="cell-bar"><span class="num">${A.short(c.spent)}</span>${U.bar((c.spent / (c.budget || 1)) * 100, c.spent > c.budget * 0.9 ? "warn" : "")}</div></td><td class="n">${ls.length}</td><td class="n">${q}</td><td class="n">${A.money(ls.length ? c.spent / ls.length : 0)}</td><td><span class="lnk mono">${esc(c.link)}</span>${A.canDo("marketing", "edit") ? ` <button class="btn ghost sm" data-act="campEdit" data-id="${c.id}">تعديل</button>` : ""}</td></tr>`; }))}`;
      if (t === "content") {
        const mode = ui("ctMode") || "cal", month = ui("ctMonth") || A.today().slice(0, 7);
        const byDay = {}; st.posts.forEach((p) => { const k = p.at.slice(0, 10); (byDay[k] = byDay[k] || []).push({ id: p.id, title: p.title, tone: p.status === "published" ? "ok" : !p.approved ? "warn" : "acc" }); });
        const md = new Date(month + "-15"), prev = new Date(md.getFullYear(), md.getMonth() - 1, 15).toISOString().slice(0, 7), next = new Date(md.getFullYear(), md.getMonth() + 1, 15).toISOString().slice(0, 7);
        body = `<div class="row">${U.seg("ctMode", [["cal", "Calendar", "calendar"], ["list", "قايمة", "list"]], mode)}${mode === "cal" ? `<button class="round sm" data-act="ctMonth" data-v="${prev}" aria-label="الشهر اللي فات">›</button><b>${md.toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}</b><button class="round sm" data-act="ctMonth" data-v="${next}" aria-label="الشهر الجاي">‹</button>` : ""}<span class="spacer"></span><div class="legend-inline">${chip("acc", "متجدول")}${chip("warn", "مستني موافقة")}${chip("ok", "اتنشر")}</div>${isMgr() ? `<button class="btn" data-act="postNew">${I("plus")}بوست</button>` : ""}</div>
          ${mode === "cal" ? U.calendar(month + "-15", byDay, "postOpen") : table(["البوست", "Channel", "الكامبين", "الميعاد", "الحالة", ""], st.posts.slice().sort((a, b) => a.at.localeCompare(b.at)).map((p) => `<tr><td><b>${esc(p.title)}</b></td><td>${esc(p.channel)}</td><td>${esc((st.campaigns.find((c) => c.id === p.campaign) || {}).name || "—")}</td><td>${A.fmtDate(p.at)} · ${A.fmtTime(p.at)}${p.publishedAt ? `<span class="sub">اتنشر ${A.fmtTime(p.publishedAt)}</span>` : ""}</td><td>${p.status === "published" ? chip("ok", "اتنشر") : !p.approved ? chip("warn", "مستني موافقة") : p.at.slice(0, 10) === A.today() ? chip("bad", "Reminder النهارده") : chip("acc", "متجدول")}</td><td>${postActs(p)}</td></tr>`))}
          ${note("كل بوست له ميعاد نشر، والـ Reminder بيوصل في الميعاد، وبيتسجّل وقت النشر الفعلي. البوستات بتتراجع من مدير التسويق قبل ما تتنشر.")}`;
      }
      if (t === "broadcast") {
        const pct = (st.waSentToday / st.waLimit) * 100;
        body = `<div class="cols wide"><form data-form="bcNew" class="card">${head("رسالة Broadcast جديدة للسيلز", "megaphone", "", "صورة + نص + لوجو · بتتبعت كمهمة إرسال في لوحة كل سيلز")}
            ${field("النص", `<textarea name="text" id="bc-text" required placeholder="النص اللي السيلز هيبعته لعملائه"></textarea>`, 1)}
            ${field("Hot Inventory (الوحدات اللي في الرسالة)", `<select name="hot" multiple size="5" aria-label="Hot Inventory">${st.units.filter((u) => A.isAvailable(u) && u.pdf === "confirmed").map((u) => `<option value="${u.code}">${esc(u.code)} · ${esc(u.project)} · ${A.num(u.space)} م</option>`).join("")}</select>`)}
            <p class="hint">مواعيد الـ Broadcast الثابتة: الأحد والأربع · ${bcWeek()}</p>
            <div class="grid">${field("الصورة", `<input type="file" id="bc-img" accept="image/*" name="img">`)}<label class="tog"><input type="checkbox" name="logo" checked><span>حط اللوجو</span></label></div>
            <div class="row end"><button class="btn">${I("send")}ابعت للسيلز</button></div></form>
          <section class="card">${head("حد الواتساب اليومي", "alert", chip(pct > 85 ? "bad" : pct > 60 ? "warn" : "ok", `${st.waSentToday} / ${st.waLimit}`))}${U.bar(pct, pct > 85 ? "bad" : pct > 60 ? "warn" : "")}<p class="hint">حد أقصى للرسايل في اليوم عشان أرقام الشركة متتحظرش.</p></section></div>
          ${table(["الرسالة", "الموافقة", "بعتوها", "لسه", ""], st.broadcasts.map((b) => `<tr><td class="wrap"><b>${esc(b.text)}</b>${b.image ? `<span class="sub">${I("image")} ${esc(b.image)}</span>` : ""}</td><td>${b.approved ? chip("ok", "اتوافق") : chip("warn", "مستني مدير التسويق")}</td><td><div class="avs">${b.sent.map((id) => A.avatar(id, 1)).join("") || "—"}</div></td><td class="n">${A.sales().length - b.sent.length}</td><td>${!b.approved && isMgr() ? `<button class="btn sm" data-act="bcApprove" data-id="${b.id}">موافقة</button>` : ""}</td></tr>`))}`;
      }
      // Q26: an approved Done Deal reaches marketing with only these fields, and marketing can attach the client's logo
      if (t === "deals") body = `${note("الـ Done Deals بتظهر هنا بعد موافقة الـ Office Manager. مسموح تشوفي: الـ location، والمساحة، واسم الشركة، والـ type، واسم الـ Buyer بس، وتقدري ترفقي Logo لكل ديل.")}
        ${table(["الـ Buyer", "الشركة", "Type", "المساحة", "Location", "Logo"], mkDeals().map(({ d, u, l }) => `<tr><td><b>${esc(d.client)}</b></td><td>${esc(l.company || "—")}</td><td>${esc(u.type || "—")}</td><td class="n">${A.num(u.space || 0)} م</td><td>${esc(u.area || d.area || "—")}<span class="sub mono">${esc(u.location || "")}</span></td><td>${d.logo ? `<span class="lnk">${I("image")}${esc(d.logo)}</span>` : `<label class="btn ghost sm">${I("upload")}ارفع Logo<input type="file" accept="image/*" data-change="mkLogo" data-id="${d.id}" hidden></label>`}</td></tr>`))}`;
      if (t === "broadcast" && st.selfBroadcasts && st.selfBroadcasts.length) body += `<section class="card">${head("Broadcast عمله السيلز لوحدات تانية", "megaphone", "", "السيلز بيسجّلوه وهم بيدوسوا Done")}${table(["السيلز", "الوحدات", "إمتى"], st.selfBroadcasts.map((x) => `<tr><td>${A.who(x.by)}</td><td class="mono">${esc(x.units.join("، "))}</td><td>${A.ago(x.at)}</td></tr>`))}</section>`;
      if (t === "units") body = `${note("Live Alerts: أي وحدة جديدة بتتضاف للانفنتوري بتظهر هنا فوراً عشان تجهّزوا موادها. لما الإعلان يخلص دوس Done فتختفي، ولو اتداس بالغلط فيه Undo.")}
        <div class="drive">${newUnits.map((u) => `<article class="ucard"><div class="u-img u-${u.type}">${I("image")}<span class="mono">${u.code}</span>${chip("bad", "جديدة")}</div><div class="u-body"><b>${esc(u.project)}</b><small>${esc(u.area)} · ${A.num(u.space)} م · ${esc(u.type)}</small><div class="row"><button class="btn ghost sm" data-act="unitOpen" data-code="${u.code}">التفاصيل</button><button class="btn sm" data-act="mkUnitDone" data-code="${u.code}">الإعلان خلص · Done</button></div></div></article>`).join("") || U.empty("مفيش وحدات جديدة مستنية حملات", "building")}</div>`;
      return `<div class="row">${tabs}</div>${body}`;
    }
  };
  const postActs = (p) => p.status === "published" ? "" : !p.approved && isMgr() ? `<button class="btn sm" data-act="postApprove" data-id="${p.id}">موافقة</button>` : p.approved ? `<button class="btn ghost sm" data-act="postPub" data-id="${p.id}">اتنشر</button>` : "";
  A.ACT.mkTab = (d) => { ui("mkTab", d.v); A.render(); };
  /* the leads that never became Qualified, and why: the action the salesperson took on the lead (its stage) and their latest comment,
     with who wrote it. Follows the dashboard's date range. */
  const NQ = { "No Answer": ["warn", "No Answer · مردش"], "Not Interested": ["bad", "Not Interested"], Fresh: ["info", "لسه محدش كلّمه"], Cancellation: ["bad", "Cancellation"], Hold: ["", "Hold"] };
  const nqLabel = (s) => (NQ[s] || ["", s])[1];
  const lastAct = (l) => { const c = (l.comments || []).slice().sort((a, b) => (a.at < b.at ? 1 : -1)); return c.find((x) => x.note) || c[0] || null; };
  function notQualified(leads) {
    const st = S(), nq = leads.filter((l) => !l.everInterested), f = ui("mkNq") || "", by = {};
    nq.forEach((l) => (by[l.stage] = (by[l.stage] || 0) + 1));
    const list = nq.filter((l) => !f || l.stage === f).sort((a, b) => ((lastAct(b) || {}).at || b.created) > ((lastAct(a) || {}).at || a.created) ? 1 : -1);
    const camp = (id) => (st.campaigns.find((c) => c.id === id) || {}).name || "";
    return `<section class="card">${head("الليدز اللي ماكانتش Qualified", "users", chip(nq.length ? "bad" : "ok", `${nq.length} من ${leads.length}`), "السبب = الأكشن اللي السيلز عمله على الليد + آخر كومنت ليه، وصاحب الكومنت")}
      ${nq.length ? `<div class="row">${U.seg("mkNq", [["", `الكل (${nq.length})`], ...Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, `${nqLabel(k)} (${n})`])], f)}</div>
      ${U.hbars(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: nqLabel(k), sub: `${Math.round((n / nq.length) * 100)}% من اللي ماكانوش Qualified`, value: n })))}
      ${U.table(["الليد", "Channel · الكامبين", "السبب", "آخر أكشن / كومنت من السيلز", "صاحب الكومنت", "إمتى"], list.slice(0, 60).map((l) => { const c = lastAct(l); return `<tr><td><b>${esc(l.name)}</b><span class="sub mono">${esc(l.id)}</span></td><td>${esc(l.channel || "—")}${l.campaign ? `<span class="sub">${esc(camp(l.campaign))}</span>` : ""}</td><td>${chip((NQ[l.stage] || [""])[0], nqLabel(l.stage))}</td><td class="wrap">${c ? esc(c.text) : `<span class="hint">مفيش كومنت · لسه محدش اتواصل</span>`}</td><td>${c && c.by ? A.who(c.by) : "—"}</td><td>${c ? `${A.fmtDate(c.at)} · ${A.fmtTime(c.at)}` : "—"}</td></tr>`; }))}
      ${list.length > 60 ? `<p class="hint">ظاهر أحدث 60 من ${list.length}.</p>` : ""}` : `<p class="hint">كل الليدز في الفترة دي بقت Qualified.</p>`}</section>`;
  }
  A.ACT.mkNq = (d) => { ui("mkNq", d.v); A.render(); };
  A.ACT.mkRange = (d) => { ui("mkRange", d.v); A.render(); };
  A.CHANGE.mkF = (v, el) => { ui("mkF", Object.assign({}, ui("mkF"), { [el.dataset.k]: v })); A.render(); };
  // فترة مخصصة: picking the dates doesn't filter yet; «بحث» applies them
  A.CHANGE.mkDraft = (v, el) => { ui("mkDraft", Object.assign({}, ui("mkDraft") || ui("mkF"), { [el.dataset.k]: v })); };
  A.ACT.mkApply = () => { const d = ui("mkDraft") || ui("mkF") || {}; if (d.from && d.to && d.from > d.to) { A.toast("تاريخ «من» بعد «لحد»"); return; } ui("mkF", Object.assign({}, d)); ui("mkDraft", null); A.render(); A.toast(d.from || d.to ? `الفترة: ${d.from ? A.fmtDate(d.from) : "من الأول"} ← ${d.to ? A.fmtDate(d.to) : "لحد النهارده"}` : "كل الوقت"); };
  A.ACT.ctMode = (d) => { ui("ctMode", d.v); A.render(); };
  A.ACT.ctMonth = (d) => { ui("ctMonth", d.v); A.render(); };
  A.ACT.postOpen = (d) => { const p = S().posts.find((x) => x.id === d.id); A.openModal(p.title, `${U.kv([["Channel", esc(p.channel)], ["الميعاد", `${A.fmtDate(p.at)} · ${A.fmtTime(p.at)}`], ["الحالة", p.status === "published" ? "اتنشر" : p.approved ? "متجدول" : "مستني موافقة"], ["اتنشر فعلاً", p.publishedAt ? A.fmtTime(p.publishedAt) : "—"], ["ليدز جابها", A.num(S().leads.filter((l) => l.post === p.id).length)]])}<div class="row end">${postActs(p)}</div>`); };
  A.ACT.postApprove = (d) => { S().posts.find((p) => p.id === d.id).approved = true; A.toast("البوست اتوافق عليه"); A.closeModal(); A.render(); };
  A.ACT.postPub = (d) => { const p = S().posts.find((x) => x.id === d.id); p.status = "published"; p.publishedAt = A.nowIso(); A.toast(`اتسجّل وقت النشر ${A.fmtTime(p.publishedAt)}`); A.closeModal(); A.render(); };
  A.ACT.postNew = () => A.openModal("بوست في الـ Content plan", `<form data-form="postNew" class="grid">${field("البوست (التصميم / الفيديو)", `<input name="title" id="po-t" required>`, 1)}${field("Channel", `<select name="channel" id="po-c">${S().channels.map((c) => opt(c)).join("")}</select>`)}${field("الكامبين", `<select name="campaign" id="po-cp">${opt("", "—")}${S().campaigns.map((c) => opt(c.id, c.name)).join("")}</select>`)}${field("ميعاد النشر", `<input name="at" id="po-a" type="datetime-local" required>`, 1)}${field("الوصف", `<textarea name="desc" id="po-d"></textarea>`, 0, 1)}<div class="row end wide"><button class="btn">حفظ · هيجيلك Reminder في الميعاد</button></div></form>`);
  A.FORM.postNew = (f) => { S().posts.push({ id: "P-" + Date.now(), title: f.title, channel: f.channel, campaign: f.campaign, at: new Date(f.at).toISOString(), status: "scheduled", approved: A.canDo("marketing", "approve"), desc: f.desc }); A.closeModal(); A.toast("البوست اتجدول"); A.render(); };
  A.ACT.campNew = () => A.openModal("كامبين جديدة", `<form data-form="campNew" class="grid">
    ${field("اسم الكامبين", `<input name="name" id="cp-name" required>`, 1)}${field("Channel", `<select name="channel" id="cp-ch">${S().channels.map((c) => opt(c)).join("")}</select>`, 1)}${field("Page name", `<input name="page" id="cp-pg" list="cpPages" placeholder="اسم الصفحة اللي الإعلان نازل منها"><datalist id="cpPages">${[...new Set(S().campaigns.map((c) => c.page).filter(Boolean))].map((p) => `<option value="${esc(p)}">`).join("")}</datalist>`)}
    ${field("البداية", `<input name="start" id="cp-s" type="date" required>`, 1)}${field("النهاية", `<input name="end" id="cp-e" type="date" required>`, 1)}
    ${field("الميزانية", `<input name="budget" id="cp-b" type="number">`)}${field("المشروع / الوحدات المستهدفة", `<input name="target" id="cp-t" list="cpProj"><datalist id="cpProj">${[...new Set(S().units.map((u) => u.project))].map((p) => `<option value="${esc(p)}">`).join("")}</datalist>`)}
    ${field("لينك الإعلان", `<input name="link" id="cp-l">`)}${field("ملاحظات", `<input name="note" id="cp-n">`)}
    <div class="row end wide"><button class="btn">حفظ · هتظهر في الليدز تحت الـ channel بتاعها</button></div></form>`);
  A.ACT.campEdit = (d) => { const c = S().campaigns.find((x) => x.id === d.id); A.openModal(`تعديل · ${c.name}`, `<form data-form="campEdit" class="grid"><input type="hidden" name="id" value="${c.id}">${field("الاسم", `<input name="name" id="ce-n" value="${esc(c.name)}">`, 1)}${field("Page name", `<input name="page" id="ce-pg" value="${esc(c.page || "")}">`)}${field("النهاية", `<input type="date" name="end" id="ce-e" value="${c.end}">`)}${field("الميزانية", `<input type="number" name="budget" id="ce-b" value="${c.budget}">`)}${field("اتصرف", `<input type="number" name="spent" id="ce-s" value="${c.spent}">`)}${field("المستهدف", `<input name="target" id="ce-t" value="${esc(c.target)}">`)}<div class="row end wide"><button class="btn">حفظ</button></div></form>`); };
  A.FORM.campEdit = (f) => { const c = S().campaigns.find((x) => x.id === f.id); Object.assign(c, { name: f.name, page: (f.page || "").trim(), end: f.end, budget: +f.budget, spent: +f.spent, target: f.target }); A.audit("marketing", `الكامبين ${c.name} اتعدّلت`); A.closeModal(); A.render(); };
  A.FORM.campNew = (f) => { S().campaigns.push(Object.assign({ id: "c" + Date.now(), spent: 0 }, f, { budget: +f.budget || 0 })); A.closeModal(); A.toast("الكامبين اتضافت · الليدز هتتربط بيها"); A.render(); };
  const mkDeals = () => S().deals.filter((d) => !["Pending Review", "Rejected", "Cancelled"].includes(d.status)).map((d) => ({ d, u: S().units.find((x) => x.code === d.unit) || {}, l: S().leads.find((x) => x.id === d.lead) || {} }));
  A.CHANGE.mkLogo = (v, el) => { const f = el.files && el.files[0]; if (!f) return; S().deals.find((x) => x.id === el.dataset.id).logo = f.name; A.toast("الـ Logo اترفع على الديل"); A.render(); };
  // KPI data for Rahma: website ads per day, the monthly competitor report (due the 30th), broadcasts on the two fixed days with Hot Inventory
  const webToday = () => (S().webAds || {})[A.today()] || 0;
  const compDue = () => { const m = A.today().slice(0, 7), done = (S().compReports || []).some((x) => x.month === m); return done ? chip("ok", "اتسلّم الشهر ده") : chip(+A.today().slice(8) > 30 ? "bad" : "warn", "مستني يوم 30"); };
  const bcWeek = () => { const wk = new Date(A.NOW() - 7 * 864e5).toISOString(), n = S().broadcasts.filter((b) => b.created >= wk).length; return `الأسبوع ده اتبعت ${n} من 2`; };
  A.FORM.compNew = (f) => { const st = S(); (st.compReports = st.compReports || []).unshift({ month: A.today().slice(0, 7), name: f.name, at: A.nowIso(), by: A.uid }); A.audit("marketing", `تقرير المنافسين اتسلّم: ${f.name}`); A.toast("اتسلّم"); A.render(); };
  A.FORM.bcNew = (f, form) => { const img = form.querySelector("#bc-img").files[0], hot = [...form.querySelector("select[name=hot]").selectedOptions].map((o) => o.value); S().broadcasts.unshift({ id: "B-" + Date.now(), text: f.text, hot, image: img ? img.name : "", logo: !!f.logo, sent: [], created: A.nowIso(), approved: A.canDo("marketing", "approve") }); A.notify(["sales"], "رسالة Broadcast جديدة من التسويق · ابعتها لعملائك ودوس Done"); A.toast("اتبعتت كمهمة لكل السيلز"); A.render(); };
  A.ACT.bcApprove = (d) => { S().broadcasts.find((b) => b.id === d.id).approved = true; A.notify(["sales"], "Broadcast جديد اتوافق عليه · ابعته ودوس Done"); A.render(); };
  A.ACT.mkUnitDone = (d) => { const u = S().units.find((x) => x.code === d.code); u.mkDone = true; A.toast(`${u.code} اختفت من لوحة التسويق`, () => (u.mkDone = false)); A.render(); };
})();
