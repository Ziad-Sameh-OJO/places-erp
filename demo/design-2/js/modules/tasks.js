/* Tasks board: photography, Retouch (Manar approves), follow-ups with owners, rent→resale hand-offs, marketing tasks. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const KIND = { team: ["مهمة للفريق", "check", "info"], photo: ["تصوير", "camera", "acc"], retouch: ["Retouch", "image", "info"], followup: ["متابعة مع المالك", "clock", "warn"], toResale: ["ابديت للبيع", "send", "ok"], marketing: ["تسويق", "megaphone", ""] };
  const LANES = [["todo", "To Do"], ["progress", "In Progress"], ["uploaded", "اترفعت · مستنية موافقة منار"], ["done", "Done"]];
  // مهام الفريق = the person who got it is in the sender's department; anything sent outside it is خارجية (system tasks count as the team's)
  const deptOf = (id) => ((S().people || []).find((p) => p.id === id) || {}).dept || "";
  const isTeam = (t) => !!t.to && deptOf(t.to) === deptOf(t.by === "system" || !t.by ? t.to : t.by);
  const KPI_FIELD = () => field("تتحسب في الـ KPIs؟", `<select name="kpi" id="tk-kpi">${opt("skip", "لأ · Skip")}${opt("yes", "أيوه · تدخل في كارت اللي هيستلمها (المهام في ميعادها)")}</select>`);
  A.taskKpiField = KPI_FIELD;
  // after a task is saved: if it counts in the KPIs, the assignee's card gets (or already has) the «المهام في ميعادها» item
  A.taskKpiApply = (t, f) => { if (f.kpi !== "yes" || !A.kpiForTask) return ""; t.kpi = true; const made = A.kpiForTask(t.to, t.by);
    return made === "card" ? ` · اتعمل كارت KPIs لـ ${A.person(t.to)} وفيه بند «المهام في ميعادها» (حددوا وزنه)` : made === "item" ? ` · اتضاف بند «المهام في ميعادها» لكارت ${A.person(t.to)} (حددوا وزنه)` : " · بتتحسب في KPIs بتاعته"; };
  const scope = () => { const r = A.role, m = A.me(); return S().tasks.filter((t) => r === "admin" || (r === "marketing" && ["photo", "retouch", "marketing"].includes(t.kind)) || t.to === m || t.by === m || (r === "inventory" && t.status === "uploaded")); };

  V.tasks = {
    sub: () => "تصوير · Retouch بموافقة منار · متابعة الملاك · ابديت للبيع · مهام التسويق",
    render() {
      if (A.autoFollowups) A.autoFollowups();
      const r = A.role, side = ui("tkSide") || "team", inSide = (t) => (side === "team" ? isTeam(t) : !isTeam(t)), mine = scope().filter(inSide), k = ui("tkKind") || "", list = mine.filter((t) => !k || t.kind === k);
      const canMake = A.canDo("tasks", "create");
      return `${note(r === "marketing" ? "رحمة بتشوف كل مهام المصوّر حتى اللي منار ورندا بيدّوها." : r === "photographer" ? "منار بتدّيك وحدة في اليوم ورندا بتدّيك وحدة. بيانات الوحدة بتوصلك مع المهمة." : r === "designer" ? "ارفع الصور بعد الـ Retouch على صفحة الوحدة في السيستم. المهمة مبتبقاش Done غير لما منار توافق." : "اسحب الكارت بين الأعمدة عشان تغيّر حالته.")}
        <div class="row">${U.seg("tkSide", [["team", `مهام الفريق (${scope().filter(isTeam).length})`, "users"], ["out", `مهام لناس خارجية (${scope().filter((t) => !isTeam(t)).length})`, "send"]], side)}<span class="spacer"></span>${r === "inventory" && A.ACT.teamTask ? `<button class="btn" data-act="teamTask">${I("plus")}مهمة للفريق</button>` : ""}</div>
        <div class="row">${U.tabs("tkKind", [["", "الكل", mine.length], ...Object.entries(KIND).filter(([key]) => mine.some((t) => t.kind === key)).map(([key, v]) => [key, v[0], mine.filter((t) => t.kind === key).length])], k)}<span class="spacer"></span>
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
      <b>${esc(t.title || (u ? u.code : t.unit))}</b>
      ${""/* nothing about the unit is sent automatically: the person gets the unit code and only what Manar wrote in the notes */}
      ${t.kpi ? chip("info", "بتتحسب في الـ KPIs") : ""}${t.link ? `<span class="lnk mono">${I("image")}${esc(t.link)}</span>` : ""}${t.note ? `<span class="hint">${esc(t.note)}</span>` : ""}
      <div class="row">${t.by === "system" ? `<span class="hint">السيستم</span>` : A.avatar(t.by, 1)}<span class="hint">←</span>${A.who(t.to)}</div><div class="row">${act}</div></article>`;
  }
  A.ACT.tkKind = (d) => { ui("tkKind", d.v); A.render(); };
  A.ACT.tkSide = (d) => { ui("tkSide", d.v); ui("tkKind", ""); A.render(); };
  function setStatus(t, v) {
    const prev = t.status;
    if (t.kind === "retouch" && v === "done" && !A.canDo("tasks", "approve")) { A.toast("الـ Retouch مبيبقاش Done غير بموافقة منار · ارفع الصور على صفحة الوحدة الأول"); return; }
    t.status = v; if (v === "done") t.doneAt = A.nowIso(); else delete t.doneAt; // «في ميعادها» for the KPIs
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
      ${field(kind === "marketing" ? "ملاحظات" : "ملاحظات (ده بس اللي هيوصل مع كود الوحدة)", `<textarea name="note" id="tk-note" ${kind === "marketing" ? "" : "required"} placeholder="${kind === "photo" ? "اكتب للمصوّر كل اللي محتاجه: المكان، الدور، مين هيفتح، الميعاد… مفيش أي بيانات تانية بتتبعت أوتوماتيك" : kind === "marketing" ? "" : "اكتب كل اللي محتاج يوصل · مفيش بيانات بتتبعت أوتوماتيك"}"></textarea>`, kind !== "marketing", 1)}
      ${KPI_FIELD()}
      <div class="row end wide"><button class="btn">${I("send")}ابعت المهمة</button></div></form>`);
  };
  A.FORM.taskNew = (f) => {
    const st = S(), t = { id: "T-" + (st.tasks.length + 1) + Date.now().toString(36).slice(-2), kind: f.kind, unit: f.unit || "", title: f.kind === "marketing" ? f.title : "", by: A.me(), to: f.to, due: f.due, status: "todo", link: f.link || "", note: f.note || "" };
    if (f.kind === "photo" && st.tasks.some((x) => x.kind === "photo" && x.by === A.me() && x.due === f.due && x.status !== "done")) A.toast("تنبيه: إنت مدياه وحدة النهارده قبل كده (وحدة في اليوم)");
    const kp = A.taskKpiApply(t, f);
    st.tasks.unshift(t); A.notify([{ u12: "photographer", u13: "designer", u8: "resale", u11: "marketing" }[f.to] || "marketing", "marketing"], `مهمة ${KIND[f.kind][0]} جديدة: ${f.unit || f.title} من ${A.person(A.me())}`);
    A.closeModal(); A.toast((f.kind === "photo" ? "المهمة اتبعتت للمصوّر، ورحمة شايفاها" : "المهمة اتبعتت") + kp); A.render();
  };
})();
