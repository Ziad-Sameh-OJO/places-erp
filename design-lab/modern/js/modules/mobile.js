/* Phones: the demo behaves like an installed app. A bottom tab bar with the person's main pages + «المزيد» (the full menu as a sheet),
   a floating + for «جديد», and every data table turns into a stack of cards (each cell labelled with its column). Desktop is untouched. */
(function () {
  const A = window.APP, I = A.icon, esc = A.esc, $ = (s) => document.querySelector(s);
  const phone = () => matchMedia("(max-width: 760px)").matches;
  // the three pages each job opens most, then «المزيد»
  const PICK = { sales: ["leads", "deals", "kpis"], tl: ["leads", "deals", "kpis"], telesales: ["leads", "tickets", "kpis"], ops: ["leads", "settings", "kpis"], inventory: ["inventory", "tasks", "kpis"], resale: ["inventory", "tasks", "kpis"], inventory_staff: ["notactive", "tickets", "kpis"], marketing: ["marketing", "tasks", "kpis"], photographer: ["tasks", "tickets", "kpis"], designer: ["tasks", "tickets", "kpis"], hr: ["hr", "tickets", "kpis"], accountant: ["finance", "deals", "kpis"], procurement: ["procurement", "tickets", "kpis"], approver: ["procurement", "finance", "kpis"], officemgr: ["deals", "reports", "kpis"], admin: ["leads", "deals", "kpis"], salesdir: ["leads", "deals", "reports"], opshead: ["inventory", "tasks", "kpis"] };
  const SHORT = { home: "الرئيسية", leads: "الليدز", deals: "الصفقات", inventory: "الانفنتوري", notactive: "Not Active", tasks: "المهام", marketing: "التسويق", hr: "الـ HR", tickets: "التذاكر", finance: "المالية", procurement: "المشتريات", reports: "التقارير", kpis: "الـ KPIs", settings: "التوزيع", clients: "العملاء", access: "الصلاحيات" };

  document.body.insertAdjacentHTML("beforeend", `<nav class="tabbar" id="tabbar" aria-label="التنقل السريع"></nav><button class="fab" id="fab" aria-label="جديد">${I("plus")}</button><div class="side-scrim" id="sideScrim" hidden></div>`);
  const view = () => (location.hash || "#home").slice(1);

  let last = null;
  function tabs() {
    const bar = $("#tabbar"); if (!A.uid) { if (last !== "") bar.innerHTML = last = ""; return; }
    const nav = A.navList(), pref = (PICK[A.role] || []).filter((k) => nav.includes(k)), rest = nav.filter((k) => k !== "home" && !pref.includes(k));
    const keys = ["home"].concat(pref, rest).slice(0, 4), cur = view(), more = !keys.includes(cur);
    const html = keys.map((k) => `<a href="#${k}" class="tb${k === cur ? " on" : ""}" aria-current="${k === cur ? "page" : "false"}">${I(A.NAV[k][2])}<span>${esc(SHORT[k] || A.NAV[k][0])}</span></a>`).join("") + `<button class="tb${more ? " on" : ""}" data-act="moreOpen" aria-label="كل الصفحات">${I("list")}<span>المزيد</span></button>`;
    if (html !== last) bar.innerHTML = last = html; // only when it changed (compared with what we built, not the browser's re-serialised markup), so the observer below doesn't loop
  }
  A.ACT.moreOpen = () => { $("#side").classList.add("open"); $("#sideScrim").hidden = false; };
  const moreClose = () => { $("#side").classList.remove("open"); $("#sideScrim").hidden = true; };
  $("#sideScrim").addEventListener("click", moreClose);
  window.addEventListener("hashchange", () => { moreClose(); tabs(); });
  // phones: «جديد» (the +) and demo control open in the same bottom sheet as every other window, not as popups hanging off the
  // top bar (real phones didn't show those). Caught at the document in capture, before the buttons' own desktop handlers.
  document.addEventListener("click", (e) => {
    if (!phone()) return;
    const b = e.target.closest && e.target.closest("#fab, #demoBtn"); if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (b.id === "fab") {
      const m = $("#createMenu"); $("#createBtn").click(); m.hidden = true; // fills the menu (and its item list) the desktop way, then hides the popup
      A.openModal("اعمل حاجة جديدة", `<div class="cm-sheet">${m.innerHTML.replace(/^<strong>[^<]*<\/strong>/, "")}</div>`);
    } else {
      const p = $("#demoPanel"); p.hidden = true;
      A.openModal("تحكم الديمو", `<div class="demo-sheet">${p.innerHTML.replace(/^\s*<strong>[^<]*<\/strong>/, "").replace('id="resetBtn"', 'data-act="demoReset"')}</div>`);
    }
  }, true);
  A.ACT.demoReset = () => { A.closeModal(); document.getElementById("resetBtn").click(); };
  // the scenario panel sits over the page, so the sheet closes first
  document.addEventListener("click", (e) => { if (phone() && e.target.closest && e.target.closest('#modal [data-act="scnStart"]')) A.closeModal(); }, true);

  // tables → cards: label every cell with its column title (CSS shows the label on phones only)
  function label(root) {
    root.querySelectorAll("table:not(.perm)").forEach((t) => {
      const heads = [...t.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      if (!heads.length) return;
      t.classList.add("cardable");
      t.querySelectorAll("tbody tr").forEach((tr) => { let i = 0; [...tr.children].forEach((td) => { const span = +td.getAttribute("colspan") || 1; if (!td.hasAttribute("data-label")) td.setAttribute("data-label", heads[i] || ""); i += span; }); });
    });
  }
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; label(document.body); tabs(); document.body.classList.toggle("has-tabbar", !!A.uid); }); }).observe(document.body, { childList: true, subtree: true });
  label(document.body); tabs();
  A.isPhone = phone;
})();
