/* Shared UI building blocks (all return HTML strings) + demo controls. */
(function () {
  const A = window.APP, esc = A.esc, I = A.icon;
  const U = {};
  U.chip = (lvl, t, plain) => `<span class="chip ${lvl || ""} ${plain ? "plain" : ""}">${esc(t)}</span>`;
  U.opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel == null ? "" : sel) ? "selected" : ""}>${esc(label == null ? v : label)}</option>`;
  U.field = (label, inner, req, wide) => `<label class="field ${req ? "req" : ""} ${wide ? "wide" : ""}"><span>${esc(label)}</span>${inner}</label>`;
  U.head = (title, ic, extra, sub) => `<div class="card-head"><h3>${ic ? `<span class="ico">${I(ic)}</span>` : ""}<span>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ""}</span></h3>${extra || ""}</div>`;
  U.note = (html, kind) => `<div class="note ${kind || ""}">${I(kind === "warn" ? "alert" : kind === "ok" ? "check" : "info")}<span class="spacer">${html}</span></div>`;
  U.empty = (t, ic) => `<div class="empty">${I(ic || "sparkle")}<p>${esc(t)}</p></div>`;
  // roles or people for a setting: chips with ✕ and an «add» select · act = handler prefix (…Add / …Del), attrs = what to change
  U.whoName = (x) => ({ follower: "المتابع بتاع الكارت", owner: "السيلز المسؤول عن الليد", ownerTl: "الـ Team Leader بتاع السيلز" }[x] || (A.S.perms[x] ? A.roleLabel(x) : A.person(x)));
  U.whoEdit = (list, act, attrs, ed, extra) => `<div class="row">${list.map((x) => (ed ? `<button class="btn ghost sm" data-act="${act}Del" ${attrs} data-v="${esc(x)}" aria-label="شيل ${esc(U.whoName(x))}">${esc(U.whoName(x))} ${I("x")}</button>` : U.chip("info", U.whoName(x)))).join("") || `<span class="hint">محدش</span>`}
    ${ed ? `<select data-change="${act}Add" ${attrs} aria-label="ضيف دور أو شخص" style="max-width:200px"><option value="">+ ضيف دور أو شخص</option>${(extra || []).filter(([v]) => !list.includes(v)).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}<optgroup label="أدوار">${Object.keys(A.S.perms).filter((k) => !list.includes(k)).map((k) => `<option value="${k}">${esc(A.roleLabel(k))}</option>`).join("")}</optgroup><optgroup label="أشخاص">${A.S.users.filter((u) => u.status === "active" && !list.includes(u.id)).map((u) => `<option value="${u.id}">${esc(A.person(u.id))}</option>`).join("")}</optgroup></select>` : ""}</div>`;
  // the official holidays calendar (from–to ranges), shared by the settings page and the lead rules page; i = index in S.holidays
  U.holidays = (ed, upcoming) => {
    const fmt = (d) => new Date(d).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "long" });
    const rows = A.S.holidays.map((h, i) => ({ h, i, from: h.from || h.day, to: h.to || h.day })).filter((x) => !upcoming || x.to >= A.today()).sort((a, b) => a.from.localeCompare(b.from));
    return `${U.table(["الإجازة", "من", "لحد", "الأيام", ""], rows.map((x) => `<tr><td><b>${esc(x.h.name)}</b>${x.from <= A.today() && A.today() <= x.to ? " " + U.chip("warn", "النهارده") : ""}</td><td>${fmt(x.from)}</td><td>${fmt(x.to)}</td><td class="n">${Math.round((new Date(x.to) - new Date(x.from)) / 864e5) + 1}</td><td>${ed ? `<button class="btn ghost sm" data-act="holDel" data-i="${x.i}" aria-label="امسح ${esc(x.h.name)}">${I("x")}</button>` : ""}</td></tr>`))}
      ${ed ? `<form class="row" data-form="holAdd"><input name="name" placeholder="اسم الإجازة (مثلاً عيد الأضحى)" aria-label="اسم الإجازة" required><label class="field inline"><span>من</span><input type="date" name="from" required></label><label class="field inline"><span>لحد</span><input type="date" name="to" aria-label="لحد (لو يوم واحد سيبها فاضية)"></label><button class="btn ghost">${I("plus")}إضافة</button></form>` : ""}`;
  };
  U.table = (headRow, rows, cls) => `<div class="tbl-wrap ${cls || ""}"><table><thead><tr>${headRow.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headRow.length}">${U.empty("مفيش بيانات تطابق الفلتر")}</td></tr>`}</tbody></table></div>`;
  U.tabs = (act, items, cur) => `<div class="tabs" role="tablist">${items.map(([k, l, n]) => `<button role="tab" aria-selected="${cur === k}" data-act="${act}" data-v="${esc(k)}">${esc(l)}${n != null ? ` <span class="tab-n">${n}</span>` : ""}</button>`).join("")}</div>`;
  U.seg = (act, items, cur) => `<div class="seg" role="group">${items.map(([k, l, ic]) => `<button aria-pressed="${cur === k}" data-act="${act}" data-v="${esc(k)}" title="${esc(l)}">${ic ? I(ic) : ""}<span>${esc(l)}</span></button>`).join("")}</div>`;
  U.kv = (pairs) => `<dl class="kv">${pairs.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v == null || v === "" ? "—" : v}</dd></div>`).join("")}</dl>`;
  U.bar = (pct, lvl) => `<div class="bar ${lvl || ""}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;

  // decorative trend line from a seed so it stays stable between renders
  U.spark = (seed, tone) => { let h = 0; for (const c of String(seed)) h = (h * 33 + c.charCodeAt(0)) >>> 0; const pts = Array.from({ length: 9 }, (_, i) => { h = (h * 1103515245 + 12345) >>> 0; return [i * 10.5, 26 - (5 + (h % 13) + i * 0.9)]; }); const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" "); const col = { bad: "var(--bad)", warn: "var(--warn)", ok: "var(--ok)" }[tone] || "var(--accent)"; return `<svg class="spark" viewBox="0 0 84 28" aria-hidden="true"><path d="${d} L84 28 L0 28 Z" fill="${col}" opacity=".12"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round"/></svg>`; };
  // delta: number in % vs the previous period (positive = up)
  U.kpi = (label, val, sub, ic, tone, act, delta) => `<${act ? `button data-act="${act}"` : "div"} class="kpi ${act ? "kpi-btn" : ""}"><div class="k-top"><span>${esc(label)}</span>${ic ? `<span class="ico ${tone || ""}">${I(ic)}</span>` : ""}</div><div class="k-val"><strong>${val}</strong>${delta != null && isFinite(delta) ? `<span class="delta ${delta >= 0 ? "up" : "down"}" title="مقارنة بالفترة اللي قبلها">${delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))}%</span>` : ""}</div>${sub ? `<small>${esc(sub)}</small>` : ""}${U.spark(label, tone)}</${act ? "button" : "div"}>`;
  U.print = (title, html) => {
    let el = document.getElementById("printArea"); if (!el) { document.body.insertAdjacentHTML("beforeend", `<div id="printArea" dir="rtl" lang="ar"></div>`); el = document.getElementById("printArea"); }
    const B = A.S.brand || {}, sign = B.signature || B.stamp ? `<div class="print-sign">${B.stamp ? `<img src="${B.stamp}" alt="الختم">` : ""}${B.signature ? `<img src="${B.signature}" alt="الإمضا">` : ""}<small>اعتماد Places</small></div>` : "";
    el.innerHTML = `<h1 class="print-title">${A.esc(title)}</h1>${html}${sign}<p class="print-foot">Places ERP · ${new Date(A.NOW()).toLocaleString("ar-EG")}</p>`;
    document.body.classList.add("printing"); const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done); setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
  };
  A.ACT.printModal = () => { const body = document.querySelector("#modalBody .pdf") || document.getElementById("modalBody"); U.print(document.getElementById("modalTitle").textContent, body.outerHTML); };
  U.readSheet = (file) => new Promise((ok, fail) => {
    const rd = new FileReader(), excel = /\.xlsx?$/i.test(file.name);
    if (excel && !window.XLSX) { fail(new Error("قارئ الـ Excel مش متحمّل (محتاج إنترنت) · ارفع CSV")); return; }
    rd.onerror = () => fail(new Error("الملف مااتقراش"));
    rd.onload = () => {
      if (!excel) { ok(String(rd.result).split(/\r?\n/).map((l) => l.split(/[,;\t]/).map((c) => c.trim())).filter((c) => c.some(Boolean))); return; }
      const wb = window.XLSX.read(new Uint8Array(rd.result), { type: "array", cellDates: true }), ws = wb.Sheets[wb.SheetNames[0]];
      ok(window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "yyyy-mm-dd" }).map((r) => r.map((c) => String(c == null ? "" : c).trim())).filter((r) => r.some(Boolean)));
    };
    if (excel) rd.readAsArrayBuffer(file); else rd.readAsText(file);
  });
  U.delta = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null);
  // % change of items dated in the last `days` vs the `days` before (sum of val, or count)
  U.trend = (items, key, days, val) => { const now = A.NOW(), d = days * 864e5; let a = 0, b = 0; items.forEach((x) => { const t = now - new Date(x[key]).getTime(), v = val ? val(x) : 1; if (t >= 0 && t < d) a += v; else if (t >= d && t < 2 * d) b += v; }); return U.delta(a, b); };

  // horizontal bars: [{label, value, sub, tone}]
  U.hbars = (rows, fmt) => { const max = Math.max(1, ...rows.map((r) => r.value)); return `<div class="hbars">${rows.map((r) => `<div class="hb"><span class="hb-l">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span>${U.bar((r.value / max) * 100, r.tone)}<span class="hb-v">${fmt ? fmt(r.value) : A.num(r.value)}</span></div>`).join("")}</div>`; };
  // donut: [{label, value, color}]
  U.donut = (rows, center, sub) => {
    const tot = rows.reduce((s, r) => s + r.value, 0) || 1, R = 42, C = 2 * Math.PI * R; let off = 0;
    const segs = rows.map((r) => { const len = (r.value / tot) * C; const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${r.color}" stroke-width="14" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"><title>${esc(r.label)}: ${r.value}</title></circle>`; off += len; return s; }).join("");
    return `<div class="donut"><svg viewBox="0 0 120 120" role="img" aria-label="${esc(sub || "")}"><circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--sunken)" stroke-width="14"/>${segs}<text x="60" y="58" text-anchor="middle" class="d-big">${esc(center)}</text><text x="60" y="74" text-anchor="middle" class="d-sub">${esc(sub || "")}</text></svg><ul class="legend">${rows.map((r) => `<li><i style="background:${r.color}"></i><span>${esc(r.label)}</span><b class="num">${A.num(r.value)}</b><small class="num">${Math.round((r.value / tot) * 100)}%</small></li>`).join("")}</ul></div>`;
  };
  // area chart of a daily series [{label, value}]
  U.area = (series, opts) => {
    opts = opts || {}; const W = 560, H = 160, P = 24, max = Math.max(1, ...series.map((s) => s.value)), n = series.length;
    const x = (i) => P + (i * (W - P * 2)) / Math.max(1, n - 1), y = (v) => H - P - (v / max) * (H - P * 2);
    const d = series.map((s, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(s.value).toFixed(1)).join(" ");
    const grid = [0, 0.5, 1].map((g) => `<line x1="${P}" x2="${W - P}" y1="${y(max * g).toFixed(1)}" y2="${y(max * g).toFixed(1)}" class="grid"/><text x="${W - P + 4}" y="${(y(max * g) + 4).toFixed(1)}" class="axis">${Math.round(max * g)}</text>`).join("");
    const ticks = series.map((s, i) => (i % Math.ceil(n / 6) === 0 || i === n - 1) ? `<text x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="axis">${esc(s.label)}</text>` : "").join("");
    const last = series[n - 1] || { value: 0 };
    return `<svg class="areachart" viewBox="0 0 ${W + 20} ${H}" role="img" aria-label="${esc(opts.label || "")}">${grid}<path d="${d} L${x(n - 1).toFixed(1)} ${H - P} L${x(0).toFixed(1)} ${H - P} Z" class="fill"/><path d="${d}" class="line"/><circle cx="${x(n - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="4" class="dot"/>${ticks}</svg>`;
  };
  // pipeline stepper for a lead
  U.stepper = (stages, cur, done) => `<ol class="stepper">${stages.map((s, i) => { const ci = stages.indexOf(cur); return `<li class="${i < ci || done ? "done" : i === ci ? "cur" : ""}"><span>${i + 1}</span><b>${esc(s)}</b></li>`; }).join("")}</ol>`;
  // month calendar with items per ISO day
  U.calendar = (monthDate, itemsByDay, actName) => {
    const d0 = new Date(monthDate); d0.setDate(1);
    const startDow = (d0.getDay() + 1) % 7; // week starts Saturday
    const days = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(`<div class="cal-cell off"></div>`);
    for (let day = 1; day <= days; day++) {
      const iso = new Date(d0.getFullYear(), d0.getMonth(), day, 12).toISOString().slice(0, 10), items = itemsByDay[iso] || [];
      cells.push(`<div class="cal-cell ${iso === A.today() ? "today" : ""}"><span class="cal-d">${day}</span>${items.slice(0, 3).map((x) => `<button class="cal-item ${x.tone || ""}" ${actName && x.id ? `data-act="${actName}" data-id="${esc(x.id)}"` : ""} title="${esc(x.title)}">${esc(x.title)}</button>`).join("")}${items.length > 3 ? `<small>+${items.length - 3}</small>` : ""}</div>`);
    }
    return `<div class="cal"><div class="cal-head">${["سبت", "أحد", "اتنين", "تلات", "أربع", "خميس", "جمعة"].map((x) => `<span>${x}</span>`).join("")}</div><div class="cal-grid">${cells.join("")}</div></div>`;
  };
  U.drawer = (title, sub, chips, body, foot, nav) => `<header class="dr-head"><div class="dr-av" aria-hidden="true">${esc(String(title).replace(/^(د\.|م\.|أ\.)\s*/, "").charAt(0))}</div><div><span class="crumb">${esc(sub)}</span><h2>${esc(title)}</h2><div class="row">${chips || ""}</div></div><div class="dr-tools">${nav || ""}<button class="round" data-close="drawer" aria-label="قفل">${I("x")}</button></div></header><div class="dr-body">${body}</div>${foot ? `<footer class="dr-foot">${foot}</footer>` : ""}`;

  /* demo controls */
  A.ACT.demoClock = (d) => { A.S.clock = (A.S.clock || 0) + +d.min; A.toast(`الوقت اتقدّم ${+d.min >= 60 ? (+d.min / 60) + " ساعة" : d.min + " دقيقة"}`); A.render(); };
  // the meeting dropped the holiday switch: holidays are dated, so the demo just adds (or removes) today as an official holiday
  A.ACT.demoHoliday = () => { const st = A.S, t = A.today(); st.holidays = st.holidays || []; const i = st.holidays.findIndex((h) => h.demo && h.from === t);
    if (i >= 0) { st.holidays.splice(i, 1); A.toast("النهارده رجع يوم شغل"); } else { st.holidays.push({ from: t, to: t, name: "إجازة رسمية (ديمو)", demo: true }); A.toast("النهارده بقى إجازة رسمية · الـ SLA بيمشي بمواعيد الإجازة"); }
    A.audit("master", i >= 0 ? "اتشالت إجازة النهارده (ديمو)" : "النهارده إجازة رسمية (ديمو)"); A.render(); };
  A.ACT.demoDay = () => { A.S.clock = (A.S.clock || 0) + 24 * 60; const n = A.rotateNoAnswer(); A.toast(`يوم جديد · ${n} ليد No Answer اتنقلوا بالروتيشن`); A.render(); };
  A.ACT.demoFinger = () => { const n = A.syncFingerprint(); A.toast(n ? `اتسحب ${n} بصمة من الجهاز` : "كل بصمات النهارده موجودة"); A.render(); };
  A.ACT.demoClockReset = () => { A.S.clock = 0; A.toast("الوقت رجع للحقيقي"); A.render(); };

  window.UI = U;
})();
/* CSV export for any main list (copy, or download when opened locally) */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S;
  const cols = {
    leads: [["الكود", (l) => l.id], ["الاسم", (l) => l.name], ["الشركة", (l) => l.company], ["الموبايل", (l) => l.phones.join(" / ")], ["Area", (l) => l.area], ["Type", (l) => l.type], ["Space", (l) => l.space], ["Budget", (l) => l.budget], ["Channel", (l) => l.channel], ["Campaign", (l) => (S().campaigns.find((c) => c.id === l.campaign) || {}).name || ""], ["Sales", (l) => A.person(l.sales)], ["Stage", (l) => l.stage], ["Qualified", (l) => (l.everInterested ? "Yes" : "No")], ["Created", (l) => l.created.slice(0, 16)]],
    deals: [["Date", (d) => ((d.payments || []).map((p) => p.at).sort()[0] || "").slice(0, 7)], ["company", (d) => d.company || d.client], ["space", (d) => d.space], ["type", (d) => d.type], ["location", (d) => d.location], ["buyer", (d) => A.buyersOf(d).map(A.person).join(" · ")], ["seller", (d) => (d.sellers || []).map(A.person).join(" · ")], ["source", (d) => d.source], ["owner side", (d) => A.collectedFrom(d, "owner")], ["client side", (d) => A.collectedFrom(d, "client")], ["net commission", (d) => A.collected(d)], ["buyer commission", (d) => A.salesShares(d).filter((x) => x.side === "buyer").reduce((s, x) => s + x.amount, 0)], ["seller commission", (d) => A.salesShares(d).filter((x) => x.side === "seller").reduce((s, x) => s + x.amount, 0)], ["tcr", (d) => (d.tcrs || []).map((x) => x.code).join(" ")], ["note", (d) => d.note || ""], ["deal date", (d) => d.closed.slice(0, 10)], ["الحالة", (d) => A.dealStatus(d)]],
    units: [["Code", (u) => u.code], ["Type", (u) => u.type], ["Project", (u) => u.project], ["Area", (u) => u.area], ["Space", (u) => u.space], ["Floor", (u) => u.floor], ["Condition", (u) => u.condition], ["Total", (u) => A.unitTotal(u)], ["Agent", (u) => A.person(u.agent)], ["Status", (u) => u.status], ["Last update", (u) => u.lastUpdate]],
    audit: [["الوقت", (x) => x.at.slice(0, 16)], ["مين", (x) => A.person(x.by)], ["الموديول", (x) => x.mod], ["التغيير", (x) => x.text]],
    attendance: [["اليوم", (a) => a.day], ["الموظف", (a) => A.person(a.emp)], ["Check-in", (a) => A.hm(a.inMin)], ["Check-out", (a) => a.outAt || ""], ["الحالة", (a) => A.attRow(a).status], ["دقايق", (a) => A.attRow(a).late], ["الخصم", (a) => A.attRow(a).dedText]],
    purchases: [["الطلب", (p) => p.id], ["الحاجة", (p) => p.item], ["المبلغ", (p) => p.amount], ["البند", (p) => p.line], ["المورد", (p) => p.vendor], ["الحالة", (p) => p.status]],
    clients: [["الاسم", (p) => p.name], ["الأرقام", (p) => p.phones.join(" / ")], ["النوع", (p) => p.kinds.join("+")], ["الوحدات", (p) => p.units.join(" ")], ["الصفقات", (p) => p.deals.join(" ")]]
  };
  const rowsOf = (k) => k === "units" ? S().units : k === "clients" ? [] : (S()[k] || []).filter((x) => !x.archived);
  U.exportBtn = (k, label) => A.canDo(({ leads: "leads", deals: "deals", units: "inventory", audit: "access", attendance: "hr", purchases: "procurement", clients: "clients" })[k] || k, "export") ? `<button class="btn ghost sm" data-act="exportCsv" data-k="${k}" data-l="${esc(label)}">${I("upload")}تصدير ${esc(label)}</button>` : "";
  A.ACT.exportCsv = (d) => {
    const c = cols[d.k]; if (!c) return;
    const data = d.k === "clients" ? (A.clientList ? A.clientList() : []) : rowsOf(d.k);
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const csv = [c.map((x) => q(x[0])).join(","), ...data.map((r) => c.map((x) => q(x[1](r))).join(","))].join("\n");
    A.openModal(`تصدير ${d.l} · ${data.length} صف`, `<textarea id="csv-out" readonly style="min-height:240px;font-family:var(--f-mono);font-size:12px;direction:ltr">${esc(csv)}</textarea>
      <div class="row end"><a class="btn ghost" id="csv-dl" download="${esc(d.k)}.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + csv)}">${I("upload")}تحميل CSV</a><button class="btn" data-act="copyCsv">نسخ</button></div><p class="hint">الملف بيتفتح في Excel. لو التحميل مش شغال في المعاينة، انسخ وحطه في Excel.</p>`);
    A.audit(({ units: "inventory" })[d.k] || d.k, `تصدير ${d.l} (${data.length} صف)`);
  };
  A.ACT.copyCsv = () => { const t = document.getElementById("csv-out"); const done = () => A.toast("اتنسخ"); try { navigator.clipboard.writeText(t.value).then(done, () => { t.select(); document.execCommand && document.execCommand("copy"); done(); }); } catch (e) { t.select(); done(); } };
})();
