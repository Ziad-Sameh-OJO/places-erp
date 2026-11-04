/* Tasks board: photography, Retouch (Manar approves), follow-ups with owners, rent→resale hand-offs, marketing tasks. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const KIND = { photo: ["تصوير", "camera", "acc"], retouch: ["Retouch", "image", "info"], followup: ["متابعة مع المالك", "clock", "warn"], toResale: ["ابديت للبيع", "send", "ok"], marketing: ["تسويق", "megaphone", ""] };
  const LANES = [["todo", "To Do"], ["progress", "In Progress"], ["uploaded", "اترفعت · مستنية موافقة منار"], ["done", "Done"]];
  const scope = () => { const r = A.role, m = A.me(); return S().tasks.filter((t) => r === "admin" || (r === "marketing" && ["photo", "retouch", "marketing"].includes(t.kind)) || t.to === m || t.by === m || (r === "inventory" && t.status === "uploaded")); };

  V.tasks = {
    sub: () => "تصوير · Retouch بموافقة منار · متابعة الملاك · ابديت للبيع · مهام التسويق",
    render() {
      if (A.autoFollowups) A.autoFollowups();
      const r = A.role, k = ui("tkKind") || "", list = scope().filter((t) => !k || t.kind === k);
      const canMake = A.canDo("tasks", "create");
      return `${note(r === "marketing" ? "رحمة بتشوف كل مهام المصوّر حتى اللي منار ورندا بيدّوها." : r === "photographer" ? "منار بتدّيك وحدة في اليوم ورندا بتدّيك وحدة. بيانات الوحدة بتوصلك مع المهمة." : r === "designer" ? "ارفع الصور بعد الـ Retouch على صفحة الوحدة في السيستم. المهمة مبتبقاش Done غير لما منار توافق." : "اسحب الكارت بين الأعمدة عشان تغيّر حالته.")}
        <div class="row">${U.tabs("tkKind", [["", "الكل", scope().length], ...Object.entries(KIND).map(([key, v]) => [key, v[0], scope().filter((t) => t.kind === key).length])], k)}<span class="spacer"></span>
          ${canMake && r !== "marketing" ? `<button class="btn ghost" data-act="taskNew" data-kind="photo">${I("camera")}مهمة تصوير</button><button class="btn ghost" data-act="taskNew" data-kind="retouch">${I("image")}مهمة Retouch</button>` : ""}${A.canDo("marketing", "create") && A.canDo("tasks", "create") ? `<button class="btn" data-act="taskNew" data-kind="marketing">${I("plus")}مهمة تسويق</button>` : ""}</div>
        <div class="board">${LANES.map(([key, l]) => { const items = list.filter((t) => t.status === key); return `<div class="lane l-${key}" data-drop="task:${key}"><h4><i></i>${l}<span class="num">${items.length}</span></h4>${items.map(card).join("") || `<p class="lane-empty">—</p>`}</div>`; }).join("")}</div>`;
    }
  };
  function card(t) {
    const r = A.role, m = A.me(), u = t.unit ? S().units.find((x) => x.code === t.unit) : null, [kl, ki, kc] = KIND[t.kind] || ["مهمة", "check", ""];
    let act = "";
    if (["todo", "progress"].includes(t.status) && t.to === m && t.kind === "retouch") act = `<button class="btn sm" data-act="taskSt" data-id="${t.id}" data-v="uploaded">${I("upload")}رفعت الصور على السيستم</button>`;
    else if (t.status === "todo" && (t.to === m || r === "admin")) act = `<button class="btn ghost sm" data-act="taskSt" data-id="${t.id}" data-v="progress">ابدأ</button><button class="btn sm" data-act="taskSt" data-id="${t.id}" data-v="done">Done</button>`;
    else if (t.status === "progress" && (t.to === m || r === "admin")) act = `<button class="btn sm" data-act="taskSt" data-id="${t.id}" data-v="done">Done</button>`;
    if (t.status === "uploaded" && A.canDo("tasks", "approve")) act = `<button class="btn sm" data-act="taskSt" data-id="${t.id}" data-v="done">${I("check")}موافقة</button><button class="btn ghost sm" data-act="taskSt" data-id="${t.id}" data-v="todo">رجّعها</button>`;
    if (t.status === "done" && (t.to === m || ["marketing", "admin"].includes(r)) && t.kind !== "retouch") act = `<button class="btn ghost sm" data-act="taskSt" data-id="${t.id}" data-v="todo">${I("undo")}Undo</button>`;
    const late = t.status !== "done" && t.due < A.today();
    return `<article class="tcard ${late ? "late" : ""}" draggable="true" data-drag="${t.id}"><div class="row">${chip(kc, kl)}<span class="spacer"></span><span class="hint ${late ? "bad-t" : ""}">${I("calendar")}${A.fmtDate(t.due)}</span></div>
      <b>${esc(t.title || (u ? `${u.code} · ${u.project}` : t.unit))}</b>
      ${u ? `<span class="hint">${esc(u.area)} · الدور ${esc(u.floor || "—")} · مبنى ${esc(u.building || "—")} · ${esc(u.contact || u.owner || u.name || "")} <span class="mono">${esc(u.number || "")}</span></span>` : ""}
      ${t.link ? `<span class="lnk mono">${I("image")}${esc(t.link)}</span>` : ""}${t.note ? `<span class="hint">${esc(t.note)}</span>` : ""}
      <div class="row">${t.by === "system" ? `<span class="hint">السيستم</span>` : A.avatar(t.by, 1)}<span class="hint">←</span>${A.who(t.to)}</div><div class="row">${act}</div></article>`;
  }
  A.ACT.tkKind = (d) => { ui("tkKind", d.v); A.render(); };
  function setStatus(t, v) {
    const prev = t.status;
    if (t.kind === "retouch" && v === "done" && !A.canDo("tasks", "approve")) { A.toast("الـ Retouch مبيبقاش Done غير بموافقة منار · ارفع الصور على صفحة الوحدة الأول"); return; }
    t.status = v;
    if (v === "uploaded") A.notify(["inventory"], `${A.person(t.to)} رفعت صور الـ Retouch لـ ${t.unit} · محتاجة موافقتك`);
    if (v === "done" && t.kind === "retouch") A.notify(["marketing"], `الـ Retouch لـ ${t.unit} اتوافق عليه`);
    if (v === "done" && t.kind === "photo") A.notify(["inventory", "marketing"], `${A.person(t.to)} خلّص تصوير ${t.unit}`);
    if (v === "todo" && prev === "uploaded") A.notify(["designer"], `منار رجّعت الـ Retouch لـ ${t.unit} للتعديل`);
    A.toast(v === "done" ? "Done" : v === "uploaded" ? "اتبعتت لمنار توافق" : v === "progress" ? "In Progress" : "رجعت للمهام", () => (t.status = prev));
    A.render();
  }
  A.ACT.taskSt = (d) => setStatus(S().tasks.find((x) => x.id === d.id), d.v);
  A.DROP.task = (id, v) => { const t = S().tasks.find((x) => x.id === id); if (!t || t.status === v) return; if (v === "uploaded" && t.kind !== "retouch") { A.toast("العمود ده لمهام الـ Retouch بس"); return; } setStatus(t, v); };
  A.ACT.taskNew = (d) => {
    const kind = d.kind, st = S(), to = { photo: "u12", retouch: "u12", toResale: "u8", marketing: "u11" }[kind];
    A.openModal({ photo: "مهمة تصوير للمصوّر", retouch: "مهمة Retouch للمصمم (من غير AI)", toResale: "ابعت الوحدة لرندا · ابديت للبيع", marketing: "مهمة تسويق" }[kind], `<form data-form="taskNew" class="grid"><input type="hidden" name="kind" value="${kind}">
      ${kind === "marketing" ? field("المهمة", `<select name="title" id="tk-title">${S().mkTaskTypes.map((x) => opt(x)).join("")}</select>`, 1) : field("الوحدة", `<select name="unit" id="tk-unit">${st.units.filter((u) => u.status === "available").map((u) => opt(u.code, `${u.code} · ${u.project}`, d.code)).join("")}</select>`, 1)}
      ${kind === "marketing" ? field("مسؤول", `<select name="to" id="tk-to">${["u11", "u12"].map((id) => opt(id, A.person(id))).join("")}</select>`) : `<input type="hidden" name="to" value="${to}">`}
      ${field("الميعاد", `<input name="due" id="tk-due" type="date" value="${A.today()}" required>`, 1)}
      ${kind === "retouch" ? field("صور الوحدة (ترفع على السيستم)", `<input name="link" id="tk-link" type="file" multiple accept="image/*" required>`, 1) : ""}
      ${field("ملاحظات", `<textarea name="note" id="tk-note" placeholder="${kind === "photo" ? "بيانات الوحدة بتتبعت أوتوماتيك: الكود والبروجكت والمبنى والدور واللوكيشن ورقم المالك" : ""}"></textarea>`, 0, 1)}
      <div class="row end wide"><button class="btn">${I("send")}ابعت المهمة</button></div></form>`);
  };
  A.FORM.taskNew = (f) => {
    const st = S(), t = { id: "T-" + (st.tasks.length + 1) + Date.now().toString(36).slice(-2), kind: f.kind, unit: f.unit || "", title: f.kind === "marketing" ? f.title : "", by: A.me(), to: f.to, due: f.due, status: "todo", link: f.link || "", note: f.note || "" };
    if (f.kind === "photo" && st.tasks.some((x) => x.kind === "photo" && x.by === A.me() && x.due === f.due && x.status !== "done")) A.toast("تنبيه: إنت مدياه وحدة النهارده قبل كده (وحدة في اليوم)");
    st.tasks.unshift(t); A.notify([{ u12: "photographer", u13: "designer", u8: "resale", u11: "marketing" }[f.to] || "marketing", "marketing"], `مهمة ${KIND[f.kind][0]} جديدة: ${f.unit || f.title} من ${A.person(A.me())}`);
    A.closeModal(); A.toast(f.kind === "photo" ? "المهمة اتبعتت للمصوّر، ورحمة شايفاها" : "المهمة اتبعتت"); A.render();
  };
})();
