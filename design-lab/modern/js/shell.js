/* UX layer: collapsible rail, favorites & recent, breadcrumbs, quick create, sortable grids,
   bulk selection, tooltips, keyboard shortcuts and a guided tour. Runs on top of app.js. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S;
  const $ = (s) => document.querySelector(s);
  const PK = "places-erp-ux";
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PK)) || {}; } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PK, JSON.stringify(prefs)); } catch (e) {} };
  const bucket = (k) => { const st = S(); st[k] = st[k] || {}; st[k][A.role] = st[k][A.role] || []; return st[k][A.role]; };

  /* ---------- recent items: wrap the record openers ---------- */
  const OPENERS = {
    leadOpen: [(d) => (S().leads.find((x) => x.id === d.id) || {}).name, "users", "ليد"],
    unitOpen: [(d) => d.code + " · " + ((S().units.find((x) => x.code === d.code) || {}).project || ""), "building", "وحدة"],
    dealOpen: [(d) => d.id + " · " + ((S().deals.find((x) => x.id === d.id) || {}).client || ""), "handshake", "صفقة"],
    empFile: [(d) => A.person(d.id), "id", "موظف"],
    tkOpen: [(d) => (S().tickets.find((x) => x.id === d.id) || {}).title, "ticket", "تذكرة"],
    ctOpen: [(d) => "عقد " + d.id, "file", "عقد"],
    prOpen: [(d) => (S().purchases.find((x) => x.id === d.id) || {}).item, "cart", "طلب شراء"],
    clOpen: [(d) => ((A.clientList ? A.clientList() : []).find((x) => x.key === d.k) || {}).name, "id", "عميل"]
  };
  Object.entries(OPENERS).forEach(([k, [label, ic, kind]]) => {
    const fn = A.ACT[k]; if (!fn) return;
    A.ACT[k] = (d, el, e) => {
      // remember the on-screen order of sibling records so the drawer can step prev/next
      if (el && el.closest && el.closest("#view")) { const seen = new Set(), list = []; document.querySelectorAll(`#view [data-act="${k}"]`).forEach((x) => { const key = JSON.stringify(Object.assign({}, x.dataset)); if (!seen.has(key)) { seen.add(key); list.push(Object.assign({}, x.dataset)); } }); A.ui.drNav = { act: k, list, i: list.findIndex((x) => JSON.stringify(x) === JSON.stringify(Object.assign({}, el.dataset))) }; }
      else if (!(A.ui.drNav && A.ui.drNav.act === k && A.ui.drNav.stepping)) A.ui.drNav = null;
      fn(d, el, e);
      try { const r = bucket("recent"), key = k + ":" + JSON.stringify(d); const i = r.findIndex((x) => x.key === key); if (i >= 0) r.splice(i, 1); r.unshift({ key, act: k, data: Object.assign({}, d), label: label(d) || kind, ic, kind }); r.length = Math.min(r.length, 6); renderQuick(); } catch (er) {}
    };
  });
  A.ACT.recentOpen = (d) => { const r = bucket("recent")[+d.i]; if (r) A.ACT[r.act](r.data); };

  /* ---------- favorites ---------- */
  A.ACT.favPage = (d) => { location.hash = d.v; };
  function toggleFav() { const v = $("#view").dataset.view, f = bucket("favs"), i = f.indexOf(v); if (i >= 0) f.splice(i, 1); else f.push(v); A.toast(i >= 0 ? "اتشالت من المفضلة" : "اتضافت للمفضلة"); A.render(); }

  function renderQuick() {
    const favs = bucket("favs").filter((v) => A.can(v)), rec = bucket("recent");
    $("#sideQuick").innerHTML = `${favs.length ? `<div class="nav-sec">${I("star")}المفضلة</div>${favs.map((v) => `<a class="q-item" href="#${v}" data-tip="${esc(A.NAV[v][0])}">${I(A.NAV[v][2])}<span class="lbl">${esc(A.NAV[v][0])}</span></a>`).join("")}` : ""}
      ${rec.length ? `<div class="nav-sec">${I("clock")}فتحتها مؤخراً</div>${rec.map((x, i) => `<button class="q-item" data-act="recentOpen" data-i="${i}" data-tip="${esc(x.label)}">${I(x.ic)}<span class="lbl">${esc(x.label)}</span><small class="tag">${esc(x.kind)}</small></button>`).join("")}` : ""}`;
  }

  /* ---------- quick create ---------- */
  function createItems() {
    const c = (m) => A.canDo(m, "create"), out = [];
    if (c("leads")) out.push(["leadNew", {}, "users", "ليد جديد", "N"]);
    if (A.role === "telesales" || A.role === "admin") out.push(["bulkNew", {}, "upload", "إدخال جماعي (أرقام)"]);
    if (c("deals")) out.push(["dealNew", {}, "handshake", "صفقة"]);
    if (c("inventory")) out.push(["unitNew", {}, "building", "وحدة جديدة"]);
    if (c("marketing")) out.push(["campNew", {}, "megaphone", "كامبين"], ["postNew", {}, "calendar", "بوست في الـ Content plan"]);
    if (c("procurement")) out.push(["prNew", {}, "cart", "طلب شراء / دفع"]);
    if (c("access")) out.push(["userNew", {}, "lock", "مستخدم جديد"]);
    out.push(["tkNew", {}, "ticket", "تذكرة لقسم تاني"], ["selfReq", { k: "leave" }, "calendar", "طلب إجازة"], ["selfReq", { k: "outside" }, "pin", "شغل من بره"]);
    return out;
  }
  function openCreate() {
    const m = $("#createMenu"), items = createItems();
    m.innerHTML = `<strong>اعمل حاجة جديدة</strong>${items.map(([act, d, ic, l, k], i) => `<button class="cm-item" data-act="cmGo" data-i="${i}">${I(ic)}<span>${esc(l)}</span>${k ? `<kbd>${k}</kbd>` : ""}</button>`).join("")}`;
    m._items = items; m.hidden = !m.hidden;
  }
  A.ACT.cmGo = (d) => { const it = $("#createMenu")._items[+d.i]; $("#createMenu").hidden = true; A.ACT[it[0]](it[1]); };

  /* ---------- sortable data grids ---------- */
  const parseCell = (t) => { const s = t.replace(/[,\s]|ج\.م|د$|%|م$/g, ""); const n = parseFloat(s.replace(/[^\d.\-]/g, "")); return /\d/.test(s) && !isNaN(n) && /^[\-\d.]+[A-Za-z]?$/.test(s.replace(/[^\d.\-A-Za-z]/g, "")) ? n * (/M$/i.test(s) ? 1e6 : /K$/i.test(s) ? 1e3 : 1) : null; };
  function sortTable(tbl, col, dir) {
    const tb = tbl.tBodies[0]; if (!tb) return;
    const rows = [...tb.rows].filter((r) => r.cells.length > 1);
    rows.sort((a, b) => { const x = (a.cells[col] || {}).innerText || "", y = (b.cells[col] || {}).innerText || ""; const nx = parseCell(x), ny = parseCell(y); const r = nx != null && ny != null ? nx - ny : x.localeCompare(y, "ar"); return dir === "asc" ? r : -r; });
    rows.forEach((r) => tb.appendChild(r));
    [...tbl.tHead.rows[0].cells].forEach((th, i) => th.setAttribute("aria-sort", i === col ? (dir === "asc" ? "ascending" : "descending") : "none"));
  }
  function enhanceTables(scopeEl, key) {
    A.ui.sort = A.ui.sort || {};
    scopeEl.querySelectorAll("table").forEach((tbl, ti) => {
      if (!tbl.tHead || tbl.classList.contains("perm") || tbl.classList.contains("heat")) return;
      const k = key + ":" + ti;
      [...tbl.tHead.rows[0].cells].forEach((th, i) => { if (!th.textContent.trim() || th.querySelector("input")) return; th.classList.add("sortable"); th.tabIndex = 0; th.dataset.sortK = k; th.dataset.col = i; if (!th.hasAttribute("aria-sort")) th.setAttribute("aria-sort", "none"); });
      const sv = A.ui.sort[k]; if (sv) sortTable(tbl, sv.col, sv.dir);
      const n = tbl.tBodies[0] ? [...tbl.tBodies[0].rows].filter((r) => r.cells.length > 1).length : 0;
      const wrap = tbl.closest(".tbl-wrap");
      if (wrap && n > 0 && !wrap.querySelector(".tbl-foot") && !wrap.classList.contains("no-foot")) wrap.insertAdjacentHTML("beforeend", `<div class="tbl-foot"><span class="num">${n}</span> صف${sv ? ` · مترتب بـ «${esc(tbl.tHead.rows[0].cells[sv.col].textContent.trim())}»` : " · دوس على عنوان أي عمود عشان ترتّب"}</div>`);
    });
  }
  function onSortClick(th) {
    const k = th.dataset.sortK, col = +th.dataset.col, cur = (A.ui.sort || {})[k];
    const dir = cur && cur.col === col && cur.dir === "desc" ? "asc" : "desc";
    A.ui.sort[k] = { col, dir }; A.render();
  }

  /* ---------- bulk selection (leads) ---------- */
  const sel = () => (A.ui.lsel = A.ui.lsel || []);
  function renderBulk() {
    const b = $("#bulkBar"), s = sel(), on = $("#view").dataset.view === "leads" && s.length;
    b.hidden = !on; document.body.classList.toggle("has-bulk", !!on); if (!on) return;
    b.innerHTML = `<b class="num">${s.length}</b><span>ليد متحدد</span>
      ${A.canDo("leads", "approve") ? `<select id="bk-to" aria-label="حوّل لـ">${'<option value="">حوّل لسيلز…</option>' + A.sales().map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>` : ""}
      ${A.canDo("leads", "edit") ? `<select id="bk-st" aria-label="غيّر المرحلة"><option value="">غيّر المرحلة…</option>${S().stages.filter((x) => x !== "Visit").map((x) => `<option>${esc(x)}</option>`).join("")}</select>` : ""}
      <button class="btn sm" data-act="bulkApply">طبّق</button>${A.canDo("leads", "delete") ? `<button class="btn ghost sm" data-act="bulkArchive">${I("x")}أرشفة</button>` : ""}<button class="btn ghost sm" data-act="bulkClear">إلغاء التحديد</button>`;
  }
  A.CHANGE.lsel = (v, el) => { const s = sel(), id = el.dataset.id, i = s.indexOf(id); if (v && i < 0) s.push(id); if (!v && i >= 0) s.splice(i, 1); el.closest("tr").classList.toggle("selected", !!v); renderBulk(); };
  A.CHANGE.lselAll = (v) => { A.ui.lsel = v ? [...document.querySelectorAll(".l-pick")].map((x) => x.dataset.id) : []; A.render(); };
  A.ACT.bulkClear = () => { A.ui.lsel = []; A.render(); };
  A.ACT.bulkApply = () => {
    const to = ($("#bk-to") || {}).value, stg = ($("#bk-st") || {}).value, ids = sel().slice(); if (!to && !stg) { A.toast("اختار سيلز أو مرحلة"); return; }
    ids.forEach((id) => { const l = S().leads.find((x) => x.id === id); if (to && l.sales !== to) { A.log(l, `اتحوّل جماعي من ${A.person(l.sales)} لـ ${A.person(to)}`); l.sales = to; l.owner = "sales"; l.assignedAt = A.nowIso(); A.assignByHand(to); } if (stg) { A.setStage(l, stg); A.log(l, `المرحلة بقت ${stg} (تعديل جماعي)`); } });
    A.audit("leads", `تعديل جماعي على ${ids.length} ليد${to ? " · لـ " + A.person(to) : ""}${stg ? " · " + stg : ""}`);
    A.ui.lsel = []; A.toast(`اتطبّق على ${ids.length} ليد`); A.render();
  };
  A.ACT.bulkArchive = () => { const ids = sel().slice(); ids.forEach((id) => (S().leads.find((x) => x.id === id).archived = true)); A.audit("leads", `أرشفة ${ids.length} ليد`); A.ui.lsel = []; A.toast(`اتأرشف ${ids.length} ليد`, () => ids.forEach((id) => (S().leads.find((x) => x.id === id).archived = false))); A.render(); };

  /* ---------- toolbars: keep search + first 3 filters + any active one; the rest fold under «فلاتر أكتر» ---------- */
  function compactToolbars(scopeEl, v) {
    A.ui.tbOpen = A.ui.tbOpen || {};
    scopeEl.querySelectorAll(".toolbar").forEach((tb, i) => {
      const k = v + ":" + i, ctrls = [...tb.children].filter((c) => c.matches("select, label.date-f"));
      if (ctrls.length <= 4) return;
      const extra = ctrls.slice(3).filter((c) => !(c.querySelector("input, select") || c).value);
      if (!extra.length) return;
      const open = !!A.ui.tbOpen[k];
      extra.forEach((c) => c.classList.toggle("f-more", !open));
      const after = ctrls[ctrls.length - 1];
      after.insertAdjacentHTML("afterend", `<button class="btn ghost sm f-toggle" data-act="tbMore" data-k="${k}" aria-expanded="${open}">${I("filter")}${open ? "فلاتر أقل" : `فلاتر أكتر <b class="num">${extra.length}</b>`}</button>`);
    });
  }
  A.ACT.tbMore = (d) => { A.ui.tbOpen[d.k] = !A.ui.tbOpen[d.k]; A.render(); };

  /* ---------- tooltips ---------- */
  let tipT;
  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest("[data-tip]"), tip = $("#tip");
    if (!t || (t.closest("#nav,#sideQuick") && !document.getElementById("app").classList.contains("rail"))) { tip.hidden = true; return; }
    clearTimeout(tipT); tipT = setTimeout(() => { const r = t.getBoundingClientRect(); tip.textContent = t.dataset.tip; tip.hidden = false; const w = tip.offsetWidth; tip.style.top = Math.max(8, r.top + r.height / 2 - 14) + "px"; tip.style.left = Math.max(8, r.left - w - 10) + "px"; if (r.left - w - 10 < 8) tip.style.left = r.right + 10 + "px"; }, 180);
  });
  document.addEventListener("mouseout", (e) => { if (e.target.closest("[data-tip]")) { clearTimeout(tipT); $("#tip").hidden = true; } });

  /* ---------- keyboard ---------- */
  const GO = { h: "home", l: "leads", d: "deals", c: "clients", k: "contracts", i: "inventory", t: "tasks", m: "marketing", r: "hr", s: "tickets", f: "finance", p: "procurement", o: "reports", a: "access" };
  let gWait = 0;
  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest && e.target.closest("input,textarea,select,[contenteditable]");
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$("#modal").hidden || !$("#cmd").hidden || !$("#tour").hidden) return;
    if (!$("#drawer").hidden && (e.key === "ArrowDown" || e.key === "ArrowUp") && A.ui.drNav) { e.preventDefault(); A.ACT.drStep({ dir: e.key === "ArrowDown" ? 1 : -1 }); return; }
    if (e.key === "?") { e.preventDefault(); A.ACT.helpKeys(); return; }
    if (e.key === "/") { e.preventDefault(); A.openCmd(); return; }
    if (e.key === "[") { toggleRail(); return; }
    if (e.key.toLowerCase() === "n" && A.canDo("leads", "create")) { e.preventDefault(); A.ACT.leadNew(); return; }
    if (e.key.toLowerCase() === "g") { gWait = Date.now(); return; }
    if (Date.now() - gWait < 1200 && GO[e.key.toLowerCase()]) { const v = GO[e.key.toLowerCase()]; gWait = 0; if (A.can(v)) location.hash = v; else A.toast("مالكش صلاحية على الصفحة دي"); }
  });
  A.ACT.helpKeys = () => { $("#demoPanel").hidden = true; A.openModal("اختصارات الكيبورد", `<div class="keys">${[["⌘K  أو  /", "بحث في كل السيستم"], ["N", "ليد جديد"], ["?", "الاختصارات دي"], ["←  /  →", "التالي / السابق في الجولة"], ["[", "صغّر / كبّر القايمة"], ["Esc", "قفل أي نافذة"], ...Object.entries(GO).filter(([, v]) => A.can(v)).map(([k, v]) => [`G  ثم  ${k.toUpperCase()}`, A.NAV[v][0]])].map(([k, l]) => `<div class="key-row"><span>${esc(l)}</span><kbd>${esc(k)}</kbd></div>`).join("")}</div>`); };

  /* ---------- rail & density ---------- */
  function toggleRail() { prefs.rail = !prefs.rail; savePrefs(); applyPrefs(); }
  function applyPrefs() { document.getElementById("app").classList.toggle("rail", !!prefs.rail); document.documentElement.dataset.density = prefs.dense ? "compact" : "comfy"; const b = $("#railBtn"); if (b) b.setAttribute("aria-label", prefs.rail ? "كبّر القايمة" : "صغّر القايمة"); }

  /* ---------- guided tour: the whole system, section by section, each step seen through the person who does it ---------- */
  const S_ = () => A.S;
  const first = (k, f) => (S_()[k] || []).find(f || (() => true)) || {};
  const T = (sec, steps) => steps.map((s) => Object.assign({ sec }, s));
  const TOUR = [].concat(
    T("البداية", [
      { as: "u1", go: "home", sel: "#meCard", t: "كل واحد بحسابه", x: "كل موظف بيدخل بإيميله وباسورده بس (من غير OTP). الحسابات للموظفين الحقيقيين: الـ 14 اللي في ملف الـ KPIs، والـ 4 Team Leaders، والـ 18 سيلز في فرقهم. الحساب بيتقفل بعد 5 محاولات غلط، وفيه «نسيت الباسورد»، والأدمن هو اللي بيعمل الحسابات." },
      { as: "u1", go: "home", sel: "#nav", t: "القايمة على قد صلاحياتك", x: "القايمة متقسمة: المبيعات · العمليات · الإدارة · النظام. كل شخص بيشوف الموديولات اللي مسموحله بيها بس، وتقدر تثبّت أي صفحة في المفضلة بالنجمة جنب العنوان." },
      { as: "u1", go: "home", sel: ".inbox", t: "مهامي النهارده", x: "أول ما أي حد يفتح السيستم بيلاقي كل حاجة مستنية أكشن منه: ليد متأخر، صفقة محتاجة موافقة، TCR محتاج إمضا، طلب إجازة، كارت KPIs مستني اعتماده، تسليم عليه… المتأخر الأول، وجنب كل واحدة زرار ينفّذها على طول." },
      { as: "u7", go: "home", sel: "[data-act=kpiOpen][data-id=u7]", t: "الـ KPIs بتاعتي", x: "كل موظف بيلاقي كارت الـ KPIs بتاعه في الصفحة الرئيسية: نتيجته لحد النهارده، والبنود اللي تحت المستهدف، ومين اللي بيتابعه." },
      { as: "u1", go: "home", sel: "#searchBtn", t: "بحث في كل حاجة", x: "⌘K أو / · دوّر على ليد بالاسم أو الموبايل، وحدة بالكود، موظف، تذكرة، صفقة… وافتحها من غير ما تروح الصفحة بتاعتها." },
      { as: "u1", go: "home", sel: "#createBtn, #fab", t: "اعمل أي حاجة جديدة من أي مكان", x: "ليد، صفقة، وحدة، تذكرة، طلب إجازة، طلب شراء… الزرار بيعرض اللي صلاحياتك تسمح بيه بس. وعلى الموبايل هو زرار الـ + اللي تحت، والقايمة اللي تحت بتنقلك بين أهم صفحاتك، و«المزيد» فيها كل الصفحات." },
      { as: "u1", go: "home", sel: "#bellBtn", t: "الإشعارات", x: "كل حدث مهم بيوصل جوه السيستم وPush وعلى الإيميل، حسب قواعد الإشعارات اللي بتتظبط من «الإشعارات والإيميل»." }
    ]),
    T("الليدز", [
      { as: "u6", go: "leads", sel: "[data-act=leadNew]", t: "هبة بتسجّل الليد", x: "الليد بيتسجّل بالاسم والموبايلات والمنطقة والنوع والمساحة والميزانية والـ channel والكامبين. السيستم بيمنع التكرار بالموبايل، وبيوزّعه لوحده على سيلز المنطقة بالدور، ووقت وصوله بيتسجّل." },
      { as: "u6", go: "leads", sel: "[data-act=verifyCall]", t: "مكالمات التحقق (Second Calls)", x: "كل أسبوع السيستم بيختار 10% من الليدز الجديدة، وهبة بتكلّم العميل: السيلز كلّمه؟ وبعتله اللي محتاجه؟ لو لأ، الـ Team Leader بيجيله تنبيه. وده بند في الـ KPIs بتاعتها." },
      { as: "u6", go: "leads", sel: ".toolbar", t: "فلاتر وعروض محفوظة", x: "فلتر بالمرحلة، السيلز، المنطقة، الـ channel، الكامبين، التاريخ… وتقدر تحفظ أي فلتر كـ «عرض» وترجعله بدوسة. والتصدير Excel على قد صلاحياتك." },
      { as: "u6", go: "leads", sel: "#view table, #view .board", t: "جدول ذكي أو Kanban", x: "رتّب بأي عمود، وحدّد كذا ليد وحوّلهم لسيلز تاني أو غيّر مرحلتهم مرة واحدة. أو بدّل لـ Kanban واسحب الليد من مرحلة لمرحلة. عدّاد الـ SLA ظاهر جنب كل ليد." },
      { as: "u6", go: "leads", sel: "[data-act=bulkNew]", t: "إدخال جماعي (Import)", x: "ارفع شيت Excel فيه ليدز كتير مرة واحدة. السيستم بيراجع التكرار، والدفعة بتستنى موافقة قبل ما تتوزّع على سيلز اليوم." },
      { as: "u5", go: "leads", sel: "[data-act=companies]", t: "هدير وشيت الشركات", x: "أرشيف الشركات متقسّم على 63 كاتيجوري. هدير بتضيف شركات Outbound بمجهودها (15 شركة + 8 وحدات في الأسبوع في الأيام اللي مفيش فيها كامبين)، وعدّاد مكالماتها اليومي ظاهر قدامها (100 مكالمة)." },
      { as: "s1", go: "leads", open: () => A.ACT.leadOpen({ id: first("leads", (l) => l.sales === "s1").id || first("leads").id }), sel: "#drawer", t: "ملف الليد عند السيلز", x: "السيلز بيسجّل المكالمة فالـ SLA بيقف، وبيغيّر المرحلة: Fresh ← Interested ← Visit ← Meeting ← Near to Close ← Done Deal. Interested بيعلّمه Qualified أوتوماتيك. وفيه الوحدات المقترحة (Recommendations)، والزيارات، والـ Activity كله." },
      { as: "u19", go: "leads", sel: "[data-act=listReqs]", t: "الـ Team Leader", x: "لو السيلز مكلّمش الليد في ساعتين ونص، الـ Team Leader بيجيله تنبيه، وبعد 3 ساعات الليد بيتسحب للي بعده. والـ Team Leader بيطلب من هنا List وحدات من الانفنتوري لعميل، ومروة بتجهّزها خلال 24 ساعة." },
      { as: "u6", go: "settings", sel: "#view .card", t: "إعدادات التوزيع", x: "كل منطقة بتروح لأنهي سيلز وبأي ترتيب، وقواعد الـ SLA والروتيشن. ووضع الإجازة بيوقف العدّادات في الإجازات الرسمية. كل ده بيتعدّل من غير برمجة." }
    ]),
    T("الصفقات", [
      { as: "s1", go: "deals", sel: "[data-act=dealNew]", t: "السيلز بيقفل Done Deal", x: "بيختار الوحدة من الانفنتوري، والكوميشن من المالك ومن العميل، ومين معاه في جهة الـ Buyer. الـ Seller بييجي لوحده من الـ Agent بتاع الوحدة وبيستنى موافقة منار." },
      { as: "u21", go: "deals", ui: { dlTab: "board" }, sel: ".tabs", t: "نانسي بتراجع", x: "كل صفقة جديدة بتروح للـ Office Manager. تقدر تعدّل أي خانة قبل ما توافق، وبعد الموافقة الصفقة بتتسجّل في شيت الـ Done Deals، والتسويق بيجيله Alarm بالبيانات المسموحله بيها بس." },
      { as: "u21", go: "deals", ui: { dlTab: "sheet" }, sel: "#view", t: "شيت الـ Done Deals", x: "نفس شكل الشيت اللي بيشتغلوا عليه: كل الصفقات بالوحدة والمساحة والكوميشن والمحصّل والباقي والسيلز في كل جهة." },
      { as: "u18", go: "deals", open: () => A.ACT.dealOpen({ id: first("deals", (d) => (d.tcrs || []).length).id || first("deals").id }), sel: "#drawer", t: "التحصيل والـ TCR والأوراق", x: "أحمد أشرف بيسجّل التحصيل من العميل أو من المالك، وكل تحصيل بيطلع ورقة TCR بكود تسلسلي تتطبع PDF، والكوميشن بيتقسم نص للـ Buyer ونص للـ Seller. وكمان بيراجع أوراق الصفقة (عقد، تفويض، تسجيل)، ونانسي بتحدد ميعاد التنفيذ وتعلّم إنها اتنفذت." },
      { as: "u21", go: "deals", ui: { dlTab: "split" }, sel: "#view", t: "تفاصيل الصفقات", x: "لكل صفقة: مين الـ Buyer ومين الـ Seller ونصيب كل واحد من الكوميشن، والنوت اللي كتبتها الـ Office Manager أو المالية." },
      { as: "u21", go: "deals", ui: { dlTab: "achv" }, sel: "#view", t: "Achievements", x: "إنجازات كل سيلز: نصيبه من الكوميشن، والـ Transactions، وقد إيه من التارجت. والسيلز بيشوف «إنجازاتي» بتوعه بس." }
    ]),
    T("الانفنتوري", [
      { as: "u7", go: "inventory", sel: ".tabs", t: "مخزون الوحدات", x: "Rent · Resale · Income في قايمة واحدة بفلتر، وتابات المساحات تحت زي الشيت. والوحدة ممكن تبقى متاحة Rent وResale في نفس الوقت." },
      { as: "u7", go: "inventory", sel: "[data-act=invMode]", t: "شيت أو فولدرات", x: "اعرض الوحدات كشيت، أو كفولدرات زي ما كانوا متعودين على الدرايف." },
      { as: "u7", go: "inventory", sel: "[data-act=invReport]", t: "شغل منار اليومي", x: "استيراد Excel بيوريك الجديد والمكرر قبل ما تأكد. والتقرير اليومي (جديد / متحدّث / اتأجر / مش مؤكد) بتعتمده منار وبيتبعت للإدارة. ومهام منار لرندا وسارة ومروة بحد أقصى 30 في اليوم لكل واحدة. وطلبات الـ Lists من الـ Team Leaders كلها هنا." },
      { as: "u7", go: "inventory", open: () => A.ACT.unitOpen({ code: first("units").code }), sel: "#drawer", t: "ملف الوحدة", x: "البيانات، والـ PDF والـ slide اللي بيتأكد قبل ما السيلز يبعته، ومهام التصوير والـ Retouch، والموقع. والوحدة اتستلمت إمتى واتدخلت إمتى (خلال 24 ساعة)، ولينك الصور والـ PDF اترفع إمتى. ومنار بتقفل الإيجار ورندا البيع بعد موافقة الـ Office Manager على الصفقة." },
      { as: "u10", go: "home", sel: ".inbox", t: "يوم مروة", x: "مروة بتلاقي في «مهامي النهارده» مهام منار، وطلبات الـ Lists من الـ Team Leaders بعدّاد الـ 24 ساعة. ولما تجهّز الـ List السيستم بينبّهها لو فيها وحدة مش مؤكدة." },
      { as: "u10", go: "notactive", sel: ".tabs", t: "Not Active Inventory", x: "شيتات الأرقام اللي مش شغالة بتترفع Excel وبتتدمج من غير تكرار. مروة بتصنّف كل رقم: No Answer، أو Not True مع سبب، أو Done." },
      { as: "u10", go: "notactive", sel: "#view table", t: "Done بيدخّل وحدة جديدة", x: "لما الرقم يطلع شغال ويبقى Done، بيفتح فورم الوحدة على طول وتدخل الانفنتوري، والتسويق بيجيله إنها وحدة جديدة." }
    ]),
    T("المهام والتسويق", [
      { as: "u7", go: "tasks", sel: ".tabs", t: "المهام", x: "تصوير، Retouch، متابعة مع المالك، ابديت للبيع، ومهام التسويق. كل مهمة ليها مسؤول وميعاد وحالة." },
      { as: "u12", go: "tasks", sel: "#view", t: "بيومي (المصوّر)", x: "بيومي بيشوف مهامه بس: التصوير خلال 72 ساعة من تسجيل الوحدة، والمواد المتعدّلة خلال 48 ساعة. والـ Retouch مابيتقفلش غير بموافقة منار." },
      { as: "u11", go: "marketing", ui: { mkTab: "dash" }, sel: "#view .card", t: "Dashboard التسويق", x: "الليدز لكل channel ولكل كامبين، والـ Qualified منهم، وبكام الليد، بأي فترة. وتحت: إعلانات الويبسايت اللي بتتعد لوحدها (25 في اليوم)، وتقرير المنافسين الشهري اللي بيتسلّم يوم 30." },
      { as: "u11", go: "marketing", ui: { mkTab: "camps" }, sel: "#view", t: "الكامبينز", x: "كل كامبين بميزانيته ومنصته، وكام ليد جاب وكام منهم بقى Qualified وكام صفقة." },
      { as: "u11", go: "marketing", ui: { mkTab: "content" }, sel: "#view", t: "Content plan", x: "خطة البوستات بالمواعيد والمنصات. اللي بيعملها حد غير مدير التسويق بيستنى موافقته قبل ما يتنشر." },
      { as: "u11", go: "marketing", ui: { mkTab: "broadcast" }, sel: "select[name=hot]", t: "Broadcast + Hot Inventory", x: "رسالة واتساب جماعية بتتبعت للسيلز كمهمة، ومعاها قايمة Hot Inventory. ليها يومين ثابتين في الأسبوع، وحد يومي عشان الرقم مايتقفلش." },
      { as: "u11", go: "marketing", ui: { mkTab: "units" }, sel: "#view", t: "وحدات جديدة وصفقات", x: "أي وحدة جديدة دخلت الانفنتوري بتظهر هنا عشان تتسوّق. والصفقات اللي اتقفلت بتوصل بالبيانات المسموح بيها بس." }
    ]),
    T("العملاء والعقود", [
      { as: "u1", go: "clients", sel: "#view table", t: "ملف واحد لكل عميل ومالك", x: "كل التعامل مع العميل أو المالك في مكان واحد: الليدز، الوحدات، الصفقات، المكالمات، والعقود." },
      { as: "u1", go: "contracts", sel: "#view .card", t: "العقود", x: "تنبيهات التجديد قبل 90 و60 و30 يوم وبتعمل ليد تجديد، جدول الأقساط والمتأخرات (Aging)، والإيصالات." }
    ]),
    T("الـ HR", [
      { as: "u14", go: "hr", ui: { hrTab: "att" }, sel: ".tabs", t: "الحضور والبصمة", x: "البصمة بتيجي من ربط الجهاز أو من شيت البصمة. السيستم بيحسب التأخير على الشرايح والـ Excuse والغياب من غير إذن لوحده. واللي ليه مواعيد خاصة (زي أحمد أشرف: الاتنين والخميس 17–19) مابيتحسبش عليه تأخير." },
      { as: "u14", go: "hr", ui: { hrTab: "delay" }, sel: "#view", t: "Weekly Delay", x: "تأخير كل موظف في الأسبوع بالدقيقة، وجنب كل يوم حالته." },
      { as: "u14", go: "hr", ui: { hrTab: "emps" }, sel: "#view", t: "الموظفين و1-to-1", x: "فايل كل موظف: بياناته، المرتب، الإجازات، وجلسات الـ 1-to-1 (مرة في الشهر مع كل موظف) وحل الـ HR بميعاد." },
      { as: "u14", go: "hr", ui: { hrTab: "leaves" }, sel: "#view", t: "الإجازات والطلبات", x: "الموظف بيطلب، المدير المباشر بيوافق الأول، وبعدين الـ HR بتأكد. ورصيد الإجازات بيتحسب لوحده." },
      { as: "u14", go: "hr", ui: { hrTab: "saving" }, sel: "#view .card:last-of-type", t: "الموظف المثالي وصندوق الفريق", x: "في كل فريق، من اللي الـ KPIs بتاعتهم 80% أو أكتر ومعليهمش جزاء إداري: 40% أيام الحضور بدري + 30% ساعات التأخير (الأقل أحسن) + 30% الغياب من غير إذن (الأقل أحسن). اللي يكسب بياخد خصومات الحضور والتأخير بتاعة باقي الفريق آخر الشهر. والجزاءات الإدارية بتتسجّل هنا." },
      { as: "u14", go: "hr", ui: { hrTab: "rules" }, sel: "#view", t: "الشرايح والإعدادات", x: "شرايح التأخير والخصم، والـ Excuse وقواعد الحضور. كلها بتتعدّل من هنا." }
    ]),
    T("التذاكر والمشتريات", [
      { as: "s1", go: "tickets", sel: "#view", t: "التذاكر بين الأقسام", x: "أي طلب من قسم لقسم بقى تذكرة بدل الواتساب: ليها مسؤول وميعاد رد حسب نوعها (نزاع 48 ساعة للـ Office Manager، HR Letter 24 ساعة، شراء وصيانة 48 ساعة). وفيه طلب إجازة أو شغل من بره من هنا كمان." },
      { as: "u16", go: "procurement", sel: "[data-act=prNew]", t: "طلب شراء أو دفع", x: "Request ← موافقة (لحد 50,000 أي معتمد، وأكتر من كده أحمد أو صفوت) ← مختار يصرف ← بيتخصم من Budget البند. وفوق 10,000 لازم إيصال أو عرضين أسعار." },
      { as: "u16", go: "procurement", sel: "[data-act=assetsReviewed]", t: "عهدة مختار وأصول المكتب", x: "رصيد العهدة قدام السقف بتاعها، ونسبة الطلبات اللي اتنفذت خلال 48 ساعة، وسجل أصول المكتب ومراجعته الشهرية، وجدول الـ Office Boys على المناطق." },
      { as: "u18", go: "procurement", sel: "#view .card", t: "الـ Budget لكل بند", x: "اتصرف كام وفاضل كام في كل بند، والمعتمد بيشوف الطلبات اللي مستنياه." }
    ]),
    T("المالية", [
      { as: "u18", go: "finance", ui: { fnTab: "dash" }, sel: "#view .card", t: "Dashboard المالية", x: "من الإيرادات لصافي الربح على مر الشهور، ورصيد الخزن والبنوك، والصفقات كلّفت كام ماركتينج حسب المنصة." },
      { as: "u18", go: "finance", ui: { fnTab: "pnl" }, sel: "#view", t: "قايمة الدخل والميزانية", x: "قايمة الدخل والميزانية العمومية بتطلع لوحدها من القيود. وفيه قفل الشهر والـ Quarter لصاحب الصلاحية." },
      { as: "u18", go: "finance", ui: { fnTab: "cost" }, sel: "#view", t: "Cost Center", x: "مصروفات وإيرادات كل قسم لوحده." },
      { as: "u18", go: "finance", ui: { fnTab: "payroll" }, sel: "#view", t: "المرتبات", x: "المرتبات الشهرية لكل موظف، والخصومات اللي جاية من الـ HR." },
      { as: "u18", go: "finance", ui: { fnTab: "tree" }, sel: "#view", t: "شجرة الحسابات", x: "كل الحسابات متقسّمة أصول وخصوم وإيرادات ومصروفات." }
    ]),
    T("التقارير", [
      { as: "u21", go: "reports", ui: { rpTab: "targets" }, sel: ".tabs", t: "التارجت والـ Transactions", x: "نصيب كل سيلز من الكوميشن بيدخل التارجت بتاعه، وبتتحسبله Transaction. والـ Office Manager بتحدد التارجت الشهري." },
      { as: "u21", go: "reports", ui: { rpTab: "tl" }, sel: "#view", t: "الفرق الأربعة", x: "فريق A محمود علي · B مصطفى عزت · C عبدالرحمن يونس · D عبدالله سليم. تارجت الفريق مجموع تارجت أعضاؤه، والـ Team Leader بياخد نسبة حسب شريحة التحقيق." },
      { as: "u21", go: "reports", ui: { rpTab: "pdf" }, sel: "#view", t: "ورقة الموظف كل Quarter", x: "السيستم بيعمل ورقة لكل سيلز: المرتب، التارجت، الـ Scheme، العمولة، الجوايز. الـ Office Manager بتوافق، والورق بيتبعت على إيميل كل واحد." },
      { as: "u21", go: "reports", ui: { rpTab: "sched" }, sel: "#view", t: "تقارير متجدولة", x: "أي تقرير يتبعت لوحده على الإيميل كل يوم أو أسبوع أو شهر." }
    ]),
    T("الـ KPIs", [
      { as: "s4", go: "kpis", ui: { kpTab: "me" }, sel: "table.kpi-items", t: "كارت البياع", x: "كل بياع ليه كارت: التارجت 40%، Showings وMeetings وInventory وFarming وCalls & Broadcast 10% لكل واحد، والحضور 10%. لكل بند: المستهدف، وبيتقاس إزاي (أوتوماتيك / تسليم / يدوي)، والفعلي، والتحقيق، وبيدخل الكارت بكام. والبند ممكن يعدّي 100% ويتسجّل زي ما هو." },
      { as: "u19", go: "kpis", ui: { kpTab: "team" }, sel: ".kpi-cards", t: "الـ Team Leader وفريقه", x: "محمود علي بيشوف كروت فريقه بس: يعدّل البنود والأوزان والمستهدفات، ويدخّل اليدوي، ويكتب خطة التحسين، ويعتمد." },
      { as: "u7", go: "kpis", ui: { kpTab: "team" }, open: () => A.ACT.kpiOpen({ id: "u8" }), sel: "#drawer", t: "منار بتتحكم في كارت رندا", x: "كل مدير بيتحكم في كروت فريقه: يضيف بند أو يمسحه، ويغيّر الوزن والمستهدف وطريقة القياس. وتحت الكارت النتيجة بالفلوس: الحسبة على المرتب أو بونص الكوارتر، شهري أو كل ربع." },
      { as: "u21", go: "kpis", ui: { kpTab: "all" }, sel: ".kpi-cards", t: "كل الشركة", x: "نانسي والإدارة بيشوفوا الـ 32 كارت، ومتوسط الشركة، ومين اتعتمد. ونانسي بتقفل الربع والنتايج والمبالغ بتتبعت على إيميل كل واحد." },
      { as: "u21", go: "kpis", ui: { kpTab: "all" }, sel: "[data-change=kpiBand]", t: "شرايح الفلوس", x: "100% وأكتر مكافأة 15% · 96% بونص كامل · 70–95% بونص جزئي · أقل من 70% خصم 15% وخطة تحسين · أقل من 50% البونص بيتلغي وخصم 15% من المرتب وإنذار. والشرايح دي بتتعدّل من هنا." },
      { as: "u21", go: "kpis", ui: { kpTab: "all" }, sel: "[data-act=kpiDraftOn]", t: "كروت الـ Team Leaders للربع الجاي", x: "مسودة جاهزة للربع الجاي: تارجت الفريق، ومتوسط KPIs السيلز، والـ SLA، والـ One-to-One، والـ Showings، والحضور. بتتفعّل بدوسة." },
      { as: "u21", go: "kpis", ui: { kpTab: "ideal" }, sel: "#view table", t: "الموظف المثالي", x: "الموظف المثالي في كل فريق، والمبلغ اللي هيستلمه من صندوق الفريق آخر الشهر." }
    ]),
    T("الإدارة والنظام", [
      { as: "u1", go: "access", ui: { acTab: "roles" }, sel: "#view .card", t: "الأدوار", x: "اعمل دور جديد، أو انسخ دور موجود، أو عدّله: اسمه، مستواه في الهيكل، بيشتغل زي مين، ونطاق البيانات (بتاعه / فريقه / قسمه / الكل)." },
      { as: "u1", go: "access", ui: { acTab: "roles" }, sel: "table.perm", t: "مصفوفة الصلاحيات", x: "لكل موديول: يشوف، يضيف، يعدّل، يوافق، يأرشف، يستورد، يصدّر. دوس على العمود يتفتح للكل، أو «الكل» في آخر الصف. أي تغيير بيتطبّق فوراً على القايمة والزراير." },
      { as: "u1", go: "access", ui: { acTab: "users" }, sel: "#view table", t: "المستخدمين", x: "حساب جديد بإيميل تفعيل، أكتر من دور لنفس الشخص، فك القفل، إعادة الباسورد، آخر يوم شغل. وزرار «صلاحيات» يديله أو يشيل منه صلاحية لوحده من غير ما تغيّر دوره." },
      { as: "u1", go: "access", ui: { acTab: "audit" }, sel: "#view", t: "Audit Log", x: "كل حركة في السيستم متسجّلة: مين عمل إيه وإمتى، وفي أنهي موديول." },
      { as: "u1", go: "master", ui: { msTab: "lists" }, sel: ".tabs", t: "الإعدادات والقوايم", x: "المناطق، الـ Channels، كاتيجوريز الشركات، الموردين، مراحل الليد، المواعيد والقواعد، الإجازات الرسمية، وبنود المصروفات. كلها بتتعدّل من غير برمجة." },
      { as: "u1", go: "integrations", sel: "#view .card", t: "الإشعارات والإيميل", x: "إيميل الإرسال، وكل حدث يروح لمين وإزاي (جوه السيستم، Push، إيميل)، وكل واحد يظبط تفضيلاته." }
    ]),
    T("الديمو", [
      { as: "u1", go: "home", sel: "#demoBtn", t: "تحكم الديمو", x: "قدّم الوقت عشان تشوف تنبيه الساعتين ونص وسحب الليد بعد 3 ساعات، أو اعمل «يوم جديد» عشان روتيشن الـ No Answer، أو شغّل وضع الإجازة. ومن هنا كمان «سيناريو العرض» اللي بيمشّي صفقة كاملة، و«صندوق الإيميل» تشوف الإيميلات اللي اتبعتت." },
      { as: "u1", go: "home", sel: "#role", t: "جرّب بعين أي حد", x: "ادخل بحساب أي حد وشوف السيستم من عنده: القايمة والزراير والبيانات على قد صلاحياته. وكده خلصت الجولة. (اتنقل بين الخطوات بالأسهم، وEsc يقفل)" }
    ])
  );
  const SECS = [...new Set(TOUR.map((s) => s.sec))];
  let tourI = 0, tourWho = null;
  const shown = (x) => x.getClientRects().length > 0 && getComputedStyle(x).visibility !== "hidden";
  function showTour() {
    const step = TOUR[tourI]; if (!step) return endTour();
    A.closeDrawer(); A.closeModal();
    if (step.as && A.uid !== step.as && A.userOf(step.as)) A.signIn(step.as, 1);
    if (step.ui) Object.assign(A.ui, step.ui);
    // changing page re-renders and closes drawers on "hashchange", so open the step's drawer only after it
    if (step.go && location.hash !== "#" + step.go) { addEventListener("hashchange", () => stage(step), { once: true }); location.hash = step.go; } else { A.render(); stage(step); }
  }
  function stage(step) {
    if (step.open) { try { step.open(); } catch (e) {} }
    setTimeout(() => {
      const el = (step.sel && [...document.querySelectorAll(step.sel)].find(shown)) || $("#view");
      // phones: the card is docked at the bottom, so bring the highlighted part to the top, under the app bar
      if (A.isPhone && A.isPhone() && el.id !== "drawer") { el.scrollIntoView({ block: "start" }); scrollBy(0, -72); } else el.scrollIntoView({ block: "center" });
      setTimeout(() => place(el, step), 260);
    }, 80);
  }
  function place(el, step) {
    const r = el.getBoundingClientRect(), h = $("#tourHole"), c = $("#tourCard"), pad = 6, top = Math.max(r.top, 8), bot = Math.min(r.bottom, innerHeight - 8);
    Object.assign(h.style, { top: top - pad + "px", left: r.left - pad + "px", width: r.width + pad * 2 + "px", height: bot - top + pad * 2 + "px" });
    const who = A.userOf(A.uid), x = typeof step.x === "function" ? step.x() : step.x;
    c.innerHTML = `<div class="row"><span class="crumb">${esc(step.sec)} · ${tourI + 1} / ${TOUR.length}</span><span class="spacer"></span><select data-change="tourJump" aria-label="روح لقسم">${SECS.map((s) => `<option value="${esc(s)}" ${s === step.sec ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
      <div class="bar"><i style="width:${((tourI + 1) / TOUR.length) * 100}%"></i></div>
      <h3>${esc(step.t)}</h3><p>${esc(x)}</p>${who ? `<small class="as">داخل بحساب: ${esc(A.person(who.id))} · ${esc(A.roleLabel(who.role))}</small>` : ""}
      <div class="row end">${tourI ? `<button class="btn ghost sm" data-act="tourPrev">السابق</button>` : ""}<button class="btn ghost sm" data-act="tourEnd">إنهاء</button><button class="btn sm" data-act="tourNext">${tourI === TOUR.length - 1 ? "خلصت" : "التالي"}</button></div>`;
    // the card sits beside a big highlight (drawer / whole page) instead of covering it
    const big = r.height > innerHeight * 0.55, W = c.offsetWidth, H = c.offsetHeight;
    let ct, cl;
    if (big && r.left > W + 32) { cl = r.left - W - 16; ct = Math.max(16, innerHeight - H - 16); }
    else if (big && innerWidth - r.right > W + 32) { cl = r.right + 16; ct = Math.max(16, innerHeight - H - 16); }
    else { const below = bot + H + 32 < innerHeight; ct = big ? innerHeight - H - 16 : below ? bot + 16 : Math.max(16, top - H - 16); cl = Math.min(Math.max(16, r.left + r.width / 2 - W / 2), innerWidth - W - 16); }
    c.style.top = Math.min(innerHeight - H - 16, ct) + "px"; c.style.left = cl + "px";
  }
  function endTour() { $("#tour").hidden = true; A.closeDrawer(); if (tourWho && A.uid !== tourWho) { A.signIn(tourWho, 1); location.hash = "home"; A.render(); } tourWho = null; }
  A.ACT.tourStart = () => { $("#demoPanel").hidden = true; if (prefs.rail) toggleRail(); tourI = 0; tourWho = A.uid; $("#tour").hidden = false; showTour(); };
  A.ACT.tourNext = () => { tourI++; if (tourI >= TOUR.length) endTour(); else showTour(); };
  A.ACT.tourPrev = () => { tourI = Math.max(0, tourI - 1); showTour(); };
  A.ACT.tourEnd = endTour;
  A.CHANGE.tourJump = (v) => { tourI = TOUR.findIndex((s) => s.sec === v); showTour(); };
  A.TOUR = TOUR;
  // keyboard while the tour is open: the page is RTL, so ← is next and → is back; Esc ends
  document.addEventListener("keydown", (e) => {
    if ($("#tour").hidden || e.metaKey || e.ctrlKey || e.altKey || (e.target.closest && e.target.closest("select"))) return;
    const k = { ArrowLeft: "tourNext", ArrowRight: "tourPrev", Escape: "tourEnd" }[e.key];
    if (k) { e.preventDefault(); e.stopImmediatePropagation(); A.ACT[k](); }
  }, true);

  /* ---------- after each render ---------- */
  A.afterRender = (v) => {
    const N = A.NAV[v], sec = N[3] || "الرئيسية";
    $("#pageIco").innerHTML = I(N[2]);
    $("#breadcrumb").innerHTML = `<a href="#${A.navList()[0]}">Places</a><span>›</span><span>${esc(sec)}</span><span>›</span><b>${esc(N[0])}</b>`;
    const fav = bucket("favs").includes(v); $("#favBtn").setAttribute("aria-pressed", fav); $("#favBtn").title = fav ? "شيل من المفضلة" : "ضيف للمفضلة";
    document.querySelectorAll("#nav a").forEach((a) => (a.dataset.tip = a.querySelector(".lbl").textContent));
    renderQuick();
    const view = $("#view"); if (view.dataset.last !== v) { view.classList.remove("enter"); void view.offsetWidth; view.classList.add("enter"); view.dataset.last = v; }
    enhanceTables(view, v);
    compactToolbars(view, v);
    renderBulk();
  };
  A.afterDrawer = () => {
    enhanceTables($("#drawer"), "drawer");
    const n = A.ui.drNav, tools = document.querySelector("#drawer .dr-tools");
    if (n && n.i >= 0 && n.list.length > 1 && tools && !tools.querySelector(".dr-nav")) tools.insertAdjacentHTML("afterbegin", `<div class="dr-nav"><button class="round sm" data-act="drStep" data-dir="-1" ${n.i ? "" : "disabled"} aria-label="السابق" data-tip="السابق ( ↑ )">‹</button><span>${n.i + 1}/${n.list.length}</span><button class="round sm" data-act="drStep" data-dir="1" ${n.i < n.list.length - 1 ? "" : "disabled"} aria-label="التالي" data-tip="التالي ( ↓ )">›</button></div>`);
  };
  A.ACT.drStep = (d) => { const n = A.ui.drNav; if (!n) return; const j = n.i + +d.dir; if (j < 0 || j >= n.list.length) return; n.i = j; n.stepping = true; const x = n.list[j]; A.ACT[n.act](Object.assign({}, x)); n.stepping = false; document.querySelectorAll("#view tr.current").forEach((r) => r.classList.remove("current")); };
  A.ACT.noop = () => {};

  document.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable"); if (th) { onSortClick(th); return; }
    if (!e.target.closest("#createMenu, #createBtn")) $("#createMenu").hidden = true;
    if (!e.target.closest("#demoPanel, #demoBtn")) $("#demoPanel").hidden = true;
  });
  document.addEventListener("keydown", (e) => { const th = e.target.closest && e.target.closest("th.sortable"); if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSortClick(th); } });
  window.addEventListener("resize", () => { if (!$("#tour").hidden) showTour(); });

  const boot = () => {
    $("#railBtn").addEventListener("click", toggleRail);
    $("#densBtn").addEventListener("click", () => { prefs.dense = !prefs.dense; savePrefs(); applyPrefs(); A.toast(prefs.dense ? "عرض مضغوط" : "عرض مريح"); });
    $("#favBtn").addEventListener("click", toggleFav);
    $("#createBtn").addEventListener("click", (e) => { e.stopPropagation(); openCreate(); });
    applyPrefs();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
