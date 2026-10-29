"""
The roadmap's single source: every task card lives here once, and is written to docs/roadmap.md and (with --issues)
to its GitHub issue. Edit a card here, run `python3 scripts/roadmap.py --issues`, commit.
"""
import json, subprocess, sys

REPO = "Ziad-Sameh-OJO/places-erp"
DEMO = "demo/design-2/js/modules/"

# (id, issue#, sprint, module, title, goal, sources, demo files, already there, steps, done-when)
T = [
  ("T-00", None, 1, "", "تصدير أحدث نسخة من ملف المتطلبات للريبو",
   "النسخة اللي في `docs/requirements/sources/requirements-export-v2.json` قديمة (25/10، فيها 8 موديولات بس). محتاجين النسخة الحالية بالـ 14 موديول وكل الإجابات.",
   ["places.reca-tech.com (محتاج تسجيل دخول)"], [], [],
   ["ادخل على places.reca-tech.com وصدّر الملف (Export JSON) من الموقع.",
    "حطه في `docs/requirements/requirements.json`، واعمل منه `requirements.md` مقروء: موديول ← سؤال ← إجابة.",
    "حدّث جدول `docs/requirements/README.md` لو اتغير حاجة."],
   ["`requirements.json` فيه M-01 … M-14", "`requirements.md` بيتقري من غير أدوات"]),

  ("T-01", 1, 1, "", "Redis والـ worker شغالين محلياً وفي الـ CI",
   "الجوبز (سحب الليد، والروتيشن، والتنبيهات) محتاجة Redis و `apps/worker` شغال. ده أساس T-06 و T-07.",
   ["ARCHITECTURE.md (الجوبز)"], [], ["`apps/worker/src/main.ts` بيسجّل الجوبز بتوقيت القاهرة", "`apps/worker/src/processors/lead-sla.ts` بداية جوب الـ SLA", "`apps/api/src/core/jobs/queues.ts` أسماء الـ queues"],
   ["Redis محلي: في `infra/docker/docker-compose.yml`، وزوّد بديل من غير Docker زي `pnpm db:local` (مثلاً `pnpm redis:local`).",
    "اعمل `apps/worker` يقوم بـ `pnpm --filter @places/worker dev` ويقرا `.env` زي الـ API.",
    "في الـ CI ضيف Redis كـ service، وخطوة تتأكد إن الـ worker بيقوم وبيسجّل الجوبز.",
    "حدّث README (أوامر التشغيل)."],
   ["`pnpm dev` بيشغّل الـ worker مع الـ API والواجهة", "الـ CI أخضر وفيه خطوة الـ worker"]),

  ("T-02", 2, 1, "", "بيئة staging ونشر تلقائي من main",
   "الكلاينت يجرّب كل sprint على لينك ثابت، وأي merge على `main` ينزل لوحده.",
   ["ARCHITECTURE.md §8 (البيئات)", "docs/adr/0002"], [], ["`infra/docker/Dockerfile.api` و `Dockerfile.web`"],
   ["VPS + Postgres managed + Redis + Cloudflare (الدومين و HTTPS).",
    "GitHub Environment اسمه `staging` فيه الأسرار (DATABASE_URL، و SESSION_SECRET، و SMTP_URL…). مفيش سر في الريبو.",
    "Workflow `deploy.yml`: بعد ما الـ CI ينجح على `main`، يعمل build للـ images، ويعمل `prisma migrate deploy`، وينشر.",
    "باك أب يومي للداتابيز، و Sentry للأخطاء.",
    "seed الحسابات الـ 36 بحالة INVITED (من غير `SEED_DEV_PASSWORD`)، وإيميلات التفعيل بتتبعت."],
   ["merge على main ← staging بيتحدّث لوحده", "الكلاينت يقدر يدخل ويفعّل حسابه من الإيميل"]),

  ("T-03", 8, 1, "M-01", "الليدز: القايمة والفلاتر والإضافة والمراحل",
   "قلب السيستم: كل ليد بيدخل يتسجّل ويتتابع لحد ما يبقى صفقة.",
   ["docs/requirements · M-01", "sources/answers-leads-telesales.md", "sources/answers-telesales-voice.md", "modules-draft.md (M-01)"],
   ["leads.js", "home.js"],
   ["`packages/domain/src/leads.ts`: المراحل الـ 13، و Qualified الـ sticky، و `leadSla()`", "`apps/api/src/modules/leads`: إضافة ليد مع منع تكرار الموبايل، وتغيير المرحلة، والقايمة", "`packages/contracts/src/leads.ts`"],
   ["كمّل الـ API: القايمة بنطاق البيانات (`ownedBy()`: السيلز بتاعه، والـ TL فريقه، والأوبريشن الكل)، والفلاتر، وتفاصيل الليد بالتاريخ والأنشطة (LeadActivity).",
    "الـ Telesales: تعمل ليد ويبقى عندها، ومايظهرلهاش بعد ما يروح لسيلز (الفويس).",
    "تست e2e: السيلز مايشوفش ليد غيره · الـ TL يشوف فريقه · منع التكرار · Qualified مايرجعش.",
    "الواجهة: `features/leads` + صفحة `/leads` + إضافتها في `lib/nav.ts`. الجدول، والفلاتر، والدروار، والـ stepper زي الديمو، وزرار «جديد».",
    "جرّب بحساب سيلز وحساب TL وحساب أوبريشن، على الديسكتوب والموبايل."],
   ["كل الشروط العامة"]),

  ("T-04", 9, 1, "M-01", "توزيع الليدز بالمناطق والتعيين باليد",
   "الليد بيروح أوتوماتيك للسيلز اللي بعده في منطقته، والأوبريشن تقدر تختار سيلز معيّن.",
   ["sources/answers-leads-telesales.md (1–3)", "docs/requirements · M-01"], ["leads.js (إعدادات التوزيع)"],
   ["`LeadRouter` في `packages/domain/src/leads.ts` ومتختبر: روتيشن لكل منطقة، والتعيين باليد بيستهلك الدور", "الـ state بيتحفظ في Setting (`routing` و `areaRouting`) من `leads.service.ts`"],
   ["شاشة «إعدادات التوزيع» (module `settings`): مين بيغطي أنهي منطقة، وترتيبهم.",
    "endpoint التعيين باليد (أوبريشن بس) ← `assignedByHand` + Audit + إشعار `lead.assigned`.",
    "تست e2e: 3 ليدز في نفس المنطقة بيلفّوا بالترتيب · التعيين باليد بيخطّي الدور."],
   ["كل الشروط العامة"]),

  ("T-05", 16, 1, "M-03", "الوحدات: القايمة والإضافة والصور والحالة + قفل الوحدة",
   "مخزون الوحدات بكل بياناتها، والسيلز بيختار منه للعميل.",
   ["sources/inventory-unit-fields.md (كل حقل: مين بيدخله، إجباري؟، نوعه)", "modules-draft.md (M-03)", "images/handwritten-leads-inventory.jpg"],
   ["inventory.js", "invwork.js"], ["جدول `Unit` في `packages/db/prisma/schema.prisma` (schema `inventory`)"],
   ["القاعدة: إجمالي السعر، وكود الوحدة التسلسلي (U-101 من sequence).",
    "الـ API: CRUD بالصلاحيات (التعديل لمنار ورندا بس)، والصور برفع pre-signed، و PDF الوحدة بـ Playwright (ADR-0005).",
    "**`UnitsService.lock(unitId, dealId)` و `release()`**: الصفقة (T-12) هتستخدمهم، فلازم يخلصوا هنا.",
    "`UnitsService.search()` للوحدات المرشّحة في الليد.",
    "الواجهة: القايمة والكروت والفلاتر وفورم الوحدة زي الديمو."],
   ["كل الشروط العامة", "`lock/release` عليهم تست e2e"]),

  ("T-06", 3, 1, "M-01", "جوب الـ SLA: تنبيه الـ TL بعد 2.5 ساعة وسحب الليد بعد 3",
   "الليد اللي محدش لمسه بيتسحب أوتوماتيك ويروح للسيلز اللي بعده.",
   ["sources/answers-leads-telesales.md", "docs/requirements · M-01 (2.4)"], ["leads.js (تنبيهات الـ SLA)"],
   ["`leadSla()` في الـ domain (ساعات الشغل 11–19، والجمعة إجازة، والإجازات الرسمية 22/24 ساعة) ومتختبر", "`apps/worker/src/processors/lead-sla.ts` بداية", "الإعدادات `slaRules` والإجازات من M-13"],
   ["محتاج T-01 (Redis والـ worker).",
    "الجوب كل دقيقة: الليدز Fresh اللي ماتلمستش ← `warn` يبعت `lead.sla_warn` للـ TL ← `pull` ينقلها بـ `LeadRouter` ويبعت `lead.pulled` للأوبريشن ومدير المبيعات.",
    "optimistic update (`where: {id, assignedToId}`) عشان مايحصلش سحب مرتين، و Audit.",
    "⚠️ سؤال مفتوح للكلاينت: مثال 10:00 ← 12:30، والشغل بيبدأ 11:00 (label `needs-client`)."],
   ["تست بوقت متحكم فيه: 2.5 ساعة شغل ← تنبيه · 3 ← سحب · يوم إجازة ← 22/24 ساعة"]),

  ("T-07", 4, 2, "M-01", "روتيشن الـ No Answer كل يوم + تنبيه كل 4 ساعات",
   "الليد اللي في No Answer مايفضلش عند نفس السيلز.",
   ["sources/answers-telesales-voice.md", "sources/answers-leads-telesales.md"], ["leads.js"], ["`LeadRouter`"],
   ["جوب يومي (أول يوم شغل): كل ليد No Answer بقاله يوم عند سيلز ← للي بعده في المنطقة + LeadActivity.",
    "جوب كل 4 ساعات شغل: `lead.no_answer` لصاحب الليد."],
   ["تست بالأيام والإجازات"]),

  ("T-08", 10, 2, "M-01", "الرفع الجماعي من الـ Telesales وموافقة الأوبريشن + الشركات",
   "الـ Telesales بترفع شيت أرقام، والأوبريشن توافق، والسيستم يوزّع بالتساوي.",
   ["sources/answers-leads-telesales.md", "docs/requirements · M-01"], ["leads.js (الرفع الجماعي · الشركات)"],
   ["`distributeEvenly()` في الـ domain"],
   ["رفع Excel/CSV (ExcelJS) ← معاينة ← منع المكرر ← طلب موافقة.",
    "الأوبريشن توافق ← توزيع بالتساوي على سيلز النهارده + إشعارات.",
    "شاشة الشركات الخاصة بالـ Telesales (الكاتيجوريز من الإعدادات)."],
   ["كل الشروط العامة"]),

  ("T-09", 11, 2, "M-10", "العملاء والملاك",
   "ملف واحد لكل عميل أو مالك فيه كل حاجة عنه.",
   ["docs/requirements · M-10"], ["clients.js"], [],
   ["ملف العميل: الأرقام، والوحدات، والصفقات، والعقود، وسجل التواصل.",
    "دمج المكررين بالموبايل (Audit قبل وبعد)."],
   ["كل الشروط العامة"]),

  ("T-10", 17, 2, "M-03", "شيتات الـ Not Active",
   "الشيتات اللي بتيجي من بره بتتراجع وتتحول لوحدات من غير تكرار.",
   ["docs/requirements · M-03", "modules-draft.md (M-03)"], ["notactive.js"], ["جداول `NotActiveSheet` و `NotActiveRow` (unique sheet+key)"],
   ["رفع الشيت ← صفوف ← مراجعة سارة ومروة ← تحويل لوحدة (`UnitsService`).",
    "منع التكرار من الداتابيز (`@@unique`)، مش من الكود.",
    "⚠️ خانات الشيت (CFC) سؤال مفتوح."],
   ["كل الشروط العامة"]),

  ("T-11", 18, 2, "M-04", "المهام (Tasks)",
   "مهام بين الأقسام (تصوير، وتصميم، وواتساب) بحالتها.",
   ["images/handwritten-marketing-rahma.jpg", "modules-draft.md (M-04)"], ["tasks.js"], ["جدول `Task`"],
   ["CRUD + الحالة + المسؤول + الميعاد، و Kanban زي الديمو.", "إشعار للمسؤول لما المهمة تتعمله."],
   ["كل الشروط العامة"]),

  ("T-12", 12, 3, "M-02", "الصفقات والتحصيل والكوميشن",
   "من الـ Done Deal لحد ما الفلوس تتحصّل، والكوميشن يتحسب صح.",
   ["docs/requirements · M-02", "sources/answers-transactions-voice.md (فويسات 27/10)"], ["deals.js"],
   ["`packages/domain/src/commission.ts`: `splitDeal` (نص للبائع ونص للمشتري)، و `collectionStatus`، و `transactionsOf`، و `targetAchieved` ومتختبرين", "`team-leader.ts`"],
   ["الفلو: Done Deal ← مراجعة الـ Office Manager (Alarm لو اتعملت واتقفلت تاني يوم) ← Approved ← تحصيل جزئي/كامل.",
    "الـ Seller بيتحسب بعد موافقة منار. والصفقة بتقفل الوحدة بـ `UnitsService.lock` (T-05).",
    "الفلوس: integer piasters في الـ domain، و Decimal في الداتابيز (ADR-0003). كل مبلغ Audit.",
    "تست e2e بمثال الكلاينت: 100,000 ← 25,000 لكل مشتري و50,000 للبائع بسكيم 30%."],
   ["كل الشروط العامة"]),

  ("T-13", 19, 3, "M-05", "الـ HR: الحضور والإجازات والـ Excuse والجزاءات",
   "الحضور والخصومات أوتوماتيك بالقواعد، والإجازات بأرصدتها.",
   ["docs/requirements · M-05", "modules-draft.md (M-05)", "images/ideal-employee.jpg", "sources/answers-kpis.md (الـ 1-to-1)"],
   ["hr.js"], ["`packages/domain/src/attendance.ts`: الشرايح، والـ Excuse (1–2 مجاناً، 3–4 نص يوم، الخامس رفد + تنبيه)، و `dayRate`", "`ideal-employee.ts`", "جداول `AttendanceDay` و `LeaveRequest` و `Penalty` و `OneOnOne`"],
   ["تسجيل الحضور اليومي، والـ Weekly Delay، والخصم.",
    "الإجازات: طلب ← موافقة الـ TL/الـ HR ← الرصيد (أنواعها من الإعدادات).",
    "الجزاءات، والـ 1-to-1 الشهري، وبيانات المرتب والتارجت (الـ KPIs بتقراها في T-23).",
    "إشعار `hr.excuse` في الخامس."],
   ["كل الشروط العامة"]),

  ("T-14", 5, 3, "M-07", "المالية: الحسابات والمصروفات والـ Budget والسلف والخزن",
   "فلوس الشركة كلها في مكان واحد.",
   ["docs/requirements · M-07", "sources/answers-finance-dashboard.md (الخزن والبنوك والسلف على الداشبورد)"], ["finance.js"],
   ["جداول `Account` و `BudgetLine` و `Purchase` في schema `finance`", "`money.ts` (`allocate`، و `formatEGP`)"],
   ["شجرة الحسابات، والمصروفات على البنود، والـ Budget لكل بند، والسلف والعهد، والـ Petty cash.",
    "داشبورد: رصيد كل خزنة وبنك، وسلف الموظفين.",
    "`FinanceService.recordExpense()`: المشتريات (T-22) هتستخدمها."],
   ["كل الشروط العامة"]),

  ("T-15", 13, 4, "M-02", "الـ TCR والتوقيعات والـ PDF",
   "ورقة الـ TCR الرسمية لكل صفقة بالتوقيعات.",
   ["docs/requirements · M-02"], ["deals.js (TCR)"], [],
   ["رقم TCR تسلسلي (sequence)، والتوقيعات بالترتيب (`TcrSignature`).", "PDF بالعربي بـ Playwright (ADR-0005)."],
   ["كل الشروط العامة"]),

  ("T-16", 14, 4, "M-11", "العقود والأقساط وتنبيهات التجديد",
   "كل عقد بجدول أقساطه، والتجديد مايتنسيش.",
   ["docs/requirements · M-11"], ["deals.js", "clients.js (العقود)"], ["جداول `Contract` و `Installment`"],
   ["العقد ← جدول الأقساط.", "جوب يومي: تنبيه التجديد قبلها بـ 90 و60 و30 يوم (`contract.renewal`)."],
   ["كل الشروط العامة"]),

  ("T-17", 20, 4, "M-05", "جهاز البصمة",
   "الحضور ييجي من البصمة بدل ما يتكتب.",
   ["docs/requirements · M-05", "apps/fingerprint-agent/README.md"], ["hr.js (سحب البصمة)"], [],
   ["⚠️ نوع الجهاز سؤال مفتوح (`needs-client`). ابدأ برفع شيت البصمة (Excel).", "بعدين الـ agent اللي جنب الجهاز يرفع البصمات للـ API بتوكن خاص."],
   ["كل الشروط العامة"]),

  ("T-18", 21, 4, "M-06", "التذاكر",
   "طلبات بين الأقسام ليها SLA وتصعيد.",
   ["docs/requirements · M-06"], ["tickets.js"], ["جداول `Ticket` و `TicketEvent`"],
   ["تذكرة ← المسؤول ← الحالة ← التعليقات.", "الـ SLA لكل نوع، وتصعيد لما يعدّي (جوب)."],
   ["كل الشروط العامة"]),

  ("T-19", 22, 4, "M-04", "التسويق: الحملات والبوستات والبرودكاست",
   "الحملات ونتايجها، والـ Content plan.",
   ["images/handwritten-marketing-rahma.jpg", "docs/requirements · M-04"], ["marketing.js"], ["جدول `Campaign`"],
   ["الحملات، ونسبة الـ Qualified لكل حملة (من الليدز: `campaignId` و `qualified`).",
    "البوستات المتجدولة وتنبيه البوست (`marketing.post_reminder`).",
    "البرودكاست بالحد اليومي من الإعدادات (`whatsappDailyLimit`)."],
   ["كل الشروط العامة"]),

  ("T-20", 6, 4, "M-07", "المالية: تقفيل الشهر والتقارير والتصدير",
   "تقرير شهري للمصروف مقابل الـ Budget.",
   ["docs/requirements · M-07"], ["finance.js"], [],
   ["تقفيل الشهر (ممنوع التعديل بعده إلا بصلاحية).", "المصروف مقابل الـ Budget، وتصدير Excel/PDF."],
   ["كل الشروط العامة"]),

  ("T-21", 15, 5, "M-11", "تحصيل الأقساط والمتأخرات",
   "كل قسط اتدفع ولا لأ، ومين متأخر.",
   ["docs/requirements · M-11"], ["deals.js (الأقساط)"], [],
   ["تسجيل الدفعات، والمتأخرات (aging)، وتقرير التحصيل."], ["كل الشروط العامة"]),

  ("T-22", 23, 5, "M-08", "المشتريات وحدود الموافقة",
   "طلب الشراء بيمشي بالموافقات ويتسجل مصروف.",
   ["docs/requirements · M-08", "apps/api/src/modules/procurement/README.md (حدود الموافقة)"], ["procurement.js"], [],
   ["طلب ← موافقة حسب المبلغ (الـ Approver) ← شراء ← `FinanceService.recordExpense()` (T-14).", "إشعار `procurement.request`."],
   ["كل الشروط العامة"]),

  ("T-23", 7, 5, "M-12", "التقارير والـ KPIs",
   "كارت KPIs لكل شخص كل ربع، والفلوس اللي بتترتب عليه، وصفحة فيها كل التفاصيل والتحكم للمالك والمدير.",
   ["sources/kpis-q4-2026.md", "sources/answers-kpis.md", "images/sales-kpi-card.png", "images/team-leaders-and-teams.png", "images/ideal-employee.jpg"],
   ["kpis.js", "home.js"],
   ["`packages/domain/src/kpi.ts`: `achievement` و `cardScore` و الشرايح و `payoutDelta` ومتختبرين", "`ideal-employee.ts` و `team-leader.ts`", "جداول `KpiCard` و `KpiItem` و `KpiBands`"],
   ["الكروت لكل شخص من ملف الـ KPIs، والبنود بتتحسب أوتوماتيك من الموديولات (الصفقات، والحضور، والمهام…) أو بتتسجل يدوي.",
    "الشرايح والفلوس (المرتب أو البونص، شهري أو ربع سنوي)، والموظف المثالي وصندوق الفريق.",
    "جوب تحديث الأرقام، وقفل الربع، والورقة الربع سنوية لكل موظف (PDF)."],
   ["كل الشروط العامة", "الأرقام مطابقة لأمثلة الكلاينت"]),

  ("T-24", None, 6, "", "تجربة الكلاينت على staging (UAT)",
   "الكلاينت يجرّب السيستم كله قبل التسليم.",
   ["كل الركوايرمنتس"], ["demo/ (الجولة السريعة فيها كل الفيتشرز)"], [],
   ["سيناريو تجربة لكل موديول (من جولة الديمو).", "كل ملاحظة تبقى issue (bug أو feature) في الـ milestone ده.", "تدريب سريع لكل قسم."],
   ["الكلاينت وافق كتابةً على كل موديول"]),
]

METHOD = """## الطريقة (اللي اشتغلنا بيها في M-09 و M-13 و M-14)

أي تاسك بيمشي بالخطوات دي بالترتيب:

1. **اقرا قبل الكود:**
   - جزء الموديول في `docs/requirements/` والمصادر المذكورة في الكارت،
   - ملف الديمو (`demo/design-2/js/modules/…`)، وافتح `demo/index.html` وجرّبه بنفسك،
   - أي سؤال مفتوح يتكتب في الـ issue بـ label `needs-client`. مفيش تخمين لقاعدة بيزنس.
2. **القاعدة الأول:** في `packages/domain/src/` كدالة pure، وتستها في `packages/domain/test/` بنفس أرقام وأمثلة الركوايرمنتس:
   `pnpm --filter @places/domain test`
3. **الداتابيز (لو محتاج):** عدّل `packages/db/prisma/schema.prisma`، واعمل migration واحدة:
   `pnpm --filter @places/db migrate:dev --name <اسم>`
   ولو فيه قوايم ثابتة، ضيفها للـ seed.
4. **الـ contracts:** schemas بـ Zod في `packages/contracts/src/<module>.ts`. هي نفسها بتتحقق من الطلب في السيرفر، وبتدّي الأنواع للفورمز.
5. **الـ API:** موديول في `apps/api/src/modules/<module>/` بنفس شكل `modules/access`:
   - controller ← service ← repository،
   - `@Requires(module, action)` على كل endpoint،
   - Audit في نفس الـ transaction،
   - `NotificationsService.notify()` للإشعارات،
   - سجّل الموديول في `app.module.ts`.
6. **تست e2e:** في `apps/api/test/<module>.e2e.test.ts`، بحساب مسموح وحساب ممنوع، والفلو كامل:
   `pnpm --filter @places/api test:e2e`
7. **الواجهة:**
   - `apps/web/src/features/<module>/`، وصفحة في `app/(app)/<module>/page.tsx`، وسطر في `lib/nav.ts`،
   - نفس الديمو (design-2)، والكومبوننتس من `components/ui.tsx` (Card، و Table، و Modal، و Tabs، و Field…).
8. **جرّب بالمتصفح:** بحسابين على الأقل (مسموح وممنوع)، على الديسكتوب والموبايل 375px.
9. **سلّم:**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @places/api test:e2e
   ```
   بعدين PR بـ `Closes #<رقم>`، ثم CI أخضر، ثم مراجعة، ثم Squash merge.

### الشروط العامة لأي تاسك (Definition of Done)
- [ ] القاعدة في `packages/domain` ومعاها تست بأمثلة الركوايرمنتس
- [ ] كل endpoint عليه `@Requires`، ومتجرب بحساب مسموح وحساب ممنوع (e2e)
- [ ] Audit Log لكل إضافة وتعديل ومسح ومبلغ
- [ ] الشاشة زي الديمو (design-2) على الديسكتوب والموبايل
- [ ] `pnpm lint && pnpm typecheck && pnpm test` و الـ e2e خضر، والـ CI أخضر
"""

SPRINTS = {1: "Sprint 1 · لحد 12/11", 2: "Sprint 2 · لحد 26/11", 3: "Sprint 3 · لحد 10/12", 4: "Sprint 4 · لحد 24/12", 5: "Sprint 5 · لحد 7/1", 6: "UAT · لحد 21/1"}
MILESTONE = {1: "Sprint 1", 2: "Sprint 2", 3: "Sprint 3", 4: "Sprint 4", 5: "Sprint 5", 6: "UAT"}

def card(t, for_issue=False):
    tid, num, sprint, mod, title, goal, src, demo, have, steps, done = t
    out = [] if for_issue else [f"### {tid} · {(mod + ' · ') if mod else ''}{title}" + (f" (#{num})" if num else ""), ""]
    out += [f"**الهدف:** {goal}", ""]
    if src: out += ["**اقرا:** " + " · ".join(f"`{s}`" if "/" in s or s.endswith(".md") else s for s in src), ""]
    if demo: out += ["**الديمو:** " + " · ".join(f"`{DEMO}{d}`" if d.endswith(".js") or ".js " in d else d for d in demo), ""]
    if have: out += ["**موجود بالفعل:**"] + [f"- {h}" for h in have] + [""]
    out += ["**الخطوات:**"] + [f"{i}. {s}" for i, s in enumerate(steps, 1)] + [""]
    out += ["**يخلص لما:**"] + [f"- [ ] {d}" for d in done] + [""]
    if for_issue:
        out += ["---", "الطريقة خطوة بخطوة والشروط العامة: [docs/roadmap.md](../blob/main/docs/roadmap.md)"]
    return "\n".join(out)

def roadmap():
    lines = ["# خطة الشغل خطوة بخطوة", "",
      "كل تاسك هنا **كارت كامل لوحده**: الهدف، وتقرا إيه، والموجود بالفعل، والخطوات، وإمتى يخلص. ابعت الكارت (أو الـ issue بتاعه على GitHub) لأي حد، وهو يمشي عليه من غير ما يسأل.", "",
      "> الملف ده بيتولّد من `scripts/roadmap.py`. عدّل الكارت هناك، وبعدين شغّل `python3 scripts/roadmap.py --issues`.", "",
      "## اللي خلص", "",
      "| | إيه | فين |", "|---|---|---|",
      "| ✅ الأساس | monorepo، وقواعد البيزنس ومعاها تستات، والـ schema، والـ CI بـ Postgres وتستات e2e | `ARCHITECTURE.md` |",
      "| ✅ المرحلة 0 | تشغيل، و Postgres محلي، و migrations، و seed بالـ 36 شخص الحقيقيين والـ 18 دور | `README.md` |",
      "| ✅ M-09 | الحسابات، والتفعيل، والـ OTP، ونسيت الباسورد، والأدوار، والمصفوفة، والاستثناءات، والـ Audit Log | `modules/access` · `features/access` |",
      "| ✅ M-13 | القوايم، وقواعد الـ SLA، والإجازات الرسمية، ومراحل الليد | `modules/settings` · `features/settings` |",
      "| ✅ M-14 | قواعد الإشعارات، والجرس، والإيميل، والتفضيلات | `core/notifications` · `features/notifications` |",
      "| ✅ التصميم | design-2 على الديسكتوب والموبايل | `packages/ui` · `components/` |", "",
      METHOD, "", "## الترتيب", "",
      "| Sprint | التاسكات |", "|---|---|"]
    for s in SPRINTS:
        lines.append(f"| {SPRINTS[s]} | " + " · ".join(f"{t[0]} {t[3] or ''}".strip() for t in T if t[2] == s) + " |")
    lines += ["", "**اللي لازم يخلص قبل غيره:**",
      "- T-01 قبل T-06 و T-07 (الجوبز محتاجة Redis والـ worker).",
      "- T-05 (`UnitsService.lock`) قبل T-12 (الصفقة بتقفل الوحدة).",
      "- T-14 (`FinanceService.recordExpense`) قبل T-22 (المشتريات).",
      "- T-12 و T-13 قبل T-23 (الـ KPIs بتقرا من الصفقات والحضور).",
      "- أي موديول يستخدم موديول تاني من الـ **service** بتاعه بس، مش من الـ repository.", ""]
    for s in SPRINTS:
        lines += [f"## {SPRINTS[s]}", ""]
        for t in T:
            if t[2] == s: lines += [card(t), ""]
    return "\n".join(lines)

if __name__ == "__main__":
    open("docs/roadmap.md", "w").write(roadmap())
    print("docs/roadmap.md written")
    if "--issues" in sys.argv:
        for t in T:
            tid, num, sprint, mod, title = t[:5]
            full = f"{tid} · {(mod + ' · ') if mod else ''}{title}"
            labels = ["feature" if mod else "chore"] + ([mod] if mod else [])
            body = card(t, for_issue=True)
            if num:
                subprocess.run(["gh", "issue", "edit", str(num), "--repo", REPO, "--title", full, "--body", body, "--milestone", MILESTONE[sprint]], check=True, capture_output=True)
                print("updated", num, tid)
            else:
                existing = subprocess.run(["gh", "issue", "list", "--repo", REPO, "--state", "all", "--search", f"{tid} in:title", "--json", "number", "--jq", ".[0].number"], capture_output=True, text=True).stdout.strip()
                if existing:
                    subprocess.run(["gh", "issue", "edit", existing, "--repo", REPO, "--title", full, "--body", body], check=True, capture_output=True); print("updated", existing, tid)
                else:
                    args = ["gh", "issue", "create", "--repo", REPO, "--title", full, "--body", body, "--milestone", MILESTONE[sprint]]
                    for l in labels: args += ["--label", l]
                    print(subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip(), tid)
