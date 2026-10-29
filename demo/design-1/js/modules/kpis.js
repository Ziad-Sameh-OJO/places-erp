/* KPI cards per person per quarter (client file Places_KPIs_Q4_2026). Each item is measured one of three ways:
   a = the system measures it from the modules · d = the person hands it in (on time or not) · m = their follower enters it.
   Card score = Σ weight × achievement. The follower approves, the Office Manager closes the quarter and everyone gets their result by email. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, head, note, table } = U;
  const HOW = { a: ["info", "أوتوماتيك"], d: ["warn", "تسليم"], m: ["", "يدوي"] };
  const K = () => S().kpis || { cards: {}, approved: {} };
  const cards = () => K().cards;
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  // live measures the demo can take from its own data; other "a" items carry the module's figure as a demo value
  const LIVE = {
    att: (id) => { const r = S().attendance.filter((a) => a.emp === id).map(A.attRow); return r.length ? pct(r.filter((x) => !x.ded).length, r.length) : 100; },
    ownTarget: (id, it) => { const g = A.targetGoal(id), got = A.targetOf(id); return g && got ? pct(got, g) : +(it && it.val) || 0; }, // no collections in the demo yet → its demo figure
    // sales: half for absence (up to 5 days off in the quarter), half for lateness (up to 6 hours in the month); over the limit shrinks in proportion
    attSales: (id) => { const d = new Date(A.NOW()), q0 = new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).toISOString().slice(0, 10), mo = A.today().slice(0, 7), att = S().attendance.filter((a) => a.emp === id);
      const off = att.filter((a) => a.day >= q0 && a.status === "absent").length, lateH = att.filter((a) => a.day.startsWith(mo)).map(A.attRow).reduce((s, x) => s + x.late, 0) / 60;
      return 50 * (off <= 5 ? 1 : 5 / off) + 50 * (lateH <= 6 ? 1 : 6 / lateH); },
    teamTarget: (id) => (A.tlStats ? A.tlStats(id).pct : 0),
    company: () => { const s = A.sales(); return pct(s.reduce((x, p) => x + A.targetOf(p.id), 0), s.reduce((x, p) => x + (A.targetGoal(p.id) || 0), 0)); },
    team: (id, it) => { const ids = ((it && it.ids) || Object.keys(cards()).filter((k) => cards()[k].by === id)).filter((k) => cards()[k]); return ids.length ? ids.reduce((s, k) => s + score(k), 0) / ids.length : 0; },
    verified: () => { const u = S().units.filter(A.isAvailable); return u.length ? pct(u.filter((x) => !A.stale(x)).length, u.length) : 100; },
    resaleFresh: () => { const u = S().units.filter((x) => A.availableAs(x, "Resale")); return u.length ? pct(u.filter((x) => !A.stale(x)).length, u.length) : 100; },
    tickets: () => { const t = S().tickets.filter((x) => x.status !== "Pending TL"); return t.length && A.ticketLate ? pct(t.filter((x) => !A.ticketLate(x)).length, t.length) : 100; },
    call30: () => { const l = S().leads.filter((x) => x.comments.length); return pct(l.filter((x) => (new Date(x.comments[0].at) - new Date(x.created)) / 60000 <= 30).length, l.length); },
    qualifiedN: () => S().leads.filter((l) => l.everInterested).length,
    // Heba: share of the week's new leads that got a verification call; Hadeer: outbound companies this week
    secondCalls: (id, it) => { const wk = new Date(A.NOW() - 7 * 864e5).toISOString(), n = S().leads.filter((l) => l.created >= wk && l.sales); return n.length ? pct(n.filter((l) => l.verify).length, n.length) : +it.val || 0; },
    outbound: () => { const wk = new Date(A.NOW() - 7 * 864e5).toISOString().slice(0, 10); return S().companies.filter((x) => x.outbound && x.date >= wk).length; },
    // deal value carried out by its due date ÷ value of deals already due; paper errors found by Finance
    dealExec: (id, it) => { const due = S().deals.filter((d) => d.status !== "Cancelled" && d.execDue && d.execDue <= A.today()), v = (d) => A.placesComm(d) || d.value || 0; return due.length ? pct(due.filter((d) => d.executed && d.executed <= d.execDue).reduce((s, d) => s + v(d), 0), due.reduce((s, d) => s + v(d), 0)) : +it.val || 0; },
    paperErrors: () => S().deals.filter((d) => d.papers && !d.papers.ok).length,
    // inventory: entered within 24h of receipt, media up within 24h of entry, lists answered within 24h, lists without unconfirmed units
    in24: (id, it) => { const u = S().units.filter((x) => x.receivedAt && x.enteredAt && (!it.only || it.only.includes(x.type))); return u.length ? pct(u.filter((x) => (new Date(x.enteredAt) - new Date(x.receivedAt)) / 36e5 <= 24).length, u.length) : +it.val || 0; },
    drive24: (id, it) => { const u = S().units.filter((x) => x.enteredAt); return u.length ? pct(u.filter((x) => x.driveAt && (new Date(x.driveAt) - new Date(x.enteredAt)) / 36e5 <= 24).length, u.length) : +it.val || 0; },
    lists24: (id, it) => { const L = S().listReqs || []; return L.length ? pct(L.filter((x) => (new Date(x.doneAt || A.nowIso()) - new Date(x.at)) / 36e5 <= 24).length, L.length) : +it.val || 0; },
    listsClean: (id, it) => { const L = (S().listReqs || []).filter((x) => x.doneAt); return L.length ? pct(L.filter((x) => !x.unconfirmed).length, L.length) : +it.val || 0; },
    webAds: () => { const d = Object.entries(S().webAds || {}).filter(([k]) => k >= new Date(A.NOW() - 7 * 864e5).toISOString().slice(0, 10)).map(([, v]) => v); return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0; }, // average a day this week
    disputes: (id, it) => { const d = S().tickets.filter((t) => t.type === "dispute"); return d.length && A.ticketLate ? pct(d.filter((t) => !A.ticketLate(t)).length, d.length) : +it.val || 0; },
    proc48: (id, it) => { const p = S().purchases.filter((x) => x.paidAt); return p.length ? pct(p.filter((x) => (new Date(x.paidAt) - new Date(x.created)) / 36e5 <= 48).length, p.length) : +it.val || 0; },
    pettyCap: () => { const st = S(), b = st.accounts.find((x) => /مختار/.test(x.name)); return b && b.balance <= (st.pettyCap || 50000) ? 100 : 0; },
    receipts: () => { const p = S().purchases.filter((x) => x.amount > 10000); return p.length ? pct(p.filter((x) => x.attach).length, p.length) : 100; }
  };
  const valOf = (id, it) => (it.how === "d" ? pct(it.done, it.need) : it.m && LIVE[it.m] ? LIVE[it.m](id, it) : +it.val || 0);
  // client (28/10): every item is proportional and may pass 100% (recorded as is). "at most / zero" items: met = 100%, over it shrinks
  // (our proposal until confirmed: goal ÷ actual, and a "zero" item loses 25% per occurrence)
  const ach = (it, v) => (it.dir === "max" ? (v <= it.goal ? 1 : it.goal > 0 ? it.goal / v : Math.max(0, 1 - 0.25 * v)) : it.goal ? v / it.goal : 1);
  // client (28/10): the same bands for everyone; the base (salary or quarter bonus) and the period are set per person
  // the bands live in settings (management edits them): reward at ≥ top, full bonus at ≥ full, partial down to ≥ partial, then the cut; below "low" the Threshold rule
  const BD = () => Object.assign({ top: 100, full: 96, partial: 70, low: 50, reward: 15, cut: 15 }, K().bands);
  const band = (s) => { const b = BD(); return s >= b.top ? [b.top, `مكافأة ${b.reward}%`, "ok"] : s >= b.full ? [b.full, "بونص كامل", "ok"] : s >= b.partial ? [b.partial, "بونص جزئي", "warn"] : s >= b.low ? [b.low, `خصم ${b.cut}% + خطة تحسين`, "bad"] : [-1, `Threshold: البونص بيتلغي + خصم ${b.cut}% من المرتب + إنذار`, "bad"]; };
  const baseAmt = (id) => { const p = cards()[id].pay || {}, e = (S().employees || []).find((x) => x.id === id); return p.base === "salary" && e && e.salary ? e.salary : +p.amount || 0; };
  // reward (+) or deduction (−) on the base. 70–95%: partial bonus, the cut grows evenly from 0 at 96% to 15% at 70% (our proposal until confirmed)
  // RECA TECH's rules until the client says otherwise: the partial cut grows evenly from 0 at "full" to the cut at "partial";
  // under "low" (the Threshold) the whole bonus is cancelled and the cut is taken from the monthly salary, plus a written warning
  const salaryOf = (id) => ((S().employees || []).find((x) => x.id === id) || {}).salary || 0;
  const delta = (id) => { const s = score(id), B = baseAmt(id), b = BD(), p = cards()[id].pay || {};
    if (s < b.low) return -Math.round(p.base === "bonus" ? B + salaryOf(id) * b.cut / 100 : B * b.cut / 100);
    return Math.round(B * (s >= b.top ? b.reward / 100 : s >= b.full ? 0 : s >= b.partial ? (-b.cut / 100) * (b.full - s) / (b.full - b.partial) : -b.cut / 100)); };
  const PAYL = { salary: "المرتب", bonus: "بونص الكوارتر", month: "شهري", quarter: "كل ربع" };
  const score = (id) => (cards()[id] ? cards()[id].items.reduce((s, it) => s + it.w * ach(it, valOf(id, it)), 0) : 0);
  const isPct = (it) => it.how === "d" || /%/.test(it.target) || ["att", "attSales", "ownTarget", "company", "team", "verified", "resaleFresh", "tickets", "call30", "receipts", "secondCalls", "dealExec", "in24", "drive24", "lists24", "listsClean", "disputes", "proc48", "pettyCap"].includes(it.m);
  const fmt = (id, it) => { const v = valOf(id, it); if (it.how === "d") return `${it.done} من ${it.need} في الميعاد`; const n = Math.abs(v) < 10 && v % 1 ? v.toFixed(1) : A.num(Math.round(v)); return isPct(it) ? n + "%" : n; };
  const followerOf = (id) => (cards()[id] || {}).by;
  const followerName = (by) => (by === "owners" ? "الملاك" : A.person(by));
  // the follower (or the owners, i.e. a Super Admin who isn't the card's owner) enters manual items and approves
  const isFollower = (id) => { const by = followerOf(id); return by === "owners" ? A.role === "admin" && A.uid !== id : by === A.uid; };
  const seesAll = () => A.role === "admin" || A.canDo("kpis", "approve");
  // the card's manager controls everything on it (items, weights, targets, how it's measured); so does whoever has KPI edit rights
  const canManage = (id) => open() && (isFollower(id) || A.canDo("kpis", "edit"));
  const visible = (scope) => Object.keys(cards()).filter((id) => (scope === "me" ? id === A.uid : scope === "team" ? isFollower(id) : seesAll() || id === A.uid || isFollower(id)));
  const open = () => K().status !== "closed";
  const tone = (s) => band(s)[2];
  const below = (id) => cards()[id].items.filter((it) => ach(it, valOf(id, it)) < 1);
  // job titles as the client's KPI file writes them; anyone else shows their role
  const TITLE = { u1: "CEO · الإيراد", u2: "COO · التشغيل والمعروض", u21: "Office Manager", u18: "CFO (عن بُعد)", u14: "Head of HR", u11: "Marketing Manager", u12: "Photographer", u6: "Sales Operations Specialist", u5: "Telesales & Lead Qualifier", u7: "Inventory Manager", u8: "Resale & Primary Specialist", u9: "Data & Drive Specialist", u10: "Verification & Materials Specialist", u16: "Procurement Manager" };
  const roleOf = (id) => TITLE[id] || A.roleLabel(((S().users || []).find((u) => u.id === id) || {}).role);

  // the board on Reports → KPIs
  A.kpiBoard = (scope) => {
    const ids = visible(scope), all = Object.keys(cards()), avg = all.length ? all.reduce((s, id) => s + score(id), 0) / all.length : 0, apr = Object.keys(K().approved || {}).length;
    const sort = A.ui.kpSort || "low", list = ids.slice().sort((a, b) => (sort === "low" ? score(a) - score(b) : score(b) - score(a)));
    return `${note(`كارت KPIs لكل موظف في ${esc(K().label || "")} من ملف الكلاينت. البند <b>الأوتوماتيك</b> السيستم بيقيسه لوحده من الموديولات، و<b>التسليم</b> الموظف بيسجّله والسيستم بيشوف كان في ميعاده ولا لأ، و<b>اليدوي</b> بيدخّله المتابع. النتيجة = مجموع (الوزن × التحقيق)، وبتتحدّث لحظياً.`)}
      <div class="kpis sm">${U.kpi("الكروت", ids.length, seesAll() ? "كل الشركة" : "كارتك وفريقك", "users")}${U.kpi("متوسط الشركة", Math.round(avg) + "%", K().label, "chart", tone(avg))}${U.kpi("اتعتمد", `${apr} من ${all.length}`, "من المتابع", "check", apr === all.length ? "ok" : "warn")}${U.kpi("الربع", open() ? "مفتوح" : "اتقفل", open() ? "النتايج بتتحدّث" : "النتايج اتبعتت", "clock", open() ? "" : "ok")}</div>
      <div class="toolbar">${U.seg("kpSort", [["low", "الأقل الأول"], ["high", "الأعلى الأول"]], sort)}<span class="spacer"></span>${open() && A.canDo("kpis", "approve") ? `<button class="btn" data-act="kpiClose">${I("send")}اقفل الربع وابعت النتايج</button>` : ""}</div>
      <div class="kpi-cards">${list.map((id) => { const s = score(id), b = below(id).length, ok = (K().approved || {})[id]; return `<button class="kpi-card" data-act="kpiOpen" data-id="${id}"><span class="row">${A.avatar(id)}<span class="kc-who"><b>${esc(A.person(id))}</b><small>${esc(roleOf(id))} · يتابعه: ${esc(followerName(followerOf(id)))}</small></span><b class="num kc-score ${tone(s)}">${Math.round(s)}%</b></span>${U.bar(s, tone(s) === "ok" ? "" : tone(s))}<span class="row">${chip(tone(s), band(s)[1], 1)}${money(id)}${b ? chip("warn", `${b} بند تحت المستهدف`, 1) : ""}${ok ? chip("ok", "اتعتمد", 1) : chip("", "مستني اعتماد", 1)}${id === A.uid ? chip("info", "كارتك", 1) : ""}</span></button>`; }).join("") || U.empty("مفيش كروت ليك", "chart")}</div>`;
  };
  A.ACT.kpSort = (d) => { A.ui.kpSort = d.v; A.render(); };

  // one card in the drawer
  function parts(id) {
    const c = cards()[id], s = score(id), mine = id === A.uid, fol = isFollower(id) && open(), edit = A.ui.kpEdit && canManage(id), ok = (K().approved || {})[id], sumW = c.items.reduce((x, it) => x + it.w, 0);
    const body = `<div class="row"><b class="num kc-score big ${tone(s)}">${Math.round(s)}%</b><span class="hint">نتيجة الكارت لحد النهارده</span></div>${U.bar(s, tone(s) === "ok" ? "" : tone(s))}
        ${payBox(id)}
        ${edit && sumW !== 100 ? note(`مجموع الأوزان دلوقتي <b>${sumW}%</b> · لازم يبقى 100%.`) : ""}
        <div class="tbl-wrap"><table class="kpi-items"><thead><tr><th>البند</th><th class="c">الوزن</th><th>المستهدف</th><th>القياس</th><th class="c">الفعلي</th><th class="c">التحقيق</th><th class="c">في الكارت</th></tr></thead><tbody>
        ${c.items.map((it, i) => { if (edit) return editRow(id, it, i); const v = valOf(id, it), a = ach(it, v); return `<tr class="${a < 1 ? "under" : ""}"><td><b>${esc(it.t)}</b><span class="sub">${esc(it.src)}</span></td>
          <td class="c">${edit ? `<input type="number" min="0" max="100" value="${it.w}" data-change="kpiW" data-id="${id}" data-i="${i}" style="width:64px" aria-label="الوزن">` : it.w + "%"}</td>
          <td>${esc(it.target)}</td><td>${chip(HOW[it.how][0], HOW[it.how][1], 1)}${it.mod ? ` <small class="mono hint">${it.mod}</small>` : ""}</td>
          <td class="c">${it.how === "m" && fol ? `<input type="number" step="any" value="${it.val}" data-change="kpiVal" data-id="${id}" data-i="${i}" style="width:72px" aria-label="القيمة">` : esc(fmt(id, it))}${it.how === "d" && mine && open() && it.done < it.need ? `<button class="btn ghost sm" data-act="kpiDeliver" data-id="${id}" data-i="${i}">${I("upload")}سلّمت</button>` : ""}</td>
          <td class="c"><div class="cell-bar"><b class="num">${Math.round(a * 100)}%</b>${U.bar(a * 100, a < 1 ? "warn" : "")}</div></td><td class="c num"><b>${(it.w * a).toFixed(1)}%</b></td></tr>`; }).join("")}
        </tbody><tfoot>${edit ? `<tr><td colspan="7"><button class="btn ghost sm" data-act="kpiAdd" data-id="${id}">${I("plus")}بند جديد</button></td></tr>` : ""}<tr><td><b>الإجمالي</b></td><td class="c">${sumW}%</td><td colspan="4"></td><td class="c num"><b>${s.toFixed(1)}%</b></td></tr></tfoot></table></div>
        ${note("كل بند بيتحسب بالنسبة، ولو عدّى 100% بيتسجّل زي ما هو. البند اللي «صفر» أو «لا يزيد عن» لو زاد بيقل بالنسبة (مقترح لحد تأكيد الكلاينت).")}
`;
    const foot = `<div class="row end">${canManage(id) ? `<button class="btn ghost" data-act="kpiEditT">${A.ui.kpEdit ? "خلصت تعديل" : "عدّل البنود"}</button>` : ""}${fol && !ok ? `<button class="btn" data-act="kpiApprove" data-id="${id}">${I("check")}اعتمد النتيجة</button>` : ok ? chip("ok", `اتعتمد من ${A.person(ok.by)}`) : ""}</div>`;
    return { c, ok, body, foot };
  }
  function drawer(id) { const { c, ok, body, foot } = parts(id); return U.drawer(A.person(id), `KPIs · ${K().label} · يتابعه: ${followerName(c.by)}`, chip("info", roleOf(id)) + (ok ? chip("ok", "اتعتمد") : ""), body, foot); }
  const money = (id) => { const v = delta(id); return v ? chip(v > 0 ? "ok" : "bad", `${v > 0 ? "+" : "−"}${A.money(Math.abs(v))}`, 1) : ""; };
  function payBox(id) {
    const c = cards()[id], p = c.pay || {}, s = score(id), v = delta(id), set = A.canDo("kpis", "edit") && open(), low = s < 70;
    const sel = (k, opts) => `<select data-change="kpiPay" data-id="${id}" data-k="${k}" ${set ? "" : "disabled"} aria-label="${k}">${opts.map((o) => `<option value="${o}" ${p[k] === o ? "selected" : ""}>${PAYL[o]}</option>`).join("")}</select>`;
    return `<section class="card flat">${head("النتيجة والفلوس", "wallet", chip(tone(s), band(s)[1]))}
      <div class="row">${sel("base", ["bonus", "salary"])}${sel("period", ["quarter", "month"])}${p.base === "bonus" ? `<label class="row hint">البونص <input type="number" min="0" value="${p.amount || 0}" data-change="kpiPay" data-id="${id}" data-k="amount" ${set ? "" : "disabled"} style="width:110px"></label>` : `<span class="hint">المرتب ${A.money(baseAmt(id))}</span>`}</div>
      <p>${v > 0 ? `مكافأة <b class="num">${A.money(v)}</b> على ${PAYL[p.base]}` : v < 0 ? `خصم <b class="num">${A.money(-v)}</b> من ${PAYL[p.base]}` : `${PAYL[p.base]} كامل`} · ${PAYL[p.period]}</p>
      ${low ? `<label class="field"><span>خطة التحسين ${s < BD().low ? "· تحت الـ Threshold: البونص اتلغى + إنذار مكتوب، ولو اتكرر ربعين ورا بعض بيروح للـ HR" : ""}</span><textarea rows="2" data-change="kpiPlan" data-id="${id}" ${isFollower(id) && open() ? "" : "disabled"} placeholder="المتابع بيكتب الخطة والمواعيد">${esc(c.plan || "")}</textarea></label>` : ""}
      <small class="hint">100%+ مكافأة 15% · 96%+ بونص كامل · 70–95% جزئي (النقص بيزيد بالتساوي لحد 15%) · أقل من 70% خصم 15% + خطة تحسين · أقل من 50% البونص بيتلغي + خصم 15% من المرتب + إنذار</small></section>`;
  }
  A.CHANGE.kpiPay = (v, el) => { const c = cards()[el.dataset.id], p = (c.pay = c.pay || {}); p[el.dataset.k] = el.dataset.k === "amount" ? +v : v; A.audit("reports", `KPI ${A.person(el.dataset.id)}: الحسبة على ${PAYL[p.base]} · ${PAYL[p.period]}`); A.render(); A.refreshDrawer(); };
  A.CHANGE.kpiPlan = (v, el) => { cards()[el.dataset.id].plan = v; A.audit("reports", `خطة تحسين لـ ${A.person(el.dataset.id)}`); A.toast("خطة التحسين اتحفظت"); };
  A.ACT.kpiOpen = (d) => A.openDrawer(() => drawer(d.id));
  A.CHANGE.kpiVal = (v, el) => { const it = cards()[el.dataset.id].items[+el.dataset.i]; it.val = +v; A.audit("reports", `KPI ${A.person(el.dataset.id)} · ${it.t}: ${v}`); A.toast("اتحفظ · النتيجة اتحدّثت"); A.render(); A.refreshDrawer(); };
  // edit mode: every field of an item, plus add / remove
  const editRow = (id, it, i) => { const f = (k, v, a) => `<input value="${esc(v == null ? "" : v)}" data-change="kpiF" data-id="${id}" data-i="${i}" data-k="${k}" ${a || ""}>`, sel = (k, o) => `<select data-change="kpiF" data-id="${id}" data-i="${i}" data-k="${k}" aria-label="${k}">${o.map(([v, l]) => `<option value="${v}" ${it[k] === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    return `<tr class="edit"><td>${f("t", it.t, 'aria-label="البند"')}${f("src", it.src, 'placeholder="المصدر" aria-label="المصدر"')}</td><td class="c">${f("w", it.w, 'type="number" min="0" max="100" style="width:64px" aria-label="الوزن"')}</td>
      <td>${f("target", it.target, 'placeholder="المستهدف زي ما بيتكتب" aria-label="المستهدف"')}<span class="row">${it.how === "d" ? `<span class="hint">مطلوب</span>${f("need", it.need, 'type="number" min="1" style="width:70px" aria-label="مرات التسليم"')}<span class="hint">مرة</span>` : `${sel("dir", [["min", "لا يقل عن"], ["max", "لا يزيد عن"]])}${f("goal", it.goal, 'type="number" step="any" style="width:80px" aria-label="الرقم المستهدف"')}`}</span></td>
      <td>${sel("how", [["a", "أوتوماتيك"], ["d", "تسليم"], ["m", "يدوي"]])}${f("mod", it.mod, 'placeholder="M-03" style="width:70px" aria-label="الموديول"')}</td><td colspan="2" class="hint">${esc(fmt(id, it))}</td><td class="c"><button class="btn ghost sm" data-act="kpiDel" data-id="${id}" data-i="${i}" aria-label="امسح البند">${I("x")}</button></td></tr>`; };
  A.CHANGE.kpiF = (v, el) => { const id = el.dataset.id, it = cards()[id].items[+el.dataset.i], k = el.dataset.k, old = it[k], num = ["w", "goal", "need"].includes(k);
    it[k] = num ? +v : v;
    if (k === "how" && v === "d") Object.assign(it, { need: it.need || 4, done: it.done || 0, goal: 100, dir: "min" });
    if (k === "how" && v !== "d") { delete it.m; if (it.need) { it.goal = 100; it.val = pct(it.done, it.need); } }
    if (k === "need") it.done = Math.min(it.done || 0, +v);
    A.audit("reports", `KPI ${A.person(id)} · ${it.t}: ${k} ${old ?? ""} ← ${v}`); A.render(); A.refreshDrawer(); };
  A.ACT.kpiAdd = (d) => { cards()[d.id].items.push({ t: "بند جديد", w: 0, target: "", src: "", how: "m", mod: "", goal: 100, dir: "min", val: 0 }); A.audit("reports", `KPI ${A.person(d.id)}: بند جديد`); A.render(); A.refreshDrawer(); };
  A.ACT.kpiDel = (d) => { const c = cards()[d.id], it = c.items[+d.i]; if (!confirm(`تمسح «${it.t}» من كارت ${A.person(d.id)}؟`)) return; c.items.splice(+d.i, 1); A.audit("reports", `KPI ${A.person(d.id)}: اتمسح «${it.t}»`); A.render(); A.refreshDrawer(); };
  A.ACT.kpiEditT = () => { A.ui.kpEdit = !A.ui.kpEdit; A.refreshDrawer(); };
  A.ACT.kpiDeliver = (d) => { const it = cards()[d.id].items[+d.i]; it.done = Math.min(it.need, it.done + 1); A.audit("reports", `${A.person(d.id)} سلّم «${it.t}» في الميعاد`); A.toast("اتسجّل التسليم في ميعاده"); A.render(); A.refreshDrawer(); };
  A.ACT.kpiApprove = (d) => { const k = K(); (k.approved = k.approved || {})[d.id] = { by: A.uid, at: A.nowIso() }; A.audit("reports", `اتعتمد KPI ${A.person(d.id)} · ${Math.round(score(d.id))}%`); A.toast("النتيجة اتعتمدت"); A.render(); A.refreshDrawer(); };
  A.ACT.kpiClose = () => {
    const k = K(), left = Object.keys(k.cards).filter((id) => !(k.approved || {})[id]).length;
    if (left && !confirm(`فيه ${left} كارت لسه ماتعتمدش. تقفل الربع برضه؟`)) return;
    Object.keys(k.cards).forEach((id) => { const u = (S().users || []).find((x) => x.id === id); const v = delta(id); k.cards[id].final = Math.round(score(id) * 10) / 10; k.cards[id].amount = v; if (u && u.status === "active") A.sendMail(u.email, `نتيجة الـ KPIs بتاعتك · ${k.label}`, `نتيجتك ${k.cards[id].final}% · ${band(score(id))[1]}${v ? ` · ${v > 0 ? "مكافأة" : "خصم"} ${A.money(Math.abs(v))}` : ""}. ${below(id).map((it) => `تحت المستهدف: ${it.t}`).join(" · ") || "كل البنود محققة."}`, { kind: "kpi" }); });
    k.status = "closed"; A.audit("reports", `الـ Office Manager قفلت ${k.label} · النتايج اتبعتت`); A.notify(["admin"], `${k.label} اتقفل · متوسط الشركة ${Math.round(Object.keys(k.cards).reduce((s, id) => s + k.cards[id].final, 0) / Object.keys(k.cards).length)}%`); A.toast("الربع اتقفل والنتايج اتبعتت على الإيميل"); A.render();
  };

  // home: my card, and what's waiting for me as a follower
  A.kpiMine = () => {
    const c = cards()[A.uid]; if (!c) return "";
    const s = score(A.uid), b = below(A.uid);
    return `<section class="card">${head("الـ KPIs بتاعتي", "chart", chip(tone(s) === "ok" ? "ok" : tone(s), Math.round(s) + "%"), `${K().label} · يتابعني: ${followerName(c.by)}`)}${U.bar(s, tone(s) === "ok" ? "" : tone(s))}
      ${b.length ? `<ul class="plain">${b.slice(0, 3).map((it) => `<li>${I("alert")}<span>${esc(it.t)} <small class="hint">· ${esc(fmt(A.uid, it))} من ${esc(it.target)}</small></span></li>`).join("")}</ul>` : `<p class="hint">كل البنود محققة لحد دلوقتي.</p>`}
      <div class="row end"><button class="btn ghost sm" data-act="kpiOpen" data-id="${A.uid}">افتح الكارت</button></div></section>`;
  };
  A.kpiInbox = (add) => {
    if (!open()) return;
    Object.keys(cards()).filter((id) => isFollower(id) && !(K().approved || {})[id]).forEach((id) => add("", "chart", `KPIs ${A.person(id)}: ${Math.round(score(id))}%`, `${cards()[id].items.filter((it) => it.how === "m").length} بند يدوي بتدخّله · ومستني اعتمادك`, "kpiOpen", { id }, "افتح الكارت"));
    const c = cards()[A.uid]; if (c) c.items.forEach((it, i) => { if (it.how === "d" && it.done < it.need) add("warn", "upload", `تسليم: ${it.t}`, `${it.done} من ${it.need} · بند في الـ KPIs بتاعتك`, "kpiOpen", { id: A.uid }, "سلّم");});
  };
  A.kpiScore = score;
  // M-12 · its own page for everybody: my card, the cards I manage, the whole company (management), the ideal employee
  const V = (window.VIEWS = window.VIEWS || {});
  V.kpis = {
    sub: () => "كارت كل موظف للربع · المدير بيتحكم في بنود فريقه · الموظف المثالي",
    render() {
      const mine = !!cards()[A.uid], team = visible("team").length, tabs = [mine && ["me", "كارتي"], team && ["team", "فريقي", team], seesAll() && ["all", "كل الشركة", Object.keys(cards()).length], ["ideal", "الموظف المثالي"]].filter(Boolean);
      const t = tabs.some((x) => x[0] === A.ui.kpTab) ? A.ui.kpTab : tabs[0][0];
      let body = "";
      if (t === "me") { const x = parts(A.uid); body = `<section class="card">${head(`${A.person(A.uid)} · ${roleOf(A.uid)}`, "chart", "", `${K().label} · يتابعني: ${followerName(x.c.by)}`)}${x.body}${x.foot}</section>`; }
      if (t === "team" || t === "all") body = A.kpiBoard(t === "team" ? "team" : "") + (t === "all" ? bandsCard() : "") + draftsCard(t);
      if (t === "ideal") { const m = A.today().slice(0, 7); body = `${note("الموظف المثالي في كل فريق بيستلم خصومات الحضور والتأخير بتاعة باقي الفريق آخر الشهر. التفاصيل والجزاءات في الـ HR ← التوفير.")}${table(["الفريق", "الموظف المثالي", "الصندوق"], (A.idealTeams ? A.idealTeams() : []).map(([k, mm]) => { const x = A.idealOf(mm, m); return `<tr><td><b>${esc(k)}</b><span class="sub">${mm.length} موظف</span></td><td>${x.win ? A.who(x.win.e.id) : chip("warn", "مفيش حد مستوفي الشروط")}</td><td class="n">${A.money(x.fund)}</td></tr>`; }))}`; }
      return `<div class="row">${U.tabs("kpTab", tabs, t)}</div>${body}`;
    }
  };
  // M-13: the money bands, editable by whoever has KPI edit rights
  function bandsCard() {
    const b = BD(), ed = A.canDo("kpis", "edit"), n = (k, w) => (ed ? `<input type="number" value="${b[k]}" data-change="kpiBand" data-k="${k}" style="width:${w || 64}px" aria-label="${k}">` : `<b>${b[k]}</b>`);
    return `<section class="card">${head("شرايح الفلوس", "wallet", "", "واحدة للكل · الحسبة على المرتب أو بونص الكوارتر حسب كل موظف")}
      <div class="tiers"><div class="tier ok"><b>${n("top")}% وأكتر</b><span>البونص كامل + مكافأة ${n("reward", 52)}%</span></div><div class="tier ok"><b>${n("full")}%</b><span>بونص كامل</span></div><div class="tier warn"><b>${n("partial")}% لحد ${b.full}%</b><span>بونص جزئي (النقص لحد ${b.cut}%)</span></div><div class="tier warn2"><b>أقل من ${b.partial}%</b><span>خصم ${n("cut", 52)}% + خطة تحسين</span></div><div class="tier bad"><b>أقل من ${n("low")}%</b><span>Threshold: البونص بيتلغي + خصم ${b.cut}% من المرتب + إنذار</span></div></div></section>`;
  }
  // next quarter's Team Leader cards (RECA TECH's draft until the client sends theirs): shown, not scored yet
  function draftsCard(t) {
    const D = K().drafts || {}, ids = Object.keys(D).filter((id) => t === "all" ? seesAll() : id === A.uid || D[id].by === A.uid); if (!ids.length) return "";
    return `<section class="card">${head("كروت الـ Team Leaders · الربع الجاي", "list", chip("warn", "مسودة من RECA TECH"), "بتتفعّل أول الربع الجاي، ولحد ما الكلاينت يبعت بتاعته")}
      ${table(["البند", "الوزن", "المستهدف", "بيتقاس إزاي"], (D[ids[0]].items || []).map((it) => `<tr><td><b>${esc(it.t)}</b><span class="sub">${esc(it.src)}</span></td><td class="c">${it.w}%</td><td>${esc(it.target)}</td><td>${chip(HOW[it.how][0], HOW[it.how][1], 1)}${it.mod ? ` <small class="mono hint">${it.mod}</small>` : ""}</td></tr>`))}
      <p class="hint">نفس الكارت لـ ${ids.map((id) => esc(A.person(id))).join("، ")} · يتابعهم أحمد إسلام.</p>${A.canDo("kpis", "edit") && t === "all" ? `<div class="row end"><button class="btn ghost sm" data-act="kpiDraftOn">${I("check")}فعّلها دلوقتي</button></div>` : ""}</section>`;
  }
  A.ACT.kpiDraftOn = () => { const k = K(); Object.entries(k.drafts || {}).forEach(([id, c]) => { k.cards[id] = c; }); k.drafts = {}; A.audit("kpis", "كروت الـ Team Leaders اتفعّلت"); A.toast("الكروت اتفعّلت · بتتحسب من دلوقتي"); A.render(); };
  A.CHANGE.kpiBand = (v, el) => { const k = K(); k.bands = Object.assign(BD(), { [el.dataset.k]: +v }); A.audit("kpis", `شرايح الـ KPIs: ${el.dataset.k} = ${v}`); A.toast("اتحفظ · كل الكروت اتحسبت تاني"); A.render(); };
  A.ACT.kpTab = (d) => { A.ui.kpTab = d.v; A.render(); };
})();
