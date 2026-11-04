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
    { who: "u21", go: "deals", t: "الـ Office Manager وافقت", x: "بعد الموافقة الصفقة بتتقفل في الشيت، وبيروح للمحاسب إشعار ومهمة «حصّل عمولة»، والعميل بيتفتحله حساب تحت «عملاء» (113) لوحده.",
      run() { const d = FD(); if ((d.sellers || []).length && !d.sellerApproved) A.ACT.sellerOk({ id: d.id }); A.FORM.dealReview({ id: d.id, v: "ok", space: String(d.space), type: d.type, location: d.location, commOwner: String(d.commOwner), commClient: String(d.commClient) }, { querySelector: () => ({ selectedOptions: A.buyersOf(d).map((value) => ({ value })) }) }); return `${d.id} بقت Approved · اتبعتت للمالية.`; }, open: () => A.ACT.dealOpen({ id: ctx.fdeal }) },
    { who: "u18", go: "home", t: "وصلت للمحاسب", x: "أحمد بيلاقي في «مهامي النهارده»: «صفقة اتقفلت · حصّل عمولة» بالعميل والمبلغ، وإشعار في الجرس. زرار «حصّل» بيفتح إذن توريد متعبّي بالصفقة.",
      run() { const n = S().notifications.find((x) => (x.text || x.msg || "").includes(ctx.fdeal)); return `مهمة: حصّل عمولة ${ctx.fdeal} · ${cl()} · ${A.money(A.placesComm(FD()))}${n ? " · والإشعار وصل" : ""}`; }, open: () => A.ACT.mvNew({ k: "receive", deal: ctx.fdeal }) },
    { who: "u18", go: "finance", t: "العميل ليه حساب تحت «العملاء»", x: "في شجرة الحسابات، «عملاء» (113) حساب رئيسي، وتحته حساب لكل عميل بكود ثابت. العميل الجديد اتفتحله حساب لوحده من الصفقة، ومجموع الحسابات = رصيد العملاء.",
      run() { const C = APP_COA(), n = C.idx["عميل:" + cl()]; tree(); return `${n.code} ${n.name}: ${A.money(n.bal)} · إجمالي العملاء ${A.money(C.byCode["113"].bal)} (${C.byCode["113"].kids.length} حساب)`; } },
    { who: () => A.buyersOf(FD())[0], go: "deals", t: "السيلز بيطلب مطالبة", x: "العميل طلب مطالبة بالمبلغ. السيلز من الصفقة ← «اطلب مطالبة»: اسم الشركة وبيانات الوحدة والمبلغ متعبّيين وبيتعدّلوا (المبلغ مش شرط نفس العمولة)، والمطالبة باسم Places أو ذراين. بتروح لأحمد مهمة.",
      run() { const d = FD(); A.FORM.claimSave({ deal: d.id, company: d.company || d.client, unit: d.unit, unitInfo: (S().units.find((u) => u.code === d.unit) || {}).project || "", amount: String(d.commClient), side: "client", kind: "عمولة تأجير", entity: "places", note: "" }); ctx.claim = S().claims[0].id; return `${ctx.claim} · ${S().claims[0].company} · ${A.money(S().claims[0].amount)} · اتبعتت للمالية`; }, open: () => A.ACT.dealOpen({ id: ctx.fdeal }) },
    { who: "u18", go: "finance", t: "أحمد بيعتمد المطالبة", x: "من «مهامي النهارده» أو تاب «المطالبات» ← «اعتمد واعمل المطالبة»: بتطلع أوتوماتيك على القالب بلوجو الجهة وبيانات البنك والمبلغ بالحروف، والختم والإمضا وقت الطباعة. السيلز بيتبلّغ يبعتها للعميل.",
      run() { A.ui.fnTab = "claims"; A.ACT.claimIssue({ id: ctx.claim }); return `${ctx.claim} اتعملت من القالب`; }, keep: 1 },
    { who: () => A.buyersOf(FD())[0], go: "deals", t: "العميل اعتمد وطلب فاتورة إلكترونية", x: "السيلز بيعلّم «العميل اعتمد»، فأحمد بيجيله مهمة «ارفع الفاتورة الإلكترونية».",
      run() { A.ACT.claimApproved({ id: ctx.claim }); return "اتبلّغت المالية"; }, open: () => A.ACT.dealOpen({ id: ctx.fdeal }) },
    { who: "u18", go: "finance", t: "الفاتورة الإلكترونية على البورتال", x: "أحمد بيرفع الفاتورة على بورتال الفاتورة الإلكترونية ويكتب رقمها في المطالبة، فبتبقى «مستنية الدفع».",
      run() { A.ui.fnTab = "claims"; A.FORM.claimEinvSave({ id: ctx.claim, no: "EG-2026-001245", date: A.today() }); return "الفاتورة EG-2026-001245 اتسجّلت على المطالبة"; } },
    { who: "u18", go: "finance", t: "العميل دفع · إيصال استلام نقدية", x: "«اتحصّلت · اعمل الإيصال» بيفتح إذن توريد بمبلغ المطالبة على الصفقة. بعد الحفظ: الفلوس دخلت البنك، والقيد (من ح/ بنك CIB إلى ح/ العميل)، والـ TCR للسيلز، و«إيصال استلام نقدية» بيطلع من نفس البيانات.",
      run() { A.ui.fnTab = "claims"; const c = S().claims.find((x) => x.id === ctx.claim); A.FORM.mvSave({ kind: "receive", to: "بنك CIB", source: "عمولة من عميل", deal: ctx.fdeal, side: "client", amount: String(c.amount), note: `تحصيل ${c.id}`, date: A.today(), claim: c.id }); return `إيصال ${S().claims.find((x) => x.id === ctx.claim).receiptNo} · ${A.money(c.amount)}`; }, keep: 1 },
    { who: "u18", go: "finance", t: "الأثر على حساب العميل", x: "التحصيل عمل TCR للسيلز يمضوا عليها. وأول تحصيل بيدخّل العمولة في الإيرادات، والباقي بيفضل على حساب العميل لحد ما يتحصّل. البنك زاد بالمبلغ. ولما تدوس على حساب العميل بيظهرلك كشف حسابه.",
      run() { const C = APP_COA(), n = C.idx["عميل:" + cl()]; tree(); return `${n.code} ${n.name}: باقي ${A.money(n.bal)} · بنك CIB: ${A.money(C.idx["بنك CIB"].bal)}`; }, open: () => A.ACT.acctLedger({ k: "عميل:" + cl() }) },
    { who: "u18", go: "finance", t: "تحصيل الباقي من الـ Owner", x: "إذن توريد تاني على نفس الصفقة: جزء الـ Owner (30,000). كده الصفقة «اتحصّلت بالكامل»، وحساب العميل بقى صفر، وأحمد بيجيله إشعار إن عمولة السيلز بقت مستحقة.",
      run() { A.ui.fnTab = "cash"; A.FORM.mvSave({ kind: "receive", to: "بنك CIB", source: "عمولة من عميل", deal: ctx.fdeal, side: "owner", amount: String(A.placesComm(FD()) - A.collected(FD())), note: `عمولة ${cl()} · جزء الـ Owner`, date: A.today() }); return `${ctx.fdeal}: ${A.dealStatus(FD())} · حساب ${cl()} = ${A.money(APP_COA().idx["عميل:" + cl()].bal)}`; }, keep: 1 },
    { who: "u18", go: "finance", t: "السيلز ليه كام؟", x: "في «المرتبات» عمود «العمولة المستحقة» لكل سيلز = عمولة الصفقات اللي اتحصّلت بالكامل − اللي اتصرفله. ودوس على الرقم يطلعلك كشف العمولة صفقة صفقة (نسبته × نصيبه)، ونفس الرقم في الشجرة تحت «عمولة مبيعات مستحقة» (21103) في حساب السيلز.",
      run() { A.ui.fnTab = "payroll"; const sh = A.salesShares(FD()); ctx.emp = sh[0].sales; return sh.map((x) => `${A.person(x.sales)}: ${A.money(x.amount)} من الصفقة دي`).join(" · ") + ` · المستحق لـ ${A.person(ctx.emp)} كله ${A.money(APP_COA().idx["عمولة:" + ctx.emp].bal)}`; }, open: () => A.ACT.commStatement({ emp: ctx.emp }) },
    { who: "u18", go: "finance", t: "اصرف العمولة للسيلز", x: "«اصرف» بيعمل إذن «صرف عمولة سيلز»: بتختار الصفقة اللي بتصرف عمولتها (بيظهر العميل والوحدة ونصيبه) والـ TCR اللي هيمضي عليها، والمبلغ بالمستحق على الصفقة دي. القيد: من ح/ عمولة السيلز (21103) إلى ح/ الخزنة. حساب السيلز بيبقى صفر، والسيلز بيجيله إشعار.",
      run() { A.ui.fnTab = "payroll"; const due = APP_COA().idx["عمولة:" + ctx.emp].bal; const t = (FD().tcrs || []).slice(-1)[0], amt = A.salesComm(FD(), ctx.emp); A.FORM.mvSave({ kind: "commission", from: "خزينة رئيسية", party: ctx.emp, cdeal: ctx.fdeal, tcr: t ? t.code : "", amount: String(amt), note: `عمولة ${A.person(ctx.emp)} عن ${ctx.fdeal}`, date: A.today() }); return `اتصرف ${A.money(amt)} لـ ${A.person(ctx.emp)} عن ${ctx.fdeal}${t ? ` · TCR ${t.code}` : ""} · باقي في حسابه ${A.money(APP_COA().idx["عمولة:" + ctx.emp].bal)} (من صفقات تانية)`; }, keep: 1 },
    { who: "u18", go: "home", t: "فاتورة Property Finder ميعادها جه", x: "الفاتورة الثابتة (23,000 كل شهر يوم 1) مابتتصرفش لوحدها: بتظهر لأحمد مهمة في «مهامي النهارده» وكارت في الخزن، مستنية موافقته.",
      run() { const b = S().bills.find((x) => x.id === "BL-1"); return b.paid[A.today().slice(0, 7)] ? "اتصرفت قبل كده الشهر ده." : `${b.name} · ${A.money(b.amount)} · ميعادها يوم ${b.day} · لسه ماتصرفتش`; } },
    { who: "u18", go: "finance", t: "أحمد بيوافق ويصرف", x: "«وافق واصرف» بيفتح إذن صرف متعبّي (البند، المورد، الخزنة) والمبلغ بيتعدّل لو الفاتورة مختلفة. بعد الحفظ بيتعمل القيد والفاتورة بتتعلّم «اتصرفت الشهر ده».",
      run() { A.ui.fnTab = "bills"; A.FORM.mvSave({ kind: "pay", bill: "BL-1", date: A.today(), from: "بنك CIB", line: "اشتراكات منصات و برامج", party: "Property Finder", ref: "PF-INV-11", amount: "23000", note: "اشتراك Property Finder · نوفمبر" }); return "اتصرفت: من ح/ اشتراكات منصات و برامج إلى ح/ بنك CIB."; }, keep: 1 },
    { who: "u18", go: "finance", t: "المرتبات مرة واحدة", x: "يوم ميعاد المرتبات أحمد بيجيله مهمة «اصرف مرتبات نوفمبر». «اصرف المرتبات كلها»: كل موظف (المرتب − خصم الحضور − خصم السلفة اللي اختاره أحمد) في إذن «صرف مرتبات» واحد بقيده، وكل موظف بيتبلّغ بصافي مرتبه.",
      run() { A.ui.fnTab = "payroll"; A.FORM.payRun({ from: "بنك CIB", date: A.today() }); const r = S().payroll[A.today().slice(0, 7)]; return `اتصرفت ${A.money(r.total)} · ${r.rows.length} موظف · ${r.move}`; }, keep: 1 },
    { who: "u18", go: "finance", t: "قيد يومية يدوي", x: "المحاسب يقدر يعمل قيد بإيده من «القيود» ← «قيد يومية جديد»: يختار الحسابات من الشجرة، مدين ودائن، ومايتسجّلش غير لو متوازن. مثال: مصاريف بنكية 150 على بنك CIB.",
      run() { A.ui.fnTab = "journal"; const C = APP_COA(), line = C.leaves.find((n) => n.key === "اتصالات"), bank = C.idx["بنك CIB"];
        A.FORM.jeSave({ date: A.today(), note: "عمولة تحويل بنكي", lines: [{ code: line.code, dr: 150, cr: 0 }, { code: bank.code, dr: 0, cr: 150 }] }); return `اتسجّل القيد: من ح/ ${line.name} إلى ح/ بنك CIB.`; }, keep: 1 },
    { who: "u18", go: "finance", t: "قايمة الدخل · الشهر ده", x: "«الشهر ده» بيوري اللي حصل في نوفمبر بس: إيراد الصفقة، وعمولة السيلز والأوبريشن، والفاتورة، والقيد. و«من أول السنة» بيوري أرصدة الشجرة. أي رقم بتدوس عليه بيقولك جه منين.",
      run() { A.ui.fnTab = "pnl"; A.ui.pnlM = "month"; return "قايمة دخل نوفمبر."; } },
    { who: "u18", go: "finance", t: "الميزانية متوازنة", x: "كل اللي فات (التحصيل، الفاتورة، القيد اليدوي) اتسمّع في الشجرة، فالميزانية العمومية وقايمة الدخل اتحدّثوا لوحدهم.",
      run() { A.ui.fnTab = "bs"; const C = APP_COA(); return `الأصول ${A.money(C.byCode["1"].bal)} = الخصوم ${A.money(C.byCode["2"].bal)} + حقوق الملكية ${A.money(C.byCode["3"].bal)}`; } }
  ];
  const APP_COA = () => A.coa();
  /* «جرّب بإيدك»: a deal is closed and approved in the background, then you are Ahmed with the task waiting · each click is a new client */
  const TRY = [["م. كريم فؤاد", "Nile Bridge", "01015557711", 25000, 25000], ["أ. منى رشاد", "Delta Studio", "01126668822", 18000, 22000], ["م. وليد حامد", "Apex Pharma", "01237779933", 40000, 35000], ["أ. سلمى نبيل", "Blue Orbit", "01148880044", 15000, 15000]];
  A.ACT.demoDeal = () => {
    const st = S(), [name, company, phone, cO, cC] = TRY[((st.demoTry = (st.demoTry || 0) + 1) - 1) % TRY.length], tag = st.demoTry > TRY.length ? ` ${Math.ceil(st.demoTry / TRY.length)}` : "", nm = name + tag;
    try {
      A.signIn("s4", 1); A.FORM.leadNew({ name: nm, company, phones: phone.slice(0, -2) + String(st.demoTry).padStart(2, "0"), area: "التجمع الخامس", type: "Rent", space: "140", condition: "متشطب", budget: "150000", channel: "Facebook", campaign: "c1", sales: "s4", note: "صفقة للتجربة" });
      const l = S().leads[0], u = S().units.find((x) => A.availableAs(x, "Rent") && x.pdf === "confirmed" && x.agent && x.agent !== l.sales && !S().deals.some((d) => d.unit === x.code && d.status !== "Cancelled"));
      A.setStage(l, "Near to Close"); A.FORM.deal({ lead: l.id, unit: u.code, space: String(u.space), type: "Rent", commOwner: String(cO), commClient: String(cC) }, pick([]));
      const d = S().deals[0]; A.signIn("u21", 1); if ((d.sellers || []).length && !d.sellerApproved) A.ACT.sellerOk({ id: d.id });
      A.FORM.dealReview({ id: d.id, v: "ok", space: String(d.space), type: d.type, location: d.location, commOwner: String(d.commOwner), commClient: String(d.commClient) }, { querySelector: () => ({ selectedOptions: A.buyersOf(d).map((value) => ({ value })) }) });
      document.getElementById("demoPanel").hidden = true; A.closeModal(); A.signIn("u18", 1); location.hash = "home"; A.render();
      const C = A.coa(), acct = C.idx["عميل:" + d.client];
      A.openModal("جاهزة للتجربة · انت دلوقتي أحمد (المحاسب)", `<div class="pdf">${U.kv([["الصفقة", `<b class="mono">${d.id}</b> · ${esc(d.client)} (${esc(company)})`], ["الوحدة", esc(d.unit)], ["العمولة", `${A.money(d.commOwner)} من الـ Owner + ${A.money(d.commClient)} من الـ Client = <b>${A.money(A.placesComm(d))}</b>`], ["حساب العميل", acct ? `${acct.code} تحت «عملاء» (113)` : "هيتفتح مع أول تحصيل"]])}
        <h4 class="mini-h">جرّب بإيدك (الدورة كلها)</h4><ol class="steps">
          <li>في «مهامي النهارده» هتلاقي <b>«صفقة اتقفلت · حصّل عمولة ${d.id}»</b> والإشعار في الجرس. العميل اتفتحله حساب تحت «عملاء» (113).</li>
          <li><b>المطالبة:</b> من الصفقة (أو اعمل نفسك السيلز من «دخول سريع») ← «اطلب مطالبة» ← المالية ← «المطالبات» ← «اعتمد واعمل المطالبة» (بلوجو الجهة والمبلغ بالحروف).</li>
          <li>«العميل اعتمد» ← «اترفعت الفاتورة الإلكترونية» برقمها ← «اتحصّلت · اعمل الإيصال»: إذن توريد، وقيده (من ح/ البنك إلى ح/ العميل)، والـ TCR للسيلز، و«إيصال استلام نقدية».</li>
          <li>حصّل جزء الـ Owner (إذن توريد · عمولة من عميل) لحد ما الصفقة «اتحصّلت بالكامل» وحساب العميل يبقى صفر.</li>
          <li>هيجيلك إشعار إن عمولة السيلز بقت مستحقة. «المرتبات» ← دوس على العمولة (كشفه صفقة صفقة) ← «اصرف»: بتختار الصفقة والـ TCR اللي هيمضي عليها.</li>
          <li>«المرتبات» ← «اصرف المرتبات كلها»، و«الفواتير الثابتة» ← «وافق واصرف»، و«القيود» ← «قيد يومية جديد».</li>
          <li>«قايمة الدخل ← الشهر ده» و«الميزانية العمومية»: دوس على أي رقم تشوف وصل لكده إزاي.</li></ol></div>
        <div class="row end"><button class="btn" data-close="modal">${I("check")}يلا</button></div>`);
    } catch (e) { A.toast("ماقدرتش أجهّز الصفقة · جرّب «إعادة بيانات الديمو» الأول"); }
  };
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
