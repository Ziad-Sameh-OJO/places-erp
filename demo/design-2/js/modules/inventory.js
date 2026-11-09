/* M-03 Inventory: Rent / Resale / Income sheets, area tabs, PDF, tasks, Excel import, per-person access. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const canEdit = () => A.canDo("inventory", "edit") || (S().invAccess[A.me()] === "edit");
  // the owner's contact, number and the agent are Manar's only (Inventory Manager): hidden from every other account, in the sheet,
  // the unit page, the edit form, search and export. Entering them on a new unit is still allowed (write, not read).
  const PRIVATE = ["contact", "number", "agent", "owner", "name"];
  A.seesUnitPrivate = () => A.role === "inventory";
  const pub = (cols) => (A.seesUnitPrivate() ? cols : cols.filter(([k]) => !PRIVATE.includes(k)));
  // Location is a Google Maps link (or old-style coordinates); the link itself is shown and can be changed when the place changes
  const locUrl = (v) => { const t = String(v || "").trim(); return !t ? "" : /^https?:\/\//i.test(t) ? t : `https://maps.google.com/?q=${encodeURIComponent(t)}`; };
  const locLink = (u, full) => { const url = locUrl(u.location); if (!url) return "—"; const shown = full ? url : url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 26) + (url.length > 34 ? "…" : ""); return `<a class="lnk loc-lnk" href="${esc(url)}" target="_blank" rel="noopener" dir="ltr" title="${esc(url)}">${I("pin")}${esc(shown)}</a>`; };
  const COLS = {
    // Rent = the client's inventory sheet (Book, 9 Nov) column for column; the sheet lists Location twice, the system keeps one
    Rent: [["project", "Project"], ["code", "Code"], ["photos", "Pic"], ["contact", "Contact"], ["number", "Number"], ["space", "Area"], ["condition", "Conditions"], ["pricePerSqm", "Price/Sqm"], ["total", "Total Price"], ["maintenance", "Maintenance"], ["floor", "Floor"], ["parking", "Parking Slots"], ["building", "Building Number"], ["layout", "Layout file"], ["commission", "Commission"], ["location", "Location"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
    Resale: [["project", "اسم المبنى"], ["code", "الكود"], ["owner", "اسم الأونر"], ["number", "الرقم"], ["space", "المساحة"], ["floor", "الدور"], ["condition", "التشطيب"], ["pricePerSqm", "السعر للمتر"], ["total", "إجمالي السعر"], ["payment", "طريقة الدفع"], ["agent", "Agent"], ["maintenance", "صيانة"], ["building", "رقم المبنى"], ["parking", "Parking"], ["commission", "Commission"], ["delivery", "Delivery date"], ["photos", "Pictures"], ["lastUpdate", "Last update"]],
    Income: [["project", "اسم المبنى"], ["code", "الكود"], ["name", "الاسم"], ["number", "الرقم"], ["link", "اللينك"], ["space", "Area"], ["floor", "Floor"], ["salePerSqm", "Sale / m"], ["total", "Sale total"], ["leasePerSqm", "Lease / m"], ["monthly", "Monthly rent"], ["annual", "Annual rent"], ["yield", "Yield %"], ["contractYears", "Contract"], ["start", "Start"], ["end", "End"], ["escalation", "Escalation"], ["payment", "Payment"], ["building", "Building"], ["serviceUsd", "Service $/m"], ["tenant", "Tenant"], ["parking", "Parking"], ["commission", "Commission"], ["agreement", "Agreement"], ["note", "Note"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
    all: null
  };
  COLS.all = [COLS.Rent[0], COLS.Rent[1], ["type", "Type"], ...COLS.Rent.slice(2)];
  const OPTIONAL = ["code", "type", "total", "monthly", "annual", "yield", "layout", "pic", "resale", "comment", "note", "agent", "lastUpdate", "parking", "escalation", "floor"];
  A.missingOf = (u) => (COLS[u.type] || COLS.Rent).filter(([k]) => !OPTIONAL.includes(k) && !(k === "photos" && u.drive) && (u[k] == null || u[k] === "" || u[k] === 0)).map(([, l]) => l);
  const yn = (v) => chip(v ? "ok" : "", v ? "Yes" : "No");
  function cell(u, k) {
    const ic = A.incomeCalc(u);
    const map = {
      total: () => `<td class="n">${A.money(A.unitTotal(u))}</td>`, monthly: () => `<td class="n">${A.money(ic.monthly)}</td>`, annual: () => `<td class="n">${A.money(ic.annual)}</td>`,
      yield: () => `<td class="n"><b>${ic.yieldPct.toFixed(1)}%</b></td>`, agent: () => `<td>${A.who(u.agent)}</td>`,
      lastUpdate: () => `<td>${A.stale(u) ? chip("bad", "متأخر · " + A.fmtDate(u.lastUpdate)) : A.fmtDate(u.lastUpdate)}</td>`,
      divisible: () => `<td>${u.divisible ? chip("info", `اه · من ${A.num(u.minSplit)} م`) : "—"}</td>`,
      code: () => { const m = A.missingOf(u).length; return `<td class="mono">${u.code}${u.pdf === "draft" ? " " + chip("warn", "PDF draft") : ""}${m ? " " + chip("bad", `ناقص ${m}`) : ""}</td>`; },
      type: () => `<td>${chip(u.type === "Rent" ? "info" : u.type === "Resale" ? "acc" : "ok", u.type)}</td>`,
      location: () => `<td class="loc-td">${locLink(u)}</td>`,
      start: () => `<td>${A.fmtDate(u.start)}</td>`, end: () => `<td>${A.fmtDate(u.end)}</td>`, escalation: () => `<td class="n">${u.escalation || 0}%</td>`,
      space: () => `<td class="n"><bdi>${u.divisible && u.minSplit ? `${A.num(u.minSplit)} UP TO ${A.num(u.space)}` : A.num(u.space)}</bdi></td>`,
      photos: () => { const n = (u.photos || "").split("، ").filter(Boolean).length; return `<td><button class="lnk folder-lnk" data-act="unitFolder" data-code="${u.code}" title="فولدر صور الوحدة">${I("folder")}${n ? `${n} ملف` : "فاضي"}</button></td>`; },
      layout: () => { const n = (u.layouts || "").split("، ").filter(Boolean).length; return `<td><button class="lnk folder-lnk" data-act="unitFolder" data-kind="layout" data-code="${u.code}" title="فولدر الـ Layout">${I("file")}${n ? `${n} ملف` : "فاضي"}</button></td>`; },
      pic: () => `<td>${yn(!!(u.photos || u.drive))}</td>`,
      resale: () => `<td>${yn(u.type === "Resale" || u.also === "Resale")}</td>`, comment: () => `<td class="wrap">${esc(u.comment || "—")}</td>`,
      contractYears: () => `<td class="n">${u.contractYears || "—"} سنين</td>`, delivery: () => `<td>${u.delivery && /\d{4}-/.test(u.delivery) ? A.fmtDate(u.delivery) : esc(u.delivery || "—")}</td>`
    };
    if (map[k]) return map[k]();
    if (["pricePerSqm", "salePerSqm", "leasePerSqm", "parking", "serviceUsd"].includes(k)) return `<td class="n">${A.num(u[k])}</td>`;
    if (["link", "agreement"].includes(k)) return `<td>${u[k] ? `<span class="lnk">${I("image")}${esc(u[k])}</span>` : "—"}</td>`;
    return `<td><bdi>${esc(u[k] == null || u[k] === "" ? "—" : u[k])}</bdi></td>`;
  }
  function listUnits() {
    const st = S(), t = ui("invType") || "all", tab = ui("invTab"), f = ui("invF") || {};
    let list = st.units.filter((u) => !u.archived && (canEdit() || u.pdf === "confirmed")).filter((u) => t === "rented" ? u.status !== "available" || u.alsoStatus === "closed" : t === "all" ? A.isAvailable(u) : A.availableAs(u, t)); // Q15: sales see a unit only after Manar confirms it
    if (tab != null && st.areaTabs[tab]) list = list.filter((u) => A.unitTab(u) === tab);
    if (f.area) list = list.filter((u) => u.area === f.area);
    if (f.cond) list = list.filter((u) => u.condition === f.cond);
    if (f.agent && A.seesUnitPrivate()) list = list.filter((u) => u.agent === f.agent);
    if (f.stale) list = list.filter(A.stale);
    if (f.div) list = list.filter((u) => u.divisible);
    if (f.miss) list = list.filter((u) => A.missingOf(u).length);
    if (f.q) { const q = f.q.toLowerCase(), see = A.seesUnitPrivate(); list = list.filter((u) => JSON.stringify(see ? u : Object.fromEntries(Object.entries(u).filter(([k]) => !PRIVATE.includes(k)))).toLowerCase().includes(q)); }
    return list;
  }

  V.inventory = {
    sub: () => "Rent · Resale · Income في قايمة واحدة بفلتر، وتابات المساحات تحت زي الشيت",
    render() {
      const st = S(), r = A.role, t = ui("invType") || "all", tab = ui("invTab"), f = ui("invF") || {}, mode = ui("invMode") || "table", list = listUnits();
      if (r !== "admin" && !["inventory", "resale"].includes(r) && st.invAccess[A.me()] === "none") return U.empty("منار لسه مفعّلتش ليك صلاحية على الانفنتوري", "lock");
      // KPIs الفريق: Manar follows her team's cards (and her own) from inside the inventory
      if (r === "inventory" && ui("invView") === "kpis" && A.kpiBoard) return `<div class="row"><button class="btn ghost" data-act="invView" data-v="">${I("building")}رجوع للوحدات</button><span class="spacer"></span></div>
        ${note("كارتك وكروت فريق الانفنتوري. افتحي أي كارت وعدّلي أو ضيفي بنود من «إضافة أو تعديل KPIs»، ودخّلي القيم اليدوية لفريقك واعتمدي نتايجهم. اعتماد كارتك إنتي بيفضل مع نانسي.")}
        ${A.kpiBoard("mine")}${A.kpiInvMissing ? A.kpiInvMissing() : ""}`;
      const avail = st.units.filter(A.isAvailable), cols = pub(COLS[t] || COLS.all), as = (x) => st.units.filter((u) => A.availableAs(u, x)).length;
      const types = [["all", "الكل", avail.length], ["Rent", "Rent", as("Rent")], ["Resale", "Resale", as("Resale")], ["Income", "Income", as("Income")], ["rented", "Rented / Sold", st.units.filter((u) => u.status !== "available" || u.alsoStatus === "closed").length]];
      // the four summary cards are Manar's (Inventory Manager) only; everyone else sees the sheet straight away
      return `${r !== "inventory" ? "" : `<div class="kpis">${U.kpi("وحدات متاحة", avail.length, "Rent · Resale · Income", "building")}${U.kpi("PDF مستني Confirm", st.units.filter((u) => u.pdf === "draft").length, "قبل ما يتنشر للسيلز", "file", "warn")}${U.kpi("محتاجة ابديت", st.units.filter(A.stale).length, "last update أكتر من شهر", "clock", "bad", "invStale")}${U.kpi("ناقصها بيانات", st.units.filter((u) => !u.archived && A.missingOf(u).length).length, "تتكمّل بعدين", "alert", "bad", "invMissing")}</div>`}
        <div class="row">${U.tabs("invType", types, t)}<span class="spacer"></span>
          ${A.can("notactive") ? `<a class="btn ghost" href="#notactive">${I("layers")}Not Active Inventory</a>` : ""}${r === "inventory" ? `<button class="btn ghost" data-act="invView" data-v="kpis">${I("chart")}KPIs الفريق</button>` : ""}${A.canDo("inventory", "import") ? `<button class="btn ghost" data-act="importNew">${I("upload")}استيراد Excel</button>` : ""}${A.canDo("inventory", "approve") ? `<button class="btn ghost" data-act="invReport">${I("file")}التقرير اليومي</button><button class="btn ghost" data-act="teamTask">${I("check")}مهمة للفريق</button>` : ""}${A.canDo("inventory", "approve") || A.role === "tl" ? `<button class="btn ghost" data-act="listReqs">${I("list")}طلبات الـ Lists</button>` : ""}${U.exportBtn("units", "الوحدات")}${A.canDo("inventory", "approve") ? `<button class="btn ghost" data-act="invAccess">${I("lock")}الصلاحيات</button>` : ""}${A.canDo("inventory", "create") || canEdit() ? `<button class="btn" data-act="unitNew">${I("plus")}وحدة جديدة</button>` : ""}</div>
        <div class="toolbar">
          <label class="search">${I("search")}<input id="iq" type="search" placeholder="${A.seesUnitPrivate() ? "دوّر بأي حاجة: مشروع، كود، مالك، رقم" : "دوّر بأي حاجة: مشروع، كود، مبنى"}" value="${esc(f.q || "")}" data-change="invF" data-k="q"></label>
          <select id="if-a" data-change="invF" data-k="area" aria-label="Area">${opt("", "كل المناطق", f.area)}${st.areas.map((a) => opt(a, a, f.area)).join("")}</select>
          <select id="if-c" data-change="invF" data-k="cond" aria-label="Condition">${opt("", "كل التشطيبات", f.cond)}${S().finishings.map((c) => opt(c, c, f.cond)).join("")}</select>
          ${A.seesUnitPrivate() ? `<select id="if-g" data-change="invF" data-k="agent" aria-label="Agent">${opt("", "كل الـ agents", f.agent)}${A.sales().map((s) => opt(s.id, s.name, f.agent)).join("")}</select>` : ""}
          <label class="tog"><input type="checkbox" ${f.stale ? "checked" : ""} data-change="invF" data-k="stale"><span>محتاجة ابديت</span></label>
          <label class="tog"><input type="checkbox" ${f.div ? "checked" : ""} data-change="invF" data-k="div"><span>تنفع تتقسم</span></label>
          <label class="tog"><input type="checkbox" ${f.miss ? "checked" : ""} data-change="invF" data-k="miss"><span>ناقصها بيانات</span></label>
          <span class="spacer"></span>${U.seg("invMode", [["table", "شيت", "list"], ["drive", "فولدرات", "board"]], mode)}
        </div>
        ${mode === "drive" ? `<div class="drive">${list.map((u) => `<article class="ucard" data-act="unitOpen" data-code="${u.code}"><div class="u-img u-${u.type}">${I("image")}<span class="mono">${u.code}</span>${u.pdf === "draft" ? chip("warn", "PDF draft") : ""}</div><div class="u-body"><b>${esc(u.project)}</b><small>${esc(u.area)} · الدور ${esc(u.floor || "—")}</small><div class="row"><span class="num u-space">${A.num(u.space)} م</span><span class="spacer"></span><b class="num">${A.short(A.unitTotal(u))}</b></div><div class="row">${chip(u.type === "Rent" ? "info" : u.type === "Resale" ? "acc" : "ok", u.type)}${u.divisible ? chip("info", "تتقسم") : ""}${A.stale(u) ? chip("bad", "ابديت") : ""}</div></div></article>`).join("") || U.empty("مفيش وحدات في الفلتر ده", "building")}</div>`
        : table(cols.map((c) => c[1]), list.map((u) => `<tr class="click" data-act="unitOpen" data-code="${u.code}">${cols.map((c) => cell(u, c[0])).join("")}</tr>`), "has-sheets")}
        <div class="sheet-tabs" role="tablist" aria-label="تقسيم المساحات">
          <button role="tab" aria-selected="${tab == null}" data-act="invTab" data-v="">كل المساحات</button>
          ${st.areaTabs.map((rg, i) => `<button role="tab" aria-selected="${tab === i}" data-act="invTab" data-v="${i}">${esc(rg.label)} <span class="tab-n">${st.units.filter((u) => u.status === "available" && A.unitTab(u) === i).length}</span></button>`).join("")}
          ${canEdit() ? `<button data-act="tabsEdit" title="عدّل تابات المساحات">${I("plus")}</button>` : ""}
        </div>
        <p class="hint">التابات اللي تحت Customized: الفريق بيحدد الشرايح ويضيف أو يشيل. والوحدة اللي الـ last update بتاعها عدّى عليه أكتر من شهر بتظهر متأخرة، وبتتحسب في الـ activity بتاعة منار ورندا.</p>`;
    }
  };
  A.ACT.invType = (d) => { ui("invType", d.v); A.render(); };
  A.ACT.invTab = (d) => { ui("invTab", d.v === "" ? null : +d.v); A.render(); };
  A.ACT.invMode = (d) => { ui("invMode", d.v); A.render(); };
  A.ACT.invView = (d) => { ui("invView", d.v || null); A.render(); };
  A.ACT.invMissing = () => { location.hash = "#inventory"; ui("invType", "all"); ui("invF", { miss: true }); A.render(); };
  A.ACT.invStale = () => { ui("invF", Object.assign({}, ui("invF"), { stale: true })); A.render(); };
  A.CHANGE.invF = (v, el) => { ui("invF", Object.assign({}, ui("invF"), { [el.dataset.k]: v })); A.render(); };

  /* area tabs editor */
  A.ACT.tabsEdit = () => {
    const st = S();
    A.openModal("تابات المساحات", `${note("الشرايح دي Customized. منار أو رندا يضيفوا أو يعدّلوا أو يشيلوا أي تاب.")}
      ${table(["التاب", "من", "لحد", ""], st.areaTabs.map((t, i) => `<tr><td class="mono">${esc(t.label)}</td><td class="n">${A.num(t.min)}</td><td class="n">${t.max >= 1e9 ? "∞" : A.num(t.max)}</td><td><button class="btn ghost sm" data-act="tabDel" data-i="${i}">${I("x")}شيل</button></td></tr>`))}
      <form data-form="tabNew" class="grid">${field("من (م)", `<input name="min" id="tb-min" type="number" required>`, 1)}${field("لحد (م)", `<input name="max" id="tb-max" type="number" required>`, 1)}<div class="row end wide"><button class="btn">${I("plus")}إضافة تاب</button></div></form>`);
  };
  A.FORM.tabNew = (f) => { const st = S(); st.areaTabs.push({ label: `${f.min} to ${f.max}`, min: +f.min, max: +f.max }); st.areaTabs.sort((a, b) => a.min - b.min); A.ACT.tabsEdit(); A.render(); };
  A.ACT.tabDel = (d) => { const st = S(); st.areaTabs.splice(+d.i, 1); st.units.forEach((u) => (u.tab = null)); ui("invTab", null); A.ACT.tabsEdit(); A.render(); };

  /* unit form */
  const TYPE_FIELDS = {
    Rent: [["contact", "Contact", "text", 1], ["number", "Number", "tel", 1], ["pricePerSqm", "Price per sqm", "number", 1], ["maintenance", "Maintenance"], ["commission", "Commission"], ["comment", "Comment"], ["delivery", "Delivery date"], ["upfront", "Upfront rent"], ["security", "Security deposit"], ["payment", "Payment"], ["term", "Term"], ["grace", "Grace period"], ["escalation", "Annual increase %", "number"], ["photos", "Pic & Info (صور الوحدة · بتتحط في فولدرها)", "file"]],
    Resale: [["owner", "اسم الأونر", "text", 1], ["number", "الرقم", "tel", 1], ["pricePerSqm", "السعر للمتر", "number", 1], ["payment", "طريقة الدفع"], ["delivery", "Delivery date", "date"], ["maintenance", "صيانة"], ["commission", "Commission"], ["photos", "Pictures (صور الوحدة · بتتحط في فولدرها)", "file"]],
    Income: [["name", "الاسم", "text", 1], ["number", "الرقم", "tel"], ["link", "اللينك"], ["salePerSqm", "Sale price per meter", "number", 1], ["leasePerSqm", "Lease price per meter", "number", 1], ["contractYears", "Contract duration (سنين)", "number"], ["start", "Start date", "date"], ["end", "End date", "date"], ["escalation", "Escalation rate %", "number"], ["payment", "Payment method"], ["serviceUsd", "Service charge / m (USD)", "number"], ["tenant", "Tenant name"], ["agreement", "Agreement (ملف · يترفع على السيستم)", "file"], ["commission", "Commission"], ["note", "Note"]]
  };
  A.ACT.unitNew = () => unitForm("Rent");
  function unitForm(type) {
    const st = S();
    A.openModal("وحدة جديدة", `<form data-form="unitNew" class="grid">
      ${field("Type", `<select name="type" id="un-type" data-change="unType">${S().unitPurposes.map((t) => opt(t, t, type)).join("")}</select>`, 1)}
      ${field("Project / اسم المبنى", `<input name="project" id="un-proj">`)}
      ${field("Area", `<select name="area" id="un-area">${st.areas.map((a) => opt(a)).join("")}</select>`, 1)}
      ${field("Gross area (م)", `<input name="space" id="un-space" type="number" data-input="unSpace">`)}
      ${field("Condition / التشطيب", `<select name="condition" id="un-cond">${S().finishings.map((t) => opt(t)).join("")}</select>`, 1)}
      ${field("Floor", `<input name="floor" id="un-floor">`)}
      ${field("Build num", `<input name="building" id="un-bld">`, 1)}
      ${field("Parking slots", `<input name="parking" id="un-park" type="number" value="0">`)}
      ${field("Agent (السيلز اللي جاب الوحدة)", `<select name="agent" id="un-agent">${A.sales().map((s) => opt(s.id, s.name)).join("")}</select>`, 1)}
      ${field("تاب المساحة", `<select name="tab" id="un-tab">${opt("", "أوتوماتيك من المساحة")}${st.areaTabs.map((rg, i) => opt(i, rg.label)).join("")}</select>`)}
      ${field("Location (لينك Google Maps)", `<div class="row"><input name="location" id="un-loc" type="url" dir="ltr" placeholder="https://maps.app.goo.gl/…"><button type="button" class="btn ghost sm" data-act="pickLoc">${I("pin")}اختار</button></div>`)}
      ${TYPE_FIELDS[type].map(([k, l, t, req]) => field(l, `<input name="${k}" id="un-${k}" type="${t || "text"}" ${t === "file" ? 'multiple accept="image/*,application/pdf"' : ""}>`)).join("")}
      ${field("اتستلمت إمتى (من المالك / الواتساب)", `<input name="receivedAt" id="un-recv" type="datetime-local" value="${new Date(A.NOW() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)}">`)}
      ${field("Layout file (PDF · DWG · صورة · بيتحط في فولدر الـ Layout)", `<input name="layoutFiles" id="un-layoutFiles" type="file" multiple>`)}
      ${field("تنفع تتقسم؟", `<select name="divisible" id="un-div">${opt("no", "لا")}${opt("yes", "اه")}</select>`)}
      ${field("أقل مساحة ممكن تتقسم لها", `<input name="minSplit" id="un-min" type="number" value="0">`)}
      <div class="row end wide"><span class="hint spacer">الكود التسلسلي والـ total price والـ PDF والـ slide بيتعملوا أوتوماتيك.</span><button class="btn">حفظ الوحدة</button></div></form>`);
  }
  A.CHANGE.unType = (v) => unitForm(v);
  A.CHANGE.unSpace = (v) => { const i = S().areaTabs.findIndex((r) => +v >= r.min && +v <= r.max), el = document.getElementById("un-tab"); if (el && i >= 0) el.value = String(i); };
  A.ACT.pickLoc = () => { const el = document.getElementById("un-loc"); el.value = `https://maps.google.com/?q=30.${(Math.random() * 9e4 + 1e4) | 0},31.${(Math.random() * 9e4 + 1e4) | 0}`; A.toast("في السيستم الحقيقي الخريطة بتفتح وتختار المكان، أو تلزق لينك Google Maps"); };
  // change a unit's location link from its page (the place moved, or the old link was wrong); the old link stays in the Audit Log
  A.ACT.unitLoc = (d) => { const u = S().units.find((x) => x.code === d.code); A.openModal(`لينك اللوكيشن · ${u.code}`, `<form data-form="unitLoc" class="grid"><input type="hidden" name="code" value="${u.code}">${field("لينك Google Maps", `<input name="location" id="ul-loc" type="url" dir="ltr" required value="${esc(locUrl(u.location))}" placeholder="https://maps.app.goo.gl/…">`, 1, 1)}${u.location ? `<p class="hint wide">اللينك الحالي: ${locLink(u, true)}</p>` : ""}<div class="row end wide"><button class="btn">حفظ اللينك</button></div></form>`); };
  A.FORM.unitLoc = (f) => { const u = S().units.find((x) => x.code === f.code), was = u.location || "", v = (f.location || "").trim(); if (v === locUrl(was)) { A.closeModal(); A.toast("مفيش تغيير"); return; } u.location = v; u.lastUpdate = A.today(); u.pdf = "draft"; A.audit("inventory", `${u.code}: اللوكيشن اتغيّر · ${was || "—"} ← ${v}`); A.closeModal(); A.toast("لينك اللوكيشن اتحدّث · الـ PDF مستني Confirm تاني"); A.render(); };
  A.FORM.unitNew = (f, form) => {
    const st = S(), code = "U-" + st.unitSeq++, nums = ["space", "parking", "pricePerSqm", "salePerSqm", "leasePerSqm", "escalation", "contractYears", "serviceUsd", "minSplit"];
    const u = Object.assign({}, f, { code, divisible: f.divisible === "yes", tab: f.tab === "" ? null : +f.tab, status: "available", pdf: "draft", lastUpdate: A.today(), created: A.today(), enteredAt: A.nowIso(), receivedAt: f.receivedAt ? new Date(f.receivedAt).toISOString() : A.nowIso() });
    nums.forEach((k) => (u[k] = +f[k] || 0)); u.photos = ""; u.layouts = ""; u.layout = "No"; delete u.layoutFiles;
    st.units.unshift(u); A.audit("inventory", `${code} اتسجّلت (${u.project})`);
    A.notify(["marketing"], `Live Alert: وحدة جديدة ${code} (${u.project}) اتضافت للانفنتوري`);
    const pics = form && form.querySelector("[name=photos]"); if (pics && pics.files.length) A.unitFilesAdd(code, pics.files).then(() => A.render());
    const lay = form && form.querySelector("[name=layoutFiles]"); if (lay && lay.files.length) A.unitFilesAdd(code, lay.files, "layout").then(() => A.render());
    if (A.afterUnitNew) A.afterUnitNew(u); // a unit Marwa brought in from a Not Active sheet marks that row Done
    const miss = A.missingOf(u); A.closeModal(); A.toast(miss.length ? `${code} اتسجّلت · ناقصها ${miss.length} خانة، والتنبيه في «مهامي النهارده» لحد ما تتكمّل` : `${code} اتسجّلت · الـ PDF والـ slide اتعملوا ومستنيين Confirm من منار`); A.render(); A.ACT.unitOpen({ code });
  };

  /* unit drawer */
  A.ACT.unitOpen = (d) => { ui("utab", "data"); A.openDrawer(() => unitDrawer(d.code)); };
  function unitDrawer(code) {
    const st = S(), u = st.units.find((x) => x.code === code); if (!u) return "";
    const ic = A.incomeCalc(u), r = A.role, edit = canEdit(), tab = ui("utab") || "data", tasks = st.tasks.filter((t) => t.unit === code);
    const chips = `${chip(u.type === "Rent" ? "info" : u.type === "Resale" ? "acc" : "ok", u.type)}${u.status !== "available" ? chip("bad", u.status === "sold" ? "Sold" : "Rented") : chip("ok", "متاحة")}${u.pdf === "draft" ? chip("warn", "PDF مستني Confirm") : chip("ok", "PDF منشور للسيلز")}${u.closeReq ? chip("warn", "مستنية تأكيد القفل") : ""}${u.also ? chip(u.alsoStatus === "closed" ? "bad" : "acc", u.alsoStatus === "closed" ? `${u.also} اتقفلت` : `متاحة كمان ${u.also}`) : ""}${u.divisible ? chip("info", `تتقسم · من ${A.num(u.minSplit)} م`) : ""}${A.stale(u) ? chip("bad", "محتاجة ابديت") : ""}`;
    let body = U.tabs("utab", [["data", "البيانات"], ["pdf", "PDF & slide"], ["tasks", "المهام", tasks.length]], tab); // the location lives in one place: the Location field in البيانات
    // Q16: after the Office Manager approves the deal, Manar confirms rent units and Randa resale & income units
    const closeType = ((S().deals.find((x) => x.id === u.closeReq) || {}).type) || u.type, closer = A.canDo("inventory", "approve") && (r === "admin" || (closeType === "Rent" ? r === "inventory" : r === "resale")) || (r === "resale" && closeType !== "Rent" && A.canDo("inventory", "edit"));
    if (tab === "data" && u.closeReq) body += note(`<b>Done Deal ${esc(u.closeReq)} اتوافق عليها.</b> الوحدة بتتقفل بعد تأكيد ${u.type === "Rent" ? "منار" : "رندا"}. ${closer ? `<button class="btn sm" data-act="unitCloseConfirm" data-code="${u.code}">${I("check")}أكّد القفل (${u.type === "Resale" || u.type === "Income" ? "Sold" : "Rented"})</button>` : ""}`, "warn");
    const miss = A.missingOf(u);
    if (tab === "data" && miss.length) body += note(`<b>بيانات ناقصة (${miss.length}):</b> ${miss.map(esc).join("، ")}. الوحدة اتسجّلت عادي، وفيه تنبيه في «مهامي النهارده» لحد ما تتكمّل. ${edit ? `<button class="btn sm" data-act="unitEdit" data-code="${u.code}">كمّل البيانات</button>` : ""}`, "warn");
    if (tab === "data") body += `${kv(pub(COLS[u.type] || COLS.all).map(([k, l]) => [l, k === "location" ? `${locLink(u, true)}${edit ? ` <button class="btn ghost sm" data-act="unitLoc" data-code="${u.code}">${u.location ? "عدّل اللينك" : "ضيف لينك"}</button>` : ""}` : cell(u, k).replace(/^<td[^>]*>|<\/td>$/g, "")]).concat(u.comment ? [["Comment", esc(u.comment)]] : []))}${A.invExtras ? A.invExtras(u) : ""}
      ${u.type === "Income" ? note(`Monthly = Lease/m × Area = ${A.money(ic.monthly)} · Annual = ×12 = ${A.money(ic.annual)} · Yield = Annual ÷ Sale total = <b>${ic.yieldPct.toFixed(2)}%</b>`) : note(`Total price = السعر للمتر × المساحة = ${A.num(u.pricePerSqm)} × ${A.num(u.space)} = <b>${A.money(A.unitTotal(u))}</b>`)}
      <div class="row"><button class="btn ghost" data-act="unitFolder" data-code="${u.code}">${I("folder")}فولدر الصور (Pic & Info)</button><button class="btn ghost" data-act="unitFolder" data-kind="layout" data-code="${u.code}">${I("file")}Layout file</button></div>
      ${edit ? `<div class="row"><button class="btn ghost" data-act="unitEdit" data-code="${u.code}">تعديل البيانات</button>${A.canDo("inventory", "delete") ? `<button class="btn ghost" data-act="unitArchive" data-code="${u.code}">${I("x")}أرشفة</button>` : ""}<button class="btn ghost" data-act="unitUpdate" data-code="${u.code}">${I("clock")}ابديت مع المالك النهارده</button>${u.status === "available" ? `<button class="btn ghost" data-act="unitClose" data-code="${u.code}">${I("handshake")}اتأجّرت / اتباعت</button>` : ""}</div>` : ""}`;
    if (tab === "pdf") { body += `${A.deckPreview(u)}<div class="row"><button class="btn" data-act="unitDeck" data-code="${u.code}" data-mode="pdf">${I("file")}افتح الـ PDF</button><button class="btn ghost" data-act="unitDeckPptx" data-code="${u.code}" data-mode="pdf">${I("download")}الـ PDF كـ PowerPoint</button><button class="btn ghost" data-act="unitDeck" data-code="${u.code}" data-mode="slide">${I("board")}افتح الـ slide</button><button class="btn ghost" data-act="unitDeckPptx" data-code="${u.code}" data-mode="slide">${I("download")}الـ slide كـ PowerPoint</button></div>
      ${note("الـ PDF والـ slide بيتعملوا أوتوماتيك بنفس تصميم Places: الغلاف والجدول من بيانات الوحدة، والصور من فولدر Pic & Info (أول صورة هي صورة المبنى، والباقي صور من جوه). محدش بيعدّل عليهم بإيده: أي تعديل في البيانات أو الصور بيظهر فيهم على طول، والوحدة بترجع تستنى Confirm منار. والوحدة مابتظهرش للسيلز غير بعد الـ Confirm.")}
      ${u.pdf === "draft" && A.canDo("inventory", "approve") ? `<button class="btn" data-act="pdfConfirm" data-code="${u.code}">${I("check")}Confirm وانشره للسيلز</button>` : u.pdf === "draft" ? chip("warn", "مستني Confirm من منار") : chip("ok", "منشور للسيلز")}`; setTimeout(() => A.deckPreviewFill(u.code), 0); }
    if (tab === "tasks") body += `${tasks.map((t) => `<div class="line-item"><span>${chip(t.status === "done" ? "ok" : t.status === "uploaded" ? "warn" : "", ({ photo: "تصوير", retouch: "Retouch", followup: "متابعة", toResale: "ابديت للبيع", marketing: "تسويق" })[t.kind])} ${A.who(t.to)} · ${A.fmtDate(t.due)}</span><span class="hint">${esc(t.status)}</span></div>`).join("") || `<p class="hint">مفيش مهام على الوحدة دي</p>`}
      ${edit ? `<div class="row"><button class="btn ghost" data-act="taskNew" data-kind="photo" data-code="${u.code}">${I("camera")}مهمة تصوير</button><button class="btn ghost" data-act="taskNew" data-kind="retouch" data-code="${u.code}">${I("image")}مهمة Retouch</button>${A.role !== "resale" && u.type === "Rent" ? `<button class="btn ghost" data-act="taskNew" data-kind="toResale" data-code="${u.code}">${I("send")}ابعتها لرندا (ابديت للبيع)</button>` : ""}</div>` : ""}`;
    return U.drawer(`${u.code} · ${u.project}`, `${u.type} · ${u.area}`, chips, body);
  }
  A.ACT.utab = (d) => { ui("utab", d.v); A.refreshDrawer(); };
  A.ACT.pdfConfirm = (d) => { const u = S().units.find((x) => x.code === d.code); u.pdf = "confirmed"; A.audit("inventory", `${u.code}: الـ PDF اتعمله Confirm`); A.notify(["marketing", "sales"], `الوحدة ${u.code} (${u.project}) اتنشرت · جاهزة للسيلز والحملات`); A.toast("الـ PDF اترفع، والتسويق والسيلز وصلهم إشعار"); A.render(); };
  A.ACT.unitUpdate = (d) => { const u = S().units.find((x) => x.code === d.code); const prev = u.lastUpdate; u.lastUpdate = A.today(); S().tasks.filter((t) => t.kind === "followup" && t.unit === u.code && t.status !== "done").forEach((t) => (t.status = "done")); A.toast("الـ last update اتحدّث", () => (u.lastUpdate = prev)); A.render(); };
  A.ACT.unitCloseConfirm = (d) => { const u = S().units.find((x) => x.code === d.code), dt = (S().deals.find((x) => x.id === u.closeReq) || {}).type; if (u.also && dt === u.also) { u.alsoStatus = "closed"; u.alsoClosedBy = u.closeReq; u.closeReq = ""; A.audit("inventory", `${u.code}: جانب الـ ${u.also} اتقفل · لسه متاحة ${u.type}`); A.toast(`${u.code}: الـ ${u.also} اتقفل، والوحدة لسه متاحة ${u.type}`); A.render(); return; } u.status = u.type === "Rent" ? "rented" : "sold"; u.closedAt = A.today(); u.closedBy = u.closeReq; u.closeReq = ""; A.audit("inventory", `${u.code} اتقفلت (${u.status}) بعد Done Deal ${u.closedBy}`); A.toast(`${u.code} اتقفلت · ${u.status === "sold" ? "Sold" : "Rented"}`); A.render(); };
  A.ACT.unitClose = (d) => { const u = S().units.find((x) => x.code === d.code); u.status = u.type === "Resale" ? "sold" : "rented"; u.closedAt = A.today(); A.toast(`اتنقلت لشيت rented، واتحسبت في Achievements ${A.person(u.agent)}`, () => { u.status = "available"; }); A.closeDrawer(); A.render(); };
  // stale units become follow-up tasks automatically
  A.autoFollowups = () => { const st = S(); st.units.filter(A.stale).forEach((u) => { if (!st.tasks.some((t) => t.kind === "followup" && t.unit === u.code && t.status !== "done")) st.tasks.push({ id: "T-" + (st.tasks.length + 1) + "f", kind: "followup", unit: u.code, by: "system", to: u.type === "Resale" ? "u8" : "u7", due: A.today(), status: "todo", note: "last update عدّى عليه أكتر من شهر · كلّم المالك" }); }); };

  A.ACT.unitEdit = (d) => {
    const u = S().units.find((x) => x.code === d.code), F = [["project", "Project", "text"], ["space", "Gross area", "number"], ["floor", "Floor", "text"], ["building", "Build num", "text"], ["parking", "Parking", "number"], [u.type === "Income" ? "salePerSqm" : "pricePerSqm", u.type === "Income" ? "Sale price / m" : "Price per sqm", "number"], u.type === "Income" ? ["leasePerSqm", "Lease / m", "number"] : null, ["contact", "Contact / Owner", "text"], ["number", "Number", "tel"], ["minSplit", "أقل مساحة للتقسيم", "number"], ["alsoPricePerSqm", "سعر المتر في النوع التاني", "number"], ["maintenance", "Maintenance", "text"], ["commission", "Commission", "text"], ["comment", "Comment", "text"], ["location", "Location (لينك Google Maps)", "text"], ["photos", "ضيف صور لفولدر الوحدة", "file"]].filter(Boolean);
    // every column of the unit's type is editable, so anything left empty at entry can be completed here
    TYPE_FIELDS[u.type].forEach(([k, l, t]) => { if (!F.some((x) => x[0] === k)) F.splice(F.length - 1, 0, [k, l, t === "file" ? "text" : t || "text"]); });
    if (!A.seesUnitPrivate()) for (let i = F.length - 1; i >= 0; i--) if (PRIVATE.includes(F[i][0])) F.splice(i, 1);
    A.openModal(`تعديل ${u.code}`, `<form data-form="unitEdit" class="grid"><input type="hidden" name="code" value="${u.code}">${F.map(([k, l, t]) => field(l, t === "file" ? `<input name="${k}" id="ue-${k}" type="file" multiple accept="image/*">` : `<input name="${k}" id="ue-${k}" type="${t}" value="${esc(u[k] == null ? "" : u[k])}">`)).join("")}${field("Condition", `<select name="condition" id="ue-c">${S().finishings.map((x) => opt(x, x, u.condition)).join("")}</select>`)}${field("ضيف Layout file (PDF · DWG · صورة)", `<input name="layoutFiles" id="ue-layoutFiles" type="file" multiple>`)}${field("متاحة كمان كـ (نوع تاني)", `<select name="also" id="ue-also">${opt("", "لأ", u.also || "")}${["Rent", "Resale"].filter((x) => x !== u.type).map((x) => opt(x, x, u.also || "")).join("")}</select>`)}${field("تنفع تتقسم؟", `<select name="divisible" id="ue-dv">${opt("no", "لا", u.divisible ? "yes" : "no")}${opt("yes", "اه", u.divisible ? "yes" : "no")}</select>`)}<div class="row end wide"><span class="hint spacer">التعديل بيتسجّل في الـ Audit Log، والـ PDF بيتعمل تاني ومستني Confirm.</span><button class="btn">حفظ</button></div></form>`);
  };
  A.FORM.unitEdit = (f, form) => { const u = S().units.find((x) => x.code === f.code), ch = []; const pics = form && form.querySelector("[name=photos]"); if (pics && pics.files.length) A.unitFilesAdd(u.code, pics.files).then(() => A.render()); delete f.photos; const lay = form && form.querySelector("[name=layoutFiles]"); if (lay && lay.files.length) A.unitFilesAdd(u.code, lay.files, "layout").then(() => A.render()); delete f.layoutFiles; if (f.also !== undefined && f.also !== (u.also || "")) { u.alsoStatus = f.also ? "available" : ""; } Object.keys(f).forEach((k) => { if (k === "code") return; let v = ["space", "parking", "pricePerSqm", "salePerSqm", "leasePerSqm", "minSplit", "alsoPricePerSqm", "contractYears", "escalation", "serviceUsd"].includes(k) ? +f[k] : k === "divisible" ? f[k] === "yes" : f[k]; if (String(u[k] ?? "") !== String(v ?? "")) { ch.push(`${k}: ${u[k]} ← ${v}`); u[k] = v; } }); if (ch.length) { u.pdf = "draft"; u.lastUpdate = A.today(); A.audit("inventory", `${u.code}: ${ch.join(" · ")}`); } A.closeModal(); A.toast(ch.length ? "اتحفظ · الـ PDF مستني Confirm تاني" : "مفيش تغيير"); A.render(); };
  A.ACT.unitArchive = (d) => { const u = S().units.find((x) => x.code === d.code); u.archived = true; A.audit("inventory", `${u.code} اتأرشفت`); A.closeDrawer(); A.toast(`${u.code} اتأرشفت`, () => { u.archived = false; }); A.render(); };

  /* Excel import with duplicate check · منع التكرار: Manar picks the column(s) when she imports. A row is a repeat only when ALL the
     chosen columns match a unit already in the inventory or an earlier row of the same file. Default: the unit itself
     (Project + Building + Floor + Area), not the owner's number, since one owner often has several units. */
  const IM_COLS = [["project", "Project"], ["space", "Area"], ["floor", "Floor"], ["building", "Building Number"], ["contact", "Contact"], ["number", "Number"]];
  const IM_DEFAULT = ["project", "space", "floor", "building"];
  const imCols = () => S().imDupCols || IM_DEFAULT;
  const imVal = (k, v) => { const t = String(v == null ? "" : v).trim(); if (!t) return ""; return k === "number" ? A.normPhone(t) : k === "space" ? String(+t || t) : t.toLowerCase().replace(/\s+/g, " "); };
  const imKey = (r, cols) => { const p = cols.map((k) => imVal(k, r[k])); return p.length && p.every(Boolean) ? p.join("\u0001") : ""; };
  const imChooser = () => `<div class="na-cols"><span class="hint">منع التكرار بـ:</span>${IM_COLS.map(([k, l]) => `<label class="tog"><input type="checkbox" ${imCols().includes(k) ? "checked" : ""} data-change="imDupCol" data-k="${k}"><span>${esc(l)}</span></label>`).join("")}</div>
    <p class="hint">الصف بيتحسب مكرر لما ${imCols().length > 1 ? "الخانات المختارة كلها تبقى" : "الخانة دي تبقى"} زي وحدة موجودة أو صف قبله في نفس الملف. مالك بنفس الاسم أو الرقم وعنده وحدة تانية مش بيتحسب مكرر غير لو اخترت Contact أو Number لوحدهم.</p>`;
  A.ACT.importNew = () => A.openModal("استيراد Excel (القالب الموحّد)", `${note("الأعمدة: project, space, floor, building, contact, number, pricePerSqm, type. اختار خانة منع التكرار، والمكرر بيستنى قرار المانجر.")}
    <form data-form="importNew">${field("ارفع ملف Excel بالقالب الموحّد", `<input type="file" accept=".xlsx,.xls,.csv" data-change="imFile">`)}<div id="im-dup">${imChooser()}</div>${field("الصفوف (CSV)", `<textarea name="csv" id="im-csv" style="min-height:160px">${S().importSample.map((r) => [r.project, r.space, r.floor, r.building, r.contact, r.number, r.pricePerSqm, r.type].join(",")).join("\n")}</textarea>`, 1)}
    <div class="row end"><span class="hint spacer">ارفع ملف Excel أو عدّل الصفوف التجريبية، والسيستم هيفحص التكرار بالخانات اللي اخترتها.</span><button class="btn">${I("upload")}افحص وابعت للمراجعة</button></div></form>`);
  A.CHANGE.imDupCol = (v, el) => { const st = S(), c = imCols().slice(), i = c.indexOf(el.dataset.k); if (v && i < 0) c.push(el.dataset.k); if (!v && i >= 0) c.splice(i, 1); if (!c.length) { el.checked = true; A.toast("لازم خانة واحدة على الأقل"); return; } st.imDupCols = IM_COLS.map(([k]) => k).filter((k) => c.includes(k)); A.save(); const box = document.getElementById("im-dup"); if (box) box.innerHTML = imChooser(); };
  // the Excel file fills the rows box (header row skipped when it isn't data)
  A.CHANGE.imFile = (v, el) => { const f = el.files && el.files[0]; if (!f) return; U.readSheet(f).then((rows) => { const data = rows.filter((r) => /\d/.test(r[1] || "")); document.getElementById("im-csv").value = data.map((r) => r.slice(0, 8).join(",")).join("\n"); A.toast(`اتقرا ${data.length} صف من ${f.name}`); }).catch((e) => A.toast(e.message)); };
  A.FORM.importNew = (f) => {
    const st = S(), cols = imCols(), rows = f.csv.split(/\n/).map((x) => x.split(",").map((s) => s.trim())).filter((x) => x.length >= 8).map(([project, space, floor, building, contact, number, pricePerSqm, type]) => ({ project, space: +space, floor, building, contact, number, pricePerSqm: +pricePerSqm, type }));
    const inInv = {}; st.units.filter((u) => !u.archived).forEach((u) => { const k = imKey(u, cols); if (k && !inInv[k]) inInv[k] = u.code; });
    const inFile = {};
    rows.forEach((rw, i) => { const k = imKey(rw, cols); rw.dupe = ""; rw.dupeRow = null; rw.decision = "add";
      if (k && inInv[k]) { rw.dupe = inInv[k]; rw.decision = "skip"; } else if (k && inFile[k] != null) { rw.dupeRow = inFile[k] + 1; rw.decision = "skip"; } if (k && inFile[k] == null) inFile[k] = i; });
    const by = cols.map((k) => IM_COLS.find((c) => c[0] === k)[1]).join(" + "), n = rows.filter((x) => x.dupe || x.dupeRow).length;
    const job = { id: "IM-" + Date.now(), rows, status: "pending", by: A.me(), dupBy: by }; st.imports.push(job);
    A.audit("inventory", `استيراد Excel: ${rows.length} صف · منع التكرار بـ ${by} · ${n} مكرر`);
    A.notify(["inventory"], `استيراد Excel فيه ${rows.length} صف · ${n} متكرر (بـ ${by}) محتاج قرارك`);
    A.closeModal(); A.ACT.importReview({ id: job.id }); A.render();
  };
  A.ACT.importReview = (d) => {
    const job = S().imports.find((x) => x.id === d.id), mgr = A.canDo("inventory", "approve");
    const dupChip = (rw) => rw.dupe ? chip("warn", "مكرر مع " + rw.dupe) : rw.dupeRow ? chip("warn", `مكرر مع صف ${rw.dupeRow} في الملف`) : chip("ok", "جديد");
    const dec = (rw, i) => `<select data-change="imDec" data-id="${job.id}" data-i="${i}">${opt("skip", "استبعد المكرر", rw.decision)}${rw.dupe ? opt("merge", "ادمج (حدّث القديم)", rw.decision) : ""}${opt("add", "ضيفها برضه (مش مكررة)", rw.decision)}</select>`;
    A.openModal(`مراجعة الاستيراد · ${job.rows.length} صف`, `${job.dupBy ? note(`منع التكرار بـ <b>${esc(job.dupBy)}</b>. أي صف متعلّم مكرر بالغلط اختار له «ضيفها برضه».`) : ""}${table(["المشروع", "المساحة", "الدور", "المبنى", "المالك", "التكرار", "القرار"], job.rows.map((rw, i) => `<tr><td>${esc(rw.project)}</td><td class="n">${rw.space}</td><td>${esc(rw.floor)}</td><td>${esc(rw.building)}</td><td>${esc(rw.contact)}</td><td>${dupChip(rw)}</td><td>${(rw.dupe || rw.dupeRow) && mgr ? dec(rw, i) : esc(rw.decision === "add" ? "هيتضاف" : rw.decision)}</td></tr>`))}
      ${mgr ? `<div class="row end"><button class="btn" data-act="importApprove" data-id="${job.id}">وافق ونفّذ</button></div>` : note("مستني موافقة منار (المانجر) على المكرر.")}`);
  };
  A.CHANGE.imDec = (v, el) => { S().imports.find((x) => x.id === el.dataset.id).rows[+el.dataset.i].decision = v; };
  A.ACT.importApprove = (d) => {
    const st = S(), job = st.imports.find((x) => x.id === d.id); let add = 0, merge = 0;
    job.rows.forEach((rw) => {
      if (rw.decision === "add") { const { dupe, dupeRow, decision, ...data } = rw; st.units.unshift(Object.assign({ code: "U-" + st.unitSeq++, area: st.areas[0], condition: "متشطب", status: "available", pdf: "draft", lastUpdate: A.today(), created: A.today(), agent: "s1", parking: 0, divisible: false, minSplit: 0, tab: null }, data)); add++; }
      if (rw.decision === "merge") { const u = st.units.find((x) => x.code === rw.dupe); Object.assign(u, { pricePerSqm: rw.pricePerSqm, contact: rw.contact, lastUpdate: A.today() }); merge++; }
    });
    job.status = "done"; A.closeModal(); A.toast(`اتضاف ${add} وحدة · اتدمج ${merge} · اتستبعد ${job.rows.length - add - merge}`); A.render();
  };

  /* per-person access managed by Manar */
  A.ACT.invAccess = () => {
    const st = S(), ppl = st.people.filter((p) => !["admin", "inventory"].includes(p.role));
    A.openModal("صلاحيات الانفنتوري", `${note("منار (Inventory Manager) بتفعّل الـ access لكل شخص لوحده.")}
      ${table(["الشخص", "الدور", "الصلاحية"], ppl.map((p) => `<tr><td>${A.who(p.id)}</td><td>${esc(p.dept)}</td><td>${U.seg("accSet", [["none", "مفيش"], ["view", "عرض"], ["edit", "تعديل"]].map(([k, l]) => [p.id + "|" + k, l]), p.id + "|" + (st.invAccess[p.id] || "none"))}</td></tr>`))}`);
  };
  A.ACT.accSet = (d) => { const [id, v] = d.v.split("|"); S().invAccess[id] = v; A.ACT.invAccess(); A.toast(`${A.person(id)}: ${v === "edit" ? "تعديل" : v === "view" ? "عرض" : "مفيش صلاحية"}`); };
})();
