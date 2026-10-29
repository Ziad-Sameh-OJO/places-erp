/* M-03 · Not Active Inventory: uploaded sheets (e.g. CFC) merged without duplicates, numbers checked against the main inventory,
   Manar hands rows to Marwa as a task, Marwa classifies each number (No Answer / Not True + feedback / Done → a new unit). */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const STATUS = ["No Answer", "Not True", "Done"], LV = { "No Answer": "warn", "Not True": "bad", Done: "ok" };
  const MARWA = "u10";
  const isManar = () => A.canDo("notactive", "approve"); // the sheet owner: assigns rows and decides numbers already in the inventory
  const isMarwa = () => A.me() === MARWA;
  const norm = (n) => String(n || "").replace(/\D/g, "").replace(/^20/, "0");
  // a number already in the main inventory (any unit's owner / contact number) is flagged for Manar to decide its status
  const inMain = (num) => { const n = norm(num); return n ? S().units.find((u) => norm(u.number) === n) : null; };
  const sheetOf = () => { const st = S(); return st.naSheets.find((x) => x.id === ui("naSheet")) || st.naSheets[0]; };

  V.notactive = {
    sub: () => "شيتات بتترفع Excel · دمج من غير تكرار · مروة بتصنّف كل رقم · Done بيدخّل وحدة جديدة",
    render() {
      const st = S(), sh = sheetOf(); if (!sh) return U.empty("مفيش شيتات لسه", "layers");
      const tab = ui("naTab") || "all", mine = isMarwa() && !isManar();
      let rows = sh.rows.filter((r) => !mine || r.to === MARWA);
      const count = (s) => rows.filter((r) => r.status === s).length;
      const list = tab === "all" ? rows : rows.filter((r) => r.status === tab), pick = ui("naPick") || [];
      const tabs = U.tabs("naTab", [["all", "All Sheet", rows.length], ...STATUS.map((s) => [s, s, count(s)])], tab);
      return `${mine ? note("دي الأرقام اللي منار بعتتهالك. كلّمي كل رقم وصنّفيه: No Answer، أو Not True (ولازم تكتبي السبب)، أو Done (ودخّلي بيانات الوحدة والصور).") : note("منار مسؤولة عن الشيتات دي. أي شيت جديد بيتدمج مع الموجود من غير تكرار، وأي رقم موجود في الانفنتوري الأصلي بيجيلها Alarm تحدد حالته.")}
        <div class="row">${U.seg("naSheet", st.naSheets.map((x) => [x.id, x.name, "layers"]), sh.id)}<span class="spacer"></span>
          ${A.canDo("notactive", "import") ? `<label class="btn ghost">${I("upload")}ارفع / ادمج شيت (Excel)<input type="file" accept=".csv,.xlsx,.xls" data-change="naUpload" hidden></label><button class="btn ghost" data-act="naSample">${I("layers")}جرّب: ادمج شيت CFC تاني</button>` : ""}</div>
        <div class="kpis">${U.kpi("كل الشيت", rows.length, sh.name, "layers")}${U.kpi("مستني تصنيف", rows.filter((r) => !r.status).length, mine ? "عندك" : "مع مروة أو لسه", "clock", "warn")}${U.kpi("Done", count("Done"), "وحدات جديدة", "check", "ok")}${U.kpi("موجود في الانفنتوري", rows.filter((r) => r.dup && !r.dupSeen).length, "مستني قرار منار", "alert", "bad")}</div>
        <div class="row">${tabs}<span class="spacer"></span>${isManar() ? `<label class="field inline"><span>منع التكرار بخانة</span><select data-change="naKey">${sh.cols.map(([k, l]) => opt(k, l, sh.key)).join("")}</select></label>` : ""}</div>
        ${isManar() && pick.length ? `<div class="note">${I("send")}<span class="spacer">${pick.length} صف متحدد</span><button class="btn sm" data-act="naAssign">ابعتهم Task لمروة</button><button class="btn ghost sm" data-act="naPickClear">إلغاء</button></div>` : ""}
        ${table([...(isManar() ? [`<input type="checkbox" data-change="naPickAll" aria-label="حدد الكل">`] : []), ...sh.cols.map(([, l]) => l), "الحالة", "Feedback", "مع مين", ""], list.map((r) => `<tr class="${pick.includes(r.id) ? "selected" : ""}">${isManar() ? `<td class="pick"><input type="checkbox" class="na-pick" data-id="${r.id}" data-change="naPick" ${pick.includes(r.id) ? "checked" : ""} aria-label="حدد"></td>` : ""}${sh.cols.map(([k]) => `<td>${esc(String(r.d[k] || "—"))}</td>`).join("")}<td>${r.status ? chip(LV[r.status], r.status) : chip("", "لسه")}${r.dup ? `<span class="sub">${chip("bad", "موجود في الانفنتوري " + r.dup)}</span>` : ""}${r.unit ? `<span class="sub mono">${esc(r.unit)}</span>` : ""}</td><td class="wrap">${esc(r.feedback || "")}</td><td>${r.to ? A.who(r.to) : "—"}</td><td>${actions(sh, r)}</td></tr>`))}
        <p class="hint">الخانات دي تجريبية لحد ما الكلاينت يبعت خانات شيت الـ CFC.</p>`;
    }
  };
  function actions(sh, r) {
    if (r.dup && !r.dupSeen && isManar()) return `<select data-change="naDupSet" data-s="${sh.id}" data-id="${r.id}" aria-label="حالة الرقم">${opt("", "حددي الحالة…")}${STATUS.map((s) => opt(s)).join("")}</select>`;
    if (r.status === "Done" || !(isMarwa() && r.to === MARWA) && !isManar()) return "";
    return `<div class="row">${STATUS.map((s) => `<button class="btn ${s === "Done" ? "" : "ghost"} sm" data-act="naSet" data-s="${sh.id}" data-id="${r.id}" data-v="${s}">${s}</button>`).join("")}</div>`;
  }
  const rowOf = (d) => S().naSheets.find((x) => x.id === d.s).rows.find((x) => x.id === d.id);
  A.ACT.naSheet = (d) => { ui("naSheet", d.v); ui("naPick", []); A.render(); };
  A.ACT.naTab = (d) => { ui("naTab", d.v); A.render(); };
  A.CHANGE.naKey = (v) => { sheetOf().key = v; A.toast("خانة منع التكرار اتغيّرت"); };
  A.CHANGE.naPick = (v, el) => { const p = (A.ui.naPick = A.ui.naPick || []), i = p.indexOf(el.dataset.id); if (v && i < 0) p.push(el.dataset.id); if (!v && i >= 0) p.splice(i, 1); A.render(); };
  A.CHANGE.naPickAll = (v) => { A.ui.naPick = v ? [...document.querySelectorAll(".na-pick")].map((x) => x.dataset.id) : []; A.render(); };
  A.ACT.naPickClear = () => { A.ui.naPick = []; A.render(); };
  A.ACT.naAssign = () => { const sh = sheetOf(), ids = ui("naPick") || []; sh.rows.filter((r) => ids.includes(r.id)).forEach((r) => (r.to = MARWA)); A.audit("inventory", `منار بعتت ${ids.length} صف من ${sh.name} Task لمروة`); A.notify(["inventory_staff"], `منار بعتتلك ${ids.length} رقم من شيت ${sh.name} تصنّفيهم`); ui("naPick", []); A.toast(`اتبعت ${ids.length} صف لمروة`); A.render(); };
  A.CHANGE.naDupSet = (v, el) => { if (!v) return; const r = rowOf(el.dataset); r.status = v; r.dupSeen = true; A.audit("inventory", `منار حددت حالة ${r.d.number} (موجود في الانفنتوري ${r.dup}): ${v}`); A.toast("اتحددت الحالة · والصف فاضل في الشيت"); A.render(); };
  A.ACT.naSet = (d) => {
    const r = rowOf(d);
    if (d.v === "No Answer") { r.status = "No Answer"; A.render(); return; }
    if (d.v === "Not True") return A.openModal("Not True · لازم Feedback", `<form data-form="naNotTrue" class="grid"><input type="hidden" name="s" value="${d.s}"><input type="hidden" name="id" value="${d.id}">${field("السبب", `<textarea name="fb" required placeholder="مثلاً: مش صاحب الوحدة"></textarea>`, 1, 1)}<div class="row end wide"><button class="btn">احفظ</button></div></form>`);
    // Done = she got a new unit from this number: the main inventory's unit form opens, prefilled from the row
    A.ui.naRow = { s: d.s, id: d.id }; A.ACT.unitNew();
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set("un-proj", r.d.project || r.d.unit); set("un-space", r.d.space); set("un-area", r.d.area); set("un-contact", r.d.owner); set("un-number", r.d.number);
  };
  A.FORM.naNotTrue = (f) => { const r = rowOf(f); r.status = "Not True"; r.feedback = f.fb; A.closeModal(); A.toast("اتسجّل Not True بالـ Feedback"); A.render(); };
  // called by the inventory module right after a unit is saved
  A.afterUnitNew = (u) => {
    const ref = A.ui.naRow; if (!ref) return; A.ui.naRow = null;
    const sh = S().naSheets.find((x) => x.id === ref.s), r = sh.rows.find((x) => x.id === ref.id);
    r.status = "Done"; r.unit = u.code; A.audit("inventory", `${sh.name}: الرقم ${r.d.number} بقى Done · وحدة جديدة ${u.code}`); A.notify(["inventory"], `مروة جابت وحدة جديدة ${u.code} من شيت ${sh.name} · تتضاف للانفنتوري`);
  };

  // merge: rows whose dedupe column already exists are skipped, the rest are added and checked against the main inventory
  function merge(sh, incoming, file) {
    const have = new Set(sh.rows.map((r) => String(r.d[sh.key] || "").trim()));
    let added = 0, skipped = 0, dups = 0;
    incoming.forEach((d) => { const k = String(d[sh.key] || "").trim(); if (!k || have.has(k)) { skipped++; return; } have.add(k); const u = inMain(d.number); sh.rows.push({ id: "NA-" + Date.now().toString(36) + added, d, status: "", feedback: "", to: "", dup: u ? u.code : "" }); added++; if (u) dups++; });
    if (dups) A.notify(["inventory"], `${dups} رقم في شيت ${sh.name} موجود في الانفنتوري الأصلي · حددي حالتهم`);
    A.audit("inventory", `${file}: اتضاف ${added} صف لـ ${sh.name}، واتساب ${skipped} مكرر (بخانة ${(sh.cols.find((c) => c[0] === sh.key) || [, sh.key])[1]})`);
    A.toast(`اتضاف ${added} صف · اتساب ${skipped} مكرر${dups ? ` · ${dups} موجود في الانفنتوري` : ""}`); A.render();
  }
  A.ACT.naSample = () => { const sh = sheetOf(), base = sh.rows.slice(0, 3).map((r) => Object.assign({}, r.d)); merge(sh, base.concat([{ unit: "C-210", owner: "أ. وائل", number: "01055501210", area: "التجمع الخامس", space: 140, note: "مكتب" }, { unit: "C-211", owner: "م. دينا", number: "01000000101", area: "التجمع الخامس", space: 95, note: "" }]), "شيت CFC تجريبي"); };
  A.CHANGE.naUpload = (v, el) => {
    const file = el.files && el.files[0], sh = sheetOf(); if (!file) return;
    U.readSheet(file).then((lines) => { const hdr = lines.shift() || []; const idx = sh.cols.map(([k, l]) => hdr.findIndex((h) => h === k || h === l)); if (idx.every((i) => i < 0)) { A.toast("أسامي الأعمدة في الملف مش زي خانات الشيت"); return; } merge(sh, lines.map((c) => Object.fromEntries(sh.cols.map(([k], i) => [k, idx[i] >= 0 ? c[idx[i]] : ""]))), file.name); }).catch((e) => A.toast(e.message));
  };
})();
