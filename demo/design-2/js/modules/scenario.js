/* «سيناريو العرض»: one guided run through the whole cycle for a client meeting. Each step signs in as the right person,
   opens the right screen and really performs the action (lead → deal → approvals → collection → TCR → targets → quarterly sheet). */
(function () {
  const A = window.APP, U = window.UI, esc = A.esc, I = A.icon, S = () => A.S;
  const pick = (ids) => ({ querySelector: () => ({ selectedOptions: ids.map((value) => ({ value })) }) }); // stands in for a <select multiple>
  const ctx = {};
  const lead = () => S().leads.find((l) => l.id === ctx.lead), deal = () => S().deals.find((d) => d.id === ctx.deal);
  const STEPS = [
    { who: "u6", go: "leads", t: "ليد جديد بيدخل ويتوزّع", x: "الأوبريشن بتسجّل ليد من كامبين Facebook في التجمع الخامس. السيستم بيوزّعه لوحده على سيلز المنطقة دي بالدور، وبيبدأ عدّاد الـ SLA (ساعتين ونص تنبيه، 3 ساعات سحب).",
      run() { A.FORM.leadNew({ name: "م. هالة سمير", company: "Nova Labs", phones: "01099911122", area: "التجمع الخامس", type: "Rent", space: "120", condition: "متشطب", budget: "140000", channel: "Facebook", campaign: "c1", sales: "", note: "عايزين مكتب قريب من التسعين" }); ctx.lead = S().leads[0].id; return `الليد ${ctx.lead} راح لـ ${A.person(lead().sales)}.`; }, open: () => A.ACT.leadOpen({ id: ctx.lead }) },
    { who: () => lead().sales, go: "leads", t: "السيلز بيكلّمه ويبقى Interested", x: "السيلز بيسجّل المكالمة فالـ SLA بيقف، وبيغيّر المرحلة لـ Interested. الليد بيتعلّم Qualified أوتوماتيك، وبيتحسب في الكامبين والـ channel بتوعه في التسويق.",
      run() { A.ACT.leadCall({ id: ctx.lead }); A.setStage(lead(), "Interested"); A.log(lead(), "المرحلة بقت Interested"); return `${lead().name} بقى Interested واتعلّم Qualified.`; }, open: () => A.ACT.leadOpen({ id: ctx.lead }) },
    { who: () => lead().sales, go: "deals", t: "السيلز بيقفل Done Deal", x: "السيلز بيختار الوحدة من الانفنتوري، وبيكتب مين معاه في جهة الـ Buyer. الـ Seller بييجي لوحده من الـ Agent بتاع الوحدة، والصفقة بتروح للـ Office Manager.",
      run() {
        const me = lead().sales, u = S().units.find((x) => A.availableAs(x, "Rent") && x.pdf === "confirmed" && x.agent && x.agent !== me), mate = A.activeSales().find((id) => id !== me && id !== u.agent);
        A.FORM.deal({ lead: ctx.lead, unit: u.code, space: String(u.space), type: "Rent", commOwner: "40000", commClient: "40000" }, pick([mate]));
        ctx.deal = S().deals[0].id; ctx.unit = u.code; return `الصفقة ${ctx.deal} اتسجّلت · Buyer: ${A.buyersOf(deal()).map(A.person).join(" و")} · Seller: ${(deal().sellers || []).map(A.person).join("")} (مستني منار).`;
      }, open: () => A.ACT.dealOpen({ id: ctx.deal }) },
    { who: "u7", go: "home", t: "منار توافق على الـ Seller", x: "الـ Agent بتاع الوحدة مايتسجّلش Seller غير بموافقة منار. التنبيه بيجيلها في «مهامي النهارده».",
      run() { A.ACT.sellerOk({ id: ctx.deal }); return `${(deal().sellers || []).map(A.person).join("")} اتسجّل Seller.`; }, open: () => A.ACT.dealOpen({ id: ctx.deal }) },
    { who: "u21", go: "deals", t: "الـ Office Manager تراجع وتوافق", x: "تقدر تعدّل أي خانة قبل ما توافق. بعد الموافقة الصفقة بتتسجّل في شيت الـ Done Deals، والتسويق بيجيله Alarm بالبيانات المسموحلها بيها بس.",
      run() { const d = deal(); A.FORM.dealReview({ id: d.id, v: "ok", space: String(d.space), type: d.type, location: d.location, commOwner: String(d.commOwner), commClient: String(d.commClient) }, { querySelector: () => ({ selectedOptions: A.buyersOf(d).map((value) => ({ value })) }) }); A.ui.dlTab = "sheet"; return `${d.id} اتسجّلت في الشيت.`; } },
    { who: "u18", go: "deals", t: "المالية بتسجّل التحصيل وبتطلع TCR", x: "التحصيل من الـ Client ومن الـ Owner. كل تحصيل بيعمل ورقة TCR بكود تسلسلي. والكوميشن اللي اتحصّل بيتقسم: نص للـ Buyer ونص للـ Seller، وكل نص على عدد السيلز في الجهة دي.",
      run() { A.FORM.dealPay({ id: ctx.deal, side: "client", amount: "40000" }); A.FORM.dealPay({ id: ctx.deal, side: "owner", amount: "40000" }); return `اتحصّل ${A.money(80000)} · ${deal().tcrs.map((x) => x.code).join(" و")} · ${A.salesShares(deal()).map((x) => `${A.person(x.sales)} ${A.short(x.share)}`).join(" · ")}`; }, open: () => A.ACT.dealOpen({ id: ctx.deal }) },
    { who: () => A.buyersOf(deal())[0], go: "home", t: "السيلز بيمضي على الـ TCR", x: "كل سيلز في الديل بيجيله تنبيه يمضي على كل TCR. والـ TCR بتتطبع كـ PDF من الزرار اللي جواها.",
      run() { deal().tcrs.forEach((x, i) => A.ACT.tcrSign({ id: ctx.deal, i })); return "مضى على الـ TCR."; }, open: () => A.ACT.dealOpen({ id: ctx.deal }) },
    { who: "u7", go: "inventory", t: "منار تأكد قفل الوحدة", x: "الوحدة مابتتقفلش (Rented) غير بعد موافقة الـ Office Manager على الصفقة وتأكيد منار. ولو الوحدة متاحة كمان Resale، الجانب ده بيفضل متاح.",
      run() { A.ACT.unitCloseConfirm({ code: ctx.unit }); return `${ctx.unit} اتقفلت.`; }, open: () => A.ACT.unitOpen({ code: ctx.unit }) },
    { who: "u21", go: "reports", t: "التارجت والـ Team Leaders", x: "نصيب كل سيلز من الكوميشن بيدخل التارجت بتاعه، وبتتحسبله Transaction. والـ Team Leader بياخد نسبة حسب شريحة تحقيق فريقه.",
      run() { A.ui.rpTab = "tl"; return "ده جدول الـ Team Leaders بعد الصفقة."; } },
    { who: "u21", go: "reports", t: "ورقة الـ Quarter لكل سيلز", x: "السيستم بيعمل ورقة لكل سيلز (المرتب، التارجت، الـ Scheme، العمولة، الجوايز). الـ Office Manager بتوافق، والورق بيتبعت على إيميل كل واحد.",
      run() { A.ui.rpTab = "pdf"; const st = S(), k = Object.keys(st.statements || {}).find((x) => st.statements[x].status === "draft"); if (!k) A.ACT.pdfMake(); A.ACT.pdfApprove(); return "الورق اتبعت · افتح «صندوق الإيميل» من لوحة الديمو تشوفه."; } }
  ];
  let i = 0, out = "";
  const who = (s) => (typeof s.who === "function" ? s.who() : s.who);
  function show() {
    let el = document.getElementById("scn"); if (!el) { document.body.insertAdjacentHTML("beforeend", `<aside class="scn" id="scn" role="dialog" aria-live="polite" dir="rtl"></aside>`); el = document.getElementById("scn"); }
    const s = STEPS[i]; el.hidden = false;
    el.innerHTML = `<div class="row"><span class="crumb">سيناريو العرض · ${i + 1} / ${STEPS.length}</span><span class="spacer"></span><button class="icon-btn" data-act="scnEnd" aria-label="إنهاء">${I("x")}</button></div><h3>${esc(s.t)}</h3><p>${esc(s.x)}</p>${out ? `<div class="scn-out">${I("check")}<span>${esc(out)}</span></div>` : ""}<div class="row end">${i ? `<button class="btn ghost sm" data-act="scnPrev">السابق</button>` : ""}${out ? (i < STEPS.length - 1 ? `<button class="btn sm" data-act="scnNext">الخطوة الجاية</button>` : `<button class="btn sm" data-act="scnEnd">خلصت</button>`) : `<button class="btn sm" data-act="scnRun">${I("bolt")}نفّذ الخطوة</button>`}</div>`;
  }
  A.ACT.scnStart = () => { document.getElementById("demoPanel").hidden = true; i = 0; out = ""; Object.keys(ctx).forEach((k) => delete ctx[k]); show(); };
  A.ACT.scnRun = () => {
    const s = STEPS[i];
    try { A.signIn(who(s), 1); location.hash = s.go; out = s.run() || "اتنفّذت"; A.render(); if (s.open) s.open(); }
    catch (e) { out = "الخطوة دي محتاجة اللي قبلها يتنفّذ الأول"; }
    show();
  };
  A.ACT.scnNext = () => { i = Math.min(STEPS.length - 1, i + 1); out = ""; A.closeDrawer(); show(); };
  A.ACT.scnPrev = () => { i = Math.max(0, i - 1); out = ""; show(); };
  A.ACT.scnEnd = () => { const el = document.getElementById("scn"); if (el) el.hidden = true; };
})();
