# ترتيب الشغل

الـ 150 issue بالترتيب اللي المفروض يتعملوا بيه. مفيش تاسك جاي قبل حاجة محتاجها، وكل تاسك في الـ Sprint بتاعه.
لو أكتر من حد شغال: خد أول تاسك في اللستة لسه محدش ماسكه و «لازم قبله» بتاعه خلص.


## Sprint 1

1. [#49](https://github.com/Ziad-Sameh-OJO/places-erp/issues/49) **0.1** Redis محلي (docker-compose + أمر `pnpm redis:local` من غير Docker)
2. [#50](https://github.com/Ziad-Sameh-OJO/places-erp/issues/50) **0.2** الـ worker يقوم مع `pnpm dev` ويقرا `.env` ويسجّل الجوبز بتوقيت القاهرة · بعد 0.1
3. [#51](https://github.com/Ziad-Sameh-OJO/places-erp/issues/51) **0.3** Redis في الـ CI + خطوة تتأكد إن الـ worker قام · بعد 0.2
4. [#52](https://github.com/Ziad-Sameh-OJO/places-erp/issues/52) **0.4** سيرفر staging: VPS + Postgres + Redis + دومين و HTTPS (Cloudflare)
5. [#53](https://github.com/Ziad-Sameh-OJO/places-erp/issues/53) **0.5** `deploy.yml`: build للـ images + `migrate deploy` + نشر أوتوماتيك بعد الـ CI على main · بعد 0.4
6. [#54](https://github.com/Ziad-Sameh-OJO/places-erp/issues/54) **0.6** أسرار staging في GitHub Environment + SMTP حقيقي للإيميلات · بعد 0.4
7. [#55](https://github.com/Ziad-Sameh-OJO/places-erp/issues/55) **0.7** باك أب يومي للداتابيز + Sentry للـ API والواجهة · بعد 0.4
8. [#56](https://github.com/Ziad-Sameh-OJO/places-erp/issues/56) **0.8** seed الحسابات الـ 36 على staging بحالة INVITED، وإيميلات التفعيل تتبعت · بعد 0.6
9. [#57](https://github.com/Ziad-Sameh-OJO/places-erp/issues/57) **0.9** رفع الملفات: S3/MinIO + روابط pre-signed (`core/files`)
10. [#58](https://github.com/Ziad-Sameh-OJO/places-erp/issues/58) **0.10** PDF بالعربي بـ Playwright (`core/documents`) + قالب أساسي بلوجو Places
11. [#61](https://github.com/Ziad-Sameh-OJO/places-erp/issues/61) **0.13** كومبوننتس الواجهة من الديمو: Drawer (bottom sheet على الموبايل)، و Stepper، و Kanban، و KPI tile، وزرار «جديد» (FAB)
12. [#62](https://github.com/Ziad-Sameh-OJO/places-erp/issues/62) **1.1** Schema الليد: الحقول الناقصة (وقت الوصول، الـ Visit، الوحدات المرشّحة…) + migration
13. [#63](https://github.com/Ziad-Sameh-OJO/places-erp/issues/63) **1.2** API قايمة الليدز بنطاق البيانات (السيلز / الـ TL / الأوبريشن) + الفلاتر · بعد 1.1
14. [#64](https://github.com/Ziad-Sameh-OJO/places-erp/issues/64) **1.3** API تفاصيل الليد + سجل الأنشطة + الكومنتات · بعد 1.1
15. [#65](https://github.com/Ziad-Sameh-OJO/places-erp/issues/65) **1.4** الـ Telesales: تعمل ليد ويفضل عندها، ومايظهرلهاش بعد ما يروح لسيلز · بعد 1.2
16. [#66](https://github.com/Ziad-Sameh-OJO/places-erp/issues/66) **1.5** الليد المكرر: كل وصول يتسجّل للحملة + شاشة الأوبريشن تقارن الاتنين وتختار · بعد 1.2
17. [#67](https://github.com/Ziad-Sameh-OJO/places-erp/issues/67) **1.6** واجهة القايمة: جدول + فلاتر + Kanban بلون الـ SLA · بعد 0.13، 1.2
18. [#68](https://github.com/Ziad-Sameh-OJO/places-erp/issues/68) **1.7** واجهة دروار الليد: البيانات، والـ stepper، والأنشطة، وتغيير المرحلة · بعد 1.3
19. [#69](https://github.com/Ziad-Sameh-OJO/places-erp/issues/69) **1.8** فورم ليد جديد من زرار «جديد» · بعد 1.6
20. [#70](https://github.com/Ziad-Sameh-OJO/places-erp/issues/70) **1.9** الـ Visit: وحدات + ميعاد + Alarm وقت الزيارة + Done · بعد 1.7
21. [#71](https://github.com/Ziad-Sameh-OJO/places-erp/issues/71) **1.10** سجل المكالمات، ووقت وصول الليد، وأول مكالمة خلال 30 دقيقة · بعد 1.3
22. [#72](https://github.com/Ziad-Sameh-OJO/places-erp/issues/72) **1.11** تستات e2e: نطاق البيانات، والتكرار، والـ Qualified · بعد 1.5
23. [#73](https://github.com/Ziad-Sameh-OJO/places-erp/issues/73) **1.12** إعدادات التوزيع: مين بيغطي أنهي منطقة (API + شاشة)
24. [#74](https://github.com/Ziad-Sameh-OJO/places-erp/issues/74) **1.13** التوزيع الأوتوماتيك بالـ `LeadRouter` مع إنشاء الليد + إشعار `lead.assigned` · بعد 1.12
25. [#75](https://github.com/Ziad-Sameh-OJO/places-erp/issues/75) **1.14** التعيين والسحب باليد (الأوبريشن ومدير المبيعات والإدارة) · بعد 1.13
26. [#77](https://github.com/Ziad-Sameh-OJO/places-erp/issues/77) **1.16** جوب الـ SLA: تنبيه 2.5 ساعة، وسحب 3، والإجازات 22/24 · بعد 0.2، 1.13
27. [#83](https://github.com/Ziad-Sameh-OJO/places-erp/issues/83) **1.22** لوحة «مهامي النهارده» للسيلز والـ TL · بعد 1.7
28. [#84](https://github.com/Ziad-Sameh-OJO/places-erp/issues/84) **2.1** Schema الوحدة كاملة من `sources/inventory-unit-fields.md` بالأنواع (Rent / Resale / Income / Primary) + migration
29. [#85](https://github.com/Ziad-Sameh-OJO/places-erp/issues/85) **2.2** API الوحدات CRUD + الصلاحيات (منار ورندا) + كود U-101 · بعد 2.1
30. [#86](https://github.com/Ziad-Sameh-OJO/places-erp/issues/86) **2.3** حسابات الوحدة في الـ domain: الإجمالي، والـ Income (سنوي وعائد)، والتقسيم + تستات · بعد 2.1
31. [#87](https://github.com/Ziad-Sameh-OJO/places-erp/issues/87) **2.4** صور الوحدة (رفع وترتيب) · بعد 0.9، 2.2
32. [#88](https://github.com/Ziad-Sameh-OJO/places-erp/issues/88) **2.5** تابات المساحات (منار ورندا بيضيفوها بـ «+») · بعد 2.2
33. [#89](https://github.com/Ziad-Sameh-OJO/places-erp/issues/89) **2.6** واجهة القايمة والكروت والفلاتر · بعد 0.13، 2.2
34. [#90](https://github.com/Ziad-Sameh-OJO/places-erp/issues/90) **2.7** فورم الوحدة بحقول كل نوع · بعد 2.6
35. [#91](https://github.com/Ziad-Sameh-OJO/places-erp/issues/91) **2.8** PDF الوحدة والـ slide أوتوماتيك + تأكيد منار قبل الظهور + إعادة التأكيد بعد أي تعديل · بعد 0.10، 2.7
36. [#92](https://github.com/Ziad-Sameh-OJO/places-erp/issues/92) **2.9** `UnitsService.lock/release` + موافقة منار/رندا + Rent و Resale مع بعض (**الصفقات مستنياه**) · بعد 2.2
37. [#93](https://github.com/Ziad-Sameh-OJO/places-erp/issues/93) **2.10** صفحة المؤجّر/المباع بفلاتر · بعد 2.9

## Sprint 2

38. [#78](https://github.com/Ziad-Sameh-OJO/places-erp/issues/78) **1.17** جوب الـ No Answer اليومي + الروتيشن التالت للـ Telesales + طلب New Lead للأوبريشن · بعد 1.16
39. [#79](https://github.com/Ziad-Sameh-OJO/places-erp/issues/79) **1.18** تنبيه No Answer كل 4 ساعات + سؤال «بعت واتساب؟» · بعد 1.17
40. [#81](https://github.com/Ziad-Sameh-OJO/places-erp/issues/81) **1.20** شيت الشركات للـ Telesales: الشاشة، والكاتيجوريز، والإضافة، وتنبيه الشركة الجديدة · بعد 1.2
41. [#82](https://github.com/Ziad-Sameh-OJO/places-erp/issues/82) **1.21** تقرير الشركات اللي عقدها قرّب يخلص + استيراد أرشيف الكاتيجوريز · بعد 1.20
42. [#95](https://github.com/Ziad-Sameh-OJO/places-erp/issues/95) **2.12** ترشيح الوحدات: القاعدة في الـ domain (±20% مستني تأكيد) + أسئلة التضييق · بعد 2.2
43. [#96](https://github.com/Ziad-Sameh-OJO/places-erp/issues/96) **2.13** PDF لستة الوحدات للعميل + كومنت على الليد · بعد 1.3، 2.12
44. [#103](https://github.com/Ziad-Sameh-OJO/places-erp/issues/103) **3.1** Schema العميل/المالك + الربط بالليد والوحدة والصفقة · بعد 1.3
45. [#94](https://github.com/Ziad-Sameh-OJO/places-erp/issues/94) **2.11** المالك بيتعمل مع أول وحدة ليه، والوحدة مربوطة بيه · بعد 2.2، 3.1
46. [#104](https://github.com/Ziad-Sameh-OJO/places-erp/issues/104) **3.2** API ملف العميل: الأرقام، والوحدات، والصفقات، والعقود، وسجل التواصل، والمدفوع والمتبقي · بعد 3.1
47. [#105](https://github.com/Ziad-Sameh-OJO/places-erp/issues/105) **3.3** واجهة قايمة العملاء والملف · بعد 3.2
48. [#106](https://github.com/Ziad-Sameh-OJO/places-erp/issues/106) **3.4** الدمج بالموبايل بموافقة الأوبريشن + Audit · بعد 3.2
49. [#107](https://github.com/Ziad-Sameh-OJO/places-erp/issues/107) **3.5** الصلاحيات: السيلز مايشوفش أرقام الملاك، والمالية تقرا بس · بعد 3.2
50. [#108](https://github.com/Ziad-Sameh-OJO/places-erp/issues/108) **3.6** جوب Inactive بعد سنة + تقرير الملاك اللي محتاجين ابديت + موافقة التسويق + طلب مسح البيانات · بعد 0.2، 3.2
51. [#109](https://github.com/Ziad-Sameh-OJO/places-erp/issues/109) **4.1** Schema + API المهام: الأنواع، والمسؤول، والميعاد، والحالة، و Undo
52. [#110](https://github.com/Ziad-Sameh-OJO/places-erp/issues/110) **4.2** واجهة المهام Kanban · بعد 0.13، 4.1
53. [#111](https://github.com/Ziad-Sameh-OJO/places-erp/issues/111) **4.3** مهمة التصوير والـ Retouch بموافقة منار + الـ SLA (48/72 ساعة) · بعد 2.2، 4.1
54. [#112](https://github.com/Ziad-Sameh-OJO/places-erp/issues/112) **4.4** تنبيه التسويق مع كل وحدة جديدة + بورد التسويق · بعد 4.2
55. [#180](https://github.com/Ziad-Sameh-OJO/places-erp/issues/180) **12.1** الهيكل (`managerId` لكل موظف) من ملف الـ KPIs في الـ seed
56. [#181](https://github.com/Ziad-Sameh-OJO/places-erp/issues/181) **12.2** الـ Ops Head يعدّل صلاحيات فريقه بس + الـ HR تعمل وتوقف حسابات
57. [#182](https://github.com/Ziad-Sameh-OJO/places-erp/issues/182) **12.3** نقل شغل الموظف اللي ماشي بموافقة مديره · بعد 1.2، 4.1
58. [#183](https://github.com/Ziad-Sameh-OJO/places-erp/issues/183) **12.4** الـ OTP: «ابعت تاني» بعد دقيقة
59. [#185](https://github.com/Ziad-Sameh-OJO/places-erp/issues/185) **12.6** بحث المستخدمين بالموبايل والقسم
60. [#186](https://github.com/Ziad-Sameh-OJO/places-erp/issues/186) **12.7** القوايم: نشط / موقوف بدل المسح
61. [#187](https://github.com/Ziad-Sameh-OJO/places-erp/issues/187) **12.8** إعدادات كل قسم لمديره بس

## Sprint 3

62. [#99](https://github.com/Ziad-Sameh-OJO/places-erp/issues/99) **2.16** شغل فريق الانفنتوري: مهام سارة ومروة اليومية (حد 30)، ووقت الرفع على الدرايف · بعد 2.2
63. [#100](https://github.com/Ziad-Sameh-OJO/places-erp/issues/100) **2.17** جوب الوحدة اللي عدّى عليها شهر: تتحسب متأخرة وتتعمل مهمة متابعة مع المالك · بعد 0.2، 4.1
64. [#101](https://github.com/Ziad-Sameh-OJO/places-erp/issues/101) **2.18** التقرير اليومي للانفنتوري (السيستم بيطلّعه ومنار بتعتمده) · بعد 2.2
65. [#118](https://github.com/Ziad-Sameh-OJO/places-erp/issues/118) **5.1** Schema الصفقة كاملة: المشترين، والبائعين، والأنواع، والمبالغ، والـ note + migration · بعد 2.9
66. [#119](https://github.com/Ziad-Sameh-OJO/places-erp/issues/119) **5.2** API الصفقة: Done Deal ← مراجعة الـ Office Manager ← Approved · بعد 5.1
67. [#117](https://github.com/Ziad-Sameh-OJO/places-erp/issues/117) **4.9** Alarm الصفقة للتسويق بالبيانات المسموحة + رفع لوجو · بعد 5.2
68. [#120](https://github.com/Ziad-Sameh-OJO/places-erp/issues/120) **5.3** التحصيل الجزئي والكامل + حالاته · بعد 5.2
69. [#121](https://github.com/Ziad-Sameh-OJO/places-erp/issues/121) **5.4** الكوميشن بـ `splitDeal` + الـ Scheme لكل سيلز + موافقة منار على الـ Seller · بعد 5.3
70. [#122](https://github.com/Ziad-Sameh-OJO/places-erp/issues/122) **5.5** الصفقة بتقفل الوحدة وتنقلها للمؤجّر/المباع · بعد 2.9، 5.2
71. [#123](https://github.com/Ziad-Sameh-OJO/places-erp/issues/123) **5.6** Alarm الصفقة اللي اتقفلت تاني يوم + استبعادها من التارجت + الـ note · بعد 5.2
72. [#124](https://github.com/Ziad-Sameh-OJO/places-erp/issues/124) **5.7** إلغاء الصفقة يعكس الإيراد والـ achievements والكوميشن · بعد 5.4
73. [#125](https://github.com/Ziad-Sameh-OJO/places-erp/issues/125) **5.8** عمولة الـ TL بالشرايح + جدول الشرايح في الإعدادات · بعد 5.4
74. [#126](https://github.com/Ziad-Sameh-OJO/places-erp/issues/126) **5.9** واجهة الصفقات: القايمة، والفورم، والدروار، والتحصيل · بعد 0.13، 5.3
75. [#127](https://github.com/Ziad-Sameh-OJO/places-erp/issues/127) **5.10** داشبورد الإيرادات + صفحة Achievements + الترتيب · بعد 5.4
76. [#131](https://github.com/Ziad-Sameh-OJO/places-erp/issues/131) **5.14** تستات e2e بمثال الكلاينت (100,000 ← 25,000 / 25,000 / 50,000) · بعد 5.4
77. [#139](https://github.com/Ziad-Sameh-OJO/places-erp/issues/139) **7.1** ملف الموظف كامل: المرتب، والنوع، والشرايح الخاصة، والمواعيد الثابتة (Schema + شاشة)
78. [#140](https://github.com/Ziad-Sameh-OJO/places-erp/issues/140) **7.2** الحضور اليومي بالشرايح + الـ Weekly Delay + الخصم · بعد 7.1
79. [#141](https://github.com/Ziad-Sameh-OJO/places-erp/issues/141) **7.3** الـ Visit كحضور + نسي البصمة (تأكيد الـ HR) + الشغل من بره بعذر · بعد 1.9، 7.2
80. [#143](https://github.com/Ziad-Sameh-OJO/places-erp/issues/143) **7.5** الإجازات: طلب ← TL ← HR، والأرصدة، والتذكير والتصعيد، والمرضي بمستند · بعد 7.1
81. [#76](https://github.com/Ziad-Sameh-OJO/places-erp/issues/76) **1.15** السيلز اللي في إجازة يطلع من التوزيع · بعد 1.13، 7.5
82. [#144](https://github.com/Ziad-Sameh-OJO/places-erp/issues/144) **7.6** كالندر «مين إجازة النهارده» + تقرير الأرصدة الشهري · بعد 7.5
83. [#145](https://github.com/Ziad-Sameh-OJO/places-erp/issues/145) **7.7** الجزاءات · بعد 7.1
84. [#146](https://github.com/Ziad-Sameh-OJO/places-erp/issues/146) **7.8** الـ 1-to-1: الأسئلة، و«حل الـ HR» بميعاد و Alarm، والجلسة اللي فاتت · بعد 7.1
85. [#147](https://github.com/Ziad-Sameh-OJO/places-erp/issues/147) **7.9** شيت المرتبات يوم 30 (بعد الخصومات والـ KPIs) للمالية بعد موافقة الـ HR · بعد 7.2، 7.7
86. [#148](https://github.com/Ziad-Sameh-OJO/places-erp/issues/148) **7.10** شاشات: حضور النهارده، والتاريخ بالشخص والفترة، والـ Weekly Delay · بعد 7.2
87. [#149](https://github.com/Ziad-Sameh-OJO/places-erp/issues/149) **7.11** الموظف المثالي وصندوق الفريق كل شهر · بعد 7.2، 7.7
88. [#156](https://github.com/Ziad-Sameh-OJO/places-erp/issues/156) **9.1** شجرة الحسابات + الخزن والبنوك (Schema + API + شاشة)
89. [#157](https://github.com/Ziad-Sameh-OJO/places-erp/issues/157) **9.2** المصروفات على البنود + الـ Budget · بعد 9.1
90. [#158](https://github.com/Ziad-Sameh-OJO/places-erp/issues/158) **9.3** السلف والعهد والـ Petty cash + `FinanceService.recordExpense()` · بعد 9.1
91. [#159](https://github.com/Ziad-Sameh-OJO/places-erp/issues/159) **9.4** داشبورد المالية: الخزن، والبنوك، والسلف، والإيراد، وصافي الربح، والتوفير · بعد 9.2
92. [#188](https://github.com/Ziad-Sameh-OJO/places-erp/issues/188) **12.9** الإيميل من الـ worker + سجل الإرسال + تنبيه لما يفشل · بعد 0.2
93. [#189](https://github.com/Ziad-Sameh-OJO/places-erp/issues/189) **12.10** الـ Push notifications (PWA + VAPID) · بعد 0.4
94. [#190](https://github.com/Ziad-Sameh-OJO/places-erp/issues/190) **12.11** الجرس لحظي (WebSocket) + فلتر بالنوع

## Sprint 4

95. [#59](https://github.com/Ziad-Sameh-OJO/places-erp/issues/59) **0.11** تصدير Excel لأي جدول (component في الواجهة + endpoint مشترك)
96. [#60](https://github.com/Ziad-Sameh-OJO/places-erp/issues/60) **0.12** استيراد Excel مشترك: رفع ← معاينة ← أخطاء ← تأكيد (ExcelJS)
97. [#80](https://github.com/Ziad-Sameh-OJO/places-erp/issues/80) **1.19** الرفع الجماعي: شيت ← معاينة ← موافقة الأوبريشن ← توزيع بالتساوي · بعد 0.12، 1.13
98. [#97](https://github.com/Ziad-Sameh-OJO/places-erp/issues/97) **2.14** Not Active: رفع الشيت + الصفوف + منع التكرار · بعد 0.12
99. [#98](https://github.com/Ziad-Sameh-OJO/places-erp/issues/98) **2.15** Not Active: التابات، و feedback للـ Not True، والـ Done يفتح فورم وحدة، و Alarm لمنار، والمقارنة بالانفنتوري · بعد 2.14
100. [#113](https://github.com/Ziad-Sameh-OJO/places-erp/issues/113) **4.5** الحملات: CRUD + التكلفة
101. [#114](https://github.com/Ziad-Sameh-OJO/places-erp/issues/114) **4.6** داشبورد Channel ← حملة ← بوست، بالنسب والفلاتر · بعد 1.5، 4.5
102. [#115](https://github.com/Ziad-Sameh-OJO/places-erp/issues/115) **4.7** الـ Content plan: كالندر البوستات + وقت النشر الفعلي + Reminder · بعد 4.5
103. [#116](https://github.com/Ziad-Sameh-OJO/places-erp/issues/116) **4.8** البرودكاست: مهمة للسيلز + Done/share + Hot Inventory مرتين في الأسبوع + الحد اليومي · بعد 4.1
104. [#128](https://github.com/Ziad-Sameh-OJO/places-erp/issues/128) **5.11** تصدير تفاصيل الصفقة لكل سيلز · بعد 0.11، 5.4
105. [#129](https://github.com/Ziad-Sameh-OJO/places-erp/issues/129) **5.12** الـ TCR: رقم تسلسلي، والتوقيعات بالترتيب، و TCR جديدة مع كل تحصيل · بعد 5.3
106. [#130](https://github.com/Ziad-Sameh-OJO/places-erp/issues/130) **5.13** PDF الـ TCR · بعد 0.10، 5.12
107. [#132](https://github.com/Ziad-Sameh-OJO/places-erp/issues/132) **6.1** Schema + API العقد وجدول الأقساط · بعد 5.3
108. [#133](https://github.com/Ziad-Sameh-OJO/places-erp/issues/133) **6.2** واجهة العقود والأقساط + الكالندر · بعد 6.1
109. [#134](https://github.com/Ziad-Sameh-OJO/places-erp/issues/134) **6.3** جوب التجديد 90/60/30 + ليد تجديد أوتوماتيك · بعد 0.2، 6.1
110. [#135](https://github.com/Ziad-Sameh-OJO/places-erp/issues/135) **6.4** الإنهاء المبكر والانتهاء يرجّعوا الوحدة + تغيير القيمة بموافقة + الزيادة السنوية · بعد 2.9، 6.1
111. [#150](https://github.com/Ziad-Sameh-OJO/places-erp/issues/150) **7.12** رفع شيت البصمة: ربط الأسامي، ومنع التكرار، واستكمال الأيام · بعد 0.12، 7.2
112. [#151](https://github.com/Ziad-Sameh-OJO/places-erp/issues/151) **7.13** agent جهاز البصمة (بعد ما الكلاينت يحدد نوع الجهاز) · بعد 7.12
113. [#152](https://github.com/Ziad-Sameh-OJO/places-erp/issues/152) **8.1** Schema + API التذاكر: الأنواع ومسار كل نوع، والأولوية، والتحويل بالتاريخ
114. [#102](https://github.com/Ziad-Sameh-OJO/places-erp/issues/102) **2.19** طلب List من الـ TL كتذكرة لمروة (24 ساعة) · بعد 8.1
115. [#142](https://github.com/Ziad-Sameh-OJO/places-erp/issues/142) **7.4** الـ Excuse: تذكرة للـ TL ثم الـ HR، واتنين مجاناً، والتالت والرابع نص يوم، والخامس رفد · بعد 7.2، 8.1
116. [#153](https://github.com/Ziad-Sameh-OJO/places-erp/issues/153) **8.2** واجهة التذاكر · بعد 8.1
117. [#154](https://github.com/Ziad-Sameh-OJO/places-erp/issues/154) **8.3** جوب الـ SLA والتصعيد (24 ساعة، و4 للعالية، والنزاع 48 وتنبيه نانسي) · بعد 0.2، 8.1
118. [#155](https://github.com/Ziad-Sameh-OJO/places-erp/issues/155) **8.4** تقرير سرعة الرد لكل قسم · بعد 8.1
119. [#160](https://github.com/Ziad-Sameh-OJO/places-erp/issues/160) **9.5** القيود والأرصدة الافتتاحية · بعد 9.1
120. [#161](https://github.com/Ziad-Sameh-OJO/places-erp/issues/161) **9.6** الترحيل الأوتوماتيك: التحصيل، وتكاليف الصفقة، والمرتبات، والمشتريات، والإلغاء · بعد 5.3، 7.9، 9.5
121. [#162](https://github.com/Ziad-Sameh-OJO/places-erp/issues/162) **9.7** قايمة الدخل والميزانية وصافي الربح + drill-down · بعد 9.6
122. [#163](https://github.com/Ziad-Sameh-OJO/places-erp/issues/163) **9.8** تقفيل الشهر والربع + التعديل اليدوي لشخص واحد + تسوية العهدة الأسبوعية · بعد 9.5
123. [#164](https://github.com/Ziad-Sameh-OJO/places-erp/issues/164) **9.9** المصروف مقابل الـ Budget + التصدير · بعد 0.11، 9.2
124. [#178](https://github.com/Ziad-Sameh-OJO/places-erp/issues/178) **11.9** بيانات البنود الناقصة: عينة Second Call، وعدّاد إعلانات الويبسايت، والـ Farming، والمنافسين، والـ 500م · بعد 1.10
125. [#179](https://github.com/Ziad-Sameh-OJO/places-erp/issues/179) **11.10** محرك التقارير المتجدولة (الأحد ويوم 1) + تقرير الأداء الشهري · بعد 0.2، 0.11
126. [#184](https://github.com/Ziad-Sameh-OJO/places-erp/issues/184) **12.5** الـ Audit Log: تصدير، وفلتر بالتاريخ والشخص، والجهاز + تقرير الصلاحيات + تنبيه الـ Super Admin · بعد 0.11

## Sprint 5

127. [#136](https://github.com/Ziad-Sameh-OJO/places-erp/issues/136) **6.5** تسجيل الدفعات + المتأخرات (aging) + تقرير التحصيل · بعد 6.1
128. [#137](https://github.com/Ziad-Sameh-OJO/places-erp/issues/137) **6.6** تذكير القسط قبلها بـ 3 أيام + تنبيه المتأخر + تصعيد بعد 7 أيام · بعد 0.2، 6.5
129. [#138](https://github.com/Ziad-Sameh-OJO/places-erp/issues/138) **6.7** فاتورة/إيصال PDF · بعد 0.10، 6.5
130. [#165](https://github.com/Ziad-Sameh-OJO/places-erp/issues/165) **9.10** الـ Cost Center: تكلفة الحملة على الليدز المؤهلة وعلى كل صفقة · بعد 4.5، 9.6
131. [#166](https://github.com/Ziad-Sameh-OJO/places-erp/issues/166) **10.1** Schema + API الطلب: الموافقات بالحدود، ومختار مايوافقش على طلبه، وتغيير المبلغ بموافقة · بعد 9.3
132. [#167](https://github.com/Ziad-Sameh-OJO/places-erp/issues/167) **10.2** المرفقات الإجبارية فوق 10,000 + سقف العهدة + الدفع ← `recordExpense` · بعد 9.3، 10.1
133. [#168](https://github.com/Ziad-Sameh-OJO/places-erp/issues/168) **10.3** واجهة المشتريات + تذكير المعتمد + تقرير البنود + الموردين · بعد 10.1
134. [#169](https://github.com/Ziad-Sameh-OJO/places-erp/issues/169) **10.4** سجل أصول المكتب + جدول الـ Office Boys بالمناطق
135. [#170](https://github.com/Ziad-Sameh-OJO/places-erp/issues/170) **11.1** Schema الكروت (البنود، والأوزان، والمصدر، والمتابع، والـ Baseline) + seed كروت Q4 من الملف
136. [#171](https://github.com/Ziad-Sameh-OJO/places-erp/issues/171) **11.2** «كارتي» للموظف + تسجيل التسليمات · بعد 11.1
137. [#172](https://github.com/Ziad-Sameh-OJO/places-erp/issues/172) **11.3** «فريقي» للمتابع: تعديل البنود، واليدوي، وخطة التحسين، والاعتماد · بعد 11.1
138. [#173](https://github.com/Ziad-Sameh-OJO/places-erp/issues/173) **11.4** «كل الشركة»: إعدادات الفلوس لكل موظف + الشرايح + قفل الربع · بعد 11.1
139. [#174](https://github.com/Ziad-Sameh-OJO/places-erp/issues/174) **11.5** جوب حساب البنود الأوتوماتيك كل يوم من الموديولات · بعد كل اللي قبله
140. [#175](https://github.com/Ziad-Sameh-OJO/places-erp/issues/175) **11.6** التنبيهات (نص الربع، وتحت 70% خطة تحسين، وتحت 50%) + البونص والخصم في المرتبات · بعد 7.9، 11.5
141. [#176](https://github.com/Ziad-Sameh-OJO/places-erp/issues/176) **11.7** الورقة الربع سنوية PDF بعد موافقة الـ Office Manager · بعد 0.10، 11.5
142. [#177](https://github.com/Ziad-Sameh-OJO/places-erp/issues/177) **11.8** تارجت شهري لكل سيلز وفريق + تقرير الـ TL + الـ Transactions + الترتيب · بعد 5.4

## التسليم (UAT والإطلاق)

143. [#191](https://github.com/Ziad-Sameh-OJO/places-erp/issues/191) **13.1** قوالب Excel + استيراد الوحدات والشركات والليدز القديمة بمنع التكرار · بعد 0.12، 1.20، 2.2
144. [#192](https://github.com/Ziad-Sameh-OJO/places-erp/issues/192) **13.2** تجربة الاستيراد على شيتات الكلاينت الحقيقية · بعد 13.1
145. [#193](https://github.com/Ziad-Sameh-OJO/places-erp/issues/193) **13.3** مراجعة أمان قبل الإطلاق + أداء (الصفحات التقيلة والـ indexes)
146. [#194](https://github.com/Ziad-Sameh-OJO/places-erp/issues/194) **13.4** تستات المتصفح (Playwright) لسيناريو الجولة السريعة بتاعة الديمو
147. [#195](https://github.com/Ziad-Sameh-OJO/places-erp/issues/195) **13.5** UAT: سيناريو لكل موديول + جلسات مع الكلاينت + تصليح الملاحظات · بعد كل اللي قبله
148. [#196](https://github.com/Ziad-Sameh-OJO/places-erp/issues/196) **13.6** تدريب لكل قسم + دليل استخدام مختصر · بعد كل اللي قبله
149. [#197](https://github.com/Ziad-Sameh-OJO/places-erp/issues/197) **13.7** الإطلاق: سيرفر production، والدومين، والباك أب، والمراقبة، ونقل البيانات · بعد كل اللي قبله
150. [#198](https://github.com/Ziad-Sameh-OJO/places-erp/issues/198) **13.8** ترقية الإصدارات الكبيرة: TypeScript 6 (#34)، و Prisma 7، و ESLint 10
