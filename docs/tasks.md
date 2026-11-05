# كل التاسكات لحد التسليم

**165 تاسك** في **14 جزء**. كل تاسك له issue على GitHub فيه كل التفاصيل.

**إزاي تستخدمه:**
- كل سطر = **تاسك واحد تديه لحد**، و PR واحد. ابعتله لينك الـ issue.
- التفاصيل في الـ issue نفسه، والكارت المذكور جنبه (`T-xx`) فيه الصورة الكبيرة. **ترتيب الشغل: [order.md](order.md).**
- **بعد:** يعني لازم التاسك ده يخلص الأول. الأجزاء اللي مالهاش «بعد» تقدر تمشي بالتوازي.
- الملف ده بيتولّد من `scripts/tasks.py`. عدّل هناك، وبعدين `python3 scripts/tasks.py --issues`.

| الجزء | عدد التاسكات |
|---|---|
| 0 · الأساس المشترك | 8 |
| 1 · الليدز والتوزيع · M-01 | 29 |
| 2 · الانفنتوري · M-03 | 20 |
| 3 · العملاء والملاك · M-10 | 6 |
| 4 · المهام والتسويق · M-04 | 9 |
| 5 · الصفقات والتحصيل · M-02 | 14 |
| 6 · العقود والأقساط · M-11 | 7 |
| 7 · الـ HR · M-05 | 13 |
| 8 · التذاكر · M-06 | 4 |
| 9 · المالية · M-07 | 17 |
| 10 · المشتريات · M-08 | 4 |
| 11 · الـ KPIs والتقارير · M-12 | 15 |
| 12 · اللي فاضل في الموديولات اللي خلصت · M-09 · M-13 · M-14 | 12 |
| 13 · التسليم والإطلاق | 7 |
| **الإجمالي** | **165** |

## 0 · الأساس المشترك _(أي حد يبدأ بيه · الأجزاء التانية كلها محتاجاه)_

- [ ] **0.1** Redis محلي (docker-compose + أمر `pnpm redis:local` من غير Docker) ([#49](https://github.com/Ziad-Sameh-OJO/places-erp/issues/49)) · `T-01`
- [ ] **0.2** الـ worker يقوم مع `pnpm dev` ويقرا `.env` ويسجّل الجوبز بتوقيت القاهرة ([#50](https://github.com/Ziad-Sameh-OJO/places-erp/issues/50)) · `T-01` · بعد 0.1
- [ ] **0.3** Redis في الـ CI + خطوة تتأكد إن الـ worker قام ([#51](https://github.com/Ziad-Sameh-OJO/places-erp/issues/51)) · `T-01` · بعد 0.2
- [ ] **0.9** رفع الملفات: S3/MinIO + روابط pre-signed (`core/files`) ([#57](https://github.com/Ziad-Sameh-OJO/places-erp/issues/57)) · `—`
- [ ] **0.10** PDF بالعربي بـ Playwright (`core/documents`) + قالب أساسي بلوجو Places ([#58](https://github.com/Ziad-Sameh-OJO/places-erp/issues/58)) · `—`
- [ ] **0.11** تصدير Excel لأي جدول (component في الواجهة + endpoint مشترك) ([#59](https://github.com/Ziad-Sameh-OJO/places-erp/issues/59)) · `T-33`
- [ ] **0.12** استيراد Excel مشترك: رفع ← معاينة ← أخطاء ← تأكيد (ExcelJS) ([#60](https://github.com/Ziad-Sameh-OJO/places-erp/issues/60)) · `T-30`
- [ ] **0.13** كومبوننتس الواجهة من الديمو: Drawer (bottom sheet على الموبايل)، و Stepper، و Kanban، و KPI tile، وزرار «جديد» (FAB) ([#61](https://github.com/Ziad-Sameh-OJO/places-erp/issues/61)) · `—`

## 1 · الليدز والتوزيع · M-01 _(بعد 0.2 للجوبز)_

- [ ] **1.1** Schema الليد: الحقول الناقصة (وقت الوصول، الـ Visit، الوحدات المرشّحة…) + migration ([#62](https://github.com/Ziad-Sameh-OJO/places-erp/issues/62)) · `T-03`
- [ ] **1.2** API قايمة الليدز بنطاق البيانات (السيلز / الـ TL / الأوبريشن) + الفلاتر ([#63](https://github.com/Ziad-Sameh-OJO/places-erp/issues/63)) · `T-03` · بعد 1.1
- [ ] **1.3** API تفاصيل الليد + سجل الأنشطة + الكومنتات ([#64](https://github.com/Ziad-Sameh-OJO/places-erp/issues/64)) · `T-03` · بعد 1.1
- [ ] **1.4** الـ Telesales: تعمل ليد ويفضل عندها، ومايظهرلهاش بعد ما يروح لسيلز ([#65](https://github.com/Ziad-Sameh-OJO/places-erp/issues/65)) · `T-03` · بعد 1.2
- [ ] **1.5** الليد المكرر: كل وصول يتسجّل للحملة + شاشة الأوبريشن تقارن الاتنين وتختار ([#66](https://github.com/Ziad-Sameh-OJO/places-erp/issues/66)) · `T-03` · بعد 1.2
- [ ] **1.6** واجهة القايمة: جدول + فلاتر + Kanban بلون الـ SLA ([#67](https://github.com/Ziad-Sameh-OJO/places-erp/issues/67)) · `T-03` · بعد 1.2 · 0.13
- [ ] **1.7** واجهة دروار الليد: البيانات، والـ stepper، والأنشطة، وتغيير المرحلة ([#68](https://github.com/Ziad-Sameh-OJO/places-erp/issues/68)) · `T-03` · بعد 1.3
- [ ] **1.8** فورم ليد جديد من زرار «جديد» ([#69](https://github.com/Ziad-Sameh-OJO/places-erp/issues/69)) · `T-03` · بعد 1.6
- [ ] **1.9** الـ Visit / Meeting: النوع + وحدات ببحث + ميعاد + Alarm + Done + نقل المرحلة أوتوماتيك ([#70](https://github.com/Ziad-Sameh-OJO/places-erp/issues/70)) · `T-03` · بعد 1.7
- [ ] **1.10** سجل المكالمات، ووقت وصول الليد، وأول مكالمة خلال 30 دقيقة ([#71](https://github.com/Ziad-Sameh-OJO/places-erp/issues/71)) · `T-03` · بعد 1.3
- [ ] **1.11** تستات e2e: نطاق البيانات، والتكرار، والـ Qualified ([#72](https://github.com/Ziad-Sameh-OJO/places-erp/issues/72)) · `T-03` · بعد 1.5
- [ ] **1.12** إعدادات التوزيع: مين بيغطي أنهي منطقة (API + شاشة) ([#73](https://github.com/Ziad-Sameh-OJO/places-erp/issues/73)) · `T-04`
- [ ] **1.13** التوزيع الأوتوماتيك بالـ `LeadRouter` مع إنشاء الليد + إشعار `lead.assigned` ([#74](https://github.com/Ziad-Sameh-OJO/places-erp/issues/74)) · `T-04` · بعد 1.12
- [ ] **1.14** التعيين والسحب باليد (الأوبريشن ومدير المبيعات والإدارة) ([#75](https://github.com/Ziad-Sameh-OJO/places-erp/issues/75)) · `T-04` · بعد 1.13
- [ ] **1.15** السيلز اللي في إجازة يطلع من التوزيع ([#76](https://github.com/Ziad-Sameh-OJO/places-erp/issues/76)) · `T-04` · بعد 1.13 · 7.5
- [ ] **1.16** جوب الـ SLA: التنبيه والسحب بمواعيد ومسؤولين من «قواعد الليدز» + الإجازات الرسمية بمدة ([#77](https://github.com/Ziad-Sameh-OJO/places-erp/issues/77)) · `T-06` · بعد 0.2 · 1.13 · 1.29
- [ ] **1.17** جوب الـ No Answer (24 ساعة لكل سيلز) + الروتيشن التالت للـ Telesales + طلب New Lead للأوبريشن ([#78](https://github.com/Ziad-Sameh-OJO/places-erp/issues/78)) · `T-07` · بعد 1.16
- [ ] **1.18** تنبيه No Answer كل 4 ساعات + سؤال «بعت واتساب؟» ([#79](https://github.com/Ziad-Sameh-OJO/places-erp/issues/79)) · `T-07` · بعد 1.17
- [ ] **1.19** الرفع الجماعي: شيت ← معاينة ← موافقة الأوبريشن ← توزيع بالتساوي ([#80](https://github.com/Ziad-Sameh-OJO/places-erp/issues/80)) · `T-08` · بعد 0.12 · 1.13
- [ ] **1.20** شيت الشركات للـ Telesales: الشاشة، والكاتيجوريز، والإضافة، وتنبيه الشركة الجديدة ([#81](https://github.com/Ziad-Sameh-OJO/places-erp/issues/81)) · `T-08` · بعد 1.2
- [ ] **1.21** تقرير الشركات اللي عقدها قرّب يخلص + استيراد أرشيف الكاتيجوريز ([#82](https://github.com/Ziad-Sameh-OJO/places-erp/issues/82)) · `T-08` · بعد 1.20
- [ ] **1.22** لوحة «مهامي النهارده» للسيلز والـ TL ([#83](https://github.com/Ziad-Sameh-OJO/places-erp/issues/83)) · `T-03` · بعد 1.7
- [ ] **1.23** ترتيب الروتيشن اليومي: بالبصمة وميعاد الـ Visit + تعديل يدوي لليوم ([#220](https://github.com/Ziad-Sameh-OJO/places-erp/issues/220)) · `T-04` · بعد 1.13 · 7.3
- [ ] **1.24** تأجيل الـ Visit / Meeting: سبب إجباري + موافقة الـ TL + إبلاغ الأوبريشن ([#221](https://github.com/Ziad-Sameh-OJO/places-erp/issues/221)) · `T-03` · بعد 1.9 · 7.3 · 1.29
- [ ] **1.25** تاب Logs في الليد بصلاحية يختارها الأدمن ([#222](https://github.com/Ziad-Sameh-OJO/places-erp/issues/222)) · `T-03` · بعد 1.7
- [ ] **1.26** الـ Draft: سحب الليد اللي من غير أكشن 7 أيام (Hold 14) + تاب للأوبريشن + التوزيع منه ([#223](https://github.com/Ziad-Sameh-OJO/places-erp/issues/223)) · `T-06` · بعد 1.14 · 1.16 · 1.29
- [ ] **1.27** الـ Draft Admin: كل Not Interested و Cancellation + Alarm يومي للأوبريشن + القرار ([#224](https://github.com/Ziad-Sameh-OJO/places-erp/issues/224)) · `T-03` · بعد 1.26
- [ ] **1.28** نوع الليد Client / Broker + تاب البروكرز + الفلاتر في كل التابات ([#225](https://github.com/Ziad-Sameh-OJO/places-erp/issues/225)) · `T-03` · بعد 1.6
- [ ] **1.29** صفحة «قواعد الليدز والتوزيع»: كل المواعيد والمسؤولين بيتعدّلوا + كالندر الإجازات بمدة ([#226](https://github.com/Ziad-Sameh-OJO/places-erp/issues/226)) · `T-04` · بعد 1.12

## 2 · الانفنتوري · M-03 _(بالتوازي مع الجزء 1)_

- [ ] **2.1** Schema الوحدة كاملة من `sources/inventory-unit-fields.md` بالأنواع (Rent / Resale / Income / Primary) + migration ([#84](https://github.com/Ziad-Sameh-OJO/places-erp/issues/84)) · `T-05`
- [ ] **2.2** API الوحدات CRUD + الصلاحيات (منار ورندا) + كود U-101 ([#85](https://github.com/Ziad-Sameh-OJO/places-erp/issues/85)) · `T-05` · بعد 2.1
- [ ] **2.3** حسابات الوحدة في الـ domain: الإجمالي، والـ Income (سنوي وعائد)، والتقسيم + تستات ([#86](https://github.com/Ziad-Sameh-OJO/places-erp/issues/86)) · `T-05` · بعد 2.1
- [ ] **2.4** صور الوحدة (رفع وترتيب) ([#87](https://github.com/Ziad-Sameh-OJO/places-erp/issues/87)) · `T-05` · بعد 0.9 · 2.2
- [ ] **2.5** تابات المساحات (منار ورندا بيضيفوها بـ «+») ([#88](https://github.com/Ziad-Sameh-OJO/places-erp/issues/88)) · `T-05` · بعد 2.2
- [ ] **2.6** واجهة القايمة والكروت والفلاتر ([#89](https://github.com/Ziad-Sameh-OJO/places-erp/issues/89)) · `T-05` · بعد 2.2 · 0.13
- [ ] **2.7** فورم الوحدة بحقول كل نوع ([#90](https://github.com/Ziad-Sameh-OJO/places-erp/issues/90)) · `T-05` · بعد 2.6
- [ ] **2.8** PDF الوحدة والـ slide أوتوماتيك + تأكيد منار قبل الظهور + إعادة التأكيد بعد أي تعديل ([#91](https://github.com/Ziad-Sameh-OJO/places-erp/issues/91)) · `T-05` · بعد 0.10 · 2.7
- [ ] **2.9** `UnitsService.lock/release` + موافقة منار/رندا + Rent و Resale مع بعض (**الصفقات مستنياه**) ([#92](https://github.com/Ziad-Sameh-OJO/places-erp/issues/92)) · `T-05` · بعد 2.2
- [ ] **2.10** صفحة المؤجّر/المباع بفلاتر ([#93](https://github.com/Ziad-Sameh-OJO/places-erp/issues/93)) · `T-05` · بعد 2.9
- [ ] **2.11** المالك بيتعمل مع أول وحدة ليه، والوحدة مربوطة بيه ([#94](https://github.com/Ziad-Sameh-OJO/places-erp/issues/94)) · `T-05` · بعد 2.2 · 3.1
- [ ] **2.12** ترشيح الوحدات: القاعدة في الـ domain (±20% مستني تأكيد) + أسئلة التضييق ([#95](https://github.com/Ziad-Sameh-OJO/places-erp/issues/95)) · `T-28` · بعد 2.2
- [ ] **2.13** PDF لستة الوحدات للعميل + كومنت على الليد ([#96](https://github.com/Ziad-Sameh-OJO/places-erp/issues/96)) · `T-28` · بعد 2.12 · 1.3
- [ ] **2.14** Not Active: رفع الشيت + الصفوف + منع التكرار ([#97](https://github.com/Ziad-Sameh-OJO/places-erp/issues/97)) · `T-10` · بعد 0.12
- [ ] **2.15** Not Active: التابات، و feedback للـ Not True، والـ Done يفتح فورم وحدة، و Alarm لمنار، والمقارنة بالانفنتوري ([#98](https://github.com/Ziad-Sameh-OJO/places-erp/issues/98)) · `T-10` · بعد 2.14
- [ ] **2.16** شغل فريق الانفنتوري: مهام سارة ومروة اليومية (حد 30)، ووقت الرفع على الدرايف ([#99](https://github.com/Ziad-Sameh-OJO/places-erp/issues/99)) · `T-29` · بعد 2.2
- [ ] **2.17** جوب الوحدة اللي عدّى عليها شهر: تتحسب متأخرة وتتعمل مهمة متابعة مع المالك ([#100](https://github.com/Ziad-Sameh-OJO/places-erp/issues/100)) · `T-29` · بعد 0.2 · 4.1
- [ ] **2.18** التقرير اليومي للانفنتوري (السيستم بيطلّعه ومنار بتعتمده) ([#101](https://github.com/Ziad-Sameh-OJO/places-erp/issues/101)) · `T-29` · بعد 2.2
- [ ] **2.19** طلب List من الـ TL كتذكرة لمروة (24 ساعة) ([#102](https://github.com/Ziad-Sameh-OJO/places-erp/issues/102)) · `T-29` · بعد 8.1
- [ ] **2.20** البيانات الناقصة في الوحدة: تنبيه لحد ما تتكمّل ([#360](https://github.com/Ziad-Sameh-OJO/places-erp/issues/360)) · `T-05` · بعد 2.7

## 3 · العملاء والملاك · M-10 _(بعد 1.3)_

- [ ] **3.1** Schema العميل/المالك + الربط بالليد والوحدة والصفقة ([#103](https://github.com/Ziad-Sameh-OJO/places-erp/issues/103)) · `T-09`
- [ ] **3.2** API ملف العميل: الأرقام، والوحدات، والصفقات، والعقود، وسجل التواصل، والمدفوع والمتبقي ([#104](https://github.com/Ziad-Sameh-OJO/places-erp/issues/104)) · `T-09` · بعد 3.1
- [ ] **3.3** واجهة قايمة العملاء والملف ([#105](https://github.com/Ziad-Sameh-OJO/places-erp/issues/105)) · `T-09` · بعد 3.2
- [ ] **3.4** الدمج بالموبايل بموافقة الأوبريشن + Audit ([#106](https://github.com/Ziad-Sameh-OJO/places-erp/issues/106)) · `T-09` · بعد 3.2
- [ ] **3.5** الصلاحيات: السيلز مايشوفش أرقام الملاك، والمالية تقرا بس ([#107](https://github.com/Ziad-Sameh-OJO/places-erp/issues/107)) · `T-09` · بعد 3.2
- [ ] **3.6** جوب Inactive بعد سنة + تقرير الملاك اللي محتاجين ابديت + موافقة التسويق + طلب مسح البيانات ([#108](https://github.com/Ziad-Sameh-OJO/places-erp/issues/108)) · `T-09` · بعد 3.2 · 0.2

## 4 · المهام والتسويق · M-04 _(بالتوازي)_

- [ ] **4.1** Schema + API المهام: الأنواع، والمسؤول، والميعاد، والحالة، و Undo ([#109](https://github.com/Ziad-Sameh-OJO/places-erp/issues/109)) · `T-11`
- [ ] **4.2** واجهة المهام Kanban ([#110](https://github.com/Ziad-Sameh-OJO/places-erp/issues/110)) · `T-11` · بعد 4.1 · 0.13
- [ ] **4.3** مهمة التصوير والـ Retouch بموافقة منار + الـ SLA (48/72 ساعة) ([#111](https://github.com/Ziad-Sameh-OJO/places-erp/issues/111)) · `T-11` · بعد 4.1 · 2.2
- [ ] **4.4** تنبيه التسويق مع كل وحدة جديدة + بورد التسويق ([#112](https://github.com/Ziad-Sameh-OJO/places-erp/issues/112)) · `T-11` · بعد 4.2
- [ ] **4.5** الحملات: CRUD + التكلفة ([#113](https://github.com/Ziad-Sameh-OJO/places-erp/issues/113)) · `T-19`
- [ ] **4.6** داشبورد Channel ← حملة ← بوست، بالنسب والفلاتر ([#114](https://github.com/Ziad-Sameh-OJO/places-erp/issues/114)) · `T-19` · بعد 4.5 · 1.5
- [ ] **4.7** الـ Content plan: كالندر البوستات + وقت النشر الفعلي + Reminder ([#115](https://github.com/Ziad-Sameh-OJO/places-erp/issues/115)) · `T-19` · بعد 4.5
- [ ] **4.8** البرودكاست: مهمة للسيلز + Done/share + Hot Inventory مرتين في الأسبوع + الحد اليومي ([#116](https://github.com/Ziad-Sameh-OJO/places-erp/issues/116)) · `T-19` · بعد 4.1
- [ ] **4.9** Alarm الصفقة للتسويق بالبيانات المسموحة + رفع لوجو ([#117](https://github.com/Ziad-Sameh-OJO/places-erp/issues/117)) · `T-12` · بعد 5.2

## 5 · الصفقات والتحصيل · M-02 _(بعد 2.9)_

- [ ] **5.1** Schema الصفقة كاملة: المشترين، والبائعين، والأنواع، والمبالغ، والـ note + migration ([#118](https://github.com/Ziad-Sameh-OJO/places-erp/issues/118)) · `T-12`
- [ ] **5.2** API الصفقة: Done Deal ← مراجعة الـ Office Manager ← Approved ([#119](https://github.com/Ziad-Sameh-OJO/places-erp/issues/119)) · `T-12` · بعد 5.1
- [ ] **5.3** التحصيل الجزئي والكامل + حالاته ([#120](https://github.com/Ziad-Sameh-OJO/places-erp/issues/120)) · `T-12` · بعد 5.2
- [ ] **5.4** الكوميشن بـ `splitDeal` + الـ Scheme لكل سيلز + موافقة منار على الـ Seller ([#121](https://github.com/Ziad-Sameh-OJO/places-erp/issues/121)) · `T-12` · بعد 5.3
- [ ] **5.5** الصفقة بتقفل الوحدة وتنقلها للمؤجّر/المباع ([#122](https://github.com/Ziad-Sameh-OJO/places-erp/issues/122)) · `T-12` · بعد 2.9 · 5.2
- [ ] **5.6** Alarm الصفقة اللي اتقفلت تاني يوم + استبعادها من التارجت + الـ note ([#123](https://github.com/Ziad-Sameh-OJO/places-erp/issues/123)) · `T-12` · بعد 5.2 · 1.29
- [ ] **5.7** إلغاء الصفقة يعكس الإيراد والـ achievements والكوميشن ([#124](https://github.com/Ziad-Sameh-OJO/places-erp/issues/124)) · `T-12` · بعد 5.4
- [ ] **5.8** عمولة الـ TL بالشرايح + جدول الشرايح في الإعدادات ([#125](https://github.com/Ziad-Sameh-OJO/places-erp/issues/125)) · `T-12` · بعد 5.4
- [ ] **5.9** واجهة الصفقات: القايمة، والفورم، والدروار، والتحصيل ([#126](https://github.com/Ziad-Sameh-OJO/places-erp/issues/126)) · `T-12` · بعد 5.3 · 0.13
- [ ] **5.10** داشبورد الإيرادات + صفحة Achievements + الترتيب ([#127](https://github.com/Ziad-Sameh-OJO/places-erp/issues/127)) · `T-12` · بعد 5.4
- [ ] **5.11** تصدير تفاصيل الصفقة لكل سيلز ([#128](https://github.com/Ziad-Sameh-OJO/places-erp/issues/128)) · `T-12` · بعد 0.11 · 5.4
- [ ] **5.12** الـ TCR: رقم تسلسلي، والتوقيعات بالترتيب، و TCR جديدة مع كل تحصيل ([#129](https://github.com/Ziad-Sameh-OJO/places-erp/issues/129)) · `T-15` · بعد 5.3
- [ ] **5.13** PDF الـ TCR ([#130](https://github.com/Ziad-Sameh-OJO/places-erp/issues/130)) · `T-15` · بعد 0.10 · 5.12
- [ ] **5.14** تستات e2e بمثال الكلاينت (100,000 ← 25,000 / 25,000 / 50,000) ([#131](https://github.com/Ziad-Sameh-OJO/places-erp/issues/131)) · `T-12` · بعد 5.4

## 6 · العقود والأقساط · M-11 _(بعد 5.3)_

- [ ] **6.1** Schema + API العقد وجدول الأقساط ([#132](https://github.com/Ziad-Sameh-OJO/places-erp/issues/132)) · `T-16`
- [ ] **6.2** واجهة العقود والأقساط + الكالندر ([#133](https://github.com/Ziad-Sameh-OJO/places-erp/issues/133)) · `T-16` · بعد 6.1
- [ ] **6.3** جوب التجديد 90/60/30 + ليد تجديد أوتوماتيك ([#134](https://github.com/Ziad-Sameh-OJO/places-erp/issues/134)) · `T-16` · بعد 6.1 · 0.2
- [ ] **6.4** الإنهاء المبكر والانتهاء يرجّعوا الوحدة + تغيير القيمة بموافقة + الزيادة السنوية ([#135](https://github.com/Ziad-Sameh-OJO/places-erp/issues/135)) · `T-16` · بعد 6.1 · 2.9
- [ ] **6.5** تسجيل الدفعات + المتأخرات (aging) + تقرير التحصيل ([#136](https://github.com/Ziad-Sameh-OJO/places-erp/issues/136)) · `T-21` · بعد 6.1
- [ ] **6.6** تذكير القسط قبلها بـ 3 أيام + تنبيه المتأخر + تصعيد بعد 7 أيام ([#137](https://github.com/Ziad-Sameh-OJO/places-erp/issues/137)) · `T-21` · بعد 6.5 · 0.2
- [ ] **6.7** فاتورة/إيصال PDF ([#138](https://github.com/Ziad-Sameh-OJO/places-erp/issues/138)) · `T-21` · بعد 0.10 · 6.5

## 7 · الـ HR · M-05 _(بالتوازي)_

- [ ] **7.1** ملف الموظف كامل: المرتب، والنوع، والشرايح الخاصة، والمواعيد الثابتة (Schema + شاشة) ([#139](https://github.com/Ziad-Sameh-OJO/places-erp/issues/139)) · `T-13`
- [ ] **7.2** الحضور اليومي بالشرايح + الـ Weekly Delay + الخصم ([#140](https://github.com/Ziad-Sameh-OJO/places-erp/issues/140)) · `T-13` · بعد 7.1
- [ ] **7.3** الـ Visit كبداية اليوم + نسي البصمة (تأكيد الـ HR) + الشغل من بره بعذر ([#141](https://github.com/Ziad-Sameh-OJO/places-erp/issues/141)) · `T-13` · بعد 7.2 · 1.9
- [ ] **7.4** الـ Excuse: تذكرة للـ TL ثم الـ HR، واتنين مجاناً، والتالت والرابع نص يوم، والخامس رفد ([#142](https://github.com/Ziad-Sameh-OJO/places-erp/issues/142)) · `T-13` · بعد 7.2 · 8.1
- [ ] **7.5** الإجازات: طلب ← TL ← HR، والأرصدة، والتذكير والتصعيد، والمرضي بمستند ([#143](https://github.com/Ziad-Sameh-OJO/places-erp/issues/143)) · `T-13` · بعد 7.1
- [ ] **7.6** كالندر «مين إجازة النهارده» + تقرير الأرصدة الشهري ([#144](https://github.com/Ziad-Sameh-OJO/places-erp/issues/144)) · `T-13` · بعد 7.5
- [ ] **7.7** الجزاءات ([#145](https://github.com/Ziad-Sameh-OJO/places-erp/issues/145)) · `T-13` · بعد 7.1
- [ ] **7.8** الـ 1-to-1: الأسئلة، و«حل الـ HR» بميعاد و Alarm، والجلسة اللي فاتت ([#146](https://github.com/Ziad-Sameh-OJO/places-erp/issues/146)) · `T-13` · بعد 7.1
- [ ] **7.9** شيت المرتبات يوم 30 (بعد الخصومات والـ KPIs) للمالية بعد موافقة الـ HR ([#147](https://github.com/Ziad-Sameh-OJO/places-erp/issues/147)) · `T-13` · بعد 7.2 · 7.7
- [ ] **7.10** شاشات: حضور النهارده، والتاريخ بالشخص والفترة، والـ Weekly Delay ([#148](https://github.com/Ziad-Sameh-OJO/places-erp/issues/148)) · `T-13` · بعد 7.2
- [ ] **7.11** الموظف المثالي وصندوق الفريق كل شهر ([#149](https://github.com/Ziad-Sameh-OJO/places-erp/issues/149)) · `T-13` · بعد 7.2 · 7.7
- [ ] **7.12** رفع شيت البصمة: ربط الأسامي، ومنع التكرار، واستكمال الأيام ([#150](https://github.com/Ziad-Sameh-OJO/places-erp/issues/150)) · `T-17` · بعد 0.12 · 7.2
- [ ] **7.13** agent جهاز البصمة (بعد ما الكلاينت يحدد نوع الجهاز) ([#151](https://github.com/Ziad-Sameh-OJO/places-erp/issues/151)) · `T-17` · بعد 7.12

## 8 · التذاكر · M-06 _(قبل 7.4 و 2.19)_

- [ ] **8.1** Schema + API التذاكر: الأنواع ومسار كل نوع، والأولوية، والتحويل بالتاريخ ([#152](https://github.com/Ziad-Sameh-OJO/places-erp/issues/152)) · `T-18`
- [ ] **8.2** واجهة التذاكر ([#153](https://github.com/Ziad-Sameh-OJO/places-erp/issues/153)) · `T-18` · بعد 8.1
- [ ] **8.3** جوب الـ SLA والتصعيد (24 ساعة، و4 للعالية، والنزاع 48 وتنبيه نانسي) ([#154](https://github.com/Ziad-Sameh-OJO/places-erp/issues/154)) · `T-18` · بعد 8.1 · 0.2
- [ ] **8.4** تقرير سرعة الرد لكل قسم ([#155](https://github.com/Ziad-Sameh-OJO/places-erp/issues/155)) · `T-18` · بعد 8.1

## 9 · المالية · M-07

- [ ] **9.1** شجرة الحسابات + الخزن والبنوك (Schema + API + شاشة) ([#156](https://github.com/Ziad-Sameh-OJO/places-erp/issues/156)) · `T-14`
- [ ] **9.2** المصروفات على البنود + الـ Budget ([#157](https://github.com/Ziad-Sameh-OJO/places-erp/issues/157)) · `T-14` · بعد 9.1
- [ ] **9.3** السلف والعهد والـ Petty cash + `FinanceService.recordExpense()` ([#158](https://github.com/Ziad-Sameh-OJO/places-erp/issues/158)) · `T-14` · بعد 9.1
- [ ] **9.4** داشبورد المالية: الخزن، والبنوك، والسلف، والإيراد، وصافي الربح، والتوفير ([#159](https://github.com/Ziad-Sameh-OJO/places-erp/issues/159)) · `T-14` · بعد 9.2
- [ ] **9.5** القيود والأرصدة الافتتاحية ([#160](https://github.com/Ziad-Sameh-OJO/places-erp/issues/160)) · `T-31` · بعد 9.1
- [ ] **9.6** الترحيل الأوتوماتيك: التحصيل، وتكاليف الصفقة، والمرتبات، والمشتريات، والإلغاء ([#161](https://github.com/Ziad-Sameh-OJO/places-erp/issues/161)) · `T-31` · بعد 9.5 · 5.3 · 7.9 · 9.12
- [ ] **9.7** قايمة الدخل والميزانية وصافي الربح + drill-down ([#162](https://github.com/Ziad-Sameh-OJO/places-erp/issues/162)) · `T-31` · بعد 9.6
- [ ] **9.8** تقفيل الشهر والربع + التعديل اليدوي لشخص واحد + تسوية العهدة الأسبوعية ([#163](https://github.com/Ziad-Sameh-OJO/places-erp/issues/163)) · `T-20` · بعد 9.5
- [ ] **9.9** المصروف مقابل الـ Budget + التصدير ([#164](https://github.com/Ziad-Sameh-OJO/places-erp/issues/164)) · `T-20` · بعد 9.2 · 0.11 · 9.6
- [ ] **9.10** الـ Cost Center: تكلفة الحملة على الليدز المؤهلة وعلى كل صفقة ([#165](https://github.com/Ziad-Sameh-OJO/places-erp/issues/165)) · `T-32` · بعد 4.5 · 9.6
- [ ] **9.11** إذن توريد خزنة + التحويل بين الخزن والبنوك + كشف حساب الخزنة / البنك ([#232](https://github.com/Ziad-Sameh-OJO/places-erp/issues/232)) · `T-14` · بعد 9.1 · 9.5
- [ ] **9.12** حسابات فرعية أوتوماتيك: عميل لكل صفقة (113) · سلفة لكل موظف (114) · عمولة لكل سيلز (211) ([#244](https://github.com/Ziad-Sameh-OJO/places-erp/issues/244)) · `T-31` · بعد 9.1 · 9.5 · 5.2
- [ ] **9.13** قيد يومية يدوي من شجرة الحسابات ([#245](https://github.com/Ziad-Sameh-OJO/places-erp/issues/245)) · `T-31` · بعد 9.5
- [ ] **9.14** صرف المرتبات مرة واحدة (إذن «صرف مرتبات») + خصم السلف الشهري ([#246](https://github.com/Ziad-Sameh-OJO/places-erp/issues/246)) · `T-20` · بعد 9.3 · 9.5 · 7.9
- [ ] **9.15** صرف عمولة السيلز لكل صفقة مع الـ TCR ([#247](https://github.com/Ziad-Sameh-OJO/places-erp/issues/247)) · `T-20` · بعد 9.12 · 5.4 · 5.12
- [ ] **9.16** الفواتير الثابتة بموافقة المحاسب (زي اشتراك Property Finder) ([#248](https://github.com/Ziad-Sameh-OJO/places-erp/issues/248)) · `T-14` · بعد 9.2
- [ ] **9.17** المطالبات + الفاتورة الإلكترونية + إيصال استلام النقدية (من القوالب) ([#249](https://github.com/Ziad-Sameh-OJO/places-erp/issues/249)) · `T-15` · بعد 5.3 · 0.10 · 12.12

## 10 · المشتريات · M-08 _(بعد 9.3)_

- [ ] **10.1** Schema + API الطلب: الموافقات بالحدود، ومختار مايوافقش على طلبه، وتغيير المبلغ بموافقة ([#166](https://github.com/Ziad-Sameh-OJO/places-erp/issues/166)) · `T-22`
- [ ] **10.2** المرفقات الإجبارية فوق 10,000 + سقف العهدة + الدفع ← `recordExpense` ([#167](https://github.com/Ziad-Sameh-OJO/places-erp/issues/167)) · `T-22` · بعد 10.1 · 9.2 · 9.3
- [ ] **10.3** واجهة المشتريات + تذكير المعتمد + تقرير البنود + الموردين ([#168](https://github.com/Ziad-Sameh-OJO/places-erp/issues/168)) · `T-22` · بعد 10.1
- [ ] **10.4** سجل أصول المكتب + جدول الـ Office Boys بالمناطق ([#169](https://github.com/Ziad-Sameh-OJO/places-erp/issues/169)) · `T-22`

## 11 · الـ KPIs والتقارير · M-12 _(آخر جزء · بيقرا من الكل)_

- [ ] **11.1** Schema الكروت (البنود، والأوزان، والمصدر، والمتابع، والـ Baseline) + seed كروت Q4 من الملف ([#170](https://github.com/Ziad-Sameh-OJO/places-erp/issues/170)) · `T-23`
- [ ] **11.2** «كارتي» للموظف + تسجيل التسليمات ([#171](https://github.com/Ziad-Sameh-OJO/places-erp/issues/171)) · `T-23` · بعد 11.1
- [ ] **11.3** «فريقي» للمتابع: تعديل البنود، واليدوي، وخطة التحسين، والاعتماد ([#172](https://github.com/Ziad-Sameh-OJO/places-erp/issues/172)) · `T-23` · بعد 11.1
- [ ] **11.4** «كل الشركة»: إعدادات الفلوس لكل موظف + الشرايح + قفل الربع ([#173](https://github.com/Ziad-Sameh-OJO/places-erp/issues/173)) · `T-23` · بعد 11.1
- [ ] **11.5** جوب حساب البنود الأوتوماتيك كل يوم من الموديولات ([#174](https://github.com/Ziad-Sameh-OJO/places-erp/issues/174)) · `T-23` · بعد 11.1 · الأجزاء 1–10
- [ ] **11.6** التنبيهات (نص الربع، وتحت 70% خطة تحسين، وتحت 50%) + البونص والخصم في المرتبات ([#175](https://github.com/Ziad-Sameh-OJO/places-erp/issues/175)) · `T-23` · بعد 11.5 · 7.9
- [ ] **11.7** الورقة الربع سنوية PDF بعد موافقة الـ Office Manager ([#176](https://github.com/Ziad-Sameh-OJO/places-erp/issues/176)) · `T-23` · بعد 0.10 · 11.5
- [ ] **11.8** تارجت شهري لكل سيلز وفريق + تقرير الـ TL + الـ Transactions + الترتيب ([#177](https://github.com/Ziad-Sameh-OJO/places-erp/issues/177)) · `T-23` · بعد 5.4
- [ ] **11.9** بيانات البنود الناقصة: عينة Second Call، وعدّاد إعلانات الويبسايت، والـ Farming، والمنافسين، والـ 500م ([#178](https://github.com/Ziad-Sameh-OJO/places-erp/issues/178)) · `T-34` · بعد 1.10
- [ ] **11.10** محرك التقارير المتجدولة (الأحد ويوم 1) + تقرير الأداء الشهري ([#179](https://github.com/Ziad-Sameh-OJO/places-erp/issues/179)) · `T-33` · بعد 0.2 · 0.11 · 11.1
- [ ] **11.11** محرر مصدر البند: كتالوج مقاييس السيستم + من تقرير + يدوي بشخص + ربع جديد ([#227](https://github.com/Ziad-Sameh-OJO/places-erp/issues/227)) · `T-23` · بعد 11.1 · 11.5
- [ ] **11.12** التقرير اليومي لكل التيمز: شكله لكل شخص + خانات إضافية + تقرير أي يوم + التجميع ([#228](https://github.com/Ziad-Sameh-OJO/places-erp/issues/228)) · `T-23` · بعد 11.10 · 11.11
- [ ] **11.13** نشاطات Farming / Approach للسيلز + بند Farming أوتوماتيك ([#229](https://github.com/Ziad-Sameh-OJO/places-erp/issues/229)) · `T-34` · بعد 11.11
- [ ] **11.14** مسؤول الـ KPIs: يشوف كل الكروت والتقارير والتغييرات ويعدّل البنود، من غير أي حاجة فلوس ([#230](https://github.com/Ziad-Sameh-OJO/places-erp/issues/230)) · `T-23` · بعد 11.4 · 11.10
- [ ] **11.15** مقاييس كارت الأوبريشن: الـ New Lead خلال 30 دقيقة، وقرارات الـ Draft في يومها، والـ Second Calls لكل ليدز اليوم ([#231](https://github.com/Ziad-Sameh-OJO/places-erp/issues/231)) · `T-34` · بعد 1.17 · 1.26 · 1.27 · 1.28 · 11.11

## 12 · اللي فاضل في الموديولات اللي خلصت · M-09 · M-13 · M-14 _(أي وقت)_

- [ ] **12.1** الهيكل (`managerId` لكل موظف) من ملف الـ KPIs في الـ seed ([#180](https://github.com/Ziad-Sameh-OJO/places-erp/issues/180)) · `T-25`
- [ ] **12.2** الـ Ops Head يعدّل صلاحيات فريقه بس + الـ HR تعمل وتوقف حسابات ([#181](https://github.com/Ziad-Sameh-OJO/places-erp/issues/181)) · `T-25`
- [ ] **12.3** نقل شغل الموظف اللي ماشي بموافقة مديره ([#182](https://github.com/Ziad-Sameh-OJO/places-erp/issues/182)) · `T-25` · بعد 1.2 · 4.1
- [ ] **12.4** الـ OTP: «ابعت تاني» بعد دقيقة ([#183](https://github.com/Ziad-Sameh-OJO/places-erp/issues/183)) · `T-25`
- [ ] **12.5** الـ Audit Log: تصدير، وفلتر بالتاريخ والشخص، والجهاز + تقرير الصلاحيات + تنبيه الـ Super Admin ([#184](https://github.com/Ziad-Sameh-OJO/places-erp/issues/184)) · `T-25` · بعد 0.11
- [ ] **12.6** بحث المستخدمين بالموبايل والقسم ([#185](https://github.com/Ziad-Sameh-OJO/places-erp/issues/185)) · `T-25`
- [ ] **12.7** القوايم: نشط / موقوف بدل المسح ([#186](https://github.com/Ziad-Sameh-OJO/places-erp/issues/186)) · `T-26`
- [ ] **12.8** إعدادات كل قسم لمديره بس ([#187](https://github.com/Ziad-Sameh-OJO/places-erp/issues/187)) · `T-26`
- [ ] **12.9** الإيميل من الـ worker + سجل الإرسال + تنبيه لما يفشل ([#188](https://github.com/Ziad-Sameh-OJO/places-erp/issues/188)) · `T-27` · بعد 0.2
- [ ] **12.10** الـ Push notifications (PWA + VAPID) ([#189](https://github.com/Ziad-Sameh-OJO/places-erp/issues/189)) · `T-27`
- [ ] **12.11** الجرس لحظي (WebSocket) + فلتر بالنوع ([#190](https://github.com/Ziad-Sameh-OJO/places-erp/issues/190)) · `T-27`
- [ ] **12.12** الختم والإمضا + الجهات (لوجو وبيانات بنك) + قوالب المستندات ([#250](https://github.com/Ziad-Sameh-OJO/places-erp/issues/250)) · `T-26` · بعد 0.9 · 0.10

## 13 · التسليم والإطلاق _(آخر حاجة)_

- [ ] **13.1** قوالب Excel + استيراد الوحدات والشركات والليدز القديمة بمنع التكرار ([#191](https://github.com/Ziad-Sameh-OJO/places-erp/issues/191)) · `T-30` · بعد 0.12 · 2.2 · 1.20
- [ ] **13.2** تجربة الاستيراد على شيتات الكلاينت الحقيقية ([#192](https://github.com/Ziad-Sameh-OJO/places-erp/issues/192)) · `T-30` · بعد 13.1
- [ ] **13.3** مراجعة أمان قبل الإطلاق + أداء (الصفحات التقيلة والـ indexes) ([#193](https://github.com/Ziad-Sameh-OJO/places-erp/issues/193)) · `—`
- [ ] **13.4** تستات المتصفح (Playwright) لسيناريو الجولة السريعة بتاعة الديمو ([#194](https://github.com/Ziad-Sameh-OJO/places-erp/issues/194)) · `—`
- [ ] **13.5** UAT: سيناريو لكل موديول + جلسات مع الكلاينت + تصليح الملاحظات ([#195](https://github.com/Ziad-Sameh-OJO/places-erp/issues/195)) · `T-24`
- [ ] **13.6** تدريب لكل قسم + دليل استخدام مختصر ([#196](https://github.com/Ziad-Sameh-OJO/places-erp/issues/196)) · `T-24` · بعد 13.5
- [ ] **13.8** ترقية الإصدارات الكبيرة: TypeScript 6 (#34)، و Prisma 7، و ESLint 10 ([#198](https://github.com/Ziad-Sameh-OJO/places-erp/issues/198)) · `—`
