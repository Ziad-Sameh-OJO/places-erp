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
      <div class="row"><span class="hint">الصور والـ PDF:</span>${u.drive ? `<span class="mono">${esc(u.drive)}</span>${dH != null ? chip(dH <= 24 ? "ok" : "bad", dH <= 24 ? "اترفعت خلال 24 ساعة" : `اترفعت بعد ${Math.round(dH)} ساعة`) : ""}` : chip("warn", "لسه مااترفعتش", 1)}${ed || A.role === "inventory_staff" ? `<button class="btn ghost sm" data-act="unitDrive" data-code="${u.code}">${I("upload")}${u.drive ? "حدّث" : "ارفع"}</button>` : ""}</div></section>`;
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
