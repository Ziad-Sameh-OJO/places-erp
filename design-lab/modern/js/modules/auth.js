/* M-09 sign-in: e-mail + password, OTP by e-mail (M-09 2.6), lock after 5 wrong attempts, forgot password, account activation
   from the invitation e-mail, a demo mailbox that shows every e-mail the system sends, and the «حسابي» page. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, field, head, note, kv } = U;
  const V = (window.VIEWS = window.VIEWS || {});
  const hash = window.PWHASH;
  const MAX_TRIES = 5, OTP_MIN = 10, RESEND_SEC = 60;
  let step = "login", pending = null, msg = "", email = "", token = "";
  const byEmail = (e) => (S().users || []).find((u) => u.email.toLowerCase() === String(e || "").trim().toLowerCase());
  const strong = (pw) => pw.length >= 8 && /[A-Za-z؀-ۿ]/.test(pw) && /\d/.test(pw);
  const code6 = () => String(Math.floor(100000 + Math.random() * 900000));

  // every e-mail the system sends lands in this demo mailbox (OTP, activation, password reset, quarterly sheets)
  A.sendMail = (to, subject, body, extra) => { const st = S(); (st.mails = st.mails || []).unshift(Object.assign({ id: "M-" + Date.now().toString(36), to, subject, body, at: A.nowIso() }, extra || {})); A.save(); };
  function sendOtp(u, why, title) { u.otp = { code: code6(), exp: A.NOW() + OTP_MIN * 60000, sentAt: A.NOW() }; A.sendMail(u.email, `${title || "كود الدخول"}: ${u.otp.code}`, `${why} · الكود بيخلص بعد ${OTP_MIN} دقايق.`, { kind: "otp", code: u.otp.code }); }

  /* ---------- the sign-in screen ---------- */
  function shell(inner) {
    const demo = (S().users || []).filter((u) => u.status === "active").slice(0, 40);
    return `<div class="auth-card"><div class="auth-brand"><span class="brand-mark" aria-hidden="true">${document.querySelector(".brand-mark") ? document.querySelector(".brand-mark").innerHTML : ""}</span><div><strong>Places ERP</strong><small>BY RECA TECH</small></div></div>${inner}
        <button class="btn ghost sm auth-mail" data-act="mailbox">${I("send")}صندوق الإيميل (ديمو)</button></div>
      <aside class="auth-demo"><b>حسابات الديمو</b><p class="hint">دوس على أي حساب يتملى الإيميل والباسورد، وبعدين دوس «دخول».</p>
        <div class="auth-list">${demo.map((u) => `<button class="auth-acc" data-act="authPick" data-e="${esc(u.email)}">${A.avatar(u.id, 1)}<span><b>${esc(A.person(u.id))}</b><small>${esc(A.roleLabel(u.role))}${u.twofa ? " · OTP" : ""}</small></span></button>`).join("")}</div></aside>`;
  }
  const err = () => (msg ? `<div class="auth-msg" role="alert">${esc(msg)}</div>` : "");
  const VIEWS_AUTH = {
    login: () => `<h1>تسجيل الدخول</h1><p class="hint">ادخل بإيميل الشغل والباسورد بتاعك.</p>${err()}
      <form data-form="authLogin" class="auth-form">${field("الإيميل", `<input name="email" id="au-email" type="email" autocomplete="username" required value="${esc(email)}">`, 1)}${field("الباسورد", `<input name="pw" id="au-pw" type="password" autocomplete="current-password" required>`, 1)}
        <button class="btn">دخول</button><button type="button" class="btn ghost sm" data-act="authStep" data-v="forgot">نسيت الباسورد؟</button></form>`,
    otp: () => { const u = A.userOf(pending), wait = Math.max(0, RESEND_SEC - Math.floor((A.NOW() - u.otp.sentAt) / 1000)); return `<h1>كود التأكيد</h1><p class="hint">بعتنا كود من 6 أرقام على <b>${esc(u.email)}</b>.</p>${err()}
      <form data-form="authOtp" class="auth-form">${field("الكود", `<input name="code" id="au-code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code">`, 1)}<button class="btn">تأكيد</button>
        <button type="button" class="btn ghost sm" data-act="authResend" ${wait ? "disabled" : ""}>${wait ? `تقدر تطلب كود تاني بعد ${wait} ثانية` : "ابعت كود تاني"}</button><button type="button" class="btn ghost sm" data-act="authStep" data-v="login">رجوع</button></form>`; },
    forgot: () => `<h1>نسيت الباسورد</h1><p class="hint">اكتب إيميلك وهنبعتلك كود تغيير الباسورد.</p>${err()}
      <form data-form="authForgot" class="auth-form">${field("الإيميل", `<input name="email" id="au-fe" type="email" required value="${esc(email)}">`, 1)}<button class="btn">ابعت الكود</button><button type="button" class="btn ghost sm" data-act="authStep" data-v="login">رجوع</button></form>`,
    reset: () => `<h1>باسورد جديد</h1><p class="hint">الكود اتبعت على <b>${esc(email)}</b>.</p>${err()}
      <form data-form="authReset" class="auth-form">${field("الكود", `<input name="code" id="au-rc" inputmode="numeric" maxlength="6" required>`, 1)}${field("الباسورد الجديد", `<input name="pw" id="au-np" type="password" autocomplete="new-password" required>`, 1)}${field("أكّد الباسورد", `<input name="pw2" id="au-np2" type="password" autocomplete="new-password" required>`, 1)}
        <p class="hint">8 حروف على الأقل، فيهم حرف ورقم.</p><button class="btn">غيّر الباسورد</button><button type="button" class="btn ghost sm" data-act="authStep" data-v="login">رجوع</button></form>`,
    activate: () => { const u = (S().users || []).find((x) => x.invite === token); return u ? `<h1>تفعيل الحساب</h1><p class="hint">أهلاً ${esc(A.person(u.id))} · اعمل الباسورد بتاعك لحساب <b>${esc(u.email)}</b>.</p>${err()}
      <form data-form="authActivate" class="auth-form">${field("الباسورد", `<input name="pw" id="au-ap" type="password" autocomplete="new-password" required>`, 1)}${field("أكّد الباسورد", `<input name="pw2" id="au-ap2" type="password" autocomplete="new-password" required>`, 1)}<p class="hint">8 حروف على الأقل، فيهم حرف ورقم.</p><button class="btn">فعّل الحساب</button></form>` : `<h1>اللينك خلص</h1><p class="hint">لينك التفعيل ده مش شغال. اطلب من الـ HR يبعتلك واحد جديد.</p><button class="btn ghost" data-act="authStep" data-v="login">رجوع</button>`; }
  };
  A.renderAuth = () => {
    let el = document.getElementById("auth");
    if (!el) { document.body.insertAdjacentHTML("beforeend", `<div class="auth" id="auth" dir="rtl" lang="ar"></div>`); el = document.getElementById("auth"); }
    document.body.classList.add("signed-out"); el.hidden = false; el.innerHTML = shell(VIEWS_AUTH[step]());
    const f = el.querySelector("form input:not([type=hidden])"); if (f && !f.value) f.focus();
  };
  A.hideAuth = () => { const el = document.getElementById("auth"); if (el) el.hidden = true; document.body.classList.remove("signed-out"); };
  const go = (s, m) => { step = s; msg = m || ""; A.renderAuth(); };
  A.ACT.authStep = (d) => go(d.v);
  A.ACT.authPick = (d) => { email = d.e; go("login"); const pw = document.getElementById("au-pw"); if (pw) { pw.value = S().pwHashSeed; } };
  const finish = (u) => { pending = null; step = "login"; msg = ""; email = ""; A.signIn(u.id); location.hash = A.navList()[0]; A.render(); A.toast(`أهلاً ${A.person(u.id)}`); };
  A.FORM.authLogin = (f) => {
    const u = byEmail(f.email); email = f.email;
    if (!u) return go("login", "الإيميل ده مش متسجّل على السيستم.");
    if (u.status === "invited") return go("login", "الحساب ده لسه ماتفعّلش · افتح إيميل التفعيل اللي اتبعتلك.");
    if (!u.active || u.status === "disabled") return go("login", "الحساب ده موقوف · كلّم الـ HR أو الأدمن.");
    if (u.status === "locked") return go("login", `الحساب اتقفل بعد ${MAX_TRIES} محاولات غلط · الأدمن يقدر يفتحه، أو غيّر الباسورد من «نسيت الباسورد».`);
    if (u.pw !== hash(f.pw)) { u.failed = (u.failed || 0) + 1; if (u.failed >= MAX_TRIES) { u.status = "locked"; A.audit("access", `${A.person(u.id)}: الحساب اتقفل بعد ${MAX_TRIES} محاولات غلط`); A.notify(["admin"], `حساب ${A.person(u.id)} اتقفل بعد ${MAX_TRIES} محاولات غلط`); } A.save(); return go("login", u.status === "locked" ? `الحساب اتقفل بعد ${MAX_TRIES} محاولات غلط.` : `الباسورد غلط · فاضلك ${MAX_TRIES - u.failed} محاولات قبل ما الحساب يتقفل.`); }
    if (u.twofa) { pending = u.id; sendOtp(u, "حد بيحاول يدخل على حسابك"); return go("otp"); }
    finish(u);
  };
  A.FORM.authOtp = (f) => { const u = A.userOf(pending); if (!u || !u.otp) return go("login"); if (A.NOW() > u.otp.exp) return go("otp", "الكود خلص · اطلب كود جديد."); if (String(f.code).trim() !== u.otp.code) return go("otp", "الكود غلط."); u.otp = null; finish(u); };
  A.ACT.authResend = () => { const u = A.userOf(pending); sendOtp(u, "كود جديد"); go("otp", "اتبعت كود جديد."); };
  A.FORM.authForgot = (f) => { const u = byEmail(f.email); email = f.email; if (!u || u.status === "invited") return go("forgot", "الإيميل ده مش متسجّل أو الحساب لسه ماتفعّلش."); sendOtp(u, "طلب تغيير الباسورد", "كود تغيير الباسورد"); go("reset"); };
  A.FORM.authReset = (f) => { const u = byEmail(email); if (!u || !u.otp || String(f.code).trim() !== u.otp.code || A.NOW() > u.otp.exp) return go("reset", "الكود غلط أو خلص."); if (!strong(f.pw)) return go("reset", "الباسورد لازم 8 حروف على الأقل، فيهم حرف ورقم."); if (f.pw !== f.pw2) return go("reset", "الباسوردين مش زي بعض."); Object.assign(u, { pw: hash(f.pw), pwChangedAt: A.nowIso(), failed: 0, otp: null, status: u.status === "locked" ? "active" : u.status }); A.audit("access", `${A.person(u.id)} غيّر الباسورد من «نسيت الباسورد»`); A.save(); go("login", "الباسورد اتغيّر · ادخل بالباسورد الجديد."); };
  A.FORM.authActivate = (f) => { const u = (S().users || []).find((x) => x.invite === token); if (!u) return go("activate"); if (!strong(f.pw)) return go("activate", "الباسورد لازم 8 حروف على الأقل، فيهم حرف ورقم."); if (f.pw !== f.pw2) return go("activate", "الباسوردين مش زي بعض."); Object.assign(u, { pw: hash(f.pw), pwChangedAt: A.nowIso(), status: "active", invite: "" }); A.audit("access", `${A.person(u.id)} فعّل حسابه`); A.notify(["hr", "admin"], `${A.person(u.id)} فعّل حسابه`); A.save(); email = u.email; token = ""; go("login", "الحساب اتفعّل · ادخل بالإيميل والباسورد."); };

  /* ---------- the demo mailbox ---------- */
  A.ACT.mailbox = () => {
    const mails = S().mails || [];
    A.openModal("صندوق الإيميل (ديمو)", `${note("في السيستم الحقيقي الإيميلات دي بتوصل على إيميل كل موظف. هنا بتظهر كلها عشان تقدر تجرّب الـ OTP والتفعيل وتغيير الباسورد.")}
      <div class="mail-list">${mails.map((m) => `<article class="mail"><div class="row"><b class="spacer">${esc(m.subject)}</b><small class="hint">${A.ago(m.at)}</small></div><small class="mono">إلى: ${esc(m.to)}</small><p>${esc(m.body)}</p>${m.code ? `<div class="row"><span class="mail-code mono">${esc(m.code)}</span><button class="btn ghost sm" data-act="mailUse" data-c="${esc(m.code)}">استخدم الكود</button></div>` : ""}${m.kind === "invite" && m.token ? `<button class="btn sm" data-act="mailActivate" data-t="${esc(m.token)}">افتح لينك التفعيل</button>` : ""}</article>`).join("") || U.empty("مفيش إيميلات", "send")}</div>`);
  };
  A.ACT.mailUse = (d) => { A.closeModal(); const el = document.getElementById("au-code") || document.getElementById("au-rc"); if (el) { el.value = d.c; el.focus(); } };
  A.ACT.mailActivate = (d) => { A.closeModal(); if (A.uid) A.signOut(); token = d.t; go("activate"); };
  A.ACT.signOut = () => { step = "login"; msg = ""; A.signOut(); };

  /* ---------- account rules: an account stops on the employee's last working day (M-09 2.6) ---------- */
  A.accountRules = () => {
    const st = S(), today = A.today();
    (st.users || []).filter((u) => u.active && u.endDate && u.endDate <= today).forEach((u) => {
      u.active = false; u.status = "disabled";
      st.leads.filter((l) => l.sales === u.id && !["Done Deal", "Not Interested", "Cancellation"].includes(l.stage)).forEach((l) => { l.sales = A.nextSales(l.area, u.id); A.log(l, `اتنقل من ${A.person(u.id)} (آخر يوم شغل)`, "system"); });
      A.audit("access", `${A.person(u.id)}: الحساب اتوقف أوتوماتيك (آخر يوم شغل ${u.endDate})`);
    });
  };

  /* ---------- «حسابي» ---------- */
  V.profile = {
    sub: () => "بياناتك · تغيير الباسورد · الأمان",
    render() {
      const st = S(), u = A.userOf(A.me()) || {}, p = st.people.find((x) => x.id === u.id) || {}, e = st.employees.find((x) => x.id === u.id) || {};
      return `<div class="cols"><section class="card">${head("بياناتي", "id")}${kv([["الاسم", esc(p.name)], ["الإيميل", `<span class="mono">${esc(u.email)}</span>`], ["الموبايل", `<span class="mono">${esc(u.phone || "—")}</span>`], ["الأدوار", A.rolesOf(u.id).map((r) => chip("info", A.roleLabel(r))).join(" ")], ["القسم", esc(p.dept || "—")], ["الـ Team Leader", e.tl ? A.who(e.tl) : "—"], ["آخر دخول", u.lastLogin ? A.ago(u.lastLogin) : "—"], ["آخر تغيير للباسورد", u.pwChangedAt ? A.fmtDate(u.pwChangedAt) : "—"]])}</section>
        <form class="card" data-form="pwChange">${head("تغيير الباسورد", "lock")}${field("الباسورد الحالي", `<input name="cur" id="pc-cur" type="password" autocomplete="current-password" required>`, 1)}${field("الباسورد الجديد", `<input name="pw" id="pc-new" type="password" autocomplete="new-password" required>`, 1)}${field("أكّد الباسورد", `<input name="pw2" id="pc-new2" type="password" autocomplete="new-password" required>`, 1)}<p class="hint">8 حروف على الأقل، فيهم حرف ورقم.</p><div class="row end"><button class="btn">غيّر الباسورد</button></div></form></div>
        <section class="card">${head("الأمان", "lock")}<label class="tog"><input type="checkbox" ${u.twofa ? "checked" : ""} data-change="myOtp">كود OTP على الإيميل مع كل دخول</label><div class="row"><span class="spacer"></span><button class="btn ghost" data-act="signOut">${I("x")}خروج</button></div></section>`;
    }
  };
  A.FORM.pwChange = (f) => { const u = A.userOf(A.me()); if (u.pw !== hash(f.cur)) { A.toast("الباسورد الحالي غلط"); return; } if (!strong(f.pw)) { A.toast("الباسورد لازم 8 حروف على الأقل، فيهم حرف ورقم"); return; } if (f.pw !== f.pw2) { A.toast("الباسوردين مش زي بعض"); return; } u.pw = hash(f.pw); u.pwChangedAt = A.nowIso(); A.audit("access", `${A.person(u.id)} غيّر الباسورد`); A.toast("الباسورد اتغيّر"); A.render(); };
  A.CHANGE.myOtp = (v) => { const u = A.userOf(A.me()); u.twofa = !!v; A.audit("access", `${A.person(u.id)}: OTP بالإيميل ${v ? "اتفعّل" : "اتقفل"}`); A.toast(v ? "هيوصلك كود على الإيميل مع كل دخول" : "اتقفل الـ OTP"); };
})();
