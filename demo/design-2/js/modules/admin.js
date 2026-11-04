/* M-09 Roles & permissions + users + audit log · M-13 settings & master data · M-14 notifications & email. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, table } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const ui = (k, v) => { if (v !== undefined) A.ui[k] = v; return A.ui[k]; };
  const ACT_L = [["v", "يشوف"], ["c", "يضيف"], ["e", "يعدّل"], ["a", "يوافق"], ["d", "يأرشف / يمسح"], ["i", "يستورد"], ["x", "يصدّر"]];
  const ALL = "vceadix", SCOPES = [["own", "بتاعه بس"], ["team", "فريقه"], ["dept", "قسمه"], ["all", "الكل"]];
  // any right needs "view"; keep the letters in matrix order so strings compare cleanly
  const norm = (s) => { s = s || ""; if (s && !s.includes("v")) s += "v"; return [...ALL].filter((k) => s.includes(k)).join(""); };
  const baseStr = (id, m) => norm(A.rolesOf(id).map((r) => (((S().perms[r] || {}).p || {})[m] || "")).join(""));
  const usersWith = (r) => S().users.filter((u) => u.role === r || (u.extraRoles || []).includes(r));
  // one matrix for a role (t = {r}) or for one person (t = {u}); a person's cell differing from their roles is highlighted
  const matrix = (get, t, ed) => { const at = t.r ? `data-r="${t.r}"` : `data-u="${t.u}"`;
    return `<div class="tbl-wrap"><table class="perm"><thead><tr><th>الموديول</th>${ACT_L.map(([k, l]) => `<th class="c">${ed ? `<button class="link" data-act="permCol" ${at} data-k="${k}" title="للكل">${l}</button>` : l}</th>`).join("")}${ed ? `<th class="c">الصف</th>` : ""}</tr></thead><tbody>
    ${A.MODS.map((m) => { const s = get(m), b = t.u ? baseStr(t.u, m) : s; return `<tr><td><span class="who">${I(A.NAV[m][2])}<b>${esc(A.NAV[m][0])}</b><small class="mono">${A.NAV[m][1]}</small></span></td>${ACT_L.map(([k]) => `<td class="c${s.includes(k) !== b.includes(k) ? " ov" : ""}"><label class="tick"><input type="checkbox" ${s.includes(k) ? "checked" : ""} ${ed ? "" : "disabled"} data-change="perm" ${at} data-m="${m}" data-k="${k}" aria-label="${esc(A.NAV[m][0])} ${k}"><span></span></label></td>`).join("")}${ed ? `<td class="c"><button class="btn ghost sm" data-act="permRow" ${at} data-m="${m}">${s === ALL ? "شيل الكل" : "الكل"}</button></td>` : ""}</tr>`; }).join("")}
    </tbody></table></div>`; };
  const userPerm = (id) => { const u = S().users.find((x) => x.id === id), o = u.overrides || {};
    A.openModal(`صلاحيات ${A.person(id)}`, `<p class="hint">الأدوار: ${A.rolesOf(id).map((r) => chip("info", roleName(r))).join(" ")} · الخانات الملوّنة مختلفة عن الدور (استثناء ليه هو بس).</p>
      ${matrix((m) => (o[m] != null ? o[m] : baseStr(id, m)), { u: id }, editable())}
      <div class="row end">${Object.keys(o).length && editable() ? `<button class="btn ghost" data-act="userPermReset" data-id="${id}">رجّع زي الدور</button>` : ""}<button class="btn" data-close="modal">تمام</button></div>`); };
  // the string a role/person has for a module, and how to save a new one
  const target = (d) => (d.r ? { get: (m) => S().perms[d.r].p[m] || "", set: (m, s) => { S().perms[d.r].p[m] = s; }, name: roleName(d.r) }
    : { get: (m) => { const o = S().users.find((x) => x.id === d.u).overrides || {}; return o[m] != null ? o[m] : baseStr(d.u, m); },
        set: (m, s) => { const u = S().users.find((x) => x.id === d.u); u.overrides = u.overrides || {}; if (s === baseStr(d.u, m)) delete u.overrides[m]; else u.overrides[m] = s; }, name: A.person(d.u) });
  let snap = {}; const keep = () => { snap = JSON.parse(JSON.stringify({ perms: S().perms, users: S().users })); };
  // whoever manages permissions can't take that right away from themselves
  const selfLock = (d) => { const mine = d.u ? d.u === A.uid : A.rolesOf(A.uid).includes(d.r); if (mine && !A.canDo("access", "edit")) { A.toast("مينفعش تشيل من نفسك صلاحية تعديل الصلاحيات"); return true; } };
  const after = (d, text) => { if (selfLock(d)) { A.S.perms = snap.perms; A.S.users = snap.users; A.render(); if (d.u) userPerm(d.u); return; } A.audit("access", text); A.toast("اتحفظ · بيتطبّق فوراً"); A.render(); if (d.u) userPerm(d.u); };
  const TIERS = [
    ["Super Admin", "الملاك / المؤسسين", "صلاحيات كاملة ومطلقة على كل الإدارات والتقارير المالية والتشغيلية."],
    ["Office Manager", "مدير المكتب", "بتراجع الـ Done Deals الأول، وبتقرر الصلاحيات اللي تتفتح لكل دور ولكل شخص."],
    ["Operations Head", "مدير العمليات", "إشراف كامل على فرق العمليات ودورات العمل، ومتابعة مخزون الوحدات (التعديل لمنار ورندا بس)."],
    ["Sales Director", "مدير المبيعات", "فريق المبيعات، توزيع العملاء، مسارات الصفقات، وتقارير البيع."],
    ["Team Leaders", "قادة الفرق", "موافقة الإجازات، تنبيهات تأخر العملاء (SLA)، والإشراف على أعضاء الفريق."],
    ["Executive Staff", "الموظفين التنفيذيين", "مهامهم وتذاكرهم المسندة ليهم بس (واتساب، تصوير، معالجة صور…)."]
  ];
  const roleName = (r) => A.roleLabel(r);
  const editable = () => A.canDo("access", "edit");

  V.access = {
    sub: () => "هيكل الإدارة ومصفوفة الصلاحيات من محضر الاجتماع · المستخدمين · Audit Log",
    render() {
      const t = ui("acTab") || "roles";
      return `<div class="row">${U.tabs("acTab", [["roles", "الأدوار والصلاحيات"], ["users", "المستخدمين", S().users.length], ["audit", "Audit Log", S().audit.length]], t)}</div>${AC[t]()}`;
    }
  };
  A.ACT.acTab = (d) => { ui("acTab", d.v); A.render(); };
  const AC = {
    roles() {
      const st = S(), r = st.perms[ui("acRole")] ? ui("acRole") : "salesdir", P = st.perms[r], ed = editable();
      const face = (x) => (A.ROLES[x] || {}).user || (usersWith(x)[0] || {}).id;
      return `<section class="tiers-h">${TIERS.map(([k, ar, desc], i) => `<div class="tier-h t${i}"><span class="num">${i + 1}</span><b>${esc(k)}</b><small>${esc(ar)}</small><p>${esc(desc)}</p><div class="avs">${Object.keys(st.perms).filter((x) => st.perms[x].tier === k && face(x)).map((x) => A.avatar(face(x), 1)).join("")}</div></div>`).join("")}</section>
        ${note("كل دور ليه مصفوفة: لكل موديول يشوف / يضيف / يعدّل / يوافق / يأرشف / يستورد / يصدّر، ونطاق بيانات (بتاعه / فريقه / قسمه / الكل). تقدر تعمل دور جديد أو تنسخ دور موجود، وتدي أي شخص صلاحيات زيادة أو تشيل منه من غير ما تغيّر دوره (زرار «صلاحيات» في المستخدمين). أي تعديل بيظهر فوراً في القايمة والزراير، وبيتسجّل في الـ Audit Log.")}
        <section class="card">${head("الأدوار", "shield", ed ? `<button class="btn sm" data-act="roleNew">${I("plus")}دور جديد</button>` : "")}
          ${table(["الدور", "المستوى", "بيشتغل زي", "نطاق البيانات", "موديولات مفتوحة", "الأشخاص", ""], Object.keys(st.perms).map((k) => { const x = st.perms[k], n = usersWith(k).length, custom = !A.ROLES[k]; return `<tr${k === r ? ` class="sel"` : ""}><td><button class="link" data-act="acPick" data-v="${k}"><b>${esc(roleName(k))}</b></button>${custom ? " " + chip("info", "مخصّص", 1) : ""}</td><td>${esc(x.tier || "")}</td><td>${esc(roleName(x.base || k))}</td><td>${esc((SCOPES.find((s) => s[0] === x.scope) || ["", x.scope])[1])}</td><td>${A.MODS.filter((m) => (x.p[m] || "").includes("v")).length} من ${A.MODS.length}</td><td>${n}</td><td>${ed ? `<div class="row"><button class="btn ghost sm" data-act="roleEdit" data-v="${k}">تعديل</button><button class="btn ghost sm" data-act="roleClone" data-v="${k}">نسخ</button>${custom ? `<button class="btn ghost sm" data-act="roleDel" data-v="${k}" ${n ? `disabled title="شيل الدور من الأشخاص الأول"` : ""}>مسح</button>` : ""}</div>` : ""}</td></tr>`; }))}</section>
        <div class="cols wide"><section class="card">${head("مصفوفة الصلاحيات", "lock", `<select id="ac-role" data-change="acRole" aria-label="الدور">${Object.keys(st.perms).map((k) => opt(k, `${roleName(k)} · ${st.perms[k].tier}`, r)).join("")}</select>`)}
          <div class="row"><span class="hint">نطاق البيانات:</span>${U.seg("acScope", SCOPES.map(([k, l]) => [r + "|" + k, l]), r + "|" + P.scope)}<span class="spacer"></span>${ed ? `<span class="hint">جاهز:</span><button class="btn ghost sm" data-act="permPreset" data-r="${r}" data-v="all">كله</button><button class="btn ghost sm" data-act="permPreset" data-r="${r}" data-v="view">يشوف بس</button><button class="btn ghost sm" data-act="permPreset" data-r="${r}" data-v="none">ولا حاجة</button>` : chip("", "عرض بس", 1)}</div>
          ${matrix((m) => P.p[m] || "", { r }, ed)}</section>
          <section class="card">${head("مين عنده الدور ده", "users")}${usersWith(r).map((u) => `<div class="line-item"><span>${A.who(u.id)}${u.role !== r ? ` <small class="hint">(دور إضافي)</small>` : ""}</span>${Object.keys(u.overrides || {}).length ? chip("info", "استثناءات", 1) : ""}${u.active ? chip("ok", "نشط") : chip("bad", "موقوف")}</div>`).join("") || `<p class="hint">مفيش حد</p>`}
            <h4 class="mini-h">جرّبها</h4><p class="hint">ادخل بحساب حد عنده «${esc(roleName(r))}» من لوحة الديمو وشوف القايمة والزراير اتغيرت إزاي.</p></section></div>`;
    },
    users() {
      // account management: invite, edit, several roles (Q48), unlock, reset password, last working day
      const st = S(), q = (ui("usQ") || "").toLowerCase(), f = ui("usF") || "", mng = A.canDo("access", "create") || editable();
      const ST = { active: ["ok", "نشط"], invited: ["warn", "مستني التفعيل"], locked: ["bad", "مقفول"], disabled: ["", "موقوف"] };
      const stOf = (u) => (!u.active ? "disabled" : u.status || "active");
      const list = st.users.filter((u) => (!q || (A.person(u.id) + u.email + u.role).toLowerCase().includes(q)) && (!f || stOf(u) === f));
      const n = (k) => st.users.filter((u) => stOf(u) === k).length;
      return `<div class="kpis sm">${U.kpi("نشط", n("active"), "حسابات شغالة", "users", "ok")}${U.kpi("مستني التفعيل", n("invited"), "اتبعتلهم إيميل", "send", "warn")}${U.kpi("مقفول", n("locked"), "بعد 5 محاولات غلط", "lock", "bad")}${U.kpi("موقوف", n("disabled"), "مشيوا أو اتوقفوا", "x")}</div>
        <div class="toolbar"><label class="search">${I("search")}<input type="search" id="us-q" placeholder="اسم، إيميل، دور" value="${esc(ui("usQ") || "")}" data-change="usQ"></label><select data-change="usF" aria-label="الحالة">${opt("", "كل الحالات", f)}${Object.entries(ST).map(([k, [, l]]) => opt(k, l, f)).join("")}</select><span class="spacer"></span>${A.canDo("access", "create") ? `<button class="btn" data-act="userNew">${I("plus")}حساب جديد</button>` : ""}</div>
        ${table(["المستخدم", "الأدوار", "القسم", "آخر دخول", "OTP بالإيميل", "استثناءات", "الحالة", ""], list.map((u) => { const p = st.people.find((x) => x.id === u.id) || {}, s_ = stOf(u); return `<tr><td>${A.who(u.id)}<span class="sub mono">${esc(u.email)}</span></td><td>${A.rolesOf(u.id).map((r, i) => chip(i ? "" : "info", roleName(r), i ? 1 : 0)).join(" ")}</td><td>${esc(p.dept || "")}</td><td>${u.lastLogin ? A.ago(u.lastLogin) : "—"}</td><td>${u.twofa ? chip("ok", "مفعّل") : chip("warn", "لأ")}</td><td>${Object.keys(u.overrides || {}).length ? chip("info", Object.keys(u.overrides).length + " استثناء") : "—"}</td><td>${chip(ST[s_][0], ST[s_][1])}${u.endDate ? `<span class="sub">آخر يوم ${A.fmtDate(u.endDate)}</span>` : ""}${u.failed && s_ === "active" ? `<span class="sub">${u.failed} محاولات غلط</span>` : ""}</td><td>${mng ? `<div class="row"><button class="btn ghost sm" data-act="userEdit" data-id="${u.id}">تعديل</button><button class="btn ghost sm" data-act="userPerm" data-id="${u.id}">صلاحيات</button>${s_ === "locked" ? `<button class="btn sm" data-act="userUnlock" data-id="${u.id}">افتح الحساب</button>` : ""}${s_ === "invited" ? `<button class="btn ghost sm" data-act="userInvite" data-id="${u.id}">ابعت التفعيل تاني</button>` : ""}${s_ === "active" || s_ === "locked" ? `<button class="btn ghost sm" data-act="userReset" data-id="${u.id}">باسورد</button>` : ""}<button class="btn ghost sm" data-act="userToggle" data-id="${u.id}">${u.active ? "وقّف" : "فعّل"}</button></div>` : ""}</td></tr>`; }))}
        ${note("الحساب الجديد بيوصله إيميل تفعيل يعمل منه الباسورد. الحساب بيتقفل بعد 5 محاولات دخول غلط، وبيتوقف أوتوماتيك في آخر يوم شغل، والليدز والمهام المفتوحة بتاعته بتتنقل لحد تاني. والموظف اللي عنده أكتر من دور بياخد صلاحياتهم مع بعض.")}`;
    },
    audit() {
      const st = S(), f = ui("auF") || "", list = st.audit.filter((x) => !f || x.mod === f);
      return `<div class="toolbar"><select id="au-f" data-change="auF">${opt("", "كل الموديولات", f)}${A.MODS.map((m) => opt(m, A.NAV[m][0], f)).join("")}</select><span class="spacer"></span>${U.exportBtn("audit", "Audit Log")}</div>
        <div class="timeline">${list.slice(0, 80).map((x) => `<div><b>${esc(x.text)}</b><small>${esc(A.person(x.by))} · ${esc((A.NAV[x.mod] || [x.mod])[0])} · ${A.fmtDate(x.at)} ${A.fmtTime(x.at)}</small></div>`).join("") || U.empty("مفيش حركات", "clock")}</div>`;
    }
  };
  A.CHANGE.acRole = (v) => { ui("acRole", v); A.render(); };
  A.ACT.acScope = (d) => { if (!editable()) return; const [r, s] = d.v.split("|"); S().perms[r].scope = s; A.audit("access", `نطاق ${roleName(r)} بقى ${s}`); A.render(); };
  A.CHANGE.perm = (v, el) => { if (!editable()) return; keep(); const d = el.dataset, T = target(d), m = d.m, k = d.k; let s = T.get(m).replace(k, ""); if (v) s += k; if (k === "v" && !v) s = ""; T.set(m, norm(s)); after(d, `${T.name} · ${A.NAV[m][0]}: ${v ? "اتضاف" : "اتشال"} «${ACT_L.find((x) => x[0] === k)[1]}»`); };
  A.ACT.permRow = (d) => { if (!editable()) return; keep(); const T = target(d), full = T.get(d.m) === ALL; T.set(d.m, full ? "" : ALL); after(d, `${T.name} · ${A.NAV[d.m][0]}: ${full ? "اتقفل كله" : "اتفتح كله"}`); };
  A.ACT.permCol = (d) => { if (!editable()) return; keep(); const T = target(d), on = !A.MODS.every((m) => T.get(m).includes(d.k)), l = ACT_L.find((x) => x[0] === d.k)[1];
    A.MODS.forEach((m) => { let s = T.get(m).replace(d.k, ""); if (on) s += d.k; if (d.k === "v" && !on) s = ""; T.set(m, norm(s)); }); after(d, `${T.name}: «${l}» ${on ? "اتفتحت" : "اتقفلت"} في كل الموديولات`); };
  A.ACT.permPreset = (d) => { if (!editable()) return; keep(); const p = S().perms[d.r].p; A.MODS.forEach((m) => { p[m] = { all: ALL, view: "v", none: "" }[d.v]; }); if (d.v !== "none") p.home = p.home || "v"; after(d, `${roleName(d.r)}: الصلاحيات بقت «${{ all: "كله", view: "يشوف بس", none: "ولا حاجة" }[d.v]}»`); };
  A.ACT.acPick = (d) => { ui("acRole", d.v); A.render(); };
  A.ACT.userPerm = (d) => userPerm(d.id);
  A.ACT.userPermReset = (d) => { const u = S().users.find((x) => x.id === d.id); u.overrides = {}; after({ u: d.id }, `${A.person(d.id)}: الصلاحيات رجعت زي الدور`); };
  // roles: new / edit / copy / delete. A new role "works like" a built-in one (who it shows in inboxes, its home), and its matrix is free
  const roleForm = (k, copy) => { const x = k ? S().perms[k] : { tier: "Executive Staff", scope: "own" }, base = k ? x.base || (A.ROLES[k] ? k : "sales") : "sales";
    A.openModal(k && !copy ? `تعديل ${roleName(k)}` : "دور جديد", `<form class="form" data-form="roleSave"><input type="hidden" name="id" value="${copy ? "" : k || ""}">
      ${field("اسم الدور", `<input name="label" required value="${esc(k ? roleName(k) + (copy ? " (نسخة)" : "") : "")}">`, 1)}
      ${field("المستوى في الهيكل", `<select name="tier">${TIERS.map(([t, ar]) => opt(t, `${t} · ${ar}`, x.tier)).join("")}</select>`)}
      ${field("بيشتغل زي (الصفحة الرئيسية والتنبيهات)", `<select name="base" ${k && A.ROLES[k] && !copy ? "disabled" : ""}>${Object.keys(A.ROLES).map((r) => opt(r, A.ROLES[r].label, base)).join("")}</select>`)}
      ${field("نطاق البيانات", `<select name="scope">${SCOPES.map(([s, l]) => opt(s, l, x.scope)).join("")}</select>`)}
      ${!k ? field("ابدأ بصلاحيات", `<select name="from">${opt("", "ولا حاجة (هتختار من المصفوفة)", "")}${Object.keys(S().perms).map((r) => opt(r, "زي " + roleName(r), "")).join("")}</select>`) : copy ? `<input type="hidden" name="from" value="${k}">` : ""}
      <div class="row end"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("check")}حفظ</button></div></form>`); };
  A.ACT.roleNew = () => roleForm();
  A.ACT.roleEdit = (d) => roleForm(d.v);
  A.ACT.roleClone = (d) => roleForm(d.v, 1);
  A.FORM.roleSave = (f) => {
    const st = S(); let k = f.id;
    if (!k) { k = "r" + Date.now().toString(36); const src = f.from && st.perms[f.from]; st.perms[k] = { p: Object.fromEntries(A.MODS.map((m) => [m, src ? src.p[m] || "" : m === "home" ? "v" : ""])) }; }
    const x = st.perms[k]; x.label = f.label.trim(); x.tier = f.tier; x.scope = f.scope; if (!A.ROLES[k]) x.base = f.base || x.base;
    if (A.ROLES[k] && x.label === A.ROLES[k].label) delete x.label;
    A.audit("access", `${f.id ? "اتعدّل" : "اتعمل"} دور «${x.label || roleName(k)}» · ${x.tier} · ${roleName(x.base || k)}`); ui("acRole", k); A.closeModal(); A.toast("اتحفظ"); A.render(); };
  A.ACT.roleDel = (d) => { if (usersWith(d.v).length || A.ROLES[d.v]) return; const n = roleName(d.v); delete S().perms[d.v]; ui("acRole", ""); A.audit("access", `اتمسح دور «${n}»`); A.toast("الدور اتمسح"); A.render(); };
  A.CHANGE.usQ = (v) => { ui("usQ", v); A.render(); };
  A.CHANGE.usF = (v) => { ui("usF", v); A.render(); };
  const invite = (u) => { u.invite = "INV-" + Math.random().toString(36).slice(2, 6).toUpperCase(); A.sendMail(u.email, "فعّل حسابك على Places ERP", `اتعملك حساب بدور ${roleName(u.role)}. دوس على اللينك عشان تعمل الباسورد بتاعك.`, { kind: "invite", token: u.invite }); };
  A.ACT.userToggle = (d) => {
    const st = S(), u = st.users.find((x) => x.id === d.id); u.active = !u.active;
    if (!u.active) { u.status = "disabled"; const open = st.leads.filter((l) => l.sales === u.id && !["Done Deal", "Not Interested", "Cancellation"].includes(l.stage)); open.forEach((l) => { l.sales = A.nextSales(l.area, u.id); A.log(l, `اتنقل من ${A.person(u.id)} (الحساب اتوقف)`, "system"); }); if (A.uid === u.id) A.signOut(); A.toast(`${A.person(u.id)} اتوقف · ${open.length} ليد اتنقلوا`); }
    else { u.status = u.pw ? "active" : "invited"; u.endDate = ""; A.toast(`${A.person(u.id)} اتفعّل`); }
    A.audit("access", `${A.person(u.id)}: الحساب ${u.active ? "اتفعّل" : "اتوقف"}`); A.render();
  };
  A.ACT.userUnlock = (d) => { const u = S().users.find((x) => x.id === d.id); u.status = "active"; u.failed = 0; A.audit("access", `${A.person(u.id)}: الحساب اتفتح بعد ما كان مقفول`); A.toast("الحساب اتفتح"); A.render(); };
  A.ACT.userInvite = (d) => { const u = S().users.find((x) => x.id === d.id); invite(u); A.audit("access", `اتبعت إيميل تفعيل تاني لـ ${A.person(u.id)}`); A.toast(`اتبعت إيميل التفعيل على ${u.email}`); A.render(); };
  A.ACT.userReset = (d) => { const u = S().users.find((x) => x.id === d.id), code = String(Math.floor(100000 + Math.random() * 900000)); u.otp = { code, exp: A.NOW() + 10 * 60000, sentAt: A.NOW() }; A.sendMail(u.email, `كود تغيير الباسورد: ${code}`, "الأدمن طلب تغيير الباسورد بتاعك. ادخل على «نسيت الباسورد» واكتب الكود ده.", { kind: "otp", code }); A.audit("access", `اتبعت كود تغيير الباسورد لـ ${A.person(u.id)}`); A.toast(`اتبعت كود تغيير الباسورد على ${u.email}`); };
  const roleOpts = (sel) => Object.keys(S().perms).filter((k) => k !== "admin" || A.role === "admin").map((k) => opt(k, roleName(k), sel)).join("");
  const accountForm = (u, p, e) => `${field("الاسم", `<input name="name" id="ua-n" required value="${esc(p.name || "")}">`, 1)}${field("الإيميل", `<input name="email" id="ua-e" type="email" required value="${esc(u.email || "")}">`, 1)}${field("الموبايل", `<input name="phone" id="ua-p" value="${esc(u.phone || "")}">`)}${field("القسم", `<input name="dept" id="ua-d" required value="${esc(p.dept || "")}">`, 1)}
    ${field("الدور الأساسي", `<select name="role" id="ua-r">${roleOpts(u.role)}</select>`, 1)}${field("أدوار إضافية (لو بيعمل أكتر من حاجة)", `<select name="extra" id="ua-x" multiple size="4">${Object.keys(S().perms).filter((k) => k !== "admin").map((k) => opt(k, roleName(k), (u.extraRoles || []).includes(k) ? k : "")).join("")}</select>`)}
    ${field("الـ Team Leader (للسيلز)", `<select name="tl" id="ua-tl">${opt("", "—")}${S().people.filter((x) => x.role === "tl").map((x) => opt(x.id, x.name, e.tl || p.tl)).join("")}</select>`)}${field("آخر يوم شغل (الحساب بيتوقف فيه)", `<input name="endDate" id="ua-end" type="date" value="${esc(u.endDate || "")}">`)}
    <label class="tog wide"><input type="checkbox" name="twofa" ${u.twofa ? "checked" : ""}>كود OTP على الإيميل مع كل دخول</label>`;
  A.ACT.userNew = () => A.openModal("حساب جديد", `<form data-form="userNew" class="grid">${accountForm({ twofa: false }, {}, {})}<div class="row end wide"><span class="hint spacer">هيتعمل له فايل موظف في الـ HR، ويوصله إيميل تفعيل يعمل منه الباسورد.</span><button class="btn">${I("send")}اعمل الحساب وابعت التفعيل</button></div></form>`);
  A.ACT.userEdit = (d) => { const st = S(), u = st.users.find((x) => x.id === d.id), p = st.people.find((x) => x.id === d.id) || {}, e = st.employees.find((x) => x.id === d.id) || {}; A.openModal(`تعديل ${p.name}`, `<form data-form="userEdit" class="grid"><input type="hidden" name="id" value="${u.id}">${accountForm(u, p, e)}<div class="row end wide"><button class="btn">احفظ</button></div></form>`); };
  const extras = (form, primary) => [...form.querySelector("#ua-x").selectedOptions].map((o) => o.value).filter((r) => r !== primary);
  A.FORM.userNew = (f, form) => {
    const st = S(); if (st.users.some((u) => u.email.toLowerCase() === f.email.toLowerCase())) { A.toast("الإيميل ده عليه حساب قبل كده"); return; }
    const id = "n" + Date.now().toString(36), u = { id, role: f.role, extraRoles: extras(form, f.role), active: true, status: "invited", email: f.email, phone: f.phone, pw: "", pwChangedAt: "", failed: 0, lastLogin: "", twofa: !!f.twofa, endDate: f.endDate || "", overrides: {} };
    st.people.push({ id, name: f.name, role: f.role, dept: f.dept, tl: f.tl || "" }); st.users.push(u);
    st.employees.push({ id, name: f.name, role: f.role, dept: f.dept, salary: 12000, target: 0, commissionPct: f.role === "sales" ? 30 : 0, kind: "Full-time", deduction: null, tl: f.tl || "", leaveBalance: 21, leaveUsed: 0, joined: A.today() });
    invite(u); A.audit("access", `اتعمل حساب ${f.name} بدور ${roleName(f.role)}${u.extraRoles.length ? " + " + u.extraRoles.map(roleName).join(" + ") : ""}`); A.closeModal(); A.toast(`الحساب اتعمل · اتبعت إيميل التفعيل على ${f.email}`); A.render();
  };
  A.FORM.userEdit = (f, form) => {
    const st = S(), u = st.users.find((x) => x.id === f.id), p = st.people.find((x) => x.id === f.id), e = st.employees.find((x) => x.id === f.id), before = `${roleName(u.role)}${(u.extraRoles || []).length ? " + " + u.extraRoles.map(roleName).join(" + ") : ""}`;
    if (st.users.some((x) => x.id !== u.id && x.email.toLowerCase() === f.email.toLowerCase())) { A.toast("الإيميل ده عليه حساب تاني"); return; }
    Object.assign(u, { role: f.role, extraRoles: extras(form, f.role), email: f.email, phone: f.phone, twofa: !!f.twofa, endDate: f.endDate || "" }); Object.assign(p, { name: f.name, role: f.role, dept: f.dept, tl: f.tl || "" }); if (e) Object.assign(e, { name: f.name, role: f.role, dept: f.dept, tl: f.tl || "" });
    A.audit("access", `${f.name}: الأدوار ${before} ← ${roleName(u.role)}${u.extraRoles.length ? " + " + u.extraRoles.map(roleName).join(" + ") : ""}`); A.closeModal(); A.toast("اتحفظ · الصلاحيات بتتطبّق فوراً"); A.render();
  };
  A.CHANGE.auF = (v) => { ui("auF", v); A.render(); };

  /* ---------- M-13 settings & master data ---------- */
  V.master = {
    sub: () => "القوايم والقواعد اللي بيتبني عليها السيستم · بتتعدّل من غير برمجة",
    render() {
      const st = S(), t = ui("msTab") || "lists", ed = A.canDo("master", "edit");
      const list = (key, label, items, render) => `<section class="card">${head(label, "list", chip("", items.length + "", 1))}<div class="chips-edit">${items.map((x, i) => `<span class="chip-e">${render ? render(x) : esc(x)}${ed ? `<button data-act="msDel" data-k="${key}" data-i="${i}" aria-label="شيل">${I("x")}</button>` : ""}</span>`).join("")}</div>${ed ? `<form class="row" data-form="msAdd"><input type="hidden" name="k" value="${key}"><input name="v" id="ms-${key}" placeholder="إضافة…" required><button class="btn ghost sm">${I("plus")}إضافة</button></form>` : ""}</section>`;
      let body = "";
      if (t === "lists") body = `<div class="cols">${list("areas", "المناطق (Areas)", st.areas)}${list("channels", "الـ Channels", st.channels)}${list("companyCats", "كاتيجوريز الشركات", st.companyCats)}${list("vendors", "الموردين", st.vendors)}</div>`;
      if (t === "stages") body = `<section class="card">${head("مراحل الليد", "layers", "", "الترتيب، وأنهي مرحلة بتحسب Qualified")}${table(["#", "المرحلة", "Qualified؟", "عدد الليدز"], st.stages.map((s, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(s)}</b></td><td>${["Fresh", "Not Interested", "No Answer"].includes(s) ? chip("", "لأ", 1) : chip("ok", "اه · أوتوماتيك")}</td><td class="n">${st.leads.filter((l) => l.stage === s).length}</td></tr>`))}</section>`;
      if (t === "time") body = `<div class="cols"><section class="card">${head("قواعد الـ SLA", "clock")}<ul class="rules"><li><b>تنبيه</b><span>${A.dur(st.leadRules.sla.warnMin)} (أيام الشغل) · ${A.dur(st.leadRules.sla.holWarnMin)} (الإجازات)</span></li><li><b>سحب الليد</b><span>${A.dur(st.leadRules.sla.pullMin)} · ${A.dur(st.leadRules.sla.holPullMin)} في الإجازات</span></li><li><b>No Answer</b><span>يوم عند كل سيلز · Telesales في الروتيشن رقم ${st.leadRules.noAnswer.toTelesalesAt}</span></li></ul><a class="btn ghost sm" href="#settings">عدّل من قواعد الليدز</a></section>
          <section class="card">${head("ميعاد الشغل والخصم", "fingerprint")}<ul class="rules"><li><b>ميعاد الشغل</b><span>11:00 لكل الناس</span></li><li><b>الشرايح</b><span>لحد 11:16 · ربع · نص · يوم</span></li><li><b>Excuse</b><span>2 مجاناً في الشهر · 3 و4 نص يوم · 5 رفد</span></li></ul><a class="btn ghost sm" href="#hr" data-act="goHr" data-tab="rules">عدّل من الـ HR</a></section>
          <section class="card">${head("أنواع الإجازات", "calendar")}${table(["النوع", "الرصيد السنوي"], st.leaveTypes.map((x, i) => `<tr><td>${esc(x.name)}</td><td>${ed ? `<input type="number" value="${x.days}" data-change="ltDays" data-i="${i}" style="max-width:90px">` : x.days}</td></tr>`))}</section>
          <section class="card">${head("حد الواتساب اليومي", "megaphone")}<div class="row"><input type="number" id="wa-lim" value="${st.waLimit}" ${ed ? "" : "disabled"} data-change="waLimit" style="max-width:120px"><span class="hint">رسالة في اليوم</span></div></section></div>`;
      if (t === "holidays") body = `<section class="card">${head("كالندر الإجازات الرسمية", "calendar", "", "من يوم لـ يوم (زي العيد) · في أيامها الـ SLA بيمشي بمواعيد يوم الإجازة ومابتتحسبش في ساعات الشغل")}${U.holidays(ed)}</section>`;
      if (t === "budget") body = `<section class="card">${head("بنود المصروفات والـ Budget", "wallet", "", "من شجرة الحسابات · د. علي")}${table(["البند", "النوع", "الـ Budget"], st.budgets.map((b, i) => `<tr><td>${esc(b.line)}</td><td>${esc(b.kind)}</td><td>${ed ? `<input type="number" value="${b.budget}" data-change="budSet" data-i="${i}" style="max-width:140px">` : A.money(b.budget)}</td></tr>`))}</section>`;
      return `<div class="row">${U.tabs("msTab", [["lists", "القوايم"], ["stages", "مراحل الليد"], ["time", "المواعيد والقواعد"], ["holidays", "الإجازات الرسمية", st.holidays.length], ["budget", "بنود المصروفات"]], t)}</div>${!ed ? note("عرض بس · التعديل لـ Super Admin أو مدير القسم.") : ""}${body}`;
    }
  };
  A.ACT.msTab = (d) => { ui("msTab", d.v); A.render(); };
  A.FORM.msAdd = (f) => { const arr = S()[f.k]; if (!arr.includes(f.v)) arr.push(f.v); A.audit("master", `اتضاف «${f.v}» لـ ${f.k}`); A.toast("اتضاف · ظاهر في كل الشاشات"); A.render(); };
  A.ACT.msDel = (d) => { const arr = S()[d.k], v = arr[+d.i]; arr.splice(+d.i, 1); A.audit("master", `اتشال «${v}» من ${d.k}`); A.toast("اتشال من القوايم الجديدة · البيانات القديمة زي ما هي", () => arr.splice(+d.i, 0, v)); A.render(); };
  A.CHANGE.ltDays = (v, el) => { S().leaveTypes[+el.dataset.i].days = +v; A.audit("master", "رصيد إجازة اتغير"); };
  A.CHANGE.waLimit = (v) => { S().waLimit = +v; A.audit("master", `حد الواتساب بقى ${v}`); A.toast("اتحفظ"); };
  A.CHANGE.budSet = (v, el) => { const b = S().budgets[+el.dataset.i]; A.audit("master", `Budget ${b.line}: ${b.budget} ← ${v}`); b.budget = +v; A.toast("اتحفظ"); };
  A.FORM.holAdd = (f) => {
    const to = f.to || f.from; if (to < f.from) { A.toast("«لحد» لازم يبقى بعد «من» أو نفس اليوم"); return; }
    S().holidays.push({ from: f.from, to, name: f.name }); A.audit("master", `إجازة رسمية: ${f.name} من ${f.from} لـ ${to}`); A.toast(`اتضافت · ${f.name}`); A.render();
  };
  A.ACT.holDel = (d) => { const h = S().holidays.splice(+d.i, 1)[0]; if (h) A.audit("master", `اتشالت الإجازة الرسمية: ${h.name}`); A.toast("اتشالت"); A.render(); };

  /* ---------- M-14 notifications & email (no external integrations) ---------- */
  V.integrations = {
    sub: () => "الإشعارات بتوصل جوه السيستم وPush وعلى الإيميل · قواعد كل حدث",
    render() {
      const st = S(), ed = A.canDo("integrations", "edit"), mine = st.notifPrefs && st.notifPrefs[A.me()] === false;
      return `<div class="cols">
          <section class="card">${head("إيميل الإرسال", "send", "", "الإيميل اللي كل الإشعارات بتطلع منه")}${field("من", `<input type="email" id="nf-from" value="${esc(st.notifEmail || "")}" ${ed ? "" : "disabled"} data-change="nfFrom">`)}<div class="row end"><button class="btn ghost sm" data-act="nfTest">${I("send")}ابعت إيميل تجربة</button></div></section>
          <section class="card">${head("تفضيلاتي", "bell", "", "الإشعارات المهمة بتوصلك دايماً جوه السيستم")}<label class="tog"><input type="checkbox" ${mine ? "" : "checked"} data-change="nfMine">ابعتلي الإشعارات كمان على الإيميل</label>${note("الإشعارات المهمة (Alarm / سحب ليد / رفد) ماتتقفلش غير لما تتقري، حتى لو قافل الإيميل.")}</section>
        </div>
        <section class="card">${head("قواعد الإشعارات", "bell", "", "كل حدث بيروح لمين، جوه السيستم و/أو Push و/أو إيميل")}${table(["الحدث", "لمين", "جوه السيستم", "Push", "إيميل"], st.notifRules.map((n, i) => `<tr><td><b>${esc(n.ev)}</b></td><td>${esc(n.to)}</td>${["app", "push", "email"].map((c) => `<td class="c"><label class="tick"><input type="checkbox" ${n.ch.includes(c) ? "checked" : ""} ${ed ? "" : "disabled"} data-change="nrSet" data-i="${i}" data-c="${c}"><span></span></label></td>`).join("")}</tr>`))}</section>
        ${note(`إشعارات الليدز (ليد جديد، الـ SLA، السحب، No Answer، الـ Visit، الإقفال) بتتعدّل مع قواعدها من <a href="#settings">قواعد الليدز والتوزيع</a>.`)}
        ${note("مفيش ربط مع أنظمة بره في المرحلة دي غير جهاز البصمة: الإشعارات جوه السيستم وPush notifications وعلى الإيميل.")}`;
    }
  };
  A.CHANGE.nrSet = (v, el) => { const n = S().notifRules[+el.dataset.i], c = el.dataset.c; n.ch = v ? [...new Set([...n.ch, c])] : n.ch.filter((x) => x !== c); A.audit("integrations", `قاعدة «${n.ev}» اتعدّلت`); };
  A.CHANGE.nfFrom = (v) => { S().notifEmail = v; A.audit("integrations", `إيميل الإرسال بقى ${v}`); A.toast("اتحفظ"); };
  A.CHANGE.nfMine = (v) => { const st = S(); st.notifPrefs = st.notifPrefs || {}; st.notifPrefs[A.me()] = !!v; A.toast(v ? "هيوصلك كمان على الإيميل" : "جوه السيستم بس"); };
  A.ACT.nfTest = () => A.toast(`اتبعت إيميل تجربة من ${S().notifEmail || "—"}`);
})();
