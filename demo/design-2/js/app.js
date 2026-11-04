/* Core: state, roles, business rules from the requirements file, overlays and routing. */
(function () {
  const KEY = "places-erp-d2-v19"; // bump when the seed changes shape; older keys may hold mis-encoded data
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || !S.leads || !S.perms) S = clone(window.SEED);
  if (!S.leadRules) S.leadRules = clone(window.SEED.leadRules); // saved demos from before the rules page
  ["draft", "draftAdmin"].forEach((k) => { if (!S.leadRules[k]) S.leadRules[k] = clone(window.SEED.leadRules[k]); });
  if ((S.schedReports || []).some((r) => !r.freq)) S.schedReports = clone(window.SEED.schedReports); // reports from before they had real schedules
  if (!S.kpiWatch) S.kpiWatch = clone(window.SEED.kpiWatch);
  if (!S.moves) { S.moves = clone(window.SEED.moves); S.custody = clone(window.SEED.custody); } // saved demos from before the treasury vouchers
  if (!S.activities) { S.activities = clone(window.SEED.activities); S.daily = {}; }
  if (!(S.schedReports || []).some((r) => r.daily)) S.schedReports.push(clone(window.SEED.schedReports.find((r) => r.daily)));
  const V0 = S.leadRules.visit; if (!V0.postponeInfo) { V0.postponeInfo = { to: ["u6"], ch: ["app"] }; if (V0.postpone.to.join() === "u6") V0.postpone.to = ["ownerTl"]; } // saved demos: the TL approves now, Heba is told
  if (S.leadRules.noAnswer.hours == null) S.leadRules.noAnswer.hours = 24;
  if (!S.stages.includes("Follow up to Meeting") && S.stages.includes("Meeting")) S.stages.splice(S.stages.indexOf("Meeting"), 0, "Follow up to Meeting"); // saved demos from before this stage
  ["bills", "clientCodes", "receiveSources", "interactionTypes", "finishings", "unitPurposes", "paymentPlans", "mkTaskTypes", "ticketDepts"].forEach((k) => { if (!S[k]) S[k] = clone(window.SEED[k]); }); // saved demos from before these lists were editable
  // every expense line has a budget to start from (about 10% over its usual month), so the budget page is never empty
  [["admin", "مصروفات إدارية"], ["selling", "مصروفات بيعية"]].forEach(([k, kind]) => (S.expenses[k] || []).forEach(([line, v]) => { if (!S.budgets.some((b) => b.line === line)) S.budgets.push({ line, kind, budget: Math.max(500, Math.ceil((v * 1.1) / 500) * 500), spent: 0, period: "month", alert: 80 }); }));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* demo still works without storage */ } };

  /* ---------- roles & navigation ---------- */
  const ROLES = {
    admin:        { label: "Super Admin", user: "u1", nav: ["home", "leads", "deals", "settings", "inventory", "tasks", "marketing", "hr", "tickets", "finance", "procurement"] },
    opshead:      { label: "Operations Head", user: "", nav: [] },
    salesdir:     { label: "Sales Director", user: "", nav: ["home", "leads", "deals", "settings", "marketing", "tickets"] },
    tl:           { label: "Team Leader", user: "u4", nav: ["home", "leads", "deals", "hr", "tickets"] },
    sales:        { label: "Sales", user: "s1", nav: ["home", "leads", "deals", "inventory", "tickets"] },
    telesales:    { label: "Telesales", user: "u5", nav: ["home", "leads", "tickets"] },
    ops:          { label: "Operations · Sales Admin", user: "u6", nav: ["home", "leads", "settings", "tickets"] },
    inventory:    { label: "Inventory Manager", user: "u7", nav: ["home", "inventory", "tasks", "tickets"] },
    resale:       { label: "Resale & Primary", user: "u8", nav: ["home", "inventory", "tasks", "tickets"] },
    marketing:    { label: "Marketing Manager", user: "u11", nav: ["home", "marketing", "tasks", "inventory", "tickets"] },
    photographer: { label: "Photographer", user: "u12", nav: ["home", "tasks", "tickets"] },
    designer:     { label: "Designer", user: "", nav: ["home", "tasks", "tickets"] },
    hr:           { label: "HR", user: "u14", nav: ["home", "hr", "tickets"] },
    accountant:   { label: "Accountant", user: "u18", nav: ["home", "finance", "procurement", "tickets"] },
    procurement:  { label: "Procurement", user: "u16", nav: ["home", "procurement", "tickets"] },
    approver:     { label: "Approver", user: "", nav: ["home", "procurement", "finance"] },
    officemgr:    { label: "Office Manager", user: "u21", nav: ["home", "deals", "reports", "access"] },
    inventory_staff: { label: "Inventory Specialist (مروة)", user: "u10", nav: ["home", "notactive", "tickets"] }
  };
  const NAV = {
    home: ["مهامي النهارده", "Today", "home", ""], leads: ["العملاء المحتملين", "M-01", "users", "المبيعات"], deals: ["الصفقات", "M-02", "handshake", "المبيعات"],
    settings: ["قواعد الليدز والتوزيع", "Routing", "route", "المبيعات"], inventory: ["مخزون الوحدات", "M-03", "building", "العمليات"], notactive: ["Not Active Inventory", "M-03", "layers", "العمليات"],
    tasks: ["المهام", "Tasks", "check", "العمليات"], marketing: ["التسويق", "M-04", "megaphone", "العمليات"],
    hr: ["الموارد البشرية", "M-05", "id", "الإدارة"], tickets: ["التذاكر", "M-06", "ticket", "الإدارة"],
    finance: ["المالية", "M-07", "wallet", "الإدارة"], procurement: ["المشتريات", "M-08", "cart", "الإدارة"],
    clients: ["العملاء والملاك", "M-10", "id", "المبيعات"], contracts: ["العقود والتحصيل", "M-11", "file", "المبيعات"], reports: ["التقارير والتارجت", "M-12", "chart", "الإدارة"], kpis: ["مؤشرات الأداء (KPIs)", "M-12", "trend", "الإدارة"],
    access: ["الأدوار والصلاحيات", "M-09", "lock", "النظام"], profile: ["حسابي", "Account", "id", ""], master: ["الإعدادات", "M-13", "filter", "النظام"], integrations: ["الإشعارات والإيميل", "M-14", "bolt", "النظام"]
  };
  const MODS = ["home", "leads", "deals", "clients", "contracts", "settings", "inventory", "notactive", "tasks", "marketing", "hr", "tickets", "finance", "procurement", "reports", "kpis", "access", "master", "integrations"];
  const ACTS = { view: "v", create: "c", edit: "e", approve: "a", delete: "d", import: "i", export: "x" };
  const SEC = ["", "المبيعات", "العمليات", "الإدارة", "النظام"];
  let role = "admin";
  // session: the signed-in account (null = show the login screen); the role follows the account
  let uid = null;
  try { uid = JSON.parse(localStorage.getItem(KEY + "-session") || "null"); } catch (e) {}
  const userOf = (id) => (S.users || []).find((u) => u.id === id);
  const roleLabel = (r) => ((S.perms || {})[r] || {}).label || (ROLES[r] || {}).label || r;
  const behaviourOf = (r) => (((S.perms || {})[r] || {}).base) || (ROLES[r] ? r : "sales");
  if (uid && !(userOf(uid) && userOf(uid).active)) uid = null;
  if (uid) role = behaviourOf(userOf(uid).role);
  if (!ROLES[role]) role = "admin";
  function signIn(id, quiet) { const u = userOf(id); uid = id; role = behaviourOf(u.role); ui = {}; try { localStorage.setItem(KEY + "-session", JSON.stringify(id)); } catch (e) {} if (quiet) return; u.lastLogin = nowIso(); u.failed = 0; audit("access", `${person(id)} دخل على السيستم`); } // quiet: the guided tour switching people, not a real login
  function signOut() { if (uid) audit("access", `${person(uid)} خرج من السيستم`); uid = null; ui = {}; closeDrawer(); try { localStorage.removeItem(KEY + "-session"); } catch (e) {} render(); }

  /* ---------- icons ---------- */
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.8c1.9.7 3.1 2.5 3.5 5.2"/>',
    handshake: '<path d="M3 12l4-4 4 2 3-3 7 6"/><path d="M7 8l-4 4 6 6 2-2"/><path d="M14 13l3 3M12 15l2 2M10 17l1.5 1.5"/>',
    route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    building: '<rect x="4" y="3" width="10" height="18" rx="1.5"/><path d="M14 9h5a1 1 0 0 1 1 1v11H14"/><path d="M7.5 7h3M7.5 11h3M7.5 15h3"/>',
    check: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.5l2.7 2.7L16 9.8"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3"/>',
    ticket: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5z"/><path d="M14 5v14" stroke-dasharray="2 2.5"/>',
    wallet: '<path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M16 13.5h2"/>',
    cart: '<path d="M3 4h2.5l2.2 11h10.6l2-8H6.4"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.2v.3"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z"/>', upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', bank: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>', phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>', bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', play: '<path d="M7 4l13 8-13 8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 9"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', gift: '<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13"/><path d="M12 7S10.5 3 8.5 3 6 5.5 8 7M12 7s1.5-4 3.5-4S18 5.5 16 7"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', fingerprint: '<path d="M12 11v3a8 8 0 0 0 1.5 4.5M8.5 10.5a3.5 3.5 0 0 1 7 0V13M5.5 9a7 7 0 0 1 13 1v3a12 12 0 0 0 .8 4M4 13.5a14 14 0 0 0 1.2 4M9 14.5a11 11 0 0 0 1.7 5.5"/>'
  };
  const icon = (n, cls) => `<svg class="i ${cls || ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.info}</svg>`;

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nf = new Intl.NumberFormat("en-US");
  const money = (n) => nf.format(Math.round(n || 0)) + " ج.م";
  const short = (n) => { const a = Math.abs(n || 0); return a >= 1e6 ? (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.0+$/, "") + "M" : a >= 1e3 ? Math.round(n / 1e3) + "K" : String(Math.round(n || 0)); };
  const num = (n) => nf.format(Math.round(n || 0));
  const NOW = () => Date.now() + (S.clock || 0) * 60000; // demo clock: the presenter can move time forward
  const nowIso = () => new Date(NOW()).toISOString();
  const today = () => new Date(NOW()).toISOString().slice(0, 10);
  const person = (id) => (S.people.find((p) => p.id === id) || { name: id === "system" ? "السيستم" : id || "—" }).name;
  const fmtDate = (iso) => { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" }); };
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" });
  const minsSince = (iso) => Math.floor((NOW() - new Date(iso).getTime()) / 60000);
  const ago = (iso) => { const m = minsSince(iso); if (m < 1) return "دلوقتي"; if (m < 60) return `من ${m} د`; if (m < 1440) return `من ${Math.floor(m / 60)} س`; return `من ${Math.floor(m / 1440)} يوم`; };
  // m = minutes after 11:00 (negative = came early)
  const hm = (m) => { if (m == null) return "—"; const t = (((660 + m) % 1440) + 1440) % 1440; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  const me = () => uid || ROLES[role].user;
  const rolesOf = (id) => { const u = userOf(id); return u ? [u.role, ...(u.extraRoles || [])] : [role]; };
  // permission = the role's matrix + any per-person override (e.g. Manar granting inventory access)
  const permStr = (mod) => { const base = [...new Set(rolesOf(me()).map((r) => (S.perms[r] && S.perms[r].p[mod]) || "").join(""))].join(""); const u = userOf(me()); const o = u && u.overrides && u.overrides[mod]; return o != null ? o : base; };
  const canDo = (mod, act) => permStr(mod).includes(ACTS[act] || act);
  const can = (view) => view === "profile" || canDo(view, "view"); // everyone can open their own account page
  const navList = () => MODS.filter((m) => can(m));
  const scope = () => (S.perms[(userOf(me()) || {}).role] || S.perms[role] || {}).scope || "own";
  // KPI and report changes also reach whoever runs the KPIs (kpiWatch), except anything about money
  function audit(mod, text, money) {
    (S.audit = S.audit || []).unshift({ at: nowIso(), by: me(), mod, text, ...(money ? { money: true } : {}) });
    if ((mod === "kpis" || mod === "reports") && !money && S.kpiWatch) { const to = S.kpiWatch.to.filter((x) => x !== me()); if (to.length) notify(to, `KPIs · ${text} (${person(me())})`); }
  }
  const AV = ["#0037ff", "#08875c", "#b06a00", "#c22a37", "#6a3df0", "#0a7f9e", "#2c5cff", "#b4479a"];
  const avatar = (id, sm) => { const n = person(id).replace(/^(د\.|م\.|أ\.)\s*/, ""); let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `<span class="avatar ${sm ? "sm" : ""}" style="background:${AV[h % AV.length]}" aria-hidden="true">${esc(n.charAt(0))}</span>`; };
  const who = (id) => `<span class="who">${avatar(id, 1)}<span>${esc(person(id))}</span></span>`;

  /* ---------- sales availability (HR → Leads) ---------- */
  const onLeave = (id, day) => S.leaves.some((l) => l.emp === id && ["Approved by TL", "Closed by HR"].includes(l.status) && (day || today()) >= l.from && (day || today()) <= l.to);
  const sales = () => S.people.filter((p) => p.role === "sales");
  // today's rotation order: earliest fingerprint check-in first (no check-in last); Operations can reorder it for the day
  const hhmmMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m - 660; }; // "10:00" → minutes after 11:00
  // the day's first Visit not marked «معملهاش»: it counts as the day's start instead of the fingerprint
  const dayVisit = (id, day) => S.leads.filter((l) => l.sales === id).flatMap((l) => l.visits).filter((v) => v.at.slice(0, 10) === (day || today()) && !v.notDone).sort((x, y) => (x.at < y.at ? -1 : 1))[0];
  // day start: the Visit time (even if he punches later), else the fingerprint; null = hasn't started yet
  const checkIn = (id) => {
    const a = S.attendance.find((x) => x.emp === id && x.day === today()), punch = a && a.inMin != null ? a.inMin : null, v = dayVisit(id);
    if (!v) return punch;
    const vm = hhmmMin(fmtHM(v.at));
    return punch == null ? vm : Math.min(vm, punch);
  };
  const manualOrder = () => (S.dayOrder && S.dayOrder.day === today() ? S.dayOrder.ids : null);
  const dayOrder = (ids) => {
    const auto = ids.slice().sort((a, b) => (checkIn(a) ?? 1e9) - (checkIn(b) ?? 1e9)), o = manualOrder() || [];
    const rank = (id) => (o.includes(id) ? o.indexOf(id) : o.length + auto.indexOf(id)); // someone new today joins the end
    return auto.sort((a, b) => rank(a) - rank(b));
  };
  const activeSales = () => dayOrder(sales().filter((s) => !onLeave(s.id) && (!userOf(s.id) || (userOf(s.id).active && userOf(s.id).status === "active"))).map((s) => s.id));

  /* ---------- leads rules ---------- */
  const CLOSED_OUT = ["Fresh", "Not Interested", "No Answer"];
  function log(lead, text, by) { lead.comments.push({ by: by || me(), at: nowIso(), text }); }
  function setStage(lead, stage) {
    lead.stage = stage;
    if (!CLOSED_OUT.includes(stage)) lead.everInterested = true; // sticks once reached
    lead.touched = true; lead.activity = (lead.activity || 0) + 1;
    if (stage === "No Answer") { lead.noAnswer = (lead.noAnswer || 0) + 1; lead.noAnswerAt = nowIso(); lead.naBy = lead.sales; }
    const DA = S.leadRules && S.leadRules.draftAdmin;
    if (DA && DA.on && ["Not Interested", "Cancellation"].includes(stage) && ["sales", "telesales"].includes(lead.owner)) {
      const from = lead.sales;
      notify(ruleTo(DA.notify, lead), `${lead.name} (${lead.id}) بقى ${stage} عند ${person(from)} · راح الـ Draft Admin`);
      Object.assign(lead, { draftAdmin: { at: nowIso(), from, stage, by: me() }, owner: "draftAdmin", sales: keeperOf(DA.see) });
    }
  }
  function nextSales(area, current) {
    const act = activeSales();
    const inArea = act.filter((x) => (S.areaRouting[area] || []).includes(x)), pool = inArea.length > 1 ? inArea : act;
    return pool[(pool.indexOf(current) + 1) % pool.length] || pool[0];
  }
  function routeArea(area) {
    const act = activeSales(), pool = act.filter((x) => (S.areaRouting[area] || []).includes(x)); // in today's order
    const list = pool.length ? pool : act;
    S.routeIdx = S.routeIdx || {}; S.skipTurn = S.skipTurn || {};
    for (let k = 0; k < list.length * 2; k++) {
      const i = (S.routeIdx[area] || 0) % list.length, id = list[i];
      S.routeIdx[area] = i + 1;
      if (S.skipTurn[id]) { S.skipTurn[id]--; continue; } // already got a lead by hand: this turn is used up
      return id;
    }
    return list[0];
  }
  // Q2: Operations can hand a lead to a specific salesperson; that counts as their next turn in the rotation
  const assignByHand = (id) => { S.skipTurn = S.skipTurn || {}; S.skipTurn[id] = (S.skipTurn[id] || 0) + 1; };
  // official holidays are from–to ranges (Eid can run several days); old saved ones have a single day
  const holOn = (day) => (S.holidays || []).some((h) => (h.from || h.day) <= day && day <= (h.to || h.day));
  const isHolidayToday = () => holOn(today());
  // Q4: the 3 hours run in working hours only (11:00–19:00, Friday and official holidays off), from when the lead reached the salesperson.
  // shortcut: fixed work calendar, make hours and weekend a setting in M-13 later.
  const R = () => S.leadRules;
  const offDay = (d) => R().work.off.includes(d.getDay()) || holOn(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`); // d is local midnight: its UTC date is the day before
  function workMins(fromIso) {
    const end = NOW(); let m = 0, d = new Date(fromIso); d.setHours(0, 0, 0, 0);
    for (let n = 0; n < 60 && d.getTime() <= end; n++, d.setDate(d.getDate() + 1)) {
      if (offDay(d)) continue;
      const a = Math.max(new Date(fromIso).getTime(), d.getTime() + R().work.from * 60000), b = Math.min(end, d.getTime() + R().work.to * 60000);
      if (b > a) m += (b - a) / 60000;
    }
    return Math.floor(m);
  }
  const slaLimits = () => isHolidayToday() ? { warn: R().sla.holWarnMin, pull: R().sla.holPullMin } : { warn: R().sla.warnMin, pull: R().sla.pullMin };
  const hrs = (h) => (h === 1 ? "ساعة" : h === 2 ? "ساعتين" : h <= 10 ? `${h} ساعات` : `${h} ساعة`);
  const dur = (m) => { const h = Math.floor(m / 60), r = m % 60; return !r ? hrs(h) : h ? `${hrs(h)} و${r} دقيقة` : `${r} دقيقة`; };
  // a rule's people: roles, user ids, and "owner" = the lead's salesperson
  const tlOf = (id) => ((S.people || []).find((p) => p.id === id) || {}).tl;
  const ruleTo = (who, lead) => [...new Set(who.to.map((x) => (x === "owner" ? lead && lead.sales : x === "ownerTl" ? lead && tlOf(lead.sales) : x)).filter(Boolean))];
  const ruleHas = (who, lead) => ruleTo(who, lead).some((x) => x === uid || rolesOf(uid).includes(x)); // is the signed-in person one of the rule's people for this lead
  const isIn = (who) => who.to.some((x) => x === uid || rolesOf(uid).includes(x));
  function sla(lead) {
    if (!R().sla.on || lead.stage !== "Fresh" || lead.touched || lead.owner !== "sales") return null;
    const from = lead.assignedAt || lead.created, m = isHolidayToday() ? minsSince(from) : workMins(from), L = slaLimits(), left = L.pull - m;
    if (m >= L.pull) return { level: "bad", text: "اتسحب", m, pct: 100 };
    if (m >= L.warn) return { level: "warn", text: `تنبيه TL · باقي ${left} د`, m, pct: (m / L.pull) * 100 };
    return { level: "ok", text: left >= 60 ? `باقي ${Math.floor(left / 60)}س ${left % 60}د` : `باقي ${left} د`, m, pct: (m / L.pull) * 100 };
  }
  function ensureContracts() {
    if ((S.contracts || []).length) return; S.contracts = [];
    S.deals.filter((d) => !["Rejected", "Cancelled"].includes(d.status)).forEach((d, i) => {
      const u = S.units.find((x) => x.code === d.unit) || {}, start = new Date(d.closed), end = new Date(start);
      end.setFullYear(end.getFullYear() + (u.type === "Resale" ? 3 : 1));
      if (i === 0) end.setTime(NOW() + 40 * 864e5); if (i === 3) end.setTime(NOW() + 75 * 864e5); // demo renewals
      const n = u.type === "Resale" ? 6 : 4, gap = u.type === "Resale" ? 6 : 3;
      S.contracts.push({ id: "C-" + (501 + i), deal: d.id, client: d.client, unit: d.unit, kind: u.type || "Rent", start: d.closed.slice(0, 10), end: end.toISOString().slice(0, 10), value: d.value, escalation: u.escalation || (u.type === "Rent" ? 10 : 0), file: "contract-" + d.id + ".pdf", status: "Active", paidAmt: Math.round(d.value * Math.min(1, collected(d) / (placesComm(d) || 1))),
        inst: Array.from({ length: n }, (_, k) => { const due = new Date(start); due.setMonth(due.getMonth() + k * gap); return { due: due.toISOString().slice(0, 10), amount: Math.round(d.value / n) }; }) });
    });
  }
  function tick() {
    ensureContracts();
    toDraft();
    rotateNoAnswer();
    if (APP.autoFollowups) APP.autoFollowups();
    if (APP.reportTick) APP.reportTick();
    if (APP.accountRules) APP.accountRules();
    S.leads.forEach((l) => {
      const s = sla(l);
      if (s && s.m >= slaLimits().warn && !l.alerted) { l.alerted = true; notify(ruleTo(R().sla.warn, l), `تنبيه SLA: ${l.name} (${l.id}) من غير أكشن عند ${person(l.sales)}`); }
      if (s && s.m >= slaLimits().pull) {
        const from = l.sales; l.sales = nextSales(l.area, from); l.assignedAt = nowIso(); l.alerted = false;
        log(l, `اتسحب أوتوماتيك من ${person(from)} بعد ${dur(slaLimits().pull)} من غير أكشن، وراح لـ ${person(l.sales)}`, "system");
        notify(ruleTo(R().sla.pull, l), `الليد ${l.id} اتسحب من ${person(from)} وراح لـ ${person(l.sales)}`);
      }
    });
  }
  // Draft: a lead nobody acted on for a week (two on Hold) leaves its salesperson; only the people the rules name see it
  const DRAFT_SKIP = ["Done Deal", "Cancellation", "Not Interested", "No Answer"]; // finished, or already on the No Answer rotation
  const lastTouch = (l) => [l.assignedAt, l.created, ...l.comments.filter((c) => c.by !== "system").map((c) => c.at)].filter(Boolean).sort().pop();
  // who holds a lead while it sits in a Draft: the first person the rule names, else someone with a role it names
  function keeperOf(who) { const w = who.to; return w.find((x) => S.users.some((u) => u.id === x)) || (S.users.find((u) => w.some((r) => rolesOf(u.id).includes(r))) || {}).id || "u6"; }
  const draftKeeper = () => keeperOf(R().draft.see);
  function toDraft() {
    const D = R().draft; if (!D.on) return;
    S.leads.forEach((l) => {
      if (l.archived || l.owner !== "sales" || DRAFT_SKIP.includes(l.stage)) return;
      const days = l.stage === "Hold" ? D.holdDays : D.days;
      if (minsSince(lastTouch(l)) < days * 1440) return;
      const from = l.sales;
      notify(ruleTo(D.notify, l), `${l.name} (${l.id}) اتسحب من ${person(from)} للـ Draft · ${days} يوم من غير أكشن`);
      log(l, `اتسحب أوتوماتيك من ${person(from)} للـ Draft بعد ${days} يوم من غير أكشن${l.stage === "Hold" ? " (Hold)" : ""}`, "system");
      Object.assign(l, { owner: "draft", sales: draftKeeper(), draft: { at: nowIso(), from, days } });
    });
  }
  function rotateNoAnswer() {
    let moved = 0;
    // only a No Answer the current salesperson marked themself counts; the next one has to try before it moves again
    S.leads.filter((l) => l.stage === "No Answer" && l.owner === "sales" && (l.naBy || l.sales) === l.sales && minsSince(l.noAnswerAt || l.created) >= R().noAnswer.hours * 60).forEach((l) => {
      const from = l.sales; l.rotation = (l.rotation || 1) + 1;
      Object.assign(l, { stage: "Fresh", touched: false, alerted: false, assignedAt: nowIso(), naBy: null });
      if (l.rotation >= R().noAnswer.toTelesalesAt) { l.owner = "telesales"; l.sales = R().noAnswer.telesales; log(l, `الروتيشن رقم ${l.rotation}: الليد راح لـ Telesales (${person(l.sales)})`, "system"); notify(ruleTo(R().noAnswer.notify, l), `ليد ${l.name} رجعلك في الروتيشن التالت`); }
      else { l.sales = nextSales(l.area, from); log(l, `No Answer: عدّى ${dur(R().noAnswer.hours * 60)} عند ${person(from)} وراح لـ ${person(l.sales)} (رجع Fresh)`, "system"); notify([l.sales], `ليد ${l.name} جالك بعد No Answer عند ${person(from)}`); }
      moved++;
    });
    return moved;
  }
  const normPhone = (p) => String(p || "").replace(/\D/g, "").replace(/^20/, "0");
  const findDupe = (phones, exceptId) => S.leads.find((l) => l.id !== exceptId && l.phones.some((p) => phones.map(normPhone).includes(normPhone(p))));

  /* ---------- inventory rules ---------- */
  const unitTotal = (u) => u.type === "Income" ? (u.salePerSqm || 0) * u.space : (u.pricePerSqm || 0) * u.space;
  const incomeCalc = (u) => { const monthly = (u.leasePerSqm || 0) * u.space, annual = monthly * 12, sale = unitTotal(u); return { monthly, annual, sale, yieldPct: sale ? (annual / sale) * 100 : 0 }; };
  const availableAs = (u, t) => (u.type === t && u.status === "available") || (u.also === t && u.alsoStatus !== "closed");
  const isAvailable = (u) => u.status === "available" || (!!u.also && u.alsoStatus !== "closed");
  const stale = (u) => isAvailable(u) && (NOW() - new Date(u.lastUpdate).getTime()) / 86400000 > 30;
  const unitTab = (u) => (u.tab != null && S.areaTabs[u.tab]) ? u.tab : S.areaTabs.findIndex((r) => u.space >= r.min && u.space <= r.max);
  // shortcut: ±20% tolerance on space and budget is the suggested default in the requirements; make it a setting later.
  function recommend(lead, ans) {
    ans = ans || {};
    const out = [];
    S.units.filter((u) => isAvailable(u) && u.pdf === "confirmed").forEach((u) => {
      if (lead.type && !availableAs(u, lead.type)) return;
      const asAlso = lead.type && lead.type !== u.type; // offered through its second type, at that type's price
      const fits = lead.space && Math.abs(u.space - lead.space) <= lead.space * 0.2;
      const split = u.divisible && lead.space && u.space > lead.space && (!u.minSplit || u.minSplit <= lead.space);
      if (!fits && !split) return;
      const sp = split && !fits ? lead.space : u.space;
      const price = asAlso ? (u.alsoPricePerSqm || 0) * sp : u.type === "Rent" ? (u.pricePerSqm || 0) * sp : (u.type === "Income" ? u.salePerSqm : u.pricePerSqm) * sp;
      if (lead.budget && price > lead.budget * 1.2) return;
      if (ans.floor === "G" && u.floor !== "G") return;
      if (ans.parking && (u.parking || 0) < +ans.parking) return;
      if (ans.project && u.project !== ans.project) return;
      if (ans.split === "no" && split && !fits) return;
      if (ans.payment && u.payment && u.payment !== ans.payment) return;
      if (ans.area === "same" && u.area !== lead.area) return;
      let score = 0;
      if (u.area === lead.area) score += 3; if (u.condition === lead.condition) score += 2; if (fits) score += 2; if (!lead.budget || price <= lead.budget) score += 1;
      out.push({ u, split: split && !fits, price, score, match: Math.min(99, 55 + score * 5) });
    });
    return out.sort((a, b) => b.score - a.score);
  }

  /* ---------- attendance rules ---------- */
  const DEFAULT_DED = { graceMin: 16, quarterMin: 17, halfMin: 30, dayMin: 60 };
  function attRow(a) {
    const e = S.employees.find((x) => x.id === a.emp) || {};
    const r = e.deduction || DEFAULT_DED;
    const late = a.inMin == null ? 0 : Math.max(0, a.inMin - 16); // Weekly Delay counts every minute after 11:16, no exceptions
    if (e.schedule && a.status === "auto") return { e, late: 0, status: "مواعيد خاصة", level: "info", ded: 0, dedText: "—" }; // fixed hours set by HR (e.g. the remote CFO)
    if (a.status === "absent") return { e, late: 0, status: "غياب من غير إذن", level: "bad", ded: 1, dedText: "يوم" };
    if (a.status === "outside") return { e, late: 0, status: "شغل من بره (معتمد)", level: "info", ded: 0, dedText: "—" };
    if (a.status === "forgot") return { e, late: 0, status: "نسي البصمة", level: "bad", ded: a.confirmed ? 1 : 0, dedText: a.confirmed ? "يوم (اتأكد)" : "يوم · مستني Confirmation" };
    const ex = a.status === "excuse" && S.excuses.find((x) => x.emp === a.emp && x.day === a.day), n = ex ? ex.n : 1;
    if (a.status === "excuse" && n < 5) { const ded = n >= 3 ? 0.5 : 0; return { e, late, status: `Excuse #${n}`, level: "info", ded, dedText: ded ? "نص يوم" : "—" }; }
    // Q29: a Visit never gets a full-day deduction; Q28: it counts as Check-in without Done, but a Visit marked not done shows
    // on a Visit row inMin is the real fingerprint (null until he punches): Done or not marked yet → the Visit time is the start;
    // marked «معملهاش» → the fingerprint counts with its normal deduction
    const vk = a.kind || "Visit";
    // a Visit Operations confirmed as postponed: no deduction that day (Heba records it)
    if (a.status === "visit" && a.visitPostponed) return { e, late: 0, status: `${vk} ${a.visitAt} · اتأجل (الأوبريشن أكدت)`, level: "info", ded: 0, dedText: "—" };
    if (a.status === "visit" && !a.visitNotDone) { const s = a.inMin == null ? hhmmMin(a.visitAt) : Math.min(hhmmMin(a.visitAt), a.inMin); return { e, late: Math.max(0, s - 16), status: `${vk} ${a.visitAt}`, level: "info", ded: 0, dedText: "—" }; }
    if (a.status === "visit" && a.inMin == null) return { e, late: 0, status: `${vk} ${a.visitAt} · معملهاش · مابصمش لسه`, level: "bad", ded: 0, dedText: "تنبيه للـ HR" };
    let m = a.inMin, status = "في الميعاد", level = "ok", ded = 0; // Q31: from here a 5th Excuse is refused and counts as normal lateness
    if (m >= r.dayMin) { status = "متأخر"; level = "bad"; ded = 1; }
    else if (m >= r.halfMin) { status = "متأخر"; level = "warn"; ded = 0.5; }
    else if (m >= r.quarterMin) { status = "متأخر"; level = "warn"; ded = 0.25; }
    const dedText = ded === 1 ? "يوم" : ded === 0.5 ? "نص يوم" : ded === 0.25 ? "ربع يوم" : "—";
    if (a.status === "visit") return { e, late, status: `${vk} ${a.visitAt} · معملهاش · بالبصمة ${ded ? "متأخر" : "في الميعاد"}`, level: ded ? "bad" : "warn", ded, dedText: `${dedText} · تنبيه للـ HR` };
    if (a.status === "excuse") return { e, late, status: `Excuse #${n} اترفض · ${ded ? "متأخر" : "في الميعاد"}`, level: "bad", ded, dedText: `${dedText} · تنبيه للإدارة والـ HR` };
    return { e, late, status, level, ded, dedText };
  }
  const dayRate = (e) => (e.salary || 0) / 26;
  function syncFingerprint() {
    // demo: pull today's punches from the fingerprint device for anyone who hasn't got a row yet
    const day = today(); let n = 0;
    S.employees.filter((e) => e.kind !== "Part-time" || e.ptDeduct).forEach((e, i) => {
      if (S.attendance.some((a) => a.emp === e.id && a.day === day)) return;
      const visit = S.leads.flatMap((l) => l.visits.map((v) => ({ v, l }))).find((x) => x.l.sales === e.id && x.v.at.slice(0, 10) === day);
      const outside = S.requests.find((q) => q.emp === e.id && q.day === day && q.status === "Approved");
      S.attendance.push(outside ? { emp: e.id, day, inMin: null, status: "outside" } : visit ? { emp: e.id, day, inMin: null, status: "visit", kind: visit.v.kind || "Visit", visitAt: fmtHM(visit.v.at), visitPostponed: visit.v.postpone === "approved" || undefined } : { emp: e.id, day, inMin: [3, 9, 14, 21, 33, 0, 6][i % 7], status: "auto" });
      n++;
    });
    return n;
  }
  const fmtHM = (iso) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

  /* ---------- deals ---------- */
  // Q37 + sheet «admin done deal»: Places' commission is collected from the Owner side and the Client side (net commission = both)
  const placesComm = (d) => (d.commOwner || 0) + (d.commClient || 0);
  const collected = (d) => (d.payments || []).reduce((s, p) => s + p.amount, 0);
  const collectedFrom = (d, side) => (d.payments || []).filter((p) => p.side === side).reduce((s, p) => s + p.amount, 0);
  const OFF = ["Pending Review", "Rejected", "Cancelled"];
  const dealStatus = (d) => { if (OFF.includes(d.status)) return d.status; const c = collected(d); return c >= placesComm(d) ? "Fully Collected" : c > 0 ? "Partially Collected" : "Approved"; };
  // Q10/Q38/Q39: revenue, targets and Transactions count from the first collection; Q12: a cancelled deal drops out everywhere by itself
  const countsRevenue = (d) => !OFF.includes(d.status) && collected(d) > 0;
  const inTarget = (d) => countsRevenue(d) && !d.offTarget; // Q13: a deal recorded only at closing counts, but not in the target
  const buyersOf = (d) => d.buyers || [d.sales];
  const sellersOf = (d) => (d.sellerApproved ? d.sellers || [] : []); // the unit's agent counts only after Manar approves
  const emp = (id) => S.employees.find((y) => y.id === id) || {};
  // voice notes 3–4: the money that came in is split half to the Buyer side and half to the Seller side, each half shared equally
  // by that side's salespeople; a salesperson's share counts in their target, and their scheme % of it is their commission.
  // The «note» override (d.targetBase) changes the target only, never the commission.
  function salesShares(d) {
    const base = collected(d), tgt = d.targetBase != null && d.targetBase !== "" ? +d.targetBase : base, out = [];
    [["buyer", buyersOf(d)], ["seller", sellersOf(d)]].forEach(([side, ids]) => ids.forEach((id) => {
      const rate = emp(id).commissionPct || 0, share = base / 2 / ids.length;
      out.push({ sales: id, side, pct: Math.round(100 / ids.length), share, targetShare: tgt / 2 / ids.length, rate, amount: (share * rate) / 100 });
    }));
    return out;
  }
  const salesComm = (d, id) => salesShares(d).filter((x) => !id || x.sales === id).reduce((s, x) => s + x.amount, 0);
  const inDeal = (d, id) => buyersOf(d).includes(id) || sellersOf(d).includes(id);
  // voice note 1: one Transaction for every salesperson named on a deal (two buyers = one each), after collection
  const transactions = (id) => S.deals.filter((d) => countsRevenue(d) && inDeal(d, id)).length;
  const targetOf = (id) => S.deals.filter(inTarget).reduce((s, d) => s + salesShares(d).filter((x) => x.sales === id).reduce((a, x) => a + x.targetShare, 0), 0);
  const targetGoal = (id) => emp(id).target || ((S.targets || {})[id] || {}).value || 0; // HR's employee target is the source
  // voice note 6: a Team Leader's team target is the sum of their salespeople's targets; their scheme % comes from the tier the team reached
  function tlStats(tl) {
    const team = S.people.filter((p) => p.role === "sales" && p.tl === tl).map((p) => p.id), goal = team.reduce((s, id) => s + targetGoal(id), 0), got = team.reduce((s, id) => s + targetOf(id), 0), pct = goal ? (got / goal) * 100 : 0;
    const tiers = (S.tlTiers || []).slice().sort((a, b) => a.upTo - b.upTo), tier = tiers.find((t) => pct < t.upTo) || tiers[tiers.length - 1] || { pct: 0 };
    const base = S.deals.filter(countsRevenue).reduce((s, d) => s + salesShares(d).filter((x) => team.includes(x.sales)).reduce((a, x) => a + x.share, 0), 0);
    return { team, goal, got, pct, tier, comm: (base * tier.pct) / 100 };
  }
  const suspicious = (d) => (new Date(d.closed) - new Date(d.created)) / 3600000 <= R().close.alarmH + 0.25; // closed too soon after it was opened

  /* ---------- notifications & overlays ---------- */
  function notify(roles, text) { S.notifications.unshift({ at: nowIso(), to: roles, text }); }
  const forMe = (n) => role === "admin" || n.to.includes(role) || n.to.includes(uid); // rules can name a role or a person
  const myNotifs = () => S.notifications.filter(forMe);
  const $ = (sel) => document.querySelector(sel);
  let undoFn = null;
  function toast(msg, undo) {
    const t = $("#toast"); undoFn = undo || null;
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button class="toast-undo" id="toastUndo">${icon("undo")}تراجع</button>` : ""}`;
    t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), undo ? 6000 : 2800);
  }
  function openModal(title, html, mount) { $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html; $("#modal").hidden = false; if (mount) mount($("#modalBody")); const f = $("#modalBody").querySelector("input:not([type=hidden]),select,textarea"); if (f) f.focus(); }
  function closeModal() { $("#modal").hidden = true; $("#modalBody").innerHTML = ""; }
  let drawerFn = null;
  function openDrawer(fn) { drawerFn = fn; const d = $("#drawer"); d.innerHTML = fn(); d.hidden = false; $("#scrim").hidden = false; requestAnimationFrame(() => d.classList.add("in")); if (APP.afterDrawer) APP.afterDrawer(); }
  function refreshDrawer() { if (drawerFn && !$("#drawer").hidden) { $("#drawer").innerHTML = drawerFn(); if (APP.afterDrawer) APP.afterDrawer(); } }
  function closeDrawer() { drawerFn = null; const d = $("#drawer"); d.classList.remove("in"); d.hidden = true; $("#scrim").hidden = true; }

  /* ---------- command palette ---------- */
  function cmdItems(q) {
    q = (q || "").trim().toLowerCase();
    const items = [];
    navList().forEach((k) => items.push({ kind: "صفحة", label: NAV[k][0], sub: NAV[k][1], icon: NAV[k][2], go: () => (location.hash = k) }));
    if (can("leads")) S.leads.forEach((l) => items.push({ kind: "ليد", label: l.name, sub: `${l.id} · ${l.phones.join(" / ")} · ${l.company}`, icon: "users", go: () => { location.hash = "leads"; setTimeout(() => APP.ACT.leadOpen({ id: l.id }), 30); } }));
    if (can("inventory")) S.units.forEach((u) => items.push({ kind: "وحدة", label: `${u.code} · ${u.project}`, sub: `${u.type} · ${u.space} م · ${u.area}`, icon: "building", go: () => { location.hash = "inventory"; setTimeout(() => APP.ACT.unitOpen({ code: u.code }), 30); } }));
    if (can("hr")) S.employees.forEach((e) => items.push({ kind: "موظف", label: e.name, sub: e.dept, icon: "id", go: () => { location.hash = "hr"; setTimeout(() => APP.ACT.empFile({ id: e.id }), 30); } }));
    if (can("tickets")) S.tickets.forEach((t) => items.push({ kind: "تذكرة", label: t.title, sub: `${t.id} · ${t.dept}`, icon: "ticket", go: () => { location.hash = "tickets"; setTimeout(() => APP.ACT.tkOpen({ id: t.id }), 30); } }));
    if (can("deals")) S.deals.forEach((d) => items.push({ kind: "صفقة", label: `${d.id} · ${d.company || d.client}`, sub: `${d.unit} · ${(d.tcrs || []).map((x) => x.code).join(" ")}`, icon: "handshake", go: () => { location.hash = "deals"; setTimeout(() => APP.ACT.dealOpen({ id: d.id }), 30); } }));
    if (can("leads")) (S.companies || []).forEach((c) => items.push({ kind: "شركة", label: c.name, sub: `${c.cat} · ${c.number || ""} · ${c.contact || ""}`, icon: "building", go: () => APP.ACT.companies({ cat: c.cat }) }));
    if (can("notactive")) (S.naSheets || []).forEach((sh) => sh.rows.forEach((r) => items.push({ kind: "Not Active", label: `${r.d.unit} · ${r.d.owner}`, sub: `${sh.name} · ${r.d.number} · ${r.status || "لسه"}`, icon: "layers", go: () => { APP.ui.naSheet = sh.id; location.hash = "notactive"; } })));
    if (can("access")) (S.users || []).forEach((u) => items.push({ kind: "حساب", label: person(u.id), sub: `${u.email} · ${(ROLES[u.role] || { label: u.role }).label}`, icon: "lock", go: () => { APP.ui.acTab = "users"; APP.ui.usQ = u.email; location.hash = "access"; render(); } }));
    if (can("leads")) items.push({ kind: "أكشن", label: "ليد جديد", sub: "Create lead", icon: "plus", go: () => APP.ACT.leadNew() });
    return (q ? items.filter((x) => (x.label + " " + x.sub).toLowerCase().includes(q)) : items.filter((x) => x.kind === "صفحة" || x.kind === "أكشن")).slice(0, 12);
  }
  let cmdList = [], cmdSel = 0;
  function renderCmd() {
    const q = $("#cmdInput").value; cmdList = cmdItems(q); cmdSel = Math.min(cmdSel, Math.max(0, cmdList.length - 1));
    $("#cmdList").innerHTML = cmdList.length ? cmdList.map((x, i) => `<button class="cmd-item ${i === cmdSel ? "on" : ""}" data-cmd="${i}" role="option" aria-selected="${i === cmdSel}">${icon(x.icon)}<span class="cmd-main"><b>${esc(x.label)}</b><small>${esc(x.sub)}</small></span><span class="chip plain">${esc(x.kind)}</span></button>`).join("") : `<p class="empty">مفيش نتايج لـ «${esc(q)}»</p>`;
  }
  function openCmd() { $("#cmd").hidden = false; $("#cmdInput").value = ""; cmdSel = 0; renderCmd(); $("#cmdInput").focus(); }
  function closeCmd() { $("#cmd").hidden = true; }

  /* ---------- rendering ---------- */
  const ACT = {}, FORM = {}, CHANGE = {}, DROP = {};
  let ui = {};
  function navBadges() {
    const b = {}, m = me();
    b.leads = S.leads.filter((l) => { const s = sla(l); return s && s.level !== "ok" && (role !== "sales" || l.sales === m); }).length + (["ops", "admin"].includes(role) ? S.bulk.filter((x) => x.status === "pending").length + S.leads.filter((l) => l.newLeadReq === "pending").length : 0);
    b.deals = ["officemgr", "admin"].includes(role) ? S.deals.filter((d) => d.status === "Pending Review").length : 0;
    b.tasks = S.tasks.filter((t) => t.status !== "done" && (t.to === m || (role === "inventory" && t.status === "uploaded"))).length;
    b.procurement = ["approver", "admin"].includes(role) ? S.purchases.filter((p) => p.status === "Pending").length : 0;
    b.hr = role === "hr" ? S.attendance.filter((a) => a.status === "forgot" && !a.confirmed).length : role === "tl" ? S.leaves.filter((l) => l.status === "Pending TL").length + S.requests.filter((q) => q.status === "Pending").length : 0;
    b.tickets = S.tickets.filter((t) => ["Open", "In Progress"].includes(t.status) && t.dept === deptOf(role)).length;
    b.marketing = role === "marketing" ? S.broadcasts.filter((x) => !x.approved).length + S.posts.filter((p) => !p.approved).length : 0;
    return b;
  }
  const deptOf = (r) => ({ hr: "HR", inventory: "Inventory", resale: "Inventory", marketing: "Marketing", accountant: "Accounts", procurement: "Accounts", ops: "Operations", officemgr: "الإدارة" }[r] || "");
  function render() {
    if (!uid) { if (APP.renderAuth) APP.renderAuth(); return; } // nothing shows until someone signs in
    if (APP.hideAuth) APP.hideAuth();
    if ($("#role").value !== role) $("#role").value = role;
    tick();
    const views = window.VIEWS || {};
    let v = (location.hash || "").replace("#", "");
    if (!views[v] || !can(v)) v = navList()[0] || "profile"; // someone with no modules still lands on their profile
    const badge = navBadges(); let sec = null;
    const keys = navList().sort((x, y) => SEC.indexOf(NAV[x][3]) - SEC.indexOf(NAV[y][3]));
    $("#nav").innerHTML = keys.map((k) => {
      const h = NAV[k][3] && NAV[k][3] !== sec ? `<div class="nav-sec">${NAV[k][3]}</div>` : ""; sec = NAV[k][3] || sec;
      return `${h}<a href="#${k}" ${k === v ? 'aria-current="page"' : ""}>${icon(NAV[k][2])}<span class="lbl">${NAV[k][0]}</span>${badge[k] ? `<span class="cnt">${badge[k]}</span>` : `<span class="tag">${NAV[k][1]}</span>`}</a>`;
    }).join("");
    $("#meCard").innerHTML = `<a href="#profile" class="me-link" title="حسابي">${avatar(me())}<div><b>${esc(person(me()))}</b><small>${esc(rolesOf(me()).map(roleLabel).join(" + "))}</small></div></a><button class="icon-btn" data-act="signOut" aria-label="خروج" title="خروج">${icon("x")}</button>`;
    $("#viewCrumb").textContent = NAV[v][1];
    $("#viewTitle").textContent = NAV[v][0];
    $("#viewSub").textContent = views[v].sub ? views[v].sub() : "";
    $("#clockLbl").textContent = new Date(NOW()).toLocaleString("ar-EG", { weekday: "short", hour: "numeric", minute: "2-digit" }) + (isHolidayToday() ? " · إجازة" : "");
    $("#holidayBadge").hidden = !isHolidayToday();
    $("#view").innerHTML = views[v].render();
    $("#view").dataset.view = v;
    const n = myNotifs().filter((x) => !x.read).length;
    $("#bellCount").hidden = !n; $("#bellCount").textContent = n;
    refreshDrawer();
    if (APP.afterRender) APP.afterRender(v);
    save();
  }

  let started = false;
  function init() {
    if (started) return; started = true;
    $("#role").innerHTML = Object.entries(ROLES).filter(([k, r]) => r.user && (userOf(r.user) || {}).role === k).map(([k, r]) => `<option value="${k}" ${k === role ? "selected" : ""}>${esc(person(r.user))} · ${esc(r.label)}</option>`).join("");
    // demo shortcut for presenting: sign straight in as the main account of a role (no password, no OTP)
    $("#role").addEventListener("change", (e) => { closeDrawer(); signIn(ROLES[e.target.value].user); location.hash = navList()[0]; render(); });
    window.addEventListener("hashchange", () => { $("#side").classList.remove("open"); closeDrawer(); render(); $("#view").focus({ preventScroll: true }); window.scrollTo(0, 0); });
    $("#menuBtn").addEventListener("click", () => $("#side").classList.toggle("open"));
    // light only for now (client): the dark theme stays in the CSS but is switched off, and its button is hidden
    document.documentElement.dataset.theme = "light";
    $("#resetBtn").addEventListener("click", () => { S = clone(window.SEED); ui = {}; closeDrawer(); $("#demoPanel").hidden = true; if (!userOf(uid)) uid = null; render(); toast("رجعت بيانات الديمو للأول"); });
    $("#bellBtn").addEventListener("click", () => {
      const list = myNotifs();
      $("#notifList").innerHTML = list.length ? list.map((x) => `<div class="ntf ${x.read ? "" : "new"}">${esc(x.text)}<small>${ago(x.at)}</small></div>`).join("") : `<p class="empty">مفيش إشعارات</p>`;
      list.forEach((x) => (x.read = true)); $("#notif").hidden = false; render();
    });
    $("#searchBtn").addEventListener("click", openCmd);
    $("#demoBtn").addEventListener("click", () => { $("#demoPanel").hidden = !$("#demoPanel").hidden; });
    $("#cmdInput").addEventListener("input", () => { cmdSel = 0; renderCmd(); });
    $("#cmdInput").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { cmdSel = Math.min(cmdList.length - 1, cmdSel + 1); renderCmd(); e.preventDefault(); }
      if (e.key === "ArrowUp") { cmdSel = Math.max(0, cmdSel - 1); renderCmd(); e.preventDefault(); }
      if (e.key === "Enter" && cmdList[cmdSel]) { const x = cmdList[cmdSel]; closeCmd(); x.go(); }
    });
    document.addEventListener("click", (e) => {
      if (e.target.closest("#toastUndo")) { if (undoFn) undoFn(); undoFn = null; $("#toast").hidden = true; render(); return; }
      const ci = e.target.closest("[data-cmd]"); if (ci) { const x = cmdList[+ci.dataset.cmd]; closeCmd(); x.go(); return; }
      if (e.target.id === "cmd") { closeCmd(); return; }
      const c = e.target.closest("[data-close]"); if (c) { const k = c.dataset.close; if (k === "modal") closeModal(); else if (k === "drawer") closeDrawer(); else $("#" + k).hidden = true; return; }
      if (e.target.id === "modal") { closeModal(); return; }
      if (e.target.id === "scrim") { closeDrawer(); return; }
      const a = e.target.closest("[data-act]");
      if (a && ACT[a.dataset.act]) { if (a.dataset.act !== "noop") e.preventDefault(); ACT[a.dataset.act](a.dataset, a, e); }
    });
    document.addEventListener("change", (e) => { const c = e.target.closest("[data-change]"); if (c && CHANGE[c.dataset.change]) CHANGE[c.dataset.change](c.type === "checkbox" ? c.checked : c.value, c); });
    document.addEventListener("input", (e) => { const c = e.target.closest("[data-input]"); if (c && CHANGE[c.dataset.input]) CHANGE[c.dataset.input](c.value, c); });
    document.addEventListener("submit", (e) => { const f = e.target.closest("form[data-form]"); if (f && FORM[f.dataset.form]) { e.preventDefault(); let fd; try { fd = new FormData(f, e.submitter || undefined); } catch (er) { fd = new FormData(f); if (e.submitter && e.submitter.name) fd.set(e.submitter.name, e.submitter.value); } const o = {}; new Set(fd.keys()).forEach((k) => { const vs = fd.getAll(k); o[k] = vs[0] instanceof File ? vs.filter((x) => x.name).map((x) => x.name).join("، ") : vs[vs.length - 1]; }); FORM[f.dataset.form](o, f); } });
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCmd(); return; }
      if (e.key === "Escape") { if (!$("#cmd").hidden) closeCmd(); else if (!$("#modal").hidden) closeModal(); else if (!$("#drawer").hidden) closeDrawer(); $("#notif").hidden = true; $("#demoPanel").hidden = true; }
    });
    // kanban drag & drop
    document.addEventListener("dragstart", (e) => { const d = e.target.closest("[data-drag]"); if (!d) return; e.dataTransfer.setData("text/plain", d.dataset.drag); e.dataTransfer.effectAllowed = "move"; d.classList.add("dragging"); });
    document.addEventListener("dragend", (e) => { const d = e.target.closest("[data-drag]"); if (d) d.classList.remove("dragging"); document.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); });
    document.addEventListener("dragover", (e) => { const z = e.target.closest("[data-drop]"); if (!z) return; e.preventDefault(); document.querySelectorAll(".over").forEach((x) => x !== z && x.classList.remove("over")); z.classList.add("over"); });
    document.addEventListener("drop", (e) => { const z = e.target.closest("[data-drop]"); if (!z) return; e.preventDefault(); z.classList.remove("over"); const [kind, val] = z.dataset.drop.split(":"); if (DROP[kind]) DROP[kind](e.dataTransfer.getData("text/plain"), val); });
    render();
    setInterval(() => { if (document.hidden || !$("#modal").hidden) return; render(); }, 60000);
  }

  window.APP = {
    get S() { return S; }, set S(v) { S = v; }, get role() { return role; }, get ui() { return ui; }, get uid() { return uid; }, signIn, signOut, userOf, rolesOf, roleLabel, save, ROLES, NAV, MODS, ACTS, canDo, permStr, navList, scope, audit, isHolidayToday, holOn, icon, avatar, who, esc, money, short, num, person, today, nowIso, NOW,
    fmtDate, fmtTime, fmtHM, minsSince, ago, hm, sales, activeSales, checkIn, dayVisit, manualOrder, onLeave, me, can, log, setStage, nextSales, routeArea, sla, slaLimits, rotateNoAnswer, findDupe, normPhone,
    unitTotal, incomeCalc, availableAs, isAvailable, stale, unitTab, recommend, attRow, dayRate, syncFingerprint, collected, collectedFrom, dealStatus, countsRevenue, inTarget, placesComm, salesShares, salesComm, buyersOf, sellersOf, inDeal, transactions, targetOf, targetGoal, tlStats, assignByHand, workMins, suspicious, notify, toast, forMe, lastTouch, ruleTo, ruleHas, isIn, dur,
    openModal, closeModal, openDrawer, closeDrawer, refreshDrawer, openCmd, render, ACT, FORM, CHANGE, DROP, DEFAULT_DED, CLOSED_OUT, deptOf, init
  };
})();
