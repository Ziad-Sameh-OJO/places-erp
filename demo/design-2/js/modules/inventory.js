/* M-03 Inventory: Rent / Resale / Income sheets, area tabs, PDF, tasks, Excel import, per-person access. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const canEdit = () => A.canDo("inventory", "edit") || (S().invAccess[A.me()] === "edit");
  const COLS = {
    Rent: [["project", "Project"], ["code", "Code"], ["photos", "Pic / info"], ["contact", "Contact"], ["number", "Number"], ["space", "Gross area"], ["condition", "Conditions"], ["pricePerSqm", "Price / sqm"], ["total", "Total price"], ["maintenance", "Maintenance"], ["floor", "Floor"], ["commission", "Commission"], ["agent", "Agent"], ["building", "Build num"], ["parking", "Parking"], ["location", "Location"], ["lastUpdate", "Last update"]],
    Resale: [["project", "اسم المبنى"], ["code", "الكود"], ["owner", "اسم الأونر"], ["number", "الرقم"], ["space", "المساحة"], ["floor", "الدور"], ["condition", "التشطيب"], ["pricePerSqm", "السعر للمتر"], ["total", "إجمالي السعر"], ["payment", "طريقة الدفع"], ["agent", "Agent"], ["maintenance", "صيانة"], ["building", "رقم المبنى"], ["parking", "Parking"], ["commission", "Commission"], ["delivery", "Delivery date"], ["photos", "Pictures"], ["lastUpdate", "Last update"]],
    Income: [["project", "اسم المبنى"], ["code", "الكود"], ["name", "الاسم"], ["number", "الرقم"], ["link", "اللينك"], ["space", "Area"], ["floor", "Floor"], ["salePerSqm", "Sale / m"], ["total", "Sale total"], ["leasePerSqm", "Lease / m"], ["monthly", "Monthly rent"], ["annual", "Annual rent"], ["yield", "Yield %"], ["contractYears", "Contract"], ["start", "Start"], ["end", "End"], ["escalation", "Escalation"], ["payment", "Payment"], ["building", "Building"], ["serviceUsd", "Service $/m"], ["tenant", "Tenant"], ["parking", "Parking"], ["commission", "Commission"], ["agreement", "Agreement"], ["note", "Note"], ["agent", "Agent"], ["lastUpdate", "Last update"]],
    all: [["code", "Code"], ["type", "Type"], ["project", "Project"], ["area", "Area"], ["space", "Space"], ["condition", "Condition"], ["total", "Total"], ["divisible", "تتقسم؟"], ["agent", "Agent"], ["lastUpdate", "Last update"]]
  };
  function cell(u, k) {
    const ic = A.incomeCalc(u);
    const map = {
      total: () => `<td class="n">${A.money(A.unitTotal(u))}</td>`, monthly: () => `<td class="n">${A.money(ic.monthly)}</td>`, annual: () => `<td class="n">${A.money(ic.annual)}</td>`,
      yield: () => `<td class="n"><b>${ic.yieldPct.toFixed(1)}%</b></td>`, agent: () => `<td>${A.who(u.agent)}</td>`,
      lastUpdate: () => `<td>${A.stale(u) ? chip("bad", "متأخر · " + A.fmtDate(u.lastUpdate)) : A.fmtDate(u.lastUpdate)}</td>`,
      divisible: () => `<td>${u.divisible ? chip("info", `اه · من ${A.num(u.minSplit)} م`) : "—"}</td>`,
      code: () => `<td class="mono">${u.code}${u.pdf === "draft" ? " " + chip("warn", "PDF draft") : ""}</td>`,
      type: () => `<td>${chip(u.type === "Rent" ? "info" : u.type === "Resale" ? "acc" : "ok", u.type)}</td>`,
      location: () => `<td>${u.location ? `<a class="lnk" href="https://maps.google.com/?q=${encodeURIComponent(u.location)}" target="_blank" rel="noopener">${I("pin")}خريطة</a>` : "—"}</td>`,
      start: () => `<td>${A.fmtDate(u.start)}</td>`, end: () => `<td>${A.fmtDate(u.end)}</td>`, escalation: () => `<td class="n">${u.escalation || 0}%</td>`,
      contractYears: () => `<td class="n">${u.contractYears || "—"} سنين</td>`, delivery: () => `<td>${u.delivery && /\d{4}-/.test(u.delivery) ? A.fmtDate(u.delivery) : esc(u.delivery || "—")}</td>`
    };
    if (map[k]) return map[k]();
    if (["space", "pricePerSqm", "salePerSqm", "leasePerSqm", "parking", "serviceUsd"].includes(k)) return `<td class="n">${A.num(u[k])}</td>`;
    if (["photos", "link", "agreement"].includes(k)) return `<td>${u[k] ? `<span class="lnk">${I("image")}${esc(u[k])}</span>` : "—"}</td>`;
    return `<td>${esc(u[k] == null || u[k] === "" ? "—" : u[k])}</td>`;
  }
  function listUnits() {
    const st = S(), t = ui("invType") || "all", tab = ui("invTab"), f = ui("invF") || {};
    let list = st.units.filter((u) => !u.archived && (canEdit() || u.pdf === "confirmed")).filter((u) => t === "rented" ? u.status !== "available" || u.alsoStatus === "closed" : t === "all" ? A.isAvailable(u) : A.availableAs(u, t)); // Q15: sales see a unit only after Manar confirms it
    if (tab != null && st.areaTabs[tab]) list = list.filter((u) => A.unitTab(u) === tab);
    if (f.area) list = list.filter((u) => u.area === f.area);
    if (f.cond) list = list.filter((u) => u.condition === f.cond);
    if (f.agent) list = list.filter((u) => u.agent === f.agent);
    if (f.stale) list = list.filter(A.stale);
    if (f.div) list = list.filter((u) => u.divisible);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter((u) => JSON.stringify(u).toLowerCase().includes(q)); }
    return list;
  }

  V.inventory = {
    sub: () => "Rent · Resale · Income في قايمة واحدة بفلتر، وتابات المساحات تحت زي الشيت",
    render() {
      const st = S(), r = A.role, t = ui("invType") || "all", tab = ui("invTab"), f = ui("invF") || {}, mode = ui("invMode") || "table", list = listUnits();
      if (r !== "admin" && !["inventory", "resale"].includes(r) && st.invAccess[A.me()] === "none") return U.empty("منار لسه مفعّلتش ليك صلاحية على الانفنتوري", "lock");
      const avail = st.units.filter(A.isAvailable), cols = COLS[t] || COLS.all, as = (x) => st.units.filter((u) => A.availableAs(u, x)).length;
      const types = [["all", "الكل", avail.length], ["Rent", "Rent", as("Rent")], ["Resale", "Resale", as("Resale")], ["Income", "Income", as("Income")], ["rented", "Rented / Sold", st.units.filter((u) => u.status !== "available" || u.alsoStatus === "closed").length]];
      return `<div class="kpis">${U.kpi("وحدات متاحة", avail.length, "Rent · Resale · Income", "building")}${U.kpi("PDF مستني Confirm", st.units.filter((u) => u.pdf === "draft").length, "قبل ما يتنشر للسيلز", "file", "warn")}${U.kpi("محتاجة ابديت", st.units.filter(A.stale).length, "last update أكتر من شهر", "clock", "bad", "invStale")}${U.kpi("تنفع تتقسم", avail.filter((u) => u.divisible).length, "مساحات كبيرة", "layers", "ok")}</div>
        <div class="row">${U.tabs("invType", types, t)}<span class="spacer"></span>
          ${A.can("notactive") ? `<a class="btn ghost" href="#notactive">${I("layers")}Not Active Inventory</a>` : ""}${A.canDo("inventory", "import") ? `<button class="btn ghost" data-act="importNew">${I("upload")}استيراد Excel</button>` : ""}${A.canDo("inventory", "approve") ? `<button class="btn ghost" data-act="invReport">${I("file")}التقرير اليومي</button><button class="btn ghost" data-act="teamTask">${I("check")}مهمة للفريق</button>` : ""}${A.canDo("inventory", "approve") || A.role === "tl" ? `<button class="btn ghost" data-act="listReqs">${I("list")}طلبات الـ Lists</button>` : ""}${U.exportBtn("units", "الوحدات")}${A.canDo("inventory", "approve") ? `<button class="btn ghost" data-act="invAccess">${I("lock")}الصلاحيات</button>` : ""}${A.canDo("inventory", "create") || canEdit() ? `<button class="btn" data-act="unitNew">${I("plus")}وحدة جديدة</button>` : ""}</div>
        <div class="toolbar">
          <label class="search">${I("search")}<input id="iq" type="search" placeholder="دوّر بأي حاجة: مشروع، كود، مالك، رقم" value="${esc(f.q || "")}" data-change="invF" data-k="q"></label>
          <select id="if-a" data-change="invF" data-k="area" aria-label="Area">${opt("", "كل المناطق", f.area)}${st.areas.map((a) => opt(a, a, f.area)).join("")}</select>
          <select id="if-c" data-change="invF" data-k="cond" aria-label="Condition">${opt("", "كل التشطيبات", f.cond)}${["متشطب", "نص تشطيب", "Core & Shell"].map((c) => opt(c, c, f.cond)).join("")}</select>
          <select id="if-g" data-change="invF" data-k="agent" aria-label="Agent">${opt("", "كل الـ agents", f.agent)}${A.sales().map((s) => opt(s.id, s.name, f.agent)).join("")}</select>
          <label class="tog"><input type="checkbox" ${f.stale ? "checked" : ""} data-change="invF" data-k="stale"><span>محتاجة ابديت</span></label>
          <label class="tog"><input type="checkbox" ${f.div ? "checked" : ""} data-change="invF" data-k="div"><span>تنفع تتقسم</span></label>
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
    Rent: [["contact", "Contact", "text", 1], ["number", "Number", "tel", 1], ["pricePerSqm", "Price per sqm", "number", 1], ["maintenance", "Maintenance"], ["commission", "Commission"], ["photos", "Pic or info (صور · ترفع على السيستم)", "file"]],
    Resale: [["owner", "اسم الأونر", "text", 1], ["number", "الرقم", "tel", 1], ["pricePerSqm", "السعر للمتر", "number", 1], ["payment", "طريقة الدفع"], ["delivery", "Delivery date", "date"], ["maintenance", "صيانة"], ["commission", "Commission"], ["photos", "Pictures (صور · ترفع على السيستم)", "file"]],
    Income: [["name", "الاسم", "text", 1], ["number", "الرقم", "tel"], ["link", "اللينك"], ["salePerSqm", "Sale price per meter", "number", 1], ["leasePerSqm", "Lease price per meter", "number", 1], ["contractYears", "Contract duration (سنين)", "number"], ["start", "Start date", "date"], ["end", "End date", "date"], ["escalation", "Escalation rate %", "number"], ["payment", "Payment method"], ["serviceUsd", "Service charge / m (USD)", "number"], ["tenant", "Tenant name"], ["agreement", "Agreement (ملف · يترفع على السيستم)", "file"], ["commission", "Commission"], ["note", "Note"]]
  };
  A.ACT.unitNew = () => unitForm("Rent");
  function unitForm(type) {
    const st = S();
    A.openModal("وحدة جديدة", `<form data-form="unitNew" class="grid">
      ${field("Type", `<select name="type" id="un-type" data-change="unType">${["Rent", "Resale", "Income"].map((t) => opt(t, t, type)).join("")}</select>`, 1)}
      ${field("Project / اسم المبنى", `<input name="project" id="un-proj" required>`, 1)}
      ${field("Area", `<select name="area" id="un-area">${st.areas.map((a) => opt(a)).join("")}</select>`, 1)}
      ${field("Gross area (م)", `<input name="space" id="un-space" type="number" required data-input="unSpace">`, 1)}
      ${field("Condition / التشطيب", `<select name="condition" id="un-cond">${["متشطب", "نص تشطيب", "Core & Shell"].map((t) => opt(t)).join("")}</select>`, 1)}
      ${field("Floor", `<input name="floor" id="un-floor">`)}
      ${field("Build num", `<input name="building" id="un-bld">`, 1)}
      ${field("Parking slots", `<input name="parking" id="un-park" type="number" value="0">`)}
      ${field("Agent (السيلز اللي جاب الوحدة)", `<select name="agent" id="un-agent">${A.sales().map((s) => opt(s.id, s.name)).join("")}</select>`, 1)}
      ${field("تاب المساحة", `<select name="tab" id="un-tab">${opt("", "أوتوماتيك من المساحة")}${st.areaTabs.map((rg, i) => opt(i, rg.label)).join("")}</select>`)}
      ${field("Location (من الخريطة)", `<div class="row"><input name="location" id="un-loc" placeholder="30.02, 31.48"><button type="button" class="btn ghost sm" data-act="pickLoc">${I("pin")}اختار</button></div>`)}
      ${TYPE_FIELDS[type].map(([k, l, t, req]) => field(l, `<input name="${k}" id="un-${k}" type="${t || "text"}" ${t === "file" ? 'multiple accept="image/*,application/pdf"' : ""} ${req ? "required" : ""}>`, req)).join("")}
      ${field("اتستلمت إمتى (من المالك / الواتساب)", `<input name="receivedAt" id="un-recv" type="datetime-local" value="${new Date(A.NOW() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16)}">`)}
      ${field("تنفع تتقسم؟", `<select name="divisible" id="un-div">${opt("no", "لا")}${opt("yes", "اه")}</select>`)}
      ${field("أقل مساحة ممكن تتقسم لها", `<input name="minSplit" id="un-min" type="number" value="0">`)}
      <div class="row end wide"><span class="hint spacer">الكود التسلسلي والـ total price والـ PDF والـ slide بيتعملوا أوتوماتيك.</span><button class="btn">حفظ الوحدة</button></div></form>`);
  }
  A.CHANGE.unType = (v) => unitForm(v);
  A.CHANGE.unSpace = (v) => { const i = S().areaTabs.findIndex((r) => +v >= r.min && +v <= r.max), el = document.getElementById("un-tab"); if (el && i >= 0) el.value = String(i); };
  A.ACT.pickLoc = () => { const el = document.getElementById("un-loc"); el.value = `30.${(Math.random() * 9e4 + 1e4) | 0}, 31.${(Math.random() * 9e4 + 1e4) | 0}`; A.toast("في السيستم الحقيقي الخريطة بتفتح وتختار المكان"); };
  A.FORM.unitNew = (f) => {
    const st = S(), code = "U-" + st.unitSeq++, nums = ["space", "parking", "pricePerSqm", "salePerSqm", "leasePerSqm", "escalation", "contractYears", "serviceUsd", "minSplit"];
    const u = Object.assign({}, f, { code, divisible: f.divisible === "yes", tab: f.tab === "" ? null : +f.tab, status: "available", pdf: "draft", lastUpdate: A.today(), created: A.today(), enteredAt: A.nowIso(), receivedAt: f.receivedAt ? new Date(f.receivedAt).toISOString() : A.nowIso() });
    nums.forEach((k) => (u[k] = +f[k] || 0));
    st.units.unshift(u); A.audit("inventory", `${code} اتسجّلت (${u.project})`);
    A.notify(["marketing"], `Live Alert: وحدة جديدة ${code} (${u.project}) اتضافت للانفنتوري`);
    if (A.afterUnitNew) A.afterUnitNew(u); // a unit Marwa brought in from a Not Active sheet marks that row Done
    A.closeModal(); A.toast(`${code} اتسجّلت · الـ PDF والـ slide اتعملوا ومستنيين Confirm من منار`); A.render(); A.ACT.unitOpen({ code });
  };

  /* unit drawer */
  A.ACT.unitOpen = (d) => { ui("utab", "data"); A.openDrawer(() => unitDrawer(d.code)); };
  function unitDrawer(code) {
    const st = S(), u = st.units.find((x) => x.code === code); if (!u) return "";
    const ic = A.incomeCalc(u), r = A.role, edit = canEdit(), tab = ui("utab") || "data", tasks = st.tasks.filter((t) => t.unit === code);
    const chips = `${chip(u.type === "Rent" ? "info" : u.type === "Resale" ? "acc" : "ok", u.type)}${u.status !== "available" ? chip("bad", u.status === "sold" ? "Sold" : "Rented") : chip("ok", "متاحة")}${u.pdf === "draft" ? chip("warn", "PDF مستني Confirm") : chip("ok", "PDF منشور للسيلز")}${u.closeReq ? chip("warn", "مستنية تأكيد القفل") : ""}${u.also ? chip(u.alsoStatus === "closed" ? "bad" : "acc", u.alsoStatus === "closed" ? `${u.also} اتقفلت` : `متاحة كمان ${u.also}`) : ""}${u.divisible ? chip("info", `تتقسم · من ${A.num(u.minSplit)} م`) : ""}${A.stale(u) ? chip("bad", "محتاجة ابديت") : ""}`;
    let body = U.tabs("utab", [["data", "البيانات"], ["pdf", "PDF & slide"], ["tasks", "المهام", tasks.length], ["loc", "الموقع"]], tab);
    // Q16: after the Office Manager approves the deal, Manar confirms rent units and Randa resale & income units
    const closeType = ((S().deals.find((x) => x.id === u.closeReq) || {}).type) || u.type, closer = A.canDo("inventory", "approve") && (r === "admin" || (closeType === "Rent" ? r === "inventory" : r === "resale")) || (r === "resale" && closeType !== "Rent" && A.canDo("inventory", "edit"));
    if (tab === "data" && u.closeReq) body += note(`<b>Done Deal ${esc(u.closeReq)} اتوافق عليها.</b> الوحدة بتتقفل بعد تأكيد ${u.type === "Rent" ? "منار" : "رندا"}. ${closer ? `<button class="btn sm" data-act="unitCloseConfirm" data-code="${u.code}">${I("check")}أكّد القفل (${u.type === "Resale" || u.type === "Income" ? "Sold" : "Rented"})</button>` : ""}`, "warn");
    if (tab === "data") body += `${kv((COLS[u.type] || COLS.all).map(([k, l]) => [l, cell(u, k).replace(/^<td[^>]*>|<\/td>$/g, "")]))}${A.invExtras ? A.invExtras(u) : ""}
      ${u.type === "Income" ? note(`Monthly = Lease/m × Area = ${A.money(ic.monthly)} · Annual = ×12 = ${A.money(ic.annual)} · Yield = Annual ÷ Sale total = <b>${ic.yieldPct.toFixed(2)}%</b>`) : note(`Total price = السعر للمتر × المساحة = ${A.num(u.pricePerSqm)} × ${A.num(u.space)} = <b>${A.money(A.unitTotal(u))}</b>`)}
      ${edit ? `<div class="row"><button class="btn ghost" data-act="unitEdit" data-code="${u.code}">تعديل البيانات</button>${A.canDo("inventory", "delete") ? `<button class="btn ghost" data-act="unitArchive" data-code="${u.code}">${I("x")}أرشفة</button>` : ""}<button class="btn ghost" data-act="unitUpdate" data-code="${u.code}">${I("clock")}ابديت مع المالك النهارده</button>${u.status === "available" ? `<button class="btn ghost" data-act="unitClose" data-code="${u.code}">${I("handshake")}اتأجّرت / اتباعت</button>` : ""}</div>` : ""}`;
    if (tab === "pdf") body += `<div class="pdf-preview"><div class="slide"><div class="s-img u-${u.type}">${I("image")}</div><div class="s-txt"><span class="eyebrow">PLACES · ${esc(u.type)}</span><h3>${esc(u.project)}</h3><p>${esc(u.area)} · الدور ${esc(u.floor || "—")} · ${A.num(u.space)} م · ${esc(u.condition)}</p><b class="num">${A.money(A.unitTotal(u))}${u.type === "Rent" ? " / شهر" : ""}</b><small class="mono">${u.code}</small></div></div></div>
      ${note("الـ PDF والـ slide بيتعملوا أوتوماتيك لما كل الخانات المطلوبة تتملا، ومن الصور. محدش يقدر يعدّل عليهم. أي تعديل في بيانات الوحدة بيعمل الـ PDF من تاني ويستنى Confirm منار. والوحدة مابتظهرش للسيلز غير بعد الـ Confirm.")}
      ${u.pdf === "draft" && A.canDo("inventory", "approve") ? `<button class="btn" data-act="pdfConfirm" data-code="${u.code}">${I("check")}Confirm وانشره للسيلز</button>` : u.pdf === "draft" ? chip("warn", "مستني Confirm من منار") : chip("ok", "منشور للسيلز")}`;
    if (tab === "tasks") body += `${tasks.map((t) => `<div class="line-item"><span>${chip(t.status === "done" ? "ok" : t.status === "uploaded" ? "warn" : "", ({ photo: "تصوير", retouch: "Retouch", followup: "متابعة", toResale: "ابديت للبيع", marketing: "تسويق" })[t.kind])} ${A.who(t.to)} · ${A.fmtDate(t.due)}</span><span class="hint">${esc(t.status)}</span></div>`).join("") || `<p class="hint">مفيش مهام على الوحدة دي</p>`}
      ${edit ? `<div class="row"><button class="btn ghost" data-act="taskNew" data-kind="photo" data-code="${u.code}">${I("camera")}مهمة تصوير</button><button class="btn ghost" data-act="taskNew" data-kind="retouch" data-code="${u.code}">${I("image")}مهمة Retouch</button>${A.role !== "resale" && u.type === "Rent" ? `<button class="btn ghost" data-act="taskNew" data-kind="toResale" data-code="${u.code}">${I("send")}ابعتها لرندا (ابديت للبيع)</button>` : ""}</div>` : ""}`;
    if (tab === "loc") body += `<div class="map">${I("pin")}<b>${esc(u.project)}</b><small class="mono">${esc(u.location || "مفيش لوكيشن")}</small>${u.location ? `<a class="btn ghost sm" href="https://maps.google.com/?q=${encodeURIComponent(u.location)}" target="_blank" rel="noopener">افتح في Google Maps</a>` : ""}</div><p class="hint">في السيستم الحقيقي منار أو رندا بيفتحوا الخريطة ويختاروا اللوكيشن ويتسجّل.</p>`;
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
    const u = S().units.find((x) => x.code === d.code), F = [["project", "Project", "text"], ["space", "Gross area", "number"], ["floor", "Floor", "text"], ["building", "Build num", "text"], ["parking", "Parking", "number"], [u.type === "Income" ? "salePerSqm" : "pricePerSqm", u.type === "Income" ? "Sale price / m" : "Price per sqm", "number"], u.type === "Income" ? ["leasePerSqm", "Lease / m", "number"] : null, ["contact", "Contact / Owner", "text"], ["number", "Number", "tel"], ["minSplit", "أقل مساحة للتقسيم", "number"], ["alsoPricePerSqm", "سعر المتر في النوع التاني", "number"], ["photos", "ضيف صور (ترفع على السيستم)", "file"]].filter(Boolean);
    A.openModal(`تعديل ${u.code}`, `<form data-form="unitEdit" class="grid"><input type="hidden" name="code" value="${u.code}">${F.map(([k, l, t]) => field(l, t === "file" ? `<input name="${k}" id="ue-${k}" type="file" multiple accept="image/*">` : `<input name="${k}" id="ue-${k}" type="${t}" value="${esc(u[k] == null ? "" : u[k])}">`)).join("")}${field("Condition", `<select name="condition" id="ue-c">${["متشطب", "نص تشطيب", "Core & Shell"].map((x) => opt(x, x, u.condition)).join("")}</select>`)}${field("متاحة كمان كـ (نوع تاني)", `<select name="also" id="ue-also">${opt("", "لأ", u.also || "")}${["Rent", "Resale"].filter((x) => x !== u.type).map((x) => opt(x, x, u.also || "")).join("")}</select>`)}${field("تنفع تتقسم؟", `<select name="divisible" id="ue-dv">${opt("no", "لا", u.divisible ? "yes" : "no")}${opt("yes", "اه", u.divisible ? "yes" : "no")}</select>`)}<div class="row end wide"><span class="hint spacer">التعديل بيتسجّل في الـ Audit Log، والـ PDF بيتعمل تاني ومستني Confirm.</span><button class="btn">حفظ</button></div></form>`);
  };
  A.FORM.unitEdit = (f) => { const u = S().units.find((x) => x.code === f.code), ch = []; if (f.also !== undefined && f.also !== (u.also || "")) { u.alsoStatus = f.also ? "available" : ""; } Object.keys(f).forEach((k) => { if (k === "code" || (k === "photos" && !f[k])) return; if (k === "photos") f[k] = (u.photos ? u.photos + "، " : "") + f[k]; let v = ["space", "parking", "pricePerSqm", "salePerSqm", "leasePerSqm", "minSplit", "alsoPricePerSqm"].includes(k) ? +f[k] : k === "divisible" ? f[k] === "yes" : f[k]; if (String(u[k]) !== String(v)) { ch.push(`${k}: ${u[k]} ← ${v}`); u[k] = v; } }); if (ch.length) { u.pdf = "draft"; u.lastUpdate = A.today(); A.audit("inventory", `${u.code}: ${ch.join(" · ")}`); } A.closeModal(); A.toast(ch.length ? "اتحفظ · الـ PDF مستني Confirm تاني" : "مفيش تغيير"); A.render(); };
  A.ACT.unitArchive = (d) => { const u = S().units.find((x) => x.code === d.code); u.archived = true; A.audit("inventory", `${u.code} اتأرشفت`); A.closeDrawer(); A.toast(`${u.code} اتأرشفت`, () => { u.archived = false; }); A.render(); };

  /* Excel import with duplicate check */
  A.ACT.importNew = () => A.openModal("استيراد Excel (القالب الموحّد)", `${note("الأعمدة: project, space, floor, building, contact, number, pricePerSqm, type. السيستم بيكشف التكرار بالبيانات كاملة، والمكرر بيستنى قرار المانجر.")}
    <form data-form="importNew">${field("ارفع ملف Excel بالقالب الموحّد", `<input type="file" accept=".xlsx,.xls,.csv" data-change="imFile">`)}${field("الصفوف (CSV)", `<textarea name="csv" id="im-csv" style="min-height:160px">${S().importSample.map((r) => [r.project, r.space, r.floor, r.building, r.contact, r.number, r.pricePerSqm, r.type].join(",")).join("\n")}</textarea>`, 1)}
    <div class="row end"><span class="hint spacer">ارفع ملف Excel أو عدّل الصفوف التجريبية، والسيستم هيفحص التكرار.</span><button class="btn">${I("upload")}افحص وابعت للمراجعة</button></div></form>`);
  // the Excel file fills the rows box (header row skipped when it isn't data)
  A.CHANGE.imFile = (v, el) => { const f = el.files && el.files[0]; if (!f) return; U.readSheet(f).then((rows) => { const data = rows.filter((r) => /\d/.test(r[1] || "")); document.getElementById("im-csv").value = data.map((r) => r.slice(0, 8).join(",")).join("\n"); A.toast(`اتقرا ${data.length} صف من ${f.name}`); }).catch((e) => A.toast(e.message)); };
  A.FORM.importNew = (f) => {
    const st = S(), rows = f.csv.split(/\n/).map((x) => x.split(",").map((s) => s.trim())).filter((x) => x.length >= 8).map(([project, space, floor, building, contact, number, pricePerSqm, type]) => ({ project, space: +space, floor, building, contact, number, pricePerSqm: +pricePerSqm, type }));
    rows.forEach((rw) => { const d = st.units.find((u) => u.project === rw.project && +u.space === rw.space && String(u.floor) === String(rw.floor) && u.building === rw.building && A.normPhone(u.number) === A.normPhone(rw.number)); rw.dupe = d ? d.code : ""; rw.decision = d ? "skip" : "add"; });
    const job = { id: "IM-" + Date.now(), rows, status: "pending", by: A.me() }; st.imports.push(job);
    A.notify(["inventory"], `استيراد Excel فيه ${rows.length} صف · ${rows.filter((x) => x.dupe).length} متكرر محتاج قرارك`);
    A.closeModal(); A.ACT.importReview({ id: job.id }); A.render();
  };
  A.ACT.importReview = (d) => {
    const job = S().imports.find((x) => x.id === d.id), mgr = A.canDo("inventory", "approve");
    A.openModal(`مراجعة الاستيراد · ${job.rows.length} صف`, `${table(["المشروع", "المساحة", "الدور", "المبنى", "المالك", "التكرار", "القرار"], job.rows.map((rw, i) => `<tr><td>${esc(rw.project)}</td><td class="n">${rw.space}</td><td>${esc(rw.floor)}</td><td>${esc(rw.building)}</td><td>${esc(rw.contact)}</td><td>${rw.dupe ? chip("warn", "مكرر مع " + rw.dupe) : chip("ok", "جديد")}</td><td>${rw.dupe && mgr ? `<select data-change="imDec" data-id="${job.id}" data-i="${i}">${opt("skip", "استبعد المكرر", rw.decision)}${opt("merge", "ادمج (حدّث القديم)", rw.decision)}</select>` : esc(rw.decision === "add" ? "هيتضاف" : rw.decision)}</td></tr>`))}
      ${mgr ? `<div class="row end"><button class="btn" data-act="importApprove" data-id="${job.id}">وافق ونفّذ</button></div>` : note("مستني موافقة منار (المانجر) على المكرر.")}`);
  };
  A.CHANGE.imDec = (v, el) => { S().imports.find((x) => x.id === el.dataset.id).rows[+el.dataset.i].decision = v; };
  A.ACT.importApprove = (d) => {
    const st = S(), job = st.imports.find((x) => x.id === d.id); let add = 0, merge = 0;
    job.rows.forEach((rw) => {
      if (rw.decision === "add") { st.units.unshift(Object.assign({ code: "U-" + st.unitSeq++, area: st.areas[0], condition: "متشطب", status: "available", pdf: "draft", lastUpdate: A.today(), created: A.today(), agent: "s1", parking: 0, divisible: false, minSplit: 0, tab: null }, rw)); add++; }
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
