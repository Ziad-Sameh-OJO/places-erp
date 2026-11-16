/* M-03 · Not Active Inventory: files (sheets) grouped in folders, each named when it's created from the system. A sheet is uploaded
   straight into the file; every row comes in, and rows that repeat a value in the chosen columns are flagged and can be filtered.
   Numbers are checked against the main inventory, Manar hands rows to Marwa as a task, Marwa classifies each number
   (No Answer / Not True + feedback / Done → a new unit). */
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
  const sheetOf = () => S().naSheets.find((x) => x.id === ui("naSheet")) || null; // none open → the files view
  // whoever has access to inventory management creates files and uploads sheets into them
  const canFile = () => A.canDo("notactive", "import") || A.canDo("inventory", "edit") || S().invAccess[A.me()] === "edit";
  // منع التكرار: Manar picks the column(s) when she uploads. A row is a repeat only when ALL the chosen columns match another row,
  // so the same owner with another number or another unit is never taken for a repeat. Default: the phone-number column only.
  const PHONE_COL = /number|phone|mobile|موبايل|تليفون|تلفون|^الرقم$|^رقم$|رقم (الموبايل|التليفون|المالك)/i;
  const defaultDupCols = (sh) => { const byName = sh.cols.find(([k, l]) => PHONE_COL.test(k) || PHONE_COL.test(l)); if (byName) return [byName[0]];
    const byValue = sh.cols.find(([k]) => { const v = sh.rows.map((r) => norm(r.d[k])).filter(Boolean); return v.length && v.filter((x) => x.length >= 10).length / v.length > 0.7; });
    return byValue ? [byValue[0]] : sh.cols.slice(0, 1).map(([k]) => k); };
  const dupColsOf = (sh) => sh.dupCols || defaultDupCols(sh);
  const cellKey = (k, v) => { const t = String(v == null ? "" : v).trim(); if (!t) return ""; const n = norm(t); return n.length >= 7 && n.length >= t.replace(/\s/g, "").length - 2 ? "#" + n : t.toLowerCase().replace(/\s+/g, " "); }; // phone-like values compare by digits
  const rowKey = (d, cols) => { const parts = cols.map((k) => cellKey(k, d[k])); return parts.length && parts.every(Boolean) ? parts.join("\u0001") : ""; };
  // row id → the other rows with the same value in every chosen column
  function dupsOf(sh, cols) {
    cols = cols || dupColsOf(sh); const by = {}, out = {};
    sh.rows.forEach((r) => { const k = rowKey(r.d, cols); if (k) (by[k] = by[k] || []).push(r.id); });
    Object.values(by).filter((ids) => ids.length > 1).forEach((ids) => ids.forEach((id) => (out[id] = ids.filter((x) => x !== id))));
    return out;
  }
  const colLabel = (sh, k) => (sh.cols.find((c) => c[0] === k) || [k, k])[1];

  V.notactive = {
    sub: () => "ملفات وفولدرات · كل ملف بيتسمّى وهو بيتعمل · الشيت بيترفع جوه الملف والتكرار بيظهر ويتفلتر · مروة بتصنّف كل رقم · Done بيدخّل وحدة جديدة",
    render() { return sheetOf() ? sheetView(sheetOf()) : filesView(); }
  };
  // level 1: the files, grouped by folder
  function filesView() {
    const st = S(), mine = isMarwa() && !isManar(), q = (ui("naQ") || "").toLowerCase();
    const files = st.naSheets.filter((sh) => (!mine || sh.rows.some((r) => r.to === MARWA)) && (!q || (sh.name + " " + (sh.folder || "")).toLowerCase().includes(q)));
    const folders = [...new Set(files.map((sh) => sh.folder || ""))].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b, "ar")));
    const card = (sh) => { const d = Object.keys(dupsOf(sh)).length, wait = sh.rows.filter((r) => !r.status && (!mine || r.to === MARWA)).length;
      return `<article class="ucard" data-act="naOpen" data-id="${esc(sh.id)}"><div class="u-img na-file">${I("layers")}<span class="mono">${sh.rows.length} صف</span>${d ? chip("bad", `${d} مكرر`) : ""}</div><div class="u-body"><b>${esc(sh.name)}</b><small>${sh.created ? `اتعمل ${A.fmtDate(sh.created)}${sh.by ? " · " + esc(A.person(sh.by)) : ""}` : "شيت قديم"}</small><div class="row">${sh.rows.length ? chip(wait ? "warn" : "ok", wait ? `${wait} مستني تصنيف` : "كله اتصنّف") : chip("", "فاضي · ارفع شيت")}${sh.rows.filter((r) => r.dup && !r.dupSeen).length ? chip("bad", "في الانفنتوري") : ""}</div></div></article>`; };
    return `${note(mine ? "دي الملفات اللي فيها أرقام منار بعتتهالك. افتحي الملف وصنّفي كل رقم." : "كل شيت Not Active ليه ملف باسمه، والملفات بتتجمّع في فولدرات. اعمل ملف جديد وسمّيه، وارفع الشيت جوّاه على طول، وأي تكرار في الداتا بيظهر وتقدر تفلتره.")}
      <div class="toolbar"><label class="search">${I("search")}<input id="na-q" type="search" placeholder="دوّر باسم الملف أو الفولدر" value="${esc(ui("naQ") || "")}" data-change="naQ"></label><span class="spacer"></span>${canFile() ? `<button class="btn" data-act="naNew">${I("plus")}ملف جديد</button>` : ""}</div>
      ${files.length ? folders.map((f) => `<section class="na-folder"><h3 class="na-folder-h">${I("folder")}${esc(f || "من غير فولدر")} <span class="tab-n">${files.filter((sh) => (sh.folder || "") === f).length}</span></h3><div class="drive">${files.filter((sh) => (sh.folder || "") === f).map(card).join("")}</div></section>`).join("")
        : U.empty(q ? "مفيش ملف بالاسم ده" : "مفيش ملفات لسه · اعمل ملف جديد وارفع الشيت جوّاه", "layers")}`;
  }
  // level 2: one file
  function sheetView(sh) {
    const tab = ui("naTab") || "all", mine = isMarwa() && !isManar(), dF = ui("naDupF") || "", D = dupsOf(sh), dcols = dupColsOf(sh);
    let rows = sh.rows.filter((r) => !mine || r.to === MARWA);
    const count = (s) => rows.filter((r) => r.status === s).length, dupN = rows.filter((r) => D[r.id]).length;
    let list = tab === "all" ? rows : rows.filter((r) => r.status === tab);
    if (dF === "any") list = list.filter((r) => D[r.id]); else if (dF === "none") list = list.filter((r) => !D[r.id]);
    const pick = ui("naPick") || [];
    const tabs = U.tabs("naTab", [["all", "All Sheet", rows.length], ...STATUS.map((s) => [s, s, count(s)])], tab);
    const byId = Object.fromEntries(sh.rows.map((r) => [r.id, r]));
    const dupNote = (r) => (D[r.id] ? chip("bad", `مكرر (${esc(dcols.map((k) => colLabel(sh, k)).join(" + "))}) مع ${D[r.id].length} صف`) : "");
    const cellOf = (r, k) => { const hit = D[r.id] && dcols.includes(k); return `<td${hit ? ` class="na-dup" title="نفس القيمة في: ${esc(D[r.id].map((id) => byId[id] && (byId[id].d[sh.cols[0][0]] || id)).join("، "))}"` : ""}>${esc(String(r.d[k] == null || r.d[k] === "" ? "—" : r.d[k]))}</td>`; };
    return `<nav class="na-crumb"><button class="lnk" data-act="naBack">${I("folder")}كل الملفات</button><span>‹</span>${sh.folder ? `<span>${esc(sh.folder)}</span><span>‹</span>` : ""}<b>${esc(sh.name)}</b>${canFile() ? `<button class="btn ghost sm" data-act="naRename">تغيير الاسم / الفولدر</button>` : ""}</nav>
      ${mine ? note("دي الأرقام اللي منار بعتتهالك. كلّمي كل رقم وصنّفيه: No Answer، أو Not True (ولازم تكتبي السبب)، أو Done (ودخّلي بيانات الوحدة والصور).") : note("ارفع الشيت جوه الملف ده على طول: كل الصفوف بتدخل، واللي فيها قيمة متكررة في الخانات اللي تحت بتتعلّم بالأحمر وتقدر تفلترها. وأي رقم موجود في الانفنتوري الأصلي بيجيلك Alarm تحدد حالته.")}
      ${canFile() ? `<div class="row"><label class="btn">${I("upload")}${sh.rows.length ? "ارفع شيت تاني في الملف (Excel / CSV)" : "ارفع الشيت (Excel / CSV)"}<input type="file" accept=".csv,.xlsx,.xls" data-change="naUpload" hidden></label>${sh.rows.length ? `<button class="btn ghost" data-act="naSample">${I("layers")}جرّب: ارفع شيت فيه تكرار</button>` : ""}<span class="spacer"></span></div>` : ""}
      ${sh.rows.length ? `<div class="kpis">${U.kpi("كل الشيت", rows.length, sh.name, "layers")}${U.kpi("مستني تصنيف", rows.filter((r) => !r.status).length, mine ? "عندك" : "مع مروة أو لسه", "clock", "warn")}${U.kpi("صفوف مكررة", dupN, "بـ " + (dcols.map((k) => colLabel(sh, k)).join(" + ") || "—"), "alert", "bad", "naDupOnly")}${U.kpi("موجود في الانفنتوري", rows.filter((r) => r.dup && !r.dupSeen).length, "مستني قرار منار", "alert", "bad")}</div>
      <div class="row">${tabs}<span class="spacer"></span><label class="field inline"><span>التكرار</span><select id="na-dupf" data-change="naDupF">${opt("", "كل الصفوف", dF)}${opt("any", `المكرر بس (${dupN})`, dF)}${opt("none", "من غير تكرار", dF)}</select></label></div>
      <div class="na-cols"><span class="hint">منع التكرار بـ:</span><b>${esc(dcols.map((k) => colLabel(sh, k)).join(" + ") || "—")}</b><span class="hint">· الصف بيتحسب مكرر لما ${dcols.length > 1 ? "الخانات دي كلها تبقى" : "الخانة دي تبقى"} زي صف تاني</span>${canFile() ? `<button class="btn ghost sm" data-act="naDupPick">غيّر خانة منع التكرار</button>` : ""}</div>
      ${isManar() && pick.length ? `<div class="note">${I("send")}<span class="spacer">${pick.length} صف متحدد</span><button class="btn sm" data-act="naAssign">ابعتهم Task لمروة</button><button class="btn ghost sm" data-act="naPickClear">إلغاء</button></div>` : ""}
      ${table([...(isManar() ? [`<input type="checkbox" data-change="naPickAll" aria-label="حدد الكل">`] : []), ...sh.cols.map(([, l]) => l), "الحالة", "Feedback", "مع مين", ""], list.map((r) => `<tr class="${pick.includes(r.id) ? "selected" : ""}">${isManar() ? `<td class="pick"><input type="checkbox" class="na-pick" data-id="${r.id}" data-change="naPick" ${pick.includes(r.id) ? "checked" : ""} aria-label="حدد"></td>` : ""}${sh.cols.map(([k]) => cellOf(r, k)).join("")}<td>${r.status ? chip(LV[r.status], r.status) : chip("", "لسه")}${dupNote(r) ? `<span class="sub">${dupNote(r)}</span>` : ""}${r.dup ? `<span class="sub">${chip("bad", "موجود في الانفنتوري " + r.dup)}</span>` : ""}${r.unit ? `<span class="sub mono">${esc(r.unit)}</span>` : ""}</td><td class="wrap">${esc(r.feedback || "")}</td><td>${r.to ? A.who(r.to) : "—"}</td><td>${actions(sh, r)}</td></tr>`))}`
      : `<div class="ufolder empty">${I("upload")}<b>الملف فاضي</b><span class="hint">${canFile() ? "ارفع الشيت (Excel أو CSV) وأعمدته هتبقى أعمدة الملف." : "لسه محدش رفع شيت في الملف ده."}</span></div>`}`;
  }
  function actions(sh, r) {
    if (r.dup && !r.dupSeen && isManar()) return `<select data-change="naDupSet" data-s="${sh.id}" data-id="${r.id}" aria-label="حالة الرقم">${opt("", "حددي الحالة…")}${STATUS.map((s) => opt(s)).join("")}</select>`;
    if (r.status === "Done" || !(isMarwa() && r.to === MARWA) && !isManar()) return "";
    return `<div class="row">${STATUS.map((s) => `<button class="btn ${s === "Done" ? "" : "ghost"} sm" data-act="naSet" data-s="${sh.id}" data-id="${r.id}" data-v="${s}">${s}</button>`).join("")}</div>`;
  }
  const rowOf = (d) => S().naSheets.find((x) => x.id === d.s).rows.find((x) => x.id === d.id);
  const openFile = (id) => { ui("naSheet", id); ui("naPick", []); ui("naTab", "all"); ui("naDupF", ""); A.render(); };
  A.ACT.naOpen = (d) => openFile(d.id);
  A.ACT.naSheet = (d) => openFile(d.v);
  A.ACT.naBack = () => { ui("naSheet", null); A.render(); };
  A.ACT.naTab = (d) => { ui("naTab", d.v); A.render(); };
  A.CHANGE.naQ = (v) => { ui("naQ", v); A.render(); const el = document.getElementById("na-q"); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } };
  A.CHANGE.naDupF = (v) => { ui("naDupF", v); A.render(); };
  A.ACT.naDupOnly = () => { ui("naDupF", "any"); ui("naTab", "all"); A.render(); };
  // choose the dedupe column(s) for a file already uploaded (the same chooser the upload shows), with the count before saving
  const dupChooser = (sh, rows, sel, extra) => { const tmp = { cols: sh.cols, rows }, n = Object.keys(dupsOf(tmp, sel)).length;
    return `<div class="na-cols">${sh.cols.map(([k, l]) => `<label class="tog"><input type="checkbox" ${sel.includes(k) ? "checked" : ""} data-change="naPickCol" data-k="${esc(k)}"><span>${esc(l)}</span></label>`).join("")}</div>
      ${U.note(sel.length ? `بالاختيار ده: <b>${n}</b> صف هيتعلّم مكرر (${esc(sel.map((k) => colLabel(sh, k)).join(" + "))}${sel.length > 1 ? " · لازم كلهم يتطابقوا" : ""}). مالك بنفس الاسم وعنده رقم أو وحدة تانية مش بيتحسب مكرر غير لو اخترت الاسم لوحده.` : "اختار خانة واحدة على الأقل.", sel.length ? "" : "warn")}${extra || ""}`; };
  A.ACT.naDupPick = () => { const sh = sheetOf(); A.ui.naDupDraft = { sel: dupColsOf(sh).slice(), mode: "edit" }; dupModal(); };
  A.CHANGE.naPickCol = (v, el) => { const d = A.ui.naDupDraft; if (!d) return; const i = d.sel.indexOf(el.dataset.k); if (v && i < 0) d.sel.push(el.dataset.k); if (!v && i >= 0) d.sel.splice(i, 1); const sh = sheetOf(); d.sel = sh.cols.map(([k]) => k).filter((k) => d.sel.includes(k)); dupModal(); };
  A.CHANGE.naSkipDup = (v) => { if (A.ui.naDupDraft) A.ui.naDupDraft.skip = v === "skip"; };
  function dupModal() {
    const sh = sheetOf(), d = A.ui.naDupDraft; if (!sh || !d) return;
    if (d.mode === "edit") return A.openModal("خانة منع التكرار", `${dupChooser(sh, sh.rows, d.sel)}<div class="row end"><button class="btn" data-act="naDupSave" ${d.sel.length ? "" : "disabled"}>حفظ</button></div>`);
    const incoming = d.rows.map((x, i) => ({ id: "in-" + i, d: x })), all = sh.rows.concat(incoming), D = dupsOf({ cols: sh.cols, rows: all }, d.sel), inDup = incoming.filter((r) => D[r.id]).length, seen = new Set(sh.rows.map((r) => rowKey(r.d, d.sel)).filter(Boolean)), wouldSkip = incoming.filter((r) => { const k = rowKey(r.d, d.sel); if (!k) return false; if (seen.has(k)) return true; seen.add(k); return false; }).length;
    A.openModal(`رفع «${esc(d.file)}» في ${esc(sh.name)}`, `${U.note(`الشيت فيه <b>${incoming.length}</b> صف. اختاري خانة منع التكرار قبل ما الصفوف تدخل.`)}
      ${dupChooser(sh, all, d.sel, `<p class="hint">منهم <b>${inDup}</b> صف جديد متعلّم مكرر مع الموجود أو مع بعض · ولو اخترتي «متدخلش» هيتساب <b>${wouldSkip}</b> بس (أول صف من كل تكرار بيدخل).</p>`)}
      <div class="row"><label class="field inline"><span>الصفوف المكررة</span><select data-change="naSkipDup" id="na-skip">${opt("mark", "تدخل ومتعلّمة بالأحمر (تقدري تفلتريها)", d.skip ? "skip" : "mark")}${opt("skip", "متدخلش (بتتساب)", d.skip ? "skip" : "mark")}</select></label><span class="spacer"></span><button class="btn" data-act="naUpGo" ${d.sel.length ? "" : "disabled"}>${I("upload")}ارفع الصفوف</button></div>`);
  }
  A.ACT.naDupSave = () => { const sh = sheetOf(), d = A.ui.naDupDraft; if (!d || !d.sel.length) return; sh.dupCols = d.sel.slice(); A.ui.naDupDraft = null; A.audit("inventory", `${sh.name}: منع التكرار بقى بـ ${sh.dupCols.map((k) => colLabel(sh, k)).join(" + ")}`); A.save(); A.closeModal(); A.render(); };
  A.ACT.naUpGo = () => { const sh = sheetOf(), d = A.ui.naDupDraft; if (!d || !d.sel.length) return; sh.dupCols = d.sel.slice(); A.ui.naDupDraft = null; A.closeModal(); merge(sh, d.rows, d.file, d.skip); };

  /* a new file: named (and optionally put in a folder) when it's created, the sheet can be uploaded in the same step */
  const folderList = () => [...new Set(S().naSheets.map((x) => x.folder).filter(Boolean))];
  const fileForm = (sh) => `<form data-form="${sh ? "naRename" : "naNew"}" class="grid">
      ${field("اسم الملف", `<input name="name" id="na-name" required maxlength="60" placeholder="مثلاً: CFC · نوفمبر" value="${esc(sh ? sh.name : "")}">`, 1)}
      ${field("الفولدر (اختياري)", `<input name="folder" id="na-folder" list="na-folders" placeholder="اختار فولدر أو اكتب اسم فولدر جديد" value="${esc(sh ? sh.folder || "" : "")}"><datalist id="na-folders">${folderList().map((f) => `<option value="${esc(f)}">`).join("")}</datalist>`)}
      ${sh ? "" : field("الشيت (Excel / CSV · اختياري، وتقدر ترفعه بعدين)", `<input name="sheet" id="na-sheet" type="file" accept=".csv,.xlsx,.xls">`, 0, 1)}
      <div class="row end wide"><button class="btn">${sh ? "حفظ" : `${I("plus")}اعمل الملف`}</button></div></form>`;
  A.ACT.naNew = () => A.openModal("ملف جديد · Not Active Inventory", fileForm());
  A.ACT.naRename = () => A.openModal("تغيير اسم الملف", fileForm(sheetOf()));
  const nameTaken = (name, except) => S().naSheets.some((x) => x !== except && x.name.trim().toLowerCase() === name.trim().toLowerCase());
  A.FORM.naNew = (f, form) => {
    const st = S(), name = (f.name || "").trim(); if (!name) return;
    if (nameTaken(name)) { A.toast("فيه ملف بنفس الاسم · اختار اسم تاني"); return; }
    const sh = { id: "NAF-" + Date.now().toString(36), name, folder: (f.folder || "").trim(), created: A.nowIso(), by: A.uid, cols: [], key: "", rows: [] };
    st.naSheets.push(sh); A.audit("inventory", `ملف Not Active جديد: ${name}${sh.folder ? ` (فولدر ${sh.folder})` : ""}`); A.closeModal(); openFile(sh.id);
    const file = form && form.querySelector("[name=sheet]"); if (file && file.files[0]) uploadInto(sh, file.files[0]); else A.toast(`الملف «${name}» اتعمل · ارفع الشيت جوّاه`);
  };
  A.FORM.naRename = (f) => {
    const sh = sheetOf(), name = (f.name || "").trim(); if (!sh || !name) return;
    if (nameTaken(name, sh)) { A.toast("فيه ملف بنفس الاسم · اختار اسم تاني"); return; }
    const was = sh.name; sh.name = name; sh.folder = (f.folder || "").trim(); A.audit("inventory", `ملف Not Active: ${was} ← ${name}${sh.folder ? ` (فولدر ${sh.folder})` : ""}`); A.closeModal(); A.toast("اتحفظ"); A.render();
  };
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

  // merge: every row comes in; repeats are flagged on screen (dupsOf), not dropped, so the team sees and filters them
  function merge(sh, incoming, file, skip) {
    let added = 0, inv = 0, skipped = 0; const cols = dupColsOf(sh), have = new Set(sh.rows.map((r) => rowKey(r.d, cols)).filter(Boolean)), before = Object.keys(dupsOf(sh)).length;
    incoming.forEach((d) => { if (!Object.values(d).some((v) => String(v == null ? "" : v).trim())) return; const k = rowKey(d, cols);
      if (skip && k && have.has(k)) { skipped++; return; } if (k) have.add(k);
      const u = inMain(d.number || Object.values(d).find((v) => norm(v).length >= 10)); sh.rows.push({ id: "NA-" + Date.now().toString(36) + "-" + added, d, status: "", feedback: "", to: "", dup: u ? u.code : "" }); added++; if (u) inv++; });
    const rep = Object.keys(dupsOf(sh)).length - before, by = cols.map((k) => colLabel(sh, k)).join(" + ");
    if (inv) A.notify(["inventory"], `${inv} رقم في شيت ${sh.name} موجود في الانفنتوري الأصلي · حددي حالتهم`);
    A.audit("inventory", `${file}: اتضاف ${added} صف لـ ${sh.name} · منع التكرار بـ ${by}${skipped ? ` · اتساب ${skipped} مكرر` : rep > 0 ? ` · ${rep} صف متعلّم مكرر` : ""}`);
    A.toast(`اتضاف ${added} صف${skipped ? ` · اتساب ${skipped} مكرر` : rep > 0 ? ` · ${rep} صف مكرر (متعلّم بالأحمر)` : ""}${inv ? ` · ${inv} موجود في الانفنتوري` : ""}`); A.save(); A.render();
  }
  A.ACT.naSample = () => { const sh = sheetOf(); if (!sh) return; const base = sh.rows.slice(0, 2).map((r) => Object.assign({}, r.d)), k = sh.cols.map(([c]) => c), one = (vals) => Object.fromEntries(k.map((c, i) => [c, vals[i] == null ? "" : vals[i]]));
    askDup(sh, base.concat(k.includes("unit") && k.includes("number") ? [{ unit: "C-210", owner: "أ. وائل", number: "01055501210", area: "التجمع الخامس", space: 140, note: "مكتب" }, { unit: "C-211", owner: "م. دينا", number: "01000000101", area: "التجمع الخامس", space: 95, note: "" }] : [one(sh.rows[0] ? Object.values(sh.rows[0].d) : [])]), "شيت تجريبي فيه تكرار"); };
  const askDup = (sh, rows, file) => { A.ui.naDupDraft = { sel: dupColsOf(sh).slice(), rows, file, skip: false, mode: "upload" }; dupModal(); };
  // the file's columns come from the first sheet uploaded into it; later sheets fill the same columns by header, and new headers become new columns
  function uploadInto(sh, file) {
    U.readSheet(file).then((lines) => {
      const hdr = (lines.shift() || []).map((h) => String(h || "").trim()); if (!hdr.some(Boolean)) { A.toast("الشيت فاضي"); return; }
      const keyOf = (h, i) => { const c = sh.cols.find(([k, l]) => k === h || l === h); if (c) return c[0]; if (!h) return null; const k = "c" + (sh.cols.length + 1); sh.cols.push([k, h]); return k; };
      const keys = hdr.map(keyOf); if (!sh.key) sh.key = sh.cols[0] ? sh.cols[0][0] : "";
      askDup(sh, lines.map((c) => Object.fromEntries(keys.map((k, i) => [k, c[i] == null ? "" : c[i]]).filter(([k]) => k))), file.name);
    }).catch((e) => A.toast(e.message));
  }
  A.CHANGE.naUpload = (v, el) => { const file = el.files && el.files[0], sh = sheetOf(); if (file && sh) uploadInto(sh, file); };
})();
