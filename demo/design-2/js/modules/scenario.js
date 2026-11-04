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
  /* «سيناريو المالية»: أحمد (المحاسب) بيحصّل صفقة، وبيشوف أثرها على حساب العميل، وبيصرف فاتورة ثابتة بموافقته، وبيعمل قيد يدوي */
  const FD = () => S().deals.find((d) => d.id === ctx.fdeal), cl = () => FD().client;
  const tree = () => { A.ui.fnTab = "tree"; setTimeout(() => { const el = [...document.querySelectorAll("details summary")].find((x) => x.textContent.includes("العملاء")); if (el) { el.parentElement.open = true; el.scrollIntoView({ block: "center" }); } }, 50); };
  const FIN = [
    { who: "s4", go: "deals", t: "السيلز قفل صفقة", x: "م. شريف عادل (شركة Vertex Labs) أجّر مكتب. السيلز بيسجّل Done Deal: الوحدة، والمساحة، والعمولة من الـ Owner ومن الـ Client (30,000 + 30,000).",
      run() { A.FORM.leadNew({ name: "م. شريف عادل", company: "Vertex Labs", phones: "01011223344", area: "التجمع الخامس", type: "Rent", space: "150", condition: "متشطب", budget: "160000", channel: "Facebook", campaign: "c1", sales: "s4", note: "مكتب للفريق" });
        const l = S().leads[0], me = l.sales, u = S().units.find((x) => A.availableAs(x, "Rent") && x.pdf === "confirmed" && x.agent && x.agent !== me);
        A.setStage(l, "Near to Close"); A.FORM.deal({ lead: l.id, unit: u.code, space: String(u.space), type: "Rent", commOwner: "30000", commClient: "30000" }, pick([]));
        ctx.fdeal = S().deals[0].id; return `الصفقة ${ctx.fdeal} اتسجّلت · ${l.name} · ${u.code} · مستنية مراجعة الـ Office Manager.`; }, open: () => A.ACT.dealOpen({ id: ctx.fdeal }) },
    { who: "u21", go: "deals", t: "الـ Office Manager وافقت", x: "بعد الموافقة الصفقة بتتقفل في الشيت، وبيروح للمحاسب إشعار ومهمة «حصّل عمولة»، والعميل بيتفتحله حساب تحت «العملاء» (113) لوحده.",
      run() { const d = FD(); if ((d.sellers || []).length && !d.sellerApproved) A.ACT.sellerOk({ id: d.id }); A.FORM.dealReview({ id: d.id, v: "ok", space: String(d.space), type: d.type, location: d.location, commOwner: String(d.commOwner), commClient: String(d.commClient) }, { querySelector: () => ({ selectedOptions: A.buyersOf(d).map((value) => ({ value })) }) }); return `${d.id} بقت Approved · اتبعتت للمالية.`; }, open: () => A.ACT.dealOpen({ id: ctx.fdeal }) },
    { who: "u18", go: "home", t: "وصلت للمحاسب", x: "أحمد بيلاقي في «مهامي النهارده»: «صفقة اتقفلت · حصّل عمولة» بالعميل والمبلغ، وإشعار في الجرس. زرار «حصّل» بيفتح إذن توريد متعبّي بالصفقة.",
      run() { const n = S().notifications.find((x) => (x.text || x.msg || "").includes(ctx.fdeal)); return `مهمة: حصّل عمولة ${ctx.fdeal} · ${cl()} · ${A.money(A.placesComm(FD()))}${n ? " · والإشعار وصل" : ""}`; }, open: () => A.ACT.mvNew({ k: "receive", deal: ctx.fdeal }) },
    { who: "u18", go: "finance", t: "العميل ليه حساب تحت «العملاء»", x: "في شجرة الحسابات، «العملاء» (113) حساب رئيسي، وتحته حساب لكل عميل بكود ثابت. العميل الجديد اتفتحله حساب لوحده من الصفقة، ومجموع الحسابات = رصيد العملاء.",
      run() { const C = APP_COA(), n = C.idx["عميل:" + cl()]; tree(); return `${n.code} ${n.name}: ${A.money(n.bal)} · إجمالي العملاء ${A.money(C.byCode["113"].bal)} (${C.byCode["113"].kids.length} حساب)`; } },
    { who: "u18", go: "finance", t: "إذن توريد خزنة من الصفقة", x: "إذن توريد: المصدر «عمولة من عميل»، والصفقة متختارة، فاسم العميل بييجي لوحده. بنحصّل جزء الـ Client (30,000) في بنك CIB.",
      run() { A.ui.fnTab = "cash"; A.FORM.mvSave({ kind: "receive", to: "بنك CIB", source: "عمولة من عميل", deal: ctx.fdeal, side: "client", amount: "30000", note: `عمولة ${cl()} · جزء الـ Client`, date: A.today() }); return "اتعمل إذن التوريد وقيده: من ح/ بنك CIB إلى ح/ " + cl() + "."; }, keep: 1 },
    { who: "u18", go: "finance", t: "الأثر على حساب العميل", x: "أول تحصيل بيدخّل العمولة في الإيرادات، والباقي بيفضل على حساب العميل لحد ما يتحصّل. البنك زاد بالمبلغ. ولما تدوس على حساب العميل بيظهرلك كشف حسابه.",
      run() { const C = APP_COA(), n = C.idx["عميل:" + cl()]; tree(); return `${n.code} ${n.name}: باقي ${A.money(n.bal)} · بنك CIB: ${A.money(C.idx["بنك CIB"].bal)}`; }, open: () => A.ACT.acctLedger({ k: "عميل:" + cl() }) },
    { who: () => A.buyersOf(FD())[0], go: "home", t: "الـ TCR للسيلز", x: "نفس التحصيل عمل TCR بكود تسلسلي، والسيلز اللي على الصفقة بيجيله تنبيه يمضي عليها. يعني التحصيل بيتسجّل مرة واحدة ويروح للمالية والصفقة الاتنين.",
      run() { const t = FD().tcrs.slice(-1)[0]; return `${t.code} · ${A.money(t.amount)} · مستنية إمضاء ${A.buyersOf(FD()).map(A.person).join(" و")}`; }, open: () => A.ACT.dealOpen({ id: "D-302" }) },
    { who: "u18", go: "home", t: "فاتورة Property Finder ميعادها جه", x: "الفاتورة الثابتة (23,000 كل شهر يوم 1) مابتتصرفش لوحدها: بتظهر لأحمد مهمة في «مهامي النهارده» وكارت في الخزن، مستنية موافقته.",
      run() { const b = S().bills.find((x) => x.id === "BL-1"); return b.paid[A.today().slice(0, 7)] ? "اتصرفت قبل كده الشهر ده." : `${b.name} · ${A.money(b.amount)} · ميعادها يوم ${b.day} · لسه ماتصرفتش`; } },
    { who: "u18", go: "finance", t: "أحمد بيوافق ويصرف", x: "«وافق واصرف» بيفتح إذن صرف متعبّي (البند، المورد، الخزنة) والمبلغ بيتعدّل لو الفاتورة مختلفة. بعد الحفظ بيتعمل القيد والفاتورة بتتعلّم «اتصرفت الشهر ده».",
      run() { A.ui.fnTab = "bills"; A.FORM.mvSave({ kind: "pay", bill: "BL-1", date: A.today(), from: "بنك CIB", line: "اشتراكات منصات و برامج", party: "Property Finder", ref: "PF-INV-11", amount: "23000", note: "اشتراك Property Finder · نوفمبر" }); return "اتصرفت: من ح/ اشتراكات منصات و برامج إلى ح/ بنك CIB."; }, keep: 1 },
    { who: "u18", go: "finance", t: "قيد يومية يدوي", x: "المحاسب يقدر يعمل قيد بإيده من «القيود» ← «قيد يومية جديد»: يختار الحسابات من الشجرة، مدين ودائن، ومايتسجّلش غير لو متوازن. مثال: مصاريف بنكية 150 على بنك CIB.",
      run() { A.ui.fnTab = "journal"; const C = APP_COA(), line = C.leaves.find((n) => n.key === "اتصالات"), bank = C.idx["بنك CIB"];
        A.FORM.jeSave({ date: A.today(), note: "عمولة تحويل بنكي", lines: [{ code: line.code, dr: 150, cr: 0 }, { code: bank.code, dr: 0, cr: 150 }] }); return `اتسجّل القيد: من ح/ ${line.name} إلى ح/ بنك CIB.`; }, keep: 1 },
    { who: "u18", go: "finance", t: "الميزانية متوازنة", x: "كل اللي فات (التحصيل، الفاتورة، القيد اليدوي) اتسمّع في الشجرة، فالميزانية العمومية وقايمة الدخل اتحدّثوا لوحدهم.",
      run() { A.ui.fnTab = "bs"; const C = APP_COA(); return `الأصول ${A.money(C.byCode["1"].bal)} = الخصوم ${A.money(C.byCode["2"].bal)} + حقوق الملكية ${A.money(C.byCode["3"].bal)}`; } }
  ];
  const APP_COA = () => A.coa();
  const SETS = { main: STEPS, fin: FIN };
  let STEPS_ = STEPS;
  let i = 0, out = "";
  const who = (s) => (typeof s.who === "function" ? s.who() : s.who);
  function show() {
    let el = document.getElementById("scn"); if (!el) { document.body.insertAdjacentHTML("beforeend", `<aside class="scn" id="scn" role="dialog" aria-live="polite" dir="rtl"></aside>`); el = document.getElementById("scn"); }
    const s = STEPS_[i]; el.hidden = false;
    el.innerHTML = `<div class="row"><span class="crumb">سيناريو العرض · ${i + 1} / ${STEPS_.length}</span><span class="spacer"></span><button class="icon-btn" data-act="scnEnd" aria-label="إنهاء">${I("x")}</button></div><h3>${esc(s.t)}</h3><p>${esc(s.x)}</p>${out ? `<div class="scn-out">${I("check")}<span>${esc(out)}</span></div>` : ""}<div class="row end">${i ? `<button class="btn ghost sm" data-act="scnPrev">السابق</button>` : ""}${out ? (i < STEPS_.length - 1 ? `<button class="btn sm" data-act="scnNext">الخطوة الجاية</button>` : `<button class="btn sm" data-act="scnEnd">خلصت</button>`) : `<button class="btn sm" data-act="scnRun">${I("bolt")}نفّذ الخطوة</button>`}</div>`;
  }
  A.ACT.scnStart = (d) => { STEPS_ = SETS[(d && d.s) || "main"]; document.getElementById("demoPanel").hidden = true; i = 0; out = ""; Object.keys(ctx).forEach((k) => delete ctx[k]); show(); };
  A.ACT.scnRun = () => {
    const s = STEPS_[i];
    try { A.signIn(who(s), 1); location.hash = s.go; out = s.run() || "اتنفّذت"; if (!s.keep) A.render(); if (s.open) s.open(); }
    catch (e) { out = "الخطوة دي محتاجة اللي قبلها يتنفّذ الأول"; }
    show();
  };
  A.ACT.scnNext = () => { i = Math.min(STEPS_.length - 1, i + 1); out = ""; A.closeDrawer(); A.closeModal(); show(); };
  A.ACT.scnPrev = () => { i = Math.max(0, i - 1); out = ""; show(); };
  A.ACT.scnEnd = () => { const el = document.getElementById("scn"); if (el) el.hidden = true; };
})();
