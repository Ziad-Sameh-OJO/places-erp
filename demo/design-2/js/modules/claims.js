/* M-07 · المطالبات وإيصالات استلام النقدية
   السيلز بيطلب مطالبة من الصفقة (الشركة · بيانات الوحدة · المبلغ، مش شرط نفس العمولة) ← أحمد بيعتمدها فبتطلع من القالب ← العميل بيعتمد ويطلب فاتورة إلكترونية
   ← أحمد بيرفعها على البورتال ← العميل بيدفع ← تحصيل المطالبة بيعمل «إيصال استلام نقدية» من نفس البيانات. القالبين بيتعدّلوا من الإعدادات. */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S, { chip, opt, head, note } = U;

  // ---- the amount in Arabic words (for the receipt): «فقط مائة ألف جنيه مصري لا غير» ----
  const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  const below1000 = (n) => { const h = Math.floor(n / 100), r = n % 100, t = r < 20 ? ONES[r] : ONES[r % 10] ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]; return [HUNDREDS[h], t].filter(Boolean).join(" و"); };
  const scale = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${below1000(n)} ${few}` : `${below1000(n)} ${many}`);
  A.amountWords = (x) => { const n = Math.round(+x || 0); if (!n) return "صفر";
    const m = Math.floor(n / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000;
    return [m && scale(m, "مليون", "مليونان", "ملايين", "مليون"), k && scale(k, "ألف", "ألفان", "آلاف", "ألف"), r && below1000(r)].filter(Boolean).join(" و"); };

  // ---- templates (Nancy's wording goes here · editable from Settings) ----
  const TPL = {
    claim: { title: "مطالبة مالية", body: "السادة / {الشركة}\nتحية طيبة وبعد،\nنتشرف بمطالبة سيادتكم بسداد مبلغ {المبلغ} ({المبلغ_بالحروف}) قيمة {نوع_العمولة} عن الوحدة {الوحدة}.\nبيانات الوحدة: {بيانات_الوحدة}.", footer: "برجاء اعتماد المطالبة وإفادتنا لإصدار الفاتورة الإلكترونية.\nوتفضلوا بقبول فائق الاحترام،\nPlaces · الإدارة المالية" },
    receipt: { title: "إيصال استلام نقدية", body: "استلمنا من السادة / {الشركة} مبلغ {المبلغ} ({المبلغ_بالحروف})\nوذلك مقابل {نوع_العمولة} عن الوحدة {الوحدة} ({بيانات_الوحدة}).\nطريقة الدفع: {طريقة_الدفع} · بموجب المطالبة رقم {رقم_المطالبة}.", footer: "وهذا إيصال منا بذلك،\nPlaces · الإدارة المالية" }
  };
  const tpl = (k) => Object.assign({}, TPL[k], (S().docTpl || {})[k]);
  A.docTplDefault = TPL;
  const unitInfo = (d) => { const u = S().units.find((x) => x.code === d.unit) || {}; return [u.project, u.building && `مبنى ${u.building}`, u.floor && `الدور ${u.floor}`, (u.space || d.space) && `${A.num(u.space || d.space)} م²`, u.condition, u.area || d.location].filter(Boolean).join(" · "); };
  const kindOf = (d) => `عمولة ${d.type === "Rent" ? "تأجير" : d.type === "Resale" ? "إعادة بيع" : d.type === "Primary" ? "بيع" : "تسويق"}`;
  const fill = (text, c, extra) => String(text).replace(/\{([^}]+)\}/g, (m, k) => { const v = Object.assign({ الشركة: c.company, العميل: c.client, الوحدة: c.unit, بيانات_الوحدة: c.unitInfo, المبلغ: A.money(c.amount), المبلغ_بالحروف: `فقط ${A.amountWords(c.amount)} جنيه مصري لا غير`, الصفقة: c.deal, نوع_العمولة: c.kind, رقم_المطالبة: c.id, التاريخ: A.fmtDate(c.issuedAt || c.at), طريقة_الدفع: c.payMethod || "تحويل بنكي" }, extra)[k]; return v == null ? m : esc(v); }).replace(/\n/g, "<br>");

  const ST = { requested: ["warn", "مستنية اعتماد المالية"], issued: ["info", "المطالبة اتبعتت · مستنية العميل"], approved: ["warn", "العميل اعتمد · ارفع الفاتورة الإلكترونية"], einvoice: ["info", "الفاتورة الإلكترونية اترفعت · مستنية الدفع"], paid: ["ok", "اتحصّلت · الإيصال جاهز"], rejected: ["bad", "اترفضت"] };
  const fin = () => A.canDo("finance", "create");
  const mine = (d) => A.inDeal(d, A.me()) || fin() || A.canDo("deals", "approve");
  const claimsOf = (id) => (S().claims || []).filter((c) => c.deal === id);

  // ---- the documents ----
  const doc = (c, kind) => { const T = tpl(kind), no = kind === "claim" ? c.id : c.receiptNo, at = kind === "claim" ? c.issuedAt : c.paidAt;
    return `<div class="pdf doc"><div class="pdf-head"><b>Places · ${esc(T.title)}</b><span class="mono">${esc(no)}</span></div>
      ${U.kv([["التاريخ", A.fmtDate(at || A.nowIso())], ["الصفقة", `<span class="mono">${esc(c.deal)}</span>`], ...(kind === "receipt" && c.einv ? [["الفاتورة الإلكترونية", `<span class="mono">${esc(c.einv.no)}</span>`]] : [])])}
      <div class="doc-body">${fill(T.body, c, { التاريخ: A.fmtDate(at || A.nowIso()) })}</div>
      ${U.table(["البيان", "القيمة"], [["الشركة", esc(c.company)], ["الوحدة", `${esc(c.unit)} · ${esc(c.unitInfo)}`], ["المبلغ", `<b>${A.money(c.amount)}</b>`], ["المبلغ بالحروف", `فقط ${esc(A.amountWords(c.amount))} جنيه مصري لا غير`]].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`))}
      <div class="doc-body">${fill(T.footer, c, {})}</div></div>
      <div class="row end no-print"><button class="btn ghost sm" data-act="printModal">${I("file")}اطبع / PDF (بالختم والإمضا)</button></div>`; };
  A.ACT.claimDoc = (d) => { const c = S().claims.find((x) => x.id === d.id); A.openModal(`${tpl(d.k || "claim").title} · ${d.k === "receipt" ? c.receiptNo : c.id}`, doc(c, d.k || "claim")); };

  // ---- sales: request a claim from the deal ----
  A.ACT.claimNew = (d) => { const st = S(), dl = st.deals.find((x) => x.id === d.id), rem = A.placesComm(dl) - A.collected(dl);
    A.openModal(`اطلب مطالبة · ${dl.id}`, `<form data-form="claimSave" class="grid"><input type="hidden" name="deal" value="${dl.id}">${note("المطالبة بتروح لأحمد (المالية) يعتمدها، وبتتعمل أوتوماتيك على القالب. المبلغ مش شرط يبقى نفس العمولة.")}
      ${U.field("اسم الشركة (زي ما هيتكتب في المطالبة)", `<input name="company" required value="${esc(dl.company || dl.client)}">`, 1, 1)}
      ${U.field("الوحدة", `<input name="unit" required value="${esc(dl.unit || "")}">`, 1)}${U.field("المطالبة على", `<select name="side">${opt("client", "الـ Client", "client")}${opt("owner", "الـ Owner")}</select>`, 1)}
      ${U.field("بيانات الوحدة", `<input name="unitInfo" required value="${esc(unitInfo(dl))}">`, 1, 1)}
      ${U.field("المبلغ", `<input name="amount" type="number" min="1" step="any" required value="${Math.round(dl.commClient || rem)}">`, 1)}${U.field("نوع العمولة", `<input name="kind" required value="${esc(kindOf(dl))}">`, 1)}
      ${U.field("ملاحظة للمالية", `<input name="note" placeholder="اختياري">`, 0, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("send")}ابعت للمالية</button></div></form>`); };
  A.FORM.claimSave = (f) => { const st = S(), dl = st.deals.find((x) => x.id === f.deal), c = { id: "CL-" + String((st.claims = st.claims || []).length + 101), deal: dl.id, client: dl.client, company: f.company.trim(), unit: f.unit.trim(), unitInfo: f.unitInfo.trim(), amount: +f.amount, side: f.side, kind: f.kind.trim(), note: (f.note || "").trim(), status: "requested", by: A.me(), at: A.nowIso() };
    st.claims.unshift(c); A.notify(["accountant"], `${A.person(A.me())} طالب مطالبة ${c.id} · ${c.company} · ${A.money(c.amount)} (${dl.id})`); A.audit("finance", `طلب مطالبة ${c.id} · ${c.company} · ${A.money(c.amount)}`);
    A.closeModal(); A.toast(`اتبعتت للمالية · ${c.id}`); A.render(); A.refreshDrawer && A.refreshDrawer(); };

  // ---- finance: approve / e-invoice / collect ----
  A.ACT.claimIssue = (d) => { const c = S().claims.find((x) => x.id === d.id); if (!fin()) return A.toast("المالية بس");
    c.status = "issued"; c.issuedAt = A.nowIso(); c.issuedBy = A.me(); A.notify([c.by], `المطالبة ${c.id} جاهزة · ابعتها لـ ${c.company}`); A.audit("finance", `اعتماد المطالبة ${c.id}`); A.render(); A.ACT.claimDoc({ id: c.id }); A.toast("المطالبة اتعملت من القالب · بالختم والإمضا"); };
  A.ACT.claimReject = (d) => { const c = S().claims.find((x) => x.id === d.id), why = (prompt("سبب الرفض؟") || "").trim(); if (!why) return; c.status = "rejected"; c.why = why; A.notify([c.by], `المطالبة ${c.id} اترفضت: ${why}`); A.render(); };
  A.ACT.claimApproved = (d) => { const c = S().claims.find((x) => x.id === d.id); c.status = "approved"; c.approvedAt = A.nowIso(); A.notify(["accountant"], `العميل اعتمد المطالبة ${c.id} (${c.company}) وطالب فاتورة إلكترونية بـ ${A.money(c.amount)}`); A.audit("finance", `${c.id}: العميل اعتمد`); A.toast("اتبلّغت المالية ترفع الفاتورة الإلكترونية"); A.render(); A.refreshDrawer && A.refreshDrawer(); };
  A.ACT.claimEinv = (d) => { const c = S().claims.find((x) => x.id === d.id);
    A.openModal(`الفاتورة الإلكترونية · ${c.id}`, `<form data-form="claimEinvSave" class="grid"><input type="hidden" name="id" value="${c.id}">${note(`${esc(c.company)} · ${A.money(c.amount)} · ارفعها على بورتال الفاتورة الإلكترونية واكتب رقمها هنا.`)}
      ${U.field("رقم الفاتورة الإلكترونية", `<input name="no" required placeholder="مثلاً: EG-2026-001245">`, 1)}${U.field("تاريخ الرفع", `<input name="date" type="date" value="${A.today()}" max="${A.today()}" required>`, 1)}
      <div class="row end wide"><button type="button" class="btn ghost" data-close="modal">إلغاء</button><button class="btn">${I("check")}اترفعت</button></div></form>`); };
  A.FORM.claimEinvSave = (f) => { const c = S().claims.find((x) => x.id === f.id); c.einv = { no: f.no.trim(), at: f.date, by: A.me() }; c.status = "einvoice"; A.notify([c.by], `الفاتورة الإلكترونية للمطالبة ${c.id} اترفعت (${c.einv.no}) · ابلغ العميل`); A.audit("finance", `${c.id}: فاتورة إلكترونية ${c.einv.no}`); A.closeModal(); A.toast("اتسجّلت"); A.render(); };
  A.ACT.claimReceiptReq = (d) => { const c = S().claims.find((x) => x.id === d.id); c.receiptReq = A.nowIso(); A.notify(["accountant"], `${A.person(A.me())}: ${c.company} دفع ${A.money(c.amount)} وطالب إيصال استلام نقدية (${c.id}) · سجّل التحصيل`); A.toast("اتبعت للمالية"); A.render(); A.refreshDrawer && A.refreshDrawer(); };
  // collecting the claim = the receive voucher (with the deal), then the receipt is made from the claim
  A.ACT.claimCollect = (d) => { const c = S().claims.find((x) => x.id === d.id); A.ACT.mvNew({ k: "receive", deal: c.deal, claim: c.id }); };
  A.claimPaid = (id, mv) => { const st = S(), c = (st.claims || []).find((x) => x.id === id); if (!c) return; c.status = "paid"; c.paidAt = mv.at; c.payMethod = { خزينة: "نقدي", بنك: "تحويل بنكي", محفظة: "محفظة إلكترونية" }[(st.accounts.find((a) => a.name === mv.to) || {}).kind] || "تحويل بنكي"; c.to = mv.to; c.move = mv.id; c.amount = mv.amount; c.receiptNo = "RC-" + String((st.receiptSeq = (st.receiptSeq || 500) + 1));
    A.notify([c.by], `إيصال استلام النقدية ${c.receiptNo} جاهز · ${c.company} · ${A.money(c.amount)}`); A.audit("finance", `${c.id}: اتحصّلت · ${mv.id} · إيصال ${c.receiptNo}`); };

  // ---- in the deal drawer ----
  A.claimsBlock = (d) => { if (!mine(d)) return ""; const cs = claimsOf(d.id), live = !["Pending Review", "Rejected", "Cancelled"].includes(d.status);
    return `<section class="card flat">${head("المطالبات وإيصالات الاستلام", "file", cs.length ? chip("", cs.length + "", 1) : "", "اطلب مطالبة للعميل · وبعد الدفع إيصال استلام نقدية")}
      ${cs.map((c) => `<div class="line-item"><span><b class="mono click" data-act="claimDoc" data-id="${c.id}">${c.id}</b> · ${esc(c.company)} · <b>${A.money(c.amount)}</b> ${chip(ST[c.status][0], ST[c.status][1], 1)}${c.einv ? `<small class="hint"> · فاتورة ${esc(c.einv.no)}</small>` : ""}</span>
        <span class="row">${c.status !== "requested" && c.status !== "rejected" ? `<button class="btn ghost sm" data-act="claimDoc" data-id="${c.id}">المطالبة</button>` : ""}${c.status === "issued" ? `<button class="btn sm" data-act="claimApproved" data-id="${c.id}">العميل اعتمد</button>` : ""}
        ${["issued", "approved", "einvoice"].includes(c.status) && !c.receiptReq ? `<button class="btn ghost sm" data-act="claimReceiptReq" data-id="${c.id}">العميل دفع · اطلب إيصال</button>` : ""}${c.status === "paid" ? `<button class="btn sm" data-act="claimDoc" data-id="${c.id}" data-k="receipt">إيصال الاستلام ${c.receiptNo}</button>` : ""}</span></div>`).join("")}
      ${live ? `<div class="row end"><button class="btn ghost sm" data-act="claimNew" data-id="${d.id}">${I("plus")}اطلب مطالبة</button></div>` : ""}</section>`; };

  // ---- finance tab ----
  A.claimsTab = () => { const st = S(), cs = st.claims || [], f = A.ui.clF || "open", list = cs.filter((c) => f === "all" || (f === "open" ? !["paid", "rejected"].includes(c.status) : c.status === f));
    const act = (c) => !fin() ? "" : c.status === "requested" ? `<button class="btn sm" data-act="claimIssue" data-id="${c.id}">اعتمد واعمل المطالبة</button> <button class="btn ghost sm" data-act="claimReject" data-id="${c.id}">ارفض</button>`
      : c.status === "approved" ? `<button class="btn sm" data-act="claimEinv" data-id="${c.id}">اترفعت الفاتورة الإلكترونية</button>`
      : ["issued", "einvoice"].includes(c.status) ? `${c.status === "issued" ? `<button class="btn ghost sm" data-act="claimEinv" data-id="${c.id}">ارفع الفاتورة</button> ` : ""}<button class="btn ${c.receiptReq ? "" : "ghost"} sm" data-act="claimCollect" data-id="${c.id}">اتحصّلت · اعمل الإيصال</button>`
      : c.status === "paid" ? `<button class="btn ghost sm" data-act="claimDoc" data-id="${c.id}" data-k="receipt">${c.receiptNo}</button> <a class="mono click" data-act="mvView" data-id="${c.move}">${c.move}</a>` : esc(c.why || "");
    return `${note("السيلز بيطلب المطالبة من الصفقة (الشركة · بيانات الوحدة · المبلغ) ← «اعتمد واعمل المطالبة» بتطلع من القالب بالختم والإمضا ← السيلز يبعتها للعميل ويعلّم «العميل اعتمد» ← انت بترفع الفاتورة الإلكترونية وتكتب رقمها ← لما العميل يدفع «اتحصّلت · اعمل الإيصال» بيفتح إذن توريد بالمبلغ، وبعد الحفظ «إيصال استلام النقدية» بيتعمل من نفس البيانات.")}
      <div class="row">${U.seg("clF", [["open", "مفتوحة"], ["requested", "مستنية اعتمادك"], ["approved", "مستنية فاتورة"], ["paid", "اتحصّلت"], ["all", "الكل"]], f)}<span class="spacer"></span><a class="btn ghost sm" href="#master" data-act="goTpl">${I("file")}عدّل القوالب</a></div>
      ${U.table(["المطالبة", "الشركة", "الوحدة", "المبلغ", "طلبها", "الحالة", ""], list.map((c) => `<tr><td class="mono click" data-act="claimDoc" data-id="${c.id}">${c.id}<span class="sub">${esc(c.deal)}</span></td><td>${esc(c.company)}</td><td>${esc(c.unit)}<span class="sub">${esc(c.unitInfo)}</span></td><td class="n"><b>${A.money(c.amount)}</b></td><td>${esc(A.person(c.by))}<span class="sub">${A.fmtDate(c.at)}</span></td><td>${chip(ST[c.status][0], ST[c.status][1], 1)}${c.einv ? `<span class="sub">فاتورة ${esc(c.einv.no)}</span>` : ""}${c.receiptReq && c.status !== "paid" ? `<span class="sub">العميل دفع وطالب إيصال</span>` : ""}</td><td>${act(c)}</td></tr>`))}`; };
  A.ACT.clF = (d) => { A.ui.clF = d.v; A.render(); };
  A.ACT.goTpl = () => { A.ui.msTab = "tpl"; location.hash = "#master"; A.render(); };
  A.claimsInbox = (add) => { if (!fin()) return; (S().claims || []).forEach((c) => {
    if (c.status === "requested") add("warn", "file", `اعمل مطالبة ${c.id} · ${c.company}`, `${A.money(c.amount)} · طلبها ${A.person(c.by)}`, "goFinTab", { t: "claims" }, "افتح");
    if (c.status === "approved") add("warn", "file", `ارفع الفاتورة الإلكترونية · ${c.id}`, `${c.company} · ${A.money(c.amount)}`, "claimEinv", { id: c.id }, "ارفع");
    if (c.receiptReq && c.status !== "paid") add("warn", "wallet", `سجّل تحصيل ${c.id} واعمل الإيصال`, `${c.company} دفع ${A.money(c.amount)}`, "claimCollect", { id: c.id }, "سجّل"); }); };

  // ---- templates editor (Settings) ----
  A.tplEditor = (ed) => { const box = (k, l) => { const T = tpl(k); return `<section class="card">${head(l, "file")}
      ${U.field("العنوان", `<input value="${esc(T.title)}" data-change="tplSet" data-k="${k}" data-f="title" ${ed ? "" : "disabled"}>`, 0, 1)}
      ${U.field("النص", `<textarea rows="6" data-change="tplSet" data-k="${k}" data-f="body" ${ed ? "" : "disabled"}>${esc(T.body)}</textarea>`, 0, 1)}
      ${U.field("الختام", `<textarea rows="3" data-change="tplSet" data-k="${k}" data-f="footer" ${ed ? "" : "disabled"}>${esc(T.footer)}</textarea>`, 0, 1)}
      ${ed ? `<div class="row end"><button class="btn ghost sm" data-act="tplReset" data-k="${k}">رجّع الافتراضي</button><button class="btn ghost sm" data-act="tplPreview" data-k="${k}">${I("file")}شوف شكلها</button></div>` : ""}</section>`; };
    return `${note("الكلمات اللي بين {} بتتملي لوحدها: {الشركة} {العميل} {الوحدة} {بيانات_الوحدة} {المبلغ} {المبلغ_بالحروف} {نوع_العمولة} {الصفقة} {رقم_المطالبة} {التاريخ} {طريقة_الدفع}. الختم والإمضا بيتحطوا لوحدهم وقت الطباعة.")}<div class="cols">${box("claim", "قالب المطالبة")}${box("receipt", "قالب إيصال استلام النقدية")}</div>`; };
  A.CHANGE.tplSet = (v, el) => { const st = S(); ((st.docTpl = st.docTpl || {})[el.dataset.k] = st.docTpl[el.dataset.k] || {})[el.dataset.f] = v; A.audit("master", `قالب ${el.dataset.k === "claim" ? "المطالبة" : "الإيصال"}: اتعدّل ${el.dataset.f}`); A.toast("اتحفظ القالب"); };
  A.ACT.tplReset = (d) => { const st = S(); if (st.docTpl) delete st.docTpl[d.k]; A.toast("رجع للقالب الافتراضي"); A.render(); };
  A.ACT.tplPreview = (d) => { const sample = { id: "CL-000", deal: "D-000", client: "م. أحمد سامي", company: "شركة النيل للتكنولوجيا", unit: "U-101", unitInfo: "Mivida Business Park · مبنى B4 · الدور 2 · 95 م² · متشطب", amount: 100000, kind: "عمولة تأجير", issuedAt: A.nowIso(), paidAt: A.nowIso(), receiptNo: "RC-000", einv: { no: "EG-2026-000000" } };
    A.openModal(`${tpl(d.k).title} · معاينة`, doc(sample, d.k)); };
})();
