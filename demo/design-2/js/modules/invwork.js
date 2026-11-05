/* Inventory team's day (M-03 · data the KPI cards read): unit received vs entered (24h), media link on the unit (Sara, 24h),
   Team Leaders' list requests to Marwa (24h, no unconfirmed units), Manar's daily report, and Manar's daily tasks (max 30 a person). */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, head, note, table, field, opt } = U;
  const hrs = (a, b) => (new Date(b) - new Date(a)) / 36e5;
  const TEAM = ["u8", "u9", "u10"]; // Randa, Sara, Marwa
  const CAP = 30;

  // unit page: when it came in, when it was entered, and its media link
  A.invExtras = (u) => {
    const ed = A.canDo("inventory", "edit"), inH = u.receivedAt && u.enteredAt ? hrs(u.receivedAt, u.enteredAt) : null, dH = u.driveAt && u.enteredAt ? hrs(u.enteredAt, u.driveAt) : null;
    return `<section class="card flat">${head("الاستلام والإدخال والصور", "clock")}
      <div class="row"><span class="hint">اتستلمت:</span><b>${u.receivedAt ? A.fmtDate(u.receivedAt) + " " + A.fmtTime(u.receivedAt) : "—"}</b><span class="hint">اتدخلت:</span><b>${u.enteredAt ? A.fmtDate(u.enteredAt) + " " + A.fmtTime(u.enteredAt) : "—"}</b>${inH != null ? chip(inH <= 24 ? "ok" : "bad", inH <= 24 ? "خلال 24 ساعة" : `بعد ${Math.round(inH)} ساعة`) : ""}</div>
      <div class="row"><span class="hint">الصور والـ PDF:</span>${u.drive ? `<span class="mono">${esc(u.drive)}</span>${dH != null ? chip(dH <= 24 ? "ok" : "bad", dH <= 24 ? "اترفعت خلال 24 ساعة" : `اترفعت بعد ${Math.round(dH)} ساعة`) : ""}` : chip("warn", "لسه مااترفعتش", 1)}<button class="btn ghost sm" data-act="unitFolder" data-code="${u.code}">${I("folder")}افتح الفولدر</button></div></section>`;
  };
  A.ACT.unitDrive = (d) => { const u = S().units.find((x) => x.code === d.code); u.drive = `${u.code} · صور + PDF`; u.driveAt = A.nowIso(); A.audit("inventory", `${u.code}: الصور والـ PDF اترفعوا على صفحة الوحدة`); A.toast("اترفعت · بتتحسب في الـ KPIs"); A.render(); A.refreshDrawer(); };

  // Team Leaders ask the inventory team for a list of units for a client; Marwa answers within 24h
  A.ACT.listReqs = () => {
    const st = S(), mine = A.role === "tl", work = A.role === "inventory_staff" || A.canDo("inventory", "approve"), L = (st.listReqs || []).filter((x) => !mine || x.by === A.uid);
    A.openModal("طلبات الـ Lists", `${mine || A.role === "admin" ? `<form class="row" data-form="listReq"><input name="text" required placeholder="عايز List إيه؟ (مثلاً: إيجار التجمع 100–150 م متشطب)" style="flex:1"><button class="btn sm">${I("send")}اطلب</button></form>` : ""}
      ${table(["الطلب", "مين", "اتطلب", "الحالة", ""], L.map((x) => { const age = hrs(x.at, x.doneAt || A.nowIso()); return `<tr><td>${esc(x.text)}${x.units ? `<span class="sub mono">${x.units.join(" · ")}</span>` : ""}</td><td>${esc(A.person(x.by))}</td><td>${A.ago(x.at)}</td><td>${x.doneAt ? chip(age <= 24 ? "ok" : "warn", age <= 24 ? "اتبعتت خلال 24 ساعة" : `اتبعتت بعد ${Math.round(age)} ساعة`) : chip(age > 24 ? "bad" : "warn", age > 24 ? "متأخرة" : "مستنية")}${x.unconfirmed ? chip("bad", `${x.unconfirmed} وحدة مش مؤكدة`) : ""}</td><td>${!x.doneAt && work ? `<button class="btn sm" data-act="listDo" data-id="${x.id}">جهّز وابعت</button>` : ""}</td></tr>`; }))}
      ${note("الـ List بتتبعت خلال 24 ساعة من الطلب، ومفيهاش ولا وحدة مش مؤكدة (عدّى عليها شهر من غير ابديت).")}`);
  };
  A.FORM.listReq = (f) => { const st = S(); (st.listReqs = st.listReqs || []).unshift({ id: "LR-" + Date.now().toString(36).slice(-4), by: A.uid, text: f.text, at: A.nowIso() }); A.notify(["inventory_staff", "inventory"], `طلب List من ${A.person(A.uid)}: ${f.text}`); A.toast("الطلب اتبعت للانفنتوري"); A.ACT.listReqs(); };
  A.ACT.listDo = (d) => {
    const x = S().listReqs.find((y) => y.id === d.id), units = S().units.filter(A.isAvailable).filter((u) => u.pdf === "confirmed");
    A.openModal(`List · ${x.text}`, `<form data-form="listDone" class="grid"><input type="hidden" name="id" value="${x.id}">${field("الوحدات", `<select name="units" multiple size="8" required>${units.map((u) => opt(u.code, `${u.code} · ${u.project} · ${A.num(u.space)} م${A.stale(u) ? " · مش مؤكدة" : ""}`)).join("")}</select>`, 1, 1)}<div class="row end wide"><button class="btn">${I("send")}ابعت للـ Team Leader</button></div></form>`);
  };
  A.FORM.listDone = (f, form) => {
    const x = S().listReqs.find((y) => y.id === f.id), codes = [...form.querySelector("select[name=units]").selectedOptions].map((o) => o.value), bad = codes.filter((c) => A.stale(S().units.find((u) => u.code === c)));
    if (bad.length && !confirm(`${bad.join("، ")} مش مؤكدة (عدّى عليها شهر من غير ابديت). تبعتها برضه؟ (بتتحسب في الجودة)`)) return;
    Object.assign(x, { units: codes, doneAt: A.nowIso(), doneBy: A.uid, unconfirmed: bad.length }); A.notify(["tl"], `الـ List بتاعة «${x.text}» جاهزة: ${codes.join("، ")}`); A.audit("inventory", `List اتبعتت لـ ${A.person(x.by)} (${codes.length} وحدة)`); A.closeModal(); A.toast("اتبعتت"); A.render();
  };

  // Manar's daily report: new / updated / rented / unconfirmed, approved and sent once a day
  A.ACT.invReport = () => {
    const st = S(), t = A.today(), U_ = st.units, rep = (st.invReports || {})[t];
    const c = { "جديد": U_.filter((u) => (u.created || "") === t).length, "متحدّث": U_.filter((u) => u.lastUpdate === t).length, "اتأجر / اتباع": U_.filter((u) => (u.closedAt || "").slice(0, 10) === t).length, "مش مؤكد": U_.filter((u) => A.stale(u) || u.pdf === "draft").length };
    A.openModal(`التقرير اليومي · ${A.fmtDate(t)}`, `<div class="kpis sm">${Object.entries(c).map(([k, v]) => U.kpi(k, v, "النهارده", "building")).join("")}</div>${rep ? note(`اتبعت ${A.fmtTime(rep.at)} من ${esc(A.person(rep.by))}.`) : A.canDo("inventory", "approve") ? `<div class="row end"><button class="btn" data-act="invReportSend">${I("send")}اعتمد وابعت للإدارة</button></div>` : ""}`);
    A.ui.invRep = c;
  };
  A.ACT.invReportSend = () => { const st = S(); (st.invReports = st.invReports || {})[A.today()] = { at: A.nowIso(), by: A.uid, counts: A.ui.invRep }; A.notify(["admin", "officemgr"], `التقرير اليومي للانفنتوري: ${Object.entries(A.ui.invRep).map(([k, v]) => `${k} ${v}`).join(" · ")}`); A.toast("التقرير اتبعت"); A.closeModal(); A.render(); };

  // Manar's daily tasks to Randa / Sara / Marwa: at most 30 a day each
  A.ACT.teamTask = () => A.openModal("مهمة لفريق الانفنتوري", `<form data-form="teamTask" class="grid">${field("لمين", `<select name="to">${TEAM.map((id) => opt(id, `${A.person(id)} · النهارده ${todayCount(id)} من ${CAP}`)).join("")}</select>`, 1)}${field("المهمة", `<input name="title" required placeholder="مثلاً: ارفعي صور U-104 وحدّثي اللينك">`, 1)}${field("الوحدة", `<select name="unit">${opt("", "—")}${S().units.map((u) => opt(u.code, `${u.code} · ${u.project}`)).join("")}</select>`)}<div class="row end wide"><button class="btn">${I("send")}ابعت</button></div></form>`);
  const todayCount = (id) => S().tasks.filter((t) => t.kind === "team" && t.to === id && (t.created || "").slice(0, 10) === A.today()).length;
  A.FORM.teamTask = (f) => {
    if (todayCount(f.to) >= CAP) return A.toast(`${A.person(f.to)} عندها ${CAP} مهمة النهارده (الحد الأقصى)`);
    S().tasks.unshift({ id: "T-" + Date.now().toString(36).slice(-5), kind: "team", title: f.title, unit: f.unit, by: A.uid, to: f.to, due: A.today(), created: A.nowIso(), status: "todo" });
    A.notify([((S().users || []).find((u) => u.id === f.to) || {}).role], `مهمة من منار: ${f.title}`); A.toast("المهمة اتبعتت"); A.closeModal(); A.render();
  };
  A.ACT.teamTaskDone = (d) => { const t = S().tasks.find((x) => x.id === d.id); t.status = "done"; t.doneAt = A.nowIso(); A.audit("tasks", `${A.person(t.to)} خلّصت: ${t.title}`); A.toast("اتعلّمت Done"); A.render(); };

  // home: what's waiting for the inventory team
  A.invInbox = (add) => {
    const st = S(), r = A.role;
    st.tasks.filter((t) => t.kind === "team" && t.to === A.uid && t.status !== "done").forEach((t) => add("", "check", `مهمة من منار: ${t.title}`, `${t.unit || ""} · ${A.ago(t.created)}`, "teamTaskDone", { id: t.id }, "خلصت"));
    if (r === "inventory_staff" || r === "inventory") (st.listReqs || []).filter((x) => !x.doneAt).forEach((x) => add(hrs(x.at, A.nowIso()) > 24 ? "bad" : "warn", "list", `طلب List من ${A.person(x.by)}`, `${x.text} · ${A.ago(x.at)}`, "listDo", { id: x.id }, "جهّز"));
    if (r === "inventory" && !(st.invReports || {})[A.today()]) add("warn", "file", "التقرير اليومي للانفنتوري", "جديد / متحدّث / اتأجر / مش مؤكد", "invReport", {}, "افتح");
  };
  A.invWork = { todayCount, CAP };
})();
/* Pic & Info: a folder for every unit. Photos and PDFs are uploaded into it, kept in this browser (IndexedDB, since
   localStorage can't hold images), and the unit's photo list, PIC and «uploaded within 24h» read from it. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { note, chip } = U;
  let dbp;
  const db = () => dbp || (dbp = new Promise((ok, no) => { const r = indexedDB.open("places-d2-unit-files", 1); r.onupgradeneeded = () => r.result.createObjectStore("files", { keyPath: "id" }).createIndex("unit", "unit"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }));
  const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, no) => { const t = d.transaction("files", mode), r = fn(t.objectStore("files")); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); };
  const unitOf = (code) => S().units.find((x) => x.code === code);
  const names = (u) => (u.photos || "").split("، ").filter(Boolean);
  const canUpload = () => A.canDo("inventory", "edit") || S().invAccess[A.me()] === "edit" || A.role === "inventory_staff";
  const urls = new Map(); // file id → object URL, kept for the page's life (the folder, the PDF and the slide all show them)
  // every file of a unit: the seed's photos shipped with the demo (img/units/…) + what was uploaded here, oldest first
  A.unitFiles = async (code) => {
    const u = unitOf(code); let up = []; try { up = await tx("readonly", (st) => st.index("unit").getAll(code)); } catch (e) { /* no IndexedDB */ }
    up.forEach((f) => { if (!urls.has(f.id)) urls.set(f.id, URL.createObjectURL(f.blob)); });
    return [...(u.seedPhotos || []).map((src) => ({ id: "seed:" + src, name: src.split("/").pop(), type: "image/jpeg", url: src, at: u.created, by: u.agent, seed: true })),
      ...up.sort((a, b) => (a.at < b.at ? -1 : 1)).map((f) => Object.assign({ url: urls.get(f.id) }, f))];
  };

  A.unitFilesAdd = async (code, files) => {
    files = [...(files || [])].filter((f) => f.size); if (!files.length) return 0;
    const u = unitOf(code), at = A.nowIso();
    try { await tx("readwrite", (st) => files.forEach((f, i) => st.put({ id: `${code}/${Date.now()}-${i}`, unit: code, name: f.name, type: f.type, blob: f, at, by: A.uid }))); }
    catch (e) { A.toast("الملفات مااترفعتش: مساحة المتصفح مش كفاية"); return 0; }
    u.photos = [...names(u), ...files.map((f) => f.name)].join("، ");
    if (!u.driveAt) { u.drive = `${code} · صور + PDF`; u.driveAt = at; }
    u.pdf = "draft";
    A.audit("inventory", `${code}: اترفع ${files.length} ملف في فولدر Pic & Info`); A.save(); return files.length;
  };

  A.ACT.unitFolder = async (d) => {
    const u = unitOf(d.code); if (!u) return;
    const files = await A.unitFiles(d.code);
    const left = names(u).slice(); files.forEach((f) => { const i = left.indexOf(f.name); if (i >= 0) left.splice(i, 1); }); // names saved before the folder existed (no file behind them)
    const up = canUpload(), n = files.length + left.length;
    const tile = (f) => `<figure class="uf"><a href="${f.url}" target="_blank" rel="noopener" title="افتح">${/^image\//.test(f.type) ? `<img src="${f.url}" alt="${esc(f.name)}">` : `<span class="uf-doc">${I("file")}PDF</span>`}</a><figcaption><span>${esc(f.name)}</span><small>${A.fmtDate(f.at)} · ${esc(A.person(f.by))}</small><a class="uf-dl" href="${f.url}" download="${esc(f.name)}">${I("download")}تحميل</a></figcaption>${up && !f.seed ? `<button class="uf-del" data-act="unitFileDel" data-id="${esc(f.id)}" data-code="${u.code}" aria-label="امسح ${esc(f.name)}">${I("x")}</button>` : ""}</figure>`;
    A.openModal(`فولدر ${u.code} · Pic & Info`, `<div class="row"><span class="hint">${esc(u.project)} · ${esc(u.area || "")} · ${n} ملف</span><span class="spacer"></span>${files.length ? `<button class="btn ghost" data-act="unitFolderZip" data-code="${u.code}">${I("download")}نزّل الفولدر كله (ZIP)</button>` : ""}${up ? `<label class="btn">${I("upload")}ارفع صور / PDF<input type="file" multiple accept="image/*,application/pdf" data-change="unitFolderUp" data-code="${u.code}" hidden></label>` : ""}</div>
      ${n ? `<div class="ufolder">${files.map(tile).join("")}${left.map((x) => `<figure class="uf old"><span class="uf-doc">${I("image")}</span><figcaption><span>${esc(x)}</span><small>اسم ملف بس · ارفعه تاني عشان يظهر</small></figcaption></figure>`).join("")}</div>`
        : `<div class="ufolder empty">${I("folder")}<b>الفولدر فاضي</b><span class="hint">${up ? "ارفع كل صور الوحدة هنا، وتقدر ترفع أكتر من صورة مرة واحدة." : "لسه محدش رفع صور للوحدة دي."}</span></div>`}
      ${note("الصور دي بتتشاف من خانة Pic & Info في الشيت ومن صفحة الوحدة، ومنها بيتعمل الـ PDF والـ slide. أول رفع بيتسجّل وقته وبيتحسب في «رفع الصور خلال 24 ساعة».")}`);
  };
  // the whole folder as one .zip (stored, no compression: photos and PDFs are compressed already)
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0; };
  A.zip = (entries) => { // [{ name, data: Uint8Array }] → Blob
    const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
    const hdr = (sig, size) => { const v = new DataView(new ArrayBuffer(size)); v.setUint32(0, sig, true); return v; };
    entries.forEach(({ name, data }) => {
      const n = enc.encode(name), c = crc32(data), h = hdr(0x04034b50, 30);
      h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, c, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true);
      const d = hdr(0x02014b50, 46); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint32(16, c, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, n.length, true); d.setUint32(42, off, true);
      parts.push(h, n, data); dir.push(d, n); off += 30 + n.length + data.length;
    });
    const size = dir.reduce((s, x) => s + x.byteLength, 0), e = hdr(0x06054b50, 22);
    e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...dir, e], { type: "application/zip" });
  };
  A.ACT.unitFolderZip = async (d) => {
    const files = await A.unitFiles(d.code), seen = {};
    const entries = await Promise.all(files.map(async (f) => { const k = f.name in seen ? f.name.replace(/(\.[^.]*)?$/, `-${++seen[f.name]}$1`) : ((seen[f.name] = 0), f.name); return { name: `${d.code}/${k}`, data: new Uint8Array(await (f.blob || (await fetch(f.url)).blob()).arrayBuffer()) }; }));
    const a = document.createElement("a"); a.href = URL.createObjectURL(A.zip(entries)); a.download = `${d.code} - Pic & Info.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    A.audit("inventory", `${d.code}: اتنزّل فولدر Pic & Info (${entries.length} ملف)`); A.toast(`اتنزّل ${entries.length} ملف`);
  };
  A.CHANGE.unitFolderUp = async (v, el) => { const code = el.dataset.code, n = await A.unitFilesAdd(code, el.files); if (n) { A.toast(`اترفع ${n} ملف في فولدر ${code}`); A.render(); A.ACT.unitFolder({ code }); } };
  A.ACT.unitFileDel = async (d) => {
    if (!confirm("تمسح الملف ده من فولدر الوحدة؟")) return;
    const u = unitOf(d.code), f = await tx("readonly", (st) => st.get(d.id)); await tx("readwrite", (st) => st.delete(d.id));
    const L = names(u), i = L.indexOf(f && f.name); if (i >= 0) L.splice(i, 1); u.photos = L.join("، "); u.pdf = "draft";
    A.audit("inventory", `${u.code}: اتمسح ${f ? f.name : "ملف"} من فولدر Pic & Info`); A.save(); A.render(); A.ACT.unitFolder({ code: u.code });
  };
})();
