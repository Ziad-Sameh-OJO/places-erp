# خطة الشغل خطوة بخطوة

كل تاسك هنا **كارت كامل لوحده**: الهدف، وتقرا إيه، والموجود بالفعل، والخطوات، وإمتى يخلص. ابعت الكارت (أو الـ issue بتاعه على GitHub) لأي حد، وهو يمشي عليه من غير ما يسأل.

> الملف ده بيتولّد من `scripts/roadmap.py`. عدّل الكارت هناك، وبعدين شغّل `python3 scripts/roadmap.py --issues`.

## اللي خلص

| | إيه | فين |
|---|---|---|
| ✅ الأساس | monorepo، وقواعد البيزنس ومعاها تستات، والـ schema، والـ CI بـ Postgres وتستات e2e | `ARCHITECTURE.md` |
| ✅ المرحلة 0 | تشغيل، و Postgres محلي، و migrations، و seed بالـ 36 شخص الحقيقيين والـ 18 دور | `README.md` |
| ✅ M-09 | الحسابات، والتفعيل، والـ OTP، ونسيت الباسورد، والأدوار، والمصفوفة، والاستثناءات، والـ Audit Log | `modules/access` · `features/access` |
| ✅ M-13 | القوايم، وقواعد الـ SLA، والإجازات الرسمية، ومراحل الليد | `modules/settings` · `features/settings` |
| ✅ M-14 | قواعد الإشعارات، والجرس، والإيميل، والتفضيلات | `core/notifications` · `features/notifications` |
| ✅ التصميم | design-2 على الديسكتوب والموبايل | `packages/ui` · `components/` |

## الطريقة (اللي اشتغلنا بيها في M-09 و M-13 و M-14)

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


## الترتيب

| Sprint | التاسكات |
|---|---|
| Sprint 1 · لحد 12/11 | T-00 · T-01 · T-02 · T-03 M-01 · T-04 M-01 · T-05 M-03 · T-06 M-01 |
| Sprint 2 · لحد 26/11 | T-07 M-01 · T-08 M-01 · T-09 M-10 · T-10 M-03 · T-11 M-04 |
| Sprint 3 · لحد 10/12 | T-12 M-02 · T-13 M-05 · T-14 M-07 |
| Sprint 4 · لحد 24/12 | T-15 M-02 · T-16 M-11 · T-17 M-05 · T-18 M-06 · T-19 M-04 · T-20 M-07 |
| Sprint 5 · لحد 7/1 | T-21 M-11 · T-22 M-08 · T-23 M-12 |
| UAT · لحد 21/1 | T-24 |

**اللي لازم يخلص قبل غيره:**
- T-01 قبل T-06 و T-07 (الجوبز محتاجة Redis والـ worker).
- T-05 (`UnitsService.lock`) قبل T-12 (الصفقة بتقفل الوحدة).
- T-14 (`FinanceService.recordExpense`) قبل T-22 (المشتريات).
- T-12 و T-13 قبل T-23 (الـ KPIs بتقرا من الصفقات والحضور).
- أي موديول يستخدم موديول تاني من الـ **service** بتاعه بس، مش من الـ repository.

## Sprint 1 · لحد 12/11

### T-00 · تصدير أحدث نسخة من ملف المتطلبات للريبو

**الهدف:** النسخة اللي في `docs/requirements/sources/requirements-export-v2.json` قديمة (25/10، فيها 8 موديولات بس). محتاجين النسخة الحالية بالـ 14 موديول وكل الإجابات.

**اقرا:** places.reca-tech.com (محتاج تسجيل دخول)

**الخطوات:**
1. ادخل على places.reca-tech.com وصدّر الملف (Export JSON) من الموقع.
2. حطه في `docs/requirements/requirements.json`، واعمل منه `requirements.md` مقروء: موديول ← سؤال ← إجابة.
3. حدّث جدول `docs/requirements/README.md` لو اتغير حاجة.

**يخلص لما:**
- [ ] `requirements.json` فيه M-01 … M-14
- [ ] `requirements.md` بيتقري من غير أدوات


### T-01 · Redis والـ worker شغالين محلياً وفي الـ CI (#1)

**الهدف:** الجوبز (سحب الليد، والروتيشن، والتنبيهات) محتاجة Redis و `apps/worker` شغال. ده أساس T-06 و T-07.

**اقرا:** ARCHITECTURE.md (الجوبز)

**موجود بالفعل:**
- `apps/worker/src/main.ts` بيسجّل الجوبز بتوقيت القاهرة
- `apps/worker/src/processors/lead-sla.ts` بداية جوب الـ SLA
- `apps/api/src/core/jobs/queues.ts` أسماء الـ queues

**الخطوات:**
1. Redis محلي: في `infra/docker/docker-compose.yml`، وزوّد بديل من غير Docker زي `pnpm db:local` (مثلاً `pnpm redis:local`).
2. اعمل `apps/worker` يقوم بـ `pnpm --filter @places/worker dev` ويقرا `.env` زي الـ API.
3. في الـ CI ضيف Redis كـ service، وخطوة تتأكد إن الـ worker بيقوم وبيسجّل الجوبز.
4. حدّث README (أوامر التشغيل).

**يخلص لما:**
- [ ] `pnpm dev` بيشغّل الـ worker مع الـ API والواجهة
- [ ] الـ CI أخضر وفيه خطوة الـ worker


### T-02 · بيئة staging ونشر تلقائي من main (#2)

**الهدف:** الكلاينت يجرّب كل sprint على لينك ثابت، وأي merge على `main` ينزل لوحده.

**اقرا:** ARCHITECTURE.md §8 (البيئات) · `docs/adr/0002`

**موجود بالفعل:**
- `infra/docker/Dockerfile.api` و `Dockerfile.web`

**الخطوات:**
1. VPS + Postgres managed + Redis + Cloudflare (الدومين و HTTPS).
2. GitHub Environment اسمه `staging` فيه الأسرار (DATABASE_URL، و SESSION_SECRET، و SMTP_URL…). مفيش سر في الريبو.
3. Workflow `deploy.yml`: بعد ما الـ CI ينجح على `main`، يعمل build للـ images، ويعمل `prisma migrate deploy`، وينشر.
4. باك أب يومي للداتابيز، و Sentry للأخطاء.
5. seed الحسابات الـ 36 بحالة INVITED (من غير `SEED_DEV_PASSWORD`)، وإيميلات التفعيل بتتبعت.

**يخلص لما:**
- [ ] merge على main ← staging بيتحدّث لوحده
- [ ] الكلاينت يقدر يدخل ويفعّل حسابه من الإيميل


### T-03 · M-01 · الليدز: القايمة والفلاتر والإضافة والمراحل (#8)

**الهدف:** قلب السيستم: كل ليد بيدخل يتسجّل ويتتابع لحد ما يبقى صفقة.

**اقرا:** `docs/requirements · M-01` · `sources/answers-leads-telesales.md` · `sources/answers-telesales-voice.md` · modules-draft.md (M-01)

**الديمو:** `demo/design-2/js/modules/leads.js` · `demo/design-2/js/modules/home.js`

**موجود بالفعل:**
- `packages/domain/src/leads.ts`: المراحل الـ 13، و Qualified الـ sticky، و `leadSla()`
- `apps/api/src/modules/leads`: إضافة ليد مع منع تكرار الموبايل، وتغيير المرحلة، والقايمة
- `packages/contracts/src/leads.ts`

**الخطوات:**
1. كمّل الـ API: القايمة بنطاق البيانات (`ownedBy()`: السيلز بتاعه، والـ TL فريقه، والأوبريشن الكل)، والفلاتر، وتفاصيل الليد بالتاريخ والأنشطة (LeadActivity).
2. الـ Telesales: تعمل ليد ويبقى عندها، ومايظهرلهاش بعد ما يروح لسيلز (الفويس).
3. تست e2e: السيلز مايشوفش ليد غيره · الـ TL يشوف فريقه · منع التكرار · Qualified مايرجعش.
4. الواجهة: `features/leads` + صفحة `/leads` + إضافتها في `lib/nav.ts`. الجدول، والفلاتر، والدروار، والـ stepper زي الديمو، وزرار «جديد».
5. جرّب بحساب سيلز وحساب TL وحساب أوبريشن، على الديسكتوب والموبايل.

**يخلص لما:**
- [ ] كل الشروط العامة


### T-04 · M-01 · توزيع الليدز بالمناطق والتعيين باليد (#9)

**الهدف:** الليد بيروح أوتوماتيك للسيلز اللي بعده في منطقته، والأوبريشن تقدر تختار سيلز معيّن.

**اقرا:** `sources/answers-leads-telesales.md (1–3)` · `docs/requirements · M-01`

**الديمو:** `demo/design-2/js/modules/leads.js (إعدادات التوزيع)`

**موجود بالفعل:**
- `LeadRouter` في `packages/domain/src/leads.ts` ومتختبر: روتيشن لكل منطقة، والتعيين باليد بيستهلك الدور
- الـ state بيتحفظ في Setting (`routing` و `areaRouting`) من `leads.service.ts`

**الخطوات:**
1. شاشة «إعدادات التوزيع» (module `settings`): مين بيغطي أنهي منطقة، وترتيبهم.
2. endpoint التعيين باليد (أوبريشن بس) ← `assignedByHand` + Audit + إشعار `lead.assigned`.
3. تست e2e: 3 ليدز في نفس المنطقة بيلفّوا بالترتيب · التعيين باليد بيخطّي الدور.

**يخلص لما:**
- [ ] كل الشروط العامة


### T-05 · M-03 · الوحدات: القايمة والإضافة والصور والحالة + قفل الوحدة (#16)

**الهدف:** مخزون الوحدات بكل بياناتها، والسيلز بيختار منه للعميل.

**اقرا:** `sources/inventory-unit-fields.md (كل حقل: مين بيدخله، إجباري؟، نوعه)` · modules-draft.md (M-03) · `images/handwritten-leads-inventory.jpg`

**الديمو:** `demo/design-2/js/modules/inventory.js` · `demo/design-2/js/modules/invwork.js`

**موجود بالفعل:**
- جدول `Unit` في `packages/db/prisma/schema.prisma` (schema `inventory`)

**الخطوات:**
1. القاعدة: إجمالي السعر، وكود الوحدة التسلسلي (U-101 من sequence).
2. الـ API: CRUD بالصلاحيات (التعديل لمنار ورندا بس)، والصور برفع pre-signed، و PDF الوحدة بـ Playwright (ADR-0005).
3. **`UnitsService.lock(unitId, dealId)` و `release()`**: الصفقة (T-12) هتستخدمهم، فلازم يخلصوا هنا.
4. `UnitsService.search()` للوحدات المرشّحة في الليد.
5. الواجهة: القايمة والكروت والفلاتر وفورم الوحدة زي الديمو.

**يخلص لما:**
- [ ] كل الشروط العامة
- [ ] `lock/release` عليهم تست e2e


### T-06 · M-01 · جوب الـ SLA: تنبيه الـ TL بعد 2.5 ساعة وسحب الليد بعد 3 (#3)

**الهدف:** الليد اللي محدش لمسه بيتسحب أوتوماتيك ويروح للسيلز اللي بعده.

**اقرا:** `sources/answers-leads-telesales.md` · `docs/requirements · M-01 (2.4)`

**الديمو:** `demo/design-2/js/modules/leads.js (تنبيهات الـ SLA)`

**موجود بالفعل:**
- `leadSla()` في الـ domain (ساعات الشغل 11–19، والجمعة إجازة، والإجازات الرسمية 22/24 ساعة) ومتختبر
- `apps/worker/src/processors/lead-sla.ts` بداية
- الإعدادات `slaRules` والإجازات من M-13

**الخطوات:**
1. محتاج T-01 (Redis والـ worker).
2. الجوب كل دقيقة: الليدز Fresh اللي ماتلمستش ← `warn` يبعت `lead.sla_warn` للـ TL ← `pull` ينقلها بـ `LeadRouter` ويبعت `lead.pulled` للأوبريشن ومدير المبيعات.
3. optimistic update (`where: {id, assignedToId}`) عشان مايحصلش سحب مرتين، و Audit.
4. ⚠️ سؤال مفتوح للكلاينت: مثال 10:00 ← 12:30، والشغل بيبدأ 11:00 (label `needs-client`).

**يخلص لما:**
- [ ] تست بوقت متحكم فيه: 2.5 ساعة شغل ← تنبيه · 3 ← سحب · يوم إجازة ← 22/24 ساعة


## Sprint 2 · لحد 26/11

### T-07 · M-01 · روتيشن الـ No Answer كل يوم + تنبيه كل 4 ساعات (#4)

**الهدف:** الليد اللي في No Answer مايفضلش عند نفس السيلز.

**اقرا:** `sources/answers-telesales-voice.md` · `sources/answers-leads-telesales.md`

**الديمو:** `demo/design-2/js/modules/leads.js`

**موجود بالفعل:**
- `LeadRouter`

**الخطوات:**
1. جوب يومي (أول يوم شغل): كل ليد No Answer بقاله يوم عند سيلز ← للي بعده في المنطقة + LeadActivity.
2. جوب كل 4 ساعات شغل: `lead.no_answer` لصاحب الليد.

**يخلص لما:**
- [ ] تست بالأيام والإجازات


### T-08 · M-01 · الرفع الجماعي من الـ Telesales وموافقة الأوبريشن + الشركات (#10)

**الهدف:** الـ Telesales بترفع شيت أرقام، والأوبريشن توافق، والسيستم يوزّع بالتساوي.

**اقرا:** `sources/answers-leads-telesales.md` · `docs/requirements · M-01`

**الديمو:** `demo/design-2/js/modules/leads.js (الرفع الجماعي · الشركات)`

**موجود بالفعل:**
- `distributeEvenly()` في الـ domain

**الخطوات:**
1. رفع Excel/CSV (ExcelJS) ← معاينة ← منع المكرر ← طلب موافقة.
2. الأوبريشن توافق ← توزيع بالتساوي على سيلز النهارده + إشعارات.
3. شاشة الشركات الخاصة بالـ Telesales (الكاتيجوريز من الإعدادات).

**يخلص لما:**
- [ ] كل الشروط العامة


### T-09 · M-10 · العملاء والملاك (#11)

**الهدف:** ملف واحد لكل عميل أو مالك فيه كل حاجة عنه.

**اقرا:** `docs/requirements · M-10`

**الديمو:** `demo/design-2/js/modules/clients.js`

**الخطوات:**
1. ملف العميل: الأرقام، والوحدات، والصفقات، والعقود، وسجل التواصل.
2. دمج المكررين بالموبايل (Audit قبل وبعد).

**يخلص لما:**
- [ ] كل الشروط العامة


### T-10 · M-03 · شيتات الـ Not Active (#17)

**الهدف:** الشيتات اللي بتيجي من بره بتتراجع وتتحول لوحدات من غير تكرار.

**اقرا:** `docs/requirements · M-03` · modules-draft.md (M-03)

**الديمو:** `demo/design-2/js/modules/notactive.js`

**موجود بالفعل:**
- جداول `NotActiveSheet` و `NotActiveRow` (unique sheet+key)

**الخطوات:**
1. رفع الشيت ← صفوف ← مراجعة سارة ومروة ← تحويل لوحدة (`UnitsService`).
2. منع التكرار من الداتابيز (`@@unique`)، مش من الكود.
3. ⚠️ خانات الشيت (CFC) سؤال مفتوح.

**يخلص لما:**
- [ ] كل الشروط العامة


### T-11 · M-04 · المهام (Tasks) (#18)

**الهدف:** مهام بين الأقسام (تصوير، وتصميم، وواتساب) بحالتها.

**اقرا:** `images/handwritten-marketing-rahma.jpg` · modules-draft.md (M-04)

**الديمو:** `demo/design-2/js/modules/tasks.js`

**موجود بالفعل:**
- جدول `Task`

**الخطوات:**
1. CRUD + الحالة + المسؤول + الميعاد، و Kanban زي الديمو.
2. إشعار للمسؤول لما المهمة تتعمله.

**يخلص لما:**
- [ ] كل الشروط العامة


## Sprint 3 · لحد 10/12

### T-12 · M-02 · الصفقات والتحصيل والكوميشن (#12)

**الهدف:** من الـ Done Deal لحد ما الفلوس تتحصّل، والكوميشن يتحسب صح.

**اقرا:** `docs/requirements · M-02` · `sources/answers-transactions-voice.md (فويسات 27/10)`

**الديمو:** `demo/design-2/js/modules/deals.js`

**موجود بالفعل:**
- `packages/domain/src/commission.ts`: `splitDeal` (نص للبائع ونص للمشتري)، و `collectionStatus`، و `transactionsOf`، و `targetAchieved` ومتختبرين
- `team-leader.ts`

**الخطوات:**
1. الفلو: Done Deal ← مراجعة الـ Office Manager (Alarm لو اتعملت واتقفلت تاني يوم) ← Approved ← تحصيل جزئي/كامل.
2. الـ Seller بيتحسب بعد موافقة منار. والصفقة بتقفل الوحدة بـ `UnitsService.lock` (T-05).
3. الفلوس: integer piasters في الـ domain، و Decimal في الداتابيز (ADR-0003). كل مبلغ Audit.
4. تست e2e بمثال الكلاينت: 100,000 ← 25,000 لكل مشتري و50,000 للبائع بسكيم 30%.

**يخلص لما:**
- [ ] كل الشروط العامة


### T-13 · M-05 · الـ HR: الحضور والإجازات والـ Excuse والجزاءات (#19)

**الهدف:** الحضور والخصومات أوتوماتيك بالقواعد، والإجازات بأرصدتها.

**اقرا:** `docs/requirements · M-05` · modules-draft.md (M-05) · `images/ideal-employee.jpg` · `sources/answers-kpis.md (الـ 1-to-1)`

**الديمو:** `demo/design-2/js/modules/hr.js`

**موجود بالفعل:**
- `packages/domain/src/attendance.ts`: الشرايح، والـ Excuse (1–2 مجاناً، 3–4 نص يوم، الخامس رفد + تنبيه)، و `dayRate`
- `ideal-employee.ts`
- جداول `AttendanceDay` و `LeaveRequest` و `Penalty` و `OneOnOne`

**الخطوات:**
1. تسجيل الحضور اليومي، والـ Weekly Delay، والخصم.
2. الإجازات: طلب ← موافقة الـ TL/الـ HR ← الرصيد (أنواعها من الإعدادات).
3. الجزاءات، والـ 1-to-1 الشهري، وبيانات المرتب والتارجت (الـ KPIs بتقراها في T-23).
4. إشعار `hr.excuse` في الخامس.

**يخلص لما:**
- [ ] كل الشروط العامة


### T-14 · M-07 · المالية: الحسابات والمصروفات والـ Budget والسلف والخزن (#5)

**الهدف:** فلوس الشركة كلها في مكان واحد.

**اقرا:** `docs/requirements · M-07` · `sources/answers-finance-dashboard.md (الخزن والبنوك والسلف على الداشبورد)`

**الديمو:** `demo/design-2/js/modules/finance.js`

**موجود بالفعل:**
- جداول `Account` و `BudgetLine` و `Purchase` في schema `finance`
- `money.ts` (`allocate`، و `formatEGP`)

**الخطوات:**
1. شجرة الحسابات، والمصروفات على البنود، والـ Budget لكل بند، والسلف والعهد، والـ Petty cash.
2. داشبورد: رصيد كل خزنة وبنك، وسلف الموظفين.
3. `FinanceService.recordExpense()`: المشتريات (T-22) هتستخدمها.

**يخلص لما:**
- [ ] كل الشروط العامة


## Sprint 4 · لحد 24/12

### T-15 · M-02 · الـ TCR والتوقيعات والـ PDF (#13)

**الهدف:** ورقة الـ TCR الرسمية لكل صفقة بالتوقيعات.

**اقرا:** `docs/requirements · M-02`

**الديمو:** `demo/design-2/js/modules/deals.js (TCR)`

**الخطوات:**
1. رقم TCR تسلسلي (sequence)، والتوقيعات بالترتيب (`TcrSignature`).
2. PDF بالعربي بـ Playwright (ADR-0005).

**يخلص لما:**
- [ ] كل الشروط العامة


### T-16 · M-11 · العقود والأقساط وتنبيهات التجديد (#14)

**الهدف:** كل عقد بجدول أقساطه، والتجديد مايتنسيش.

**اقرا:** `docs/requirements · M-11`

**الديمو:** `demo/design-2/js/modules/deals.js` · `demo/design-2/js/modules/clients.js (العقود)`

**موجود بالفعل:**
- جداول `Contract` و `Installment`

**الخطوات:**
1. العقد ← جدول الأقساط.
2. جوب يومي: تنبيه التجديد قبلها بـ 90 و60 و30 يوم (`contract.renewal`).

**يخلص لما:**
- [ ] كل الشروط العامة


### T-17 · M-05 · جهاز البصمة (#20)

**الهدف:** الحضور ييجي من البصمة بدل ما يتكتب.

**اقرا:** `docs/requirements · M-05` · `apps/fingerprint-agent/README.md`

**الديمو:** `demo/design-2/js/modules/hr.js (سحب البصمة)`

**الخطوات:**
1. ⚠️ نوع الجهاز سؤال مفتوح (`needs-client`). ابدأ برفع شيت البصمة (Excel).
2. بعدين الـ agent اللي جنب الجهاز يرفع البصمات للـ API بتوكن خاص.

**يخلص لما:**
- [ ] كل الشروط العامة


### T-18 · M-06 · التذاكر (#21)

**الهدف:** طلبات بين الأقسام ليها SLA وتصعيد.

**اقرا:** `docs/requirements · M-06`

**الديمو:** `demo/design-2/js/modules/tickets.js`

**موجود بالفعل:**
- جداول `Ticket` و `TicketEvent`

**الخطوات:**
1. تذكرة ← المسؤول ← الحالة ← التعليقات.
2. الـ SLA لكل نوع، وتصعيد لما يعدّي (جوب).

**يخلص لما:**
- [ ] كل الشروط العامة


### T-19 · M-04 · التسويق: الحملات والبوستات والبرودكاست (#22)

**الهدف:** الحملات ونتايجها، والـ Content plan.

**اقرا:** `images/handwritten-marketing-rahma.jpg` · `docs/requirements · M-04`

**الديمو:** `demo/design-2/js/modules/marketing.js`

**موجود بالفعل:**
- جدول `Campaign`

**الخطوات:**
1. الحملات، ونسبة الـ Qualified لكل حملة (من الليدز: `campaignId` و `qualified`).
2. البوستات المتجدولة وتنبيه البوست (`marketing.post_reminder`).
3. البرودكاست بالحد اليومي من الإعدادات (`whatsappDailyLimit`).

**يخلص لما:**
- [ ] كل الشروط العامة


### T-20 · M-07 · المالية: تقفيل الشهر والتقارير والتصدير (#6)

**الهدف:** تقرير شهري للمصروف مقابل الـ Budget.

**اقرا:** `docs/requirements · M-07`

**الديمو:** `demo/design-2/js/modules/finance.js`

**الخطوات:**
1. تقفيل الشهر (ممنوع التعديل بعده إلا بصلاحية).
2. المصروف مقابل الـ Budget، وتصدير Excel/PDF.

**يخلص لما:**
- [ ] كل الشروط العامة


## Sprint 5 · لحد 7/1

### T-21 · M-11 · تحصيل الأقساط والمتأخرات (#15)

**الهدف:** كل قسط اتدفع ولا لأ، ومين متأخر.

**اقرا:** `docs/requirements · M-11`

**الديمو:** `demo/design-2/js/modules/deals.js (الأقساط)`

**الخطوات:**
1. تسجيل الدفعات، والمتأخرات (aging)، وتقرير التحصيل.

**يخلص لما:**
- [ ] كل الشروط العامة


### T-22 · M-08 · المشتريات وحدود الموافقة (#23)

**الهدف:** طلب الشراء بيمشي بالموافقات ويتسجل مصروف.

**اقرا:** `docs/requirements · M-08` · `apps/api/src/modules/procurement/README.md (حدود الموافقة)`

**الديمو:** `demo/design-2/js/modules/procurement.js`

**الخطوات:**
1. طلب ← موافقة حسب المبلغ (الـ Approver) ← شراء ← `FinanceService.recordExpense()` (T-14).
2. إشعار `procurement.request`.

**يخلص لما:**
- [ ] كل الشروط العامة


### T-23 · M-12 · التقارير والـ KPIs (#7)

**الهدف:** كارت KPIs لكل شخص كل ربع، والفلوس اللي بتترتب عليه، وصفحة فيها كل التفاصيل والتحكم للمالك والمدير.

**اقرا:** `sources/kpis-q4-2026.md` · `sources/answers-kpis.md` · `images/sales-kpi-card.png` · `images/team-leaders-and-teams.png` · `images/ideal-employee.jpg`

**الديمو:** `demo/design-2/js/modules/kpis.js` · `demo/design-2/js/modules/home.js`

**موجود بالفعل:**
- `packages/domain/src/kpi.ts`: `achievement` و `cardScore` و الشرايح و `payoutDelta` ومتختبرين
- `ideal-employee.ts` و `team-leader.ts`
- جداول `KpiCard` و `KpiItem` و `KpiBands`

**الخطوات:**
1. الكروت لكل شخص من ملف الـ KPIs، والبنود بتتحسب أوتوماتيك من الموديولات (الصفقات، والحضور، والمهام…) أو بتتسجل يدوي.
2. الشرايح والفلوس (المرتب أو البونص، شهري أو ربع سنوي)، والموظف المثالي وصندوق الفريق.
3. جوب تحديث الأرقام، وقفل الربع، والورقة الربع سنوية لكل موظف (PDF).

**يخلص لما:**
- [ ] كل الشروط العامة
- [ ] الأرقام مطابقة لأمثلة الكلاينت


## UAT · لحد 21/1

### T-24 · تجربة الكلاينت على staging (UAT)

**الهدف:** الكلاينت يجرّب السيستم كله قبل التسليم.

**اقرا:** كل الركوايرمنتس

**الديمو:** demo/ (الجولة السريعة فيها كل الفيتشرز)

**الخطوات:**
1. سيناريو تجربة لكل موديول (من جولة الديمو).
2. كل ملاحظة تبقى issue (bug أو feature) في الـ milestone ده.
3. تدريب سريع لكل قسم.

**يخلص لما:**
- [ ] الكلاينت وافق كتابةً على كل موديول

