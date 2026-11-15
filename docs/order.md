# ترتيب الشغل

الـ 244 issue بالترتيب اللي المفروض يتعملوا بيه. مفيش تاسك جاي قبل حاجة محتاجها.
لو أكتر من حد شغال: خد أول تاسك في اللستة لسه محدش ماسكه، و «بعد» بتاعه خلص.
الملف ده بيتولّد من `scripts/tasks.py`.


## Sprint 1

1. [#49](https://github.com/Ziad-Sameh-OJO/places-erp/issues/49) **0.1** Redis محلي (docker-compose + أمر `pnpm redis:local` من غير Docker)
2. [#50](https://github.com/Ziad-Sameh-OJO/places-erp/issues/50) **0.2** الـ worker يقوم مع `pnpm dev` ويقرا `.env` ويسجّل الجوبز بتوقيت القاهرة · بعد 0.1
3. [#51](https://github.com/Ziad-Sameh-OJO/places-erp/issues/51) **0.3** Redis في الـ CI + خطوة تتأكد إن الـ worker قام · بعد 0.2
4. [#57](https://github.com/Ziad-Sameh-OJO/places-erp/issues/57) **0.9** رفع الملفات: S3/MinIO + روابط pre-signed (`core/files`)
5. [#58](https://github.com/Ziad-Sameh-OJO/places-erp/issues/58) **0.10** PDF بالعربي بـ Playwright (`core/documents`) + قالب أساسي بلوجو Places
6. [#59](https://github.com/Ziad-Sameh-OJO/places-erp/issues/59) **0.11** تصدير Excel لأي جدول (component في الواجهة + endpoint مشترك)
7. [#60](https://github.com/Ziad-Sameh-OJO/places-erp/issues/60) **0.12** استيراد Excel مشترك: رفع ← معاينة ← أخطاء ← تأكيد (ExcelJS)
8. [#61](https://github.com/Ziad-Sameh-OJO/places-erp/issues/61) **0.13** كومبوننتس الواجهة من الديمو: Drawer (bottom sheet على الموبايل)، و Stepper، و Kanban، و KPI tile، وزرار «جديد» (FAB)
9. [#399](https://github.com/Ziad-Sameh-OJO/places-erp/issues/399) **0.14** القايمة الجانبية: «المفضلة» و«فتحتها مؤخراً»
10. [#400](https://github.com/Ziad-Sameh-OJO/places-erp/issues/400) **0.15** ترتيب أي جدول بالدوسة على عنوان العمود
11. [#402](https://github.com/Ziad-Sameh-OJO/places-erp/issues/402) **0.17** البحث السريع في كل السيستم (⌘K / «/»)
12. [#62](https://github.com/Ziad-Sameh-OJO/places-erp/issues/62) **1.1** Schema الليد: الحقول الناقصة (وقت الوصول، الـ Visit، الوحدات المرشّحة…) + migration
13. [#63](https://github.com/Ziad-Sameh-OJO/places-erp/issues/63) **1.2** API قايمة الليدز بنطاق البيانات (السيلز / الـ TL / الأوبريشن) + الفلاتر · بعد 1.1
14. [#64](https://github.com/Ziad-Sameh-OJO/places-erp/issues/64) **1.3** API تفاصيل الليد + سجل الأنشطة + الكومنتات · بعد 1.1
15. [#65](https://github.com/Ziad-Sameh-OJO/places-erp/issues/65) **1.4** الـ Telesales: تعمل ليد ويفضل عندها، ومايظهرلهاش بعد ما يروح لسيلز · بعد 1.2
16. [#66](https://github.com/Ziad-Sameh-OJO/places-erp/issues/66) **1.5** الليد المكرر: كل وصول يتسجّل للحملة + شاشة الأوبريشن تقارن الاتنين وتختار · بعد 1.2
17. [#67](https://github.com/Ziad-Sameh-OJO/places-erp/issues/67) **1.6** واجهة القايمة: جدول + فلاتر + Kanban بلون الـ SLA · بعد 0.13، 1.2
18. [#68](https://github.com/Ziad-Sameh-OJO/places-erp/issues/68) **1.7** واجهة دروار الليد: البيانات، والـ stepper، والأنشطة، وتغيير المرحلة · بعد 1.3
19. [#69](https://github.com/Ziad-Sameh-OJO/places-erp/issues/69) **1.8** فورم ليد جديد من زرار «جديد» · بعد 1.6
20. [#401](https://github.com/Ziad-Sameh-OJO/places-erp/issues/401) **0.16** زرار «جديد» عام من أي صفحة: ليد، صفقة، وحدة، تذكرة، إجازة… · بعد 1.8
21. [#70](https://github.com/Ziad-Sameh-OJO/places-erp/issues/70) **1.9** الـ Visit / Meeting: النوع + وحدات ببحث + ميعاد + Alarm + Done + نقل المرحلة أوتوماتيك · بعد 1.7
22. [#71](https://github.com/Ziad-Sameh-OJO/places-erp/issues/71) **1.10** سجل المكالمات، ووقت وصول الليد، وأول مكالمة خلال 30 دقيقة · بعد 1.3
23. [#72](https://github.com/Ziad-Sameh-OJO/places-erp/issues/72) **1.11** تستات e2e: نطاق البيانات، والتكرار، والـ Qualified · بعد 1.5
24. [#73](https://github.com/Ziad-Sameh-OJO/places-erp/issues/73) **1.12** إعدادات التوزيع: مين بيغطي أنهي منطقة (API + شاشة)
25. [#74](https://github.com/Ziad-Sameh-OJO/places-erp/issues/74) **1.13** التوزيع الأوتوماتيك بالـ `LeadRouter` مع إنشاء الليد + إشعار `lead.assigned` · بعد 1.12
26. [#75](https://github.com/Ziad-Sameh-OJO/places-erp/issues/75) **1.14** التعيين والسحب باليد (الأوبريشن ومدير المبيعات والإدارة) · بعد 1.13
27. [#83](https://github.com/Ziad-Sameh-OJO/places-erp/issues/83) **1.22** لوحة «مهامي النهارده» للسيلز والـ TL · بعد 1.7
28. [#222](https://github.com/Ziad-Sameh-OJO/places-erp/issues/222) **1.25** تاب Logs في الليد بصلاحية يختارها الأدمن · بعد 1.7
29. [#225](https://github.com/Ziad-Sameh-OJO/places-erp/issues/225) **1.28** نوع الليد Client / Broker + تاب البروكرز + الفلاتر في كل التابات · بعد 1.6
30. [#226](https://github.com/Ziad-Sameh-OJO/places-erp/issues/226) **1.29** صفحة «قواعد الليدز والتوزيع»: كل المواعيد والمسؤولين بيتعدّلوا + كالندر الإجازات بمدة · بعد 1.12
31. [#77](https://github.com/Ziad-Sameh-OJO/places-erp/issues/77) **1.16** جوب الـ SLA: التنبيه والسحب بمواعيد ومسؤولين من «قواعد الليدز» + الإجازات الرسمية بمدة · بعد 0.2، 1.13، 1.29
32. [#223](https://github.com/Ziad-Sameh-OJO/places-erp/issues/223) **1.26** الـ Draft: سحب الليد اللي من غير أكشن 7 أيام (Hold 14) + تاب للأوبريشن + التوزيع منه · بعد 1.14، 1.16، 1.29
33. [#224](https://github.com/Ziad-Sameh-OJO/places-erp/issues/224) **1.27** الـ Draft Admin: كل Not Interested و Cancellation + Alarm يومي للأوبريشن + القرار · بعد 1.26
34. [#404](https://github.com/Ziad-Sameh-OJO/places-erp/issues/404) **1.30** فورم الليد الجديد: «بتروح لـ: …» بعد اختيار المنطقة · بعد 1.12
35. [#405](https://github.com/Ziad-Sameh-OJO/places-erp/issues/405) **1.31** جدول الليدز: اسم الشركة تحت اسم العميل · بعد 1.6
36. [#407](https://github.com/Ziad-Sameh-OJO/places-erp/issues/407) **1.33** ملاحظة الـ Team Leader على الليد، والسيلز بيتبلّغ · بعد 1.7
37. [#408](https://github.com/Ziad-Sameh-OJO/places-erp/issues/408) **1.34** «مهامي النهارده» للّيدز: السطور الناقصة · بعد 1.22
38. [#84](https://github.com/Ziad-Sameh-OJO/places-erp/issues/84) **2.1** Schema الوحدة كاملة من `sources/inventory-unit-fields.md` بالأنواع (Rent / Resale / Income / Primary) + migration
39. [#85](https://github.com/Ziad-Sameh-OJO/places-erp/issues/85) **2.2** API الوحدات CRUD + الصلاحيات (منار ورندا) + كود U-101 · بعد 2.1
40. [#86](https://github.com/Ziad-Sameh-OJO/places-erp/issues/86) **2.3** حسابات الوحدة في الـ domain: الإجمالي، والـ Income (سنوي وعائد)، والتقسيم + تستات · بعد 2.1
41. [#87](https://github.com/Ziad-Sameh-OJO/places-erp/issues/87) **2.4** صور الوحدة (رفع وترتيب) · بعد 0.9، 2.2
42. [#88](https://github.com/Ziad-Sameh-OJO/places-erp/issues/88) **2.5** تابات المساحات (منار ورندا بيضيفوها بـ «+») · بعد 2.2
43. [#89](https://github.com/Ziad-Sameh-OJO/places-erp/issues/89) **2.6** واجهة القايمة والكروت والفلاتر · بعد 0.13، 2.2
44. [#90](https://github.com/Ziad-Sameh-OJO/places-erp/issues/90) **2.7** فورم الوحدة بحقول كل نوع · بعد 2.6
45. [#91](https://github.com/Ziad-Sameh-OJO/places-erp/issues/91) **2.8** PDF الوحدة والـ slide أوتوماتيك + تأكيد منار قبل الظهور + إعادة التأكيد بعد أي تعديل · بعد 0.10، 2.7
46. [#92](https://github.com/Ziad-Sameh-OJO/places-erp/issues/92) **2.9** `UnitsService.lock/release` + موافقة منار/رندا + Rent و Resale مع بعض (**الصفقات مستنياه**) · بعد 2.2
47. [#93](https://github.com/Ziad-Sameh-OJO/places-erp/issues/93) **2.10** صفحة المؤجّر/المباع بفلاتر · بعد 2.9
48. [#360](https://github.com/Ziad-Sameh-OJO/places-erp/issues/360) **2.20** البيانات الناقصة في الوحدة: تنبيه لحد ما تتكمّل · بعد 2.7
49. [#364](https://github.com/Ziad-Sameh-OJO/places-erp/issues/364) **2.21** شيت الـ Rent زي شيت الكلاينت: الأعمدة وترتيبها، ومفيش خانة إجبارية، وحقول الـ PDF · بعد 2.7
50. [#365](https://github.com/Ziad-Sameh-OJO/places-erp/issues/365) **2.22** فولدر Pic & Info: تحميل ملف أو الفولدر كله ZIP، والترتيب وصورة الغلاف · بعد 2.4، 2.21
51. [#366](https://github.com/Ziad-Sameh-OJO/places-erp/issues/366) **2.23** الـ PDF والـ slide بشكل ملفات الكلاينت + تنزيل PowerPoint · بعد 2.8، 2.22
52. [#367](https://github.com/Ziad-Sameh-OJO/places-erp/issues/367) **2.24** صلاحيات الانفنتوري: منار من غير «العملاء والملاك»، وفريق الانفنتوري يفتح الوحدات · بعد 2.2
53. [#409](https://github.com/Ziad-Sameh-OJO/places-erp/issues/409) **2.25** تاب الـ PDF: صورة صغيرة للغلاف وصفحة المواصفات · بعد 2.23
54. [#410](https://github.com/Ziad-Sameh-OJO/places-erp/issues/410) **2.26** دروار الوحدة: تاب Location بكارت خريطة · بعد 2.21
55. [#411](https://github.com/Ziad-Sameh-OJO/places-erp/issues/411) **2.27** فورم الوحدة: اختيار اللوكيشن من الخريطة · بعد 2.26
56. [#412](https://github.com/Ziad-Sameh-OJO/places-erp/issues/412) **2.28** تصدير شيت الوحدات Excel · بعد 0.11
57. [#415](https://github.com/Ziad-Sameh-OJO/places-erp/issues/415) **2.31** ملف الـ Agreement لوحدة الـ Income · بعد 2.22
58. [#446](https://github.com/Ziad-Sameh-OJO/places-erp/issues/446) **2.33** شيت الـ Rent زي شيت Book (9 نوفمبر): ترتيب الأعمدة، و Location في مكان واحد · بعد 2.21
59. [#447](https://github.com/Ziad-Sameh-OJO/places-erp/issues/447) **2.34** اللوكيشن لينك Google Maps بيظهر نفسه، وبيتعدّل من صفحة الوحدة، وتاب Location اتشال · بعد 2.26، 2.27
60. [#448](https://github.com/Ziad-Sameh-OJO/places-erp/issues/448) **2.35** Layout file: فولدر ملفات لكل وحدة (PDF · DWG · صور) بدل Yes/No · بعد 0.9، 2.22
61. [#449](https://github.com/Ziad-Sameh-OJO/places-erp/issues/449) **2.36** Contact و Number و Agent بيظهروا لمنار (Inventory Manager) بس · بعد 2.24، 2.28
62. [#450](https://github.com/Ziad-Sameh-OJO/places-erp/issues/450) **2.37** كروت ملخص الانفنتوري لمنار بس · بعد 2.6
63. [#451](https://github.com/Ziad-Sameh-OJO/places-erp/issues/451) **2.38** استيراد Excel للانفنتوري: منع التكرار بخانات يختارها اللي بيرفع، و«ضيفها برضه» · بعد 0.12
64. [#537](https://github.com/Ziad-Sameh-OJO/places-erp/issues/537) **14.4** سطر الليد والـ Overview: الشركة والسيلز والـ Channel والمساحة والمنطقة والبوست
65. [#538](https://github.com/Ziad-Sameh-OJO/places-erp/issues/538) **14.5** المراحل تتبسط: شيل Follow up to/after visit/meeting، وتابات المراحل من غير Qualified
66. [#539](https://github.com/Ziad-Sameh-OJO/places-erp/issues/539) **14.6** فلاتر الليدز: سيلز أكتر من واحد، والتيم، والـ Channel، والمنطقة، والنوع (Commercial/Residential/Admin office)، والأرشيف
67. [#540](https://github.com/Ziad-Sameh-OJO/places-erp/issues/540) **14.7** تحويل الليد: القديم مايشوفهاش، واختيار إن الجديد يشوف الكومنتات القديمة، والأدمن بيشوف الكل، والتيم ليدر جوه تيمه

## Sprint 2

68. [#78](https://github.com/Ziad-Sameh-OJO/places-erp/issues/78) **1.17** جوب الـ No Answer (24 ساعة لكل سيلز) + الروتيشن التالت للـ Telesales + طلب New Lead للأوبريشن · بعد 1.16
69. [#79](https://github.com/Ziad-Sameh-OJO/places-erp/issues/79) **1.18** تنبيه No Answer كل 4 ساعات + سؤال «بعت واتساب؟» · بعد 1.17
70. [#80](https://github.com/Ziad-Sameh-OJO/places-erp/issues/80) **1.19** الرفع الجماعي: شيت ← معاينة ← موافقة الأوبريشن ← توزيع بالتساوي · بعد 0.12، 1.13
71. [#81](https://github.com/Ziad-Sameh-OJO/places-erp/issues/81) **1.20** شيت الشركات للـ Telesales: الشاشة، والكاتيجوريز، والإضافة، وتنبيه الشركة الجديدة · بعد 1.2
72. [#82](https://github.com/Ziad-Sameh-OJO/places-erp/issues/82) **1.21** تقرير الشركات اللي عقدها قرّب يخلص + استيراد أرشيف الكاتيجوريز · بعد 1.20
73. [#95](https://github.com/Ziad-Sameh-OJO/places-erp/issues/95) **2.12** ترشيح الوحدات: القاعدة في الـ domain (±20% مستني تأكيد) + أسئلة التضييق · بعد 2.2
74. [#96](https://github.com/Ziad-Sameh-OJO/places-erp/issues/96) **2.13** PDF لستة الوحدات للعميل + كومنت على الليد · بعد 1.3، 2.12
75. [#97](https://github.com/Ziad-Sameh-OJO/places-erp/issues/97) **2.14** Not Active: رفع الشيت + الصفوف + منع التكرار · بعد 0.12
76. [#98](https://github.com/Ziad-Sameh-OJO/places-erp/issues/98) **2.15** Not Active: التابات، و feedback للـ Not True، والـ Done يفتح فورم وحدة، و Alarm لمنار، والمقارنة بالانفنتوري · بعد 2.14
77. [#413](https://github.com/Ziad-Sameh-OJO/places-erp/issues/413) **2.29** «ابديت مع المالك النهارده» بدوسة، وبتقفل مهمة المتابعة · بعد 2.15
78. [#452](https://github.com/Ziad-Sameh-OJO/places-erp/issues/452) **2.39** Not Active: ملفات بأسامي في فولدرات، والشيت بيترفع جوه الملف · بعد 2.14، 2.15
79. [#453](https://github.com/Ziad-Sameh-OJO/places-erp/issues/453) **2.40** Not Active: منع التكرار بخانة أو أكتر وقت الرفع، والمكرر يدخل متعلّم أو يتساب · بعد 2.39
80. [#103](https://github.com/Ziad-Sameh-OJO/places-erp/issues/103) **3.1** Schema العميل/المالك + الربط بالليد والوحدة والصفقة · بعد 1.3
81. [#94](https://github.com/Ziad-Sameh-OJO/places-erp/issues/94) **2.11** المالك بيتعمل مع أول وحدة ليه، والوحدة مربوطة بيه · بعد 2.2، 3.1
82. [#104](https://github.com/Ziad-Sameh-OJO/places-erp/issues/104) **3.2** API ملف العميل: الأرقام، والوحدات، والصفقات، والعقود، وسجل التواصل، والمدفوع والمتبقي · بعد 3.1
83. [#105](https://github.com/Ziad-Sameh-OJO/places-erp/issues/105) **3.3** واجهة قايمة العملاء والملف · بعد 3.2
84. [#106](https://github.com/Ziad-Sameh-OJO/places-erp/issues/106) **3.4** الدمج بالموبايل بموافقة الأوبريشن + Audit · بعد 3.2
85. [#107](https://github.com/Ziad-Sameh-OJO/places-erp/issues/107) **3.5** الصلاحيات: السيلز مايشوفش أرقام الملاك، والمالية تقرا بس · بعد 3.2
86. [#108](https://github.com/Ziad-Sameh-OJO/places-erp/issues/108) **3.6** جوب Inactive بعد سنة + تقرير الملاك اللي محتاجين ابديت + موافقة التسويق + طلب مسح البيانات · بعد 0.2، 3.2
87. [#417](https://github.com/Ziad-Sameh-OJO/places-erp/issues/417) **3.7** ملف العميل: «افتح» لوحداته وعقوده · بعد 3.3
88. [#109](https://github.com/Ziad-Sameh-OJO/places-erp/issues/109) **4.1** Schema + API المهام: الأنواع، والمسؤول، والميعاد، والحالة، و Undo
89. [#110](https://github.com/Ziad-Sameh-OJO/places-erp/issues/110) **4.2** واجهة المهام Kanban · بعد 0.13، 4.1
90. [#111](https://github.com/Ziad-Sameh-OJO/places-erp/issues/111) **4.3** مهمة التصوير والـ Retouch بموافقة منار + الـ SLA (48/72 ساعة) · بعد 2.2، 4.1
91. [#414](https://github.com/Ziad-Sameh-OJO/places-erp/issues/414) **2.30** دروار الوحدة: تاب «المهام» (تصوير، Retouch، ابعتها لرندا) · بعد 4.3
92. [#112](https://github.com/Ziad-Sameh-OJO/places-erp/issues/112) **4.4** تنبيه التسويق مع كل وحدة جديدة + بورد التسويق · بعد 4.2
93. [#418](https://github.com/Ziad-Sameh-OJO/places-erp/issues/418) **4.10** مهمة التصوير: تنبيه «إديته وحدة النهارده قبل كده» · بعد 4.3
94. [#420](https://github.com/Ziad-Sameh-OJO/places-erp/issues/420) **4.12** مهمة الـ Retouch بتحمل صور الوحدة للديزاينر · بعد 2.22، 4.3
95. [#455](https://github.com/Ziad-Sameh-OJO/places-erp/issues/455) **4.14** صفحة المهام: «مهام الفريق» و«مهام لناس خارجية» في قسمين · بعد 4.2
96. [#456](https://github.com/Ziad-Sameh-OJO/places-erp/issues/456) **4.15** المهمة: «تتحسب في الـ KPIs؟» (Skip افتراضي) ← بند «المهام في ميعادها» · بعد 4.14
97. [#457](https://github.com/Ziad-Sameh-OJO/places-erp/issues/457) **4.16** مهام التصوير والـ Retouch بتوصل بكود الوحدة وملاحظات منار بس · بعد 4.3
98. [#180](https://github.com/Ziad-Sameh-OJO/places-erp/issues/180) **12.1** الهيكل (`managerId` لكل موظف) من ملف الـ KPIs في الـ seed
99. [#181](https://github.com/Ziad-Sameh-OJO/places-erp/issues/181) **12.2** الـ Ops Head يعدّل صلاحيات فريقه بس + الـ HR تعمل وتوقف حسابات
100. [#182](https://github.com/Ziad-Sameh-OJO/places-erp/issues/182) **12.3** نقل شغل الموظف اللي ماشي بموافقة مديره · بعد 1.2، 4.1
101. [#183](https://github.com/Ziad-Sameh-OJO/places-erp/issues/183) **12.4** الـ OTP: «ابعت تاني» بعد دقيقة
102. [#184](https://github.com/Ziad-Sameh-OJO/places-erp/issues/184) **12.5** الـ Audit Log: تصدير، وفلتر بالتاريخ والشخص، والجهاز + تقرير الصلاحيات + تنبيه الـ Super Admin · بعد 0.11
103. [#185](https://github.com/Ziad-Sameh-OJO/places-erp/issues/185) **12.6** بحث المستخدمين بالموبايل والقسم
104. [#186](https://github.com/Ziad-Sameh-OJO/places-erp/issues/186) **12.7** القوايم: نشط / موقوف بدل المسح
105. [#187](https://github.com/Ziad-Sameh-OJO/places-erp/issues/187) **12.8** إعدادات كل قسم لمديره بس
106. [#250](https://github.com/Ziad-Sameh-OJO/places-erp/issues/250) **12.12** الختم والإمضا + الجهات (لوجو وبيانات بنك) + قوالب المستندات · بعد 0.9، 0.10
107. [#431](https://github.com/Ziad-Sameh-OJO/places-erp/issues/431) **12.13** تاب المستخدمين: كروت العدد، والـ reset للمقفول · بعد 12.6
108. [#433](https://github.com/Ziad-Sameh-OJO/places-erp/issues/433) **12.15** صفحة «حسابي»: الموبايل، والقسم، والـ TL، وآخر دخول، وآخر تغيير باسورد · بعد 12.4
109. [#541](https://github.com/Ziad-Sameh-OJO/places-erp/issues/541) **14.8** سجل الوحدات على الليد بالمراحل: List ← Visits ← Short list ← Meeting
110. [#542](https://github.com/Ziad-Sameh-OJO/places-erp/issues/542) **14.9** الـ List of options: اختيار العميل ولوجو العميل اختياري، ويتسجّل في الـ Activity · بعد 14.8
111. [#543](https://github.com/Ziad-Sameh-OJO/places-erp/issues/543) **14.10** الـ Visits: Visit ولا Meeting، الميعاد، الوحدات من الانفنتوري أو بالكتابة، و Done بيسجّل Showing · بعد 14.8
112. [#544](https://github.com/Ziad-Sameh-OJO/places-erp/issues/544) **14.11** الـ Recommendations: اللي اتزار يطلع فوق، وترشيح يدوي من الانفنتوري بسيرش وفلتر مساحة · بعد 14.10
113. [#548](https://github.com/Ziad-Sameh-OJO/places-erp/issues/548) **14.15** المهام جوه التيم: القسم، والمهمة، والوحدة اختيارية، وميعاد، وتتحسب في الـ KPIs ولا لأ

## Sprint 3

114. [#99](https://github.com/Ziad-Sameh-OJO/places-erp/issues/99) **2.16** شغل فريق الانفنتوري: مهام سارة ومروة اليومية (حد 30)، ووقت الرفع على الدرايف · بعد 2.2
115. [#100](https://github.com/Ziad-Sameh-OJO/places-erp/issues/100) **2.17** جوب الوحدة اللي عدّى عليها شهر: تتحسب متأخرة وتتعمل مهمة متابعة مع المالك · بعد 0.2، 4.1
116. [#101](https://github.com/Ziad-Sameh-OJO/places-erp/issues/101) **2.18** التقرير اليومي للانفنتوري (السيستم بيطلّعه ومنار بتعتمده) · بعد 2.2
117. [#118](https://github.com/Ziad-Sameh-OJO/places-erp/issues/118) **5.1** Schema الصفقة كاملة: المشترين، والبائعين، والأنواع، والمبالغ، والـ note + migration · بعد 2.9
118. [#406](https://github.com/Ziad-Sameh-OJO/places-erp/issues/406) **1.32** الـ Kanban: السحب على Meeting بيحجز ميعاد، وعلى Done Deal بيفتح الصفقة · بعد 1.9، 5.1
119. [#119](https://github.com/Ziad-Sameh-OJO/places-erp/issues/119) **5.2** API الصفقة: Done Deal ← مراجعة الـ Office Manager ← Approved · بعد 5.1
120. [#117](https://github.com/Ziad-Sameh-OJO/places-erp/issues/117) **4.9** Alarm الصفقة للتسويق بالبيانات المسموحة + رفع لوجو · بعد 5.2
121. [#463](https://github.com/Ziad-Sameh-OJO/places-erp/issues/463) **4.22** صفقات التسويق: رفع اللوجو اتشال · بعد 4.9
122. [#120](https://github.com/Ziad-Sameh-OJO/places-erp/issues/120) **5.3** التحصيل الجزئي والكامل + حالاته · بعد 5.2
123. [#121](https://github.com/Ziad-Sameh-OJO/places-erp/issues/121) **5.4** الكوميشن بـ `splitDeal` + الـ Scheme لكل سيلز + موافقة منار على الـ Seller · بعد 5.3
124. [#122](https://github.com/Ziad-Sameh-OJO/places-erp/issues/122) **5.5** الصفقة بتقفل الوحدة وتنقلها للمؤجّر/المباع · بعد 2.9، 5.2
125. [#123](https://github.com/Ziad-Sameh-OJO/places-erp/issues/123) **5.6** Alarm الصفقة اللي اتقفلت تاني يوم + استبعادها من التارجت + الـ note · بعد 1.29، 5.2
126. [#124](https://github.com/Ziad-Sameh-OJO/places-erp/issues/124) **5.7** إلغاء الصفقة يعكس الإيراد والـ achievements والكوميشن · بعد 5.4
127. [#125](https://github.com/Ziad-Sameh-OJO/places-erp/issues/125) **5.8** عمولة الـ TL بالشرايح + جدول الشرايح في الإعدادات · بعد 5.4
128. [#126](https://github.com/Ziad-Sameh-OJO/places-erp/issues/126) **5.9** واجهة الصفقات: القايمة، والفورم، والدروار، والتحصيل · بعد 0.13، 5.3
129. [#127](https://github.com/Ziad-Sameh-OJO/places-erp/issues/127) **5.10** داشبورد الإيرادات + صفحة Achievements + الترتيب · بعد 5.4
130. [#128](https://github.com/Ziad-Sameh-OJO/places-erp/issues/128) **5.11** تصدير تفاصيل الصفقة لكل سيلز · بعد 0.11، 5.4
131. [#131](https://github.com/Ziad-Sameh-OJO/places-erp/issues/131) **5.14** تستات e2e بمثال الكلاينت (100,000 ← 25,000 / 25,000 / 50,000) · بعد 5.4
132. [#139](https://github.com/Ziad-Sameh-OJO/places-erp/issues/139) **7.1** ملف الموظف كامل: المرتب، والنوع، والشرايح الخاصة، والمواعيد الثابتة (Schema + شاشة)
133. [#140](https://github.com/Ziad-Sameh-OJO/places-erp/issues/140) **7.2** الحضور اليومي بالشرايح + الـ Weekly Delay + الخصم · بعد 7.1
134. [#141](https://github.com/Ziad-Sameh-OJO/places-erp/issues/141) **7.3** الـ Visit كبداية اليوم + نسي البصمة (تأكيد الـ HR) + الشغل من بره بعذر · بعد 1.9، 7.2
135. [#220](https://github.com/Ziad-Sameh-OJO/places-erp/issues/220) **1.23** ترتيب الروتيشن اليومي: بالبصمة وميعاد الـ Visit + تعديل يدوي لليوم · بعد 1.13، 7.3
136. [#221](https://github.com/Ziad-Sameh-OJO/places-erp/issues/221) **1.24** تأجيل الـ Visit / Meeting: سبب إجباري + موافقة الـ TL + إبلاغ الأوبريشن · بعد 1.9، 1.29، 7.3
137. [#143](https://github.com/Ziad-Sameh-OJO/places-erp/issues/143) **7.5** الإجازات: طلب ← TL ← HR، والأرصدة، والتذكير والتصعيد، والمرضي بمستند · بعد 7.1
138. [#76](https://github.com/Ziad-Sameh-OJO/places-erp/issues/76) **1.15** السيلز اللي في إجازة يطلع من التوزيع · بعد 1.13، 7.5
139. [#144](https://github.com/Ziad-Sameh-OJO/places-erp/issues/144) **7.6** كالندر «مين إجازة النهارده» + تقرير الأرصدة الشهري · بعد 7.5
140. [#145](https://github.com/Ziad-Sameh-OJO/places-erp/issues/145) **7.7** الجزاءات · بعد 7.1
141. [#146](https://github.com/Ziad-Sameh-OJO/places-erp/issues/146) **7.8** الـ 1-to-1: الأسئلة، و«حل الـ HR» بميعاد و Alarm، والجلسة اللي فاتت · بعد 7.1
142. [#147](https://github.com/Ziad-Sameh-OJO/places-erp/issues/147) **7.9** شيت المرتبات يوم 30 (بعد الخصومات والـ KPIs) للمالية بعد موافقة الـ HR · بعد 7.2، 7.7
143. [#148](https://github.com/Ziad-Sameh-OJO/places-erp/issues/148) **7.10** شاشات: حضور النهارده، والتاريخ بالشخص والفترة، والـ Weekly Delay · بعد 7.2
144. [#149](https://github.com/Ziad-Sameh-OJO/places-erp/issues/149) **7.11** الموظف المثالي وصندوق الفريق كل شهر · بعد 7.2، 7.7
145. [#422](https://github.com/Ziad-Sameh-OJO/places-erp/issues/422) **7.14** الـ Weekly Delay: عمود «التراكمي» · بعد 7.10
146. [#423](https://github.com/Ziad-Sameh-OJO/places-erp/issues/423) **7.15** قايمة الموظفين: «آخر 1-to-1» و«حل HR» بميعاده · بعد 7.8
147. [#424](https://github.com/Ziad-Sameh-OJO/places-erp/issues/424) **7.16** ملف الموظف: أرقام الشهر · بعد 7.1
148. [#152](https://github.com/Ziad-Sameh-OJO/places-erp/issues/152) **8.1** Schema + API التذاكر: الأنواع ومسار كل نوع، والأولوية، والتحويل بالتاريخ
149. [#102](https://github.com/Ziad-Sameh-OJO/places-erp/issues/102) **2.19** طلب List من الـ TL كتذكرة لمروة (24 ساعة) · بعد 8.1
150. [#416](https://github.com/Ziad-Sameh-OJO/places-erp/issues/416) **2.32** طلبات الـ List: زرار للـ TL، ومروة بتربط الوحدات، وبنود الـ KPIs · بعد 2.19، 8.1
151. [#142](https://github.com/Ziad-Sameh-OJO/places-erp/issues/142) **7.4** الـ Excuse: تذكرة للـ TL ثم الـ HR، واتنين مجاناً، والتالت والرابع نص يوم، والخامس رفد · بعد 7.2، 8.1
152. [#156](https://github.com/Ziad-Sameh-OJO/places-erp/issues/156) **9.1** شجرة الحسابات + الخزن والبنوك (Schema + API + شاشة)
153. [#157](https://github.com/Ziad-Sameh-OJO/places-erp/issues/157) **9.2** المصروفات على البنود + الـ Budget · بعد 9.1
154. [#158](https://github.com/Ziad-Sameh-OJO/places-erp/issues/158) **9.3** السلف والعهد والـ Petty cash + `FinanceService.recordExpense()` · بعد 9.1
155. [#159](https://github.com/Ziad-Sameh-OJO/places-erp/issues/159) **9.4** داشبورد المالية: الخزن، والبنوك، والسلف، والإيراد، وصافي الربح، والتوفير · بعد 9.2
156. [#248](https://github.com/Ziad-Sameh-OJO/places-erp/issues/248) **9.16** الفواتير الثابتة بموافقة المحاسب (زي اشتراك Property Finder) · بعد 9.2
157. [#188](https://github.com/Ziad-Sameh-OJO/places-erp/issues/188) **12.9** الإيميل من الـ worker + سجل الإرسال + تنبيه لما يفشل · بعد 0.2
158. [#189](https://github.com/Ziad-Sameh-OJO/places-erp/issues/189) **12.10** الـ Push notifications (PWA + VAPID)
159. [#190](https://github.com/Ziad-Sameh-OJO/places-erp/issues/190) **12.11** الجرس لحظي (WebSocket) + فلتر بالنوع
160. [#432](https://github.com/Ziad-Sameh-OJO/places-erp/issues/432) **12.14** «ابعت إيميل تجربة» من إعدادات الإيميل · بعد 12.10
161. [#546](https://github.com/Ziad-Sameh-OJO/places-erp/issues/546) **14.13** الماركتنج: تكلفة الليد والـ Qualified والصفقة (تختار)، والصفقة بتتحسب على شهر نزول الليد
162. [#547](https://github.com/Ziad-Sameh-OJO/places-erp/issues/547) **14.14** تقرير المنافسين الشهري ظاهر من داشبورد الماركتنج، بعمود «قوي ولا لأ»

## Sprint 4

163. [#113](https://github.com/Ziad-Sameh-OJO/places-erp/issues/113) **4.5** الحملات: CRUD + التكلفة
164. [#114](https://github.com/Ziad-Sameh-OJO/places-erp/issues/114) **4.6** داشبورد Channel ← حملة ← بوست، بالنسب والفلاتر · بعد 1.5، 4.5
165. [#115](https://github.com/Ziad-Sameh-OJO/places-erp/issues/115) **4.7** الـ Content plan: كالندر البوستات + وقت النشر الفعلي + Reminder · بعد 4.5
166. [#116](https://github.com/Ziad-Sameh-OJO/places-erp/issues/116) **4.8** البرودكاست: مهمة للسيلز + Done/share + Hot Inventory مرتين في الأسبوع + الحد اليومي · بعد 4.1
167. [#454](https://github.com/Ziad-Sameh-OJO/places-erp/issues/454) **4.13** خانة Website Ads (Yes / No) في شيت الانفنتوري للتسويق بس، بفلتر · بعد 2.6
168. [#458](https://github.com/Ziad-Sameh-OJO/places-erp/issues/458) **4.17** داشبورد التسويق: «النهارده» في فلتر الفترة، وزرار «بحث» للفترة المخصصة · بعد 4.6
169. [#459](https://github.com/Ziad-Sameh-OJO/places-erp/issues/459) **4.18** داشبورد التسويق: الليدز اللي ماكانتش Qualified، وسببها، وصاحب الكومنت · بعد 1.3، 4.6
170. [#460](https://github.com/Ziad-Sameh-OJO/places-erp/issues/460) **4.19** الكامبين: Page name من قايمة (Website · Property Finder · Dubizzle) + إدارة الأسماء · بعد 4.5
171. [#461](https://github.com/Ziad-Sameh-OJO/places-erp/issues/461) **4.20** الكامبين: الوحدات من شيت الانفنتوري، ومن غير تاريخ نهاية، والميزانية per day · بعد 2.6، 4.5
172. [#462](https://github.com/Ziad-Sameh-OJO/places-erp/issues/462) **4.21** بوست الـ Content plan: رفع صورة أو فيديو، وخانة الكامبين اتشالت · بعد 0.9، 4.7
173. [#129](https://github.com/Ziad-Sameh-OJO/places-erp/issues/129) **5.12** الـ TCR: رقم تسلسلي، والتوقيعات بالترتيب، و TCR جديدة مع كل تحصيل · بعد 5.3
174. [#130](https://github.com/Ziad-Sameh-OJO/places-erp/issues/130) **5.13** PDF الـ TCR · بعد 0.10، 5.12
175. [#421](https://github.com/Ziad-Sameh-OJO/places-erp/issues/421) **5.15** المالية تعدّل مبلغ تحصيل أو TCR اتسجّل · بعد 5.6
176. [#132](https://github.com/Ziad-Sameh-OJO/places-erp/issues/132) **6.1** Schema + API العقد وجدول الأقساط · بعد 5.3
177. [#133](https://github.com/Ziad-Sameh-OJO/places-erp/issues/133) **6.2** واجهة العقود والأقساط + الكالندر · بعد 6.1
178. [#134](https://github.com/Ziad-Sameh-OJO/places-erp/issues/134) **6.3** جوب التجديد 90/60/30 + ليد تجديد أوتوماتيك · بعد 0.2، 6.1
179. [#135](https://github.com/Ziad-Sameh-OJO/places-erp/issues/135) **6.4** الإنهاء المبكر والانتهاء يرجّعوا الوحدة + تغيير القيمة بموافقة + الزيادة السنوية · بعد 2.9، 6.1
180. [#150](https://github.com/Ziad-Sameh-OJO/places-erp/issues/150) **7.12** رفع شيت البصمة: ربط الأسامي، ومنع التكرار، واستكمال الأيام · بعد 0.12، 7.2
181. [#151](https://github.com/Ziad-Sameh-OJO/places-erp/issues/151) **7.13** agent جهاز البصمة (بعد ما الكلاينت يحدد نوع الجهاز) · بعد 7.12
182. [#153](https://github.com/Ziad-Sameh-OJO/places-erp/issues/153) **8.2** واجهة التذاكر · بعد 8.1
183. [#154](https://github.com/Ziad-Sameh-OJO/places-erp/issues/154) **8.3** جوب الـ SLA والتصعيد (24 ساعة، و4 للعالية، والنزاع 48 وتنبيه نانسي) · بعد 0.2، 8.1
184. [#155](https://github.com/Ziad-Sameh-OJO/places-erp/issues/155) **8.4** تقرير سرعة الرد لكل قسم · بعد 8.1
185. [#425](https://github.com/Ziad-Sameh-OJO/places-erp/issues/425) **8.5** صفحة التذاكر: اختصارات «طلب إجازة» و«شغل من بره» · بعد 7.3، 7.5
186. [#160](https://github.com/Ziad-Sameh-OJO/places-erp/issues/160) **9.5** القيود والأرصدة الافتتاحية · بعد 9.1
187. [#163](https://github.com/Ziad-Sameh-OJO/places-erp/issues/163) **9.8** تقفيل الشهر والربع + التعديل اليدوي لشخص واحد + تسوية العهدة الأسبوعية · بعد 9.5
188. [#232](https://github.com/Ziad-Sameh-OJO/places-erp/issues/232) **9.11** إذن توريد خزنة + التحويل بين الخزن والبنوك + كشف حساب الخزنة / البنك · بعد 9.1، 9.5
189. [#244](https://github.com/Ziad-Sameh-OJO/places-erp/issues/244) **9.12** حسابات فرعية أوتوماتيك: عميل لكل صفقة (113) · سلفة لكل موظف (114) · عمولة لكل سيلز (211) · بعد 5.2، 9.1، 9.5
190. [#161](https://github.com/Ziad-Sameh-OJO/places-erp/issues/161) **9.6** الترحيل الأوتوماتيك: التحصيل، وتكاليف الصفقة، والمرتبات، والمشتريات، والإلغاء · بعد 5.3، 7.9، 9.5، 9.12
191. [#162](https://github.com/Ziad-Sameh-OJO/places-erp/issues/162) **9.7** قايمة الدخل والميزانية وصافي الربح + drill-down · بعد 9.6
192. [#164](https://github.com/Ziad-Sameh-OJO/places-erp/issues/164) **9.9** المصروف مقابل الـ Budget + التصدير · بعد 0.11، 9.2، 9.6
193. [#245](https://github.com/Ziad-Sameh-OJO/places-erp/issues/245) **9.13** قيد يومية يدوي من شجرة الحسابات · بعد 9.5
194. [#246](https://github.com/Ziad-Sameh-OJO/places-erp/issues/246) **9.14** صرف المرتبات مرة واحدة (إذن «صرف مرتبات») + خصم السلف الشهري · بعد 7.9، 9.3، 9.5
195. [#247](https://github.com/Ziad-Sameh-OJO/places-erp/issues/247) **9.15** صرف عمولة السيلز لكل صفقة مع الـ TCR · بعد 5.4، 5.12، 9.12
196. [#249](https://github.com/Ziad-Sameh-OJO/places-erp/issues/249) **9.17** المطالبات + الفاتورة الإلكترونية + إيصال استلام النقدية (من القوالب) · بعد 0.10، 5.3، 12.12
197. [#427](https://github.com/Ziad-Sameh-OJO/places-erp/issues/427) **9.19** «مستنيك النهارده» للمحاسب كامل · بعد 5.14، 9.17
198. [#403](https://github.com/Ziad-Sameh-OJO/places-erp/issues/403) **0.18** الرئيسية بتجمع شغل كل الموديولات في «مهامي النهارده» · بعد 1.34، 9.19
199. [#178](https://github.com/Ziad-Sameh-OJO/places-erp/issues/178) **11.9** بيانات البنود الناقصة: عينة Second Call، وعدّاد إعلانات الويبسايت، والـ Farming، والمنافسين، والـ 500م · بعد 1.10
200. [#545](https://github.com/Ziad-Sameh-OJO/places-erp/issues/545) **14.12** فلتر سنة + ربع في كل حاجة (Q4 2025، Q1 2026…)، والتاريخ مايتمسحش، وإدخال الأرباع اللي فاتت بإيدنا

## Sprint 5

201. [#136](https://github.com/Ziad-Sameh-OJO/places-erp/issues/136) **6.5** تسجيل الدفعات + المتأخرات (aging) + تقرير التحصيل · بعد 6.1
202. [#137](https://github.com/Ziad-Sameh-OJO/places-erp/issues/137) **6.6** تذكير القسط قبلها بـ 3 أيام + تنبيه المتأخر + تصعيد بعد 7 أيام · بعد 0.2، 6.5
203. [#138](https://github.com/Ziad-Sameh-OJO/places-erp/issues/138) **6.7** فاتورة/إيصال PDF · بعد 0.10، 6.5
204. [#165](https://github.com/Ziad-Sameh-OJO/places-erp/issues/165) **9.10** الـ Cost Center: تكلفة الحملة على الليدز المؤهلة وعلى كل صفقة · بعد 4.5، 9.6
205. [#166](https://github.com/Ziad-Sameh-OJO/places-erp/issues/166) **10.1** Schema + API الطلب: الموافقات بالحدود، ومختار مايوافقش على طلبه، وتغيير المبلغ بموافقة · بعد 9.3
206. [#167](https://github.com/Ziad-Sameh-OJO/places-erp/issues/167) **10.2** المرفقات الإجبارية فوق 10,000 + سقف العهدة + الدفع ← `recordExpense` · بعد 9.2، 9.3، 10.1
207. [#426](https://github.com/Ziad-Sameh-OJO/places-erp/issues/426) **9.18** كارت «طلبات مشتريات مستنية الصرف» في تاب الخزن · بعد 10.2
208. [#168](https://github.com/Ziad-Sameh-OJO/places-erp/issues/168) **10.3** واجهة المشتريات + تذكير المعتمد + تقرير البنود + الموردين · بعد 10.1
209. [#169](https://github.com/Ziad-Sameh-OJO/places-erp/issues/169) **10.4** سجل أصول المكتب + جدول الـ Office Boys بالمناطق
210. [#170](https://github.com/Ziad-Sameh-OJO/places-erp/issues/170) **11.1** Schema الكروت (البنود، والأوزان، والمصدر، والمتابع، والـ Baseline) + seed كروت Q4 من الملف
211. [#171](https://github.com/Ziad-Sameh-OJO/places-erp/issues/171) **11.2** «كارتي» للموظف + تسجيل التسليمات · بعد 11.1
212. [#172](https://github.com/Ziad-Sameh-OJO/places-erp/issues/172) **11.3** «فريقي» للمتابع: تعديل البنود، واليدوي، وخطة التحسين، والاعتماد · بعد 11.1
213. [#173](https://github.com/Ziad-Sameh-OJO/places-erp/issues/173) **11.4** «كل الشركة»: إعدادات الفلوس لكل موظف + الشرايح + قفل الربع · بعد 11.1
214. [#177](https://github.com/Ziad-Sameh-OJO/places-erp/issues/177) **11.8** تارجت شهري لكل سيلز وفريق + تقرير الـ TL + الـ Transactions + الترتيب · بعد 5.4
215. [#179](https://github.com/Ziad-Sameh-OJO/places-erp/issues/179) **11.10** محرك التقارير المتجدولة (الأحد ويوم 1) + تقرير الأداء الشهري · بعد 0.2، 0.11، 11.1
216. [#419](https://github.com/Ziad-Sameh-OJO/places-erp/issues/419) **4.11** داشبورد التسويق: كارت «تقرير المنافسين الشهري» · بعد 11.10
217. [#174](https://github.com/Ziad-Sameh-OJO/places-erp/issues/174) **11.5** جوب حساب البنود الأوتوماتيك كل يوم من الموديولات · بعد كل اللي قبله
218. [#175](https://github.com/Ziad-Sameh-OJO/places-erp/issues/175) **11.6** التنبيهات (نص الربع، وتحت 70% خطة تحسين، وتحت 50%) + البونص والخصم في المرتبات · بعد 7.9، 11.5
219. [#176](https://github.com/Ziad-Sameh-OJO/places-erp/issues/176) **11.7** الورقة الربع سنوية PDF بعد موافقة الـ Office Manager · بعد 0.10، 11.5
220. [#227](https://github.com/Ziad-Sameh-OJO/places-erp/issues/227) **11.11** محرر مصدر البند: كتالوج مقاييس السيستم + من تقرير + يدوي بشخص + ربع جديد · بعد 11.1، 11.5
221. [#228](https://github.com/Ziad-Sameh-OJO/places-erp/issues/228) **11.12** التقرير اليومي لكل التيمز: شكله لكل شخص + خانات إضافية + تقرير أي يوم + التجميع · بعد 11.10، 11.11
222. [#229](https://github.com/Ziad-Sameh-OJO/places-erp/issues/229) **11.13** نشاطات Farming / Approach للسيلز + بند Farming أوتوماتيك · بعد 11.11
223. [#230](https://github.com/Ziad-Sameh-OJO/places-erp/issues/230) **11.14** مسؤول الـ KPIs: يشوف كل الكروت والتقارير والتغييرات ويعدّل البنود، من غير أي حاجة فلوس · بعد 11.4، 11.10
224. [#231](https://github.com/Ziad-Sameh-OJO/places-erp/issues/231) **11.15** مقاييس كارت الأوبريشن: الـ New Lead خلال 30 دقيقة، وقرارات الـ Draft في يومها، والـ Second Calls لكل ليدز اليوم · بعد 1.17، 1.26، 1.27، 1.28، 11.11
225. [#428](https://github.com/Ziad-Sameh-OJO/places-erp/issues/428) **11.16** الرئيسية: كارت «الـ KPIs بتاعتي» وتذكيرات الـ KPIs · بعد 11.4
226. [#429](https://github.com/Ziad-Sameh-OJO/places-erp/issues/429) **11.17** التقرير المتجدول: «ابعته دلوقتي» · بعد 11.10
227. [#430](https://github.com/Ziad-Sameh-OJO/places-erp/issues/430) **11.18** شيت الموظف الربعي كامل: المرتب والتارجت والـ scheme وقواعد الجوايز · بعد 11.7
228. [#464](https://github.com/Ziad-Sameh-OJO/places-erp/issues/464) **11.19** منار بتتابع KPIs فريق الانفنتوري من جوه الانفنتوري، وزرار «إضافة أو تعديل KPIs» · بعد 11.11، 11.14
229. [#465](https://github.com/Ziad-Sameh-OJO/places-erp/issues/465) **11.20** التقارير والتارجت للهيد بس، وهو اللي يحدد تظهر لمين · بعد 11.10
230. [#534](https://github.com/Ziad-Sameh-OJO/places-erp/issues/534) **14.1** صفحة «Dashboard» للإدارة: بتفتح أول ما يدخلوا، و«مهامي النهارده» صفحة لوحدها
231. [#535](https://github.com/Ziad-Sameh-OJO/places-erp/issues/535) **14.2** داشبورد أحمد إسلام: النهارده، والمراحل، والانفنتوري، وتارجت السنة والربع، والتيمز وناسها · بعد 14.1
232. [#536](https://github.com/Ziad-Sameh-OJO/places-erp/issues/536) **14.3** داشبورد صفوت: Today و Company و Finance و Sales و Marketing · بعد 14.1
233. [#549](https://github.com/Ziad-Sameh-OJO/places-erp/issues/549) **14.16** صفحة Sits (تأجير مقرات إدارية وإعادة تأجيرها)
234. [#550](https://github.com/Ziad-Sameh-OJO/places-erp/issues/550) **14.17** أرشيف المستندات: فولدر لكل وحدة أو صفقة بالعقود والورق
235. [#551](https://github.com/Ziad-Sameh-OJO/places-erp/issues/551) **14.18** شيت الصفقات والـ Leaderboard: عمود Achievement بالنسبة، والأرقام في الأداء
236. [#552](https://github.com/Ziad-Sameh-OJO/places-erp/issues/552) **14.19** ريبورتات السيلز اليومية والأسبوعية في «التقارير والتارجت»
237. [#553](https://github.com/Ziad-Sameh-OJO/places-erp/issues/553) **14.20** السيستم أونلاين للإدارة: سيرفر وحسابات لأحمد إسلام وصفوت

## التسليم (UAT والإطلاق)

238. [#191](https://github.com/Ziad-Sameh-OJO/places-erp/issues/191) **13.1** قوالب Excel + استيراد الوحدات والشركات والليدز القديمة بمنع التكرار · بعد 0.12، 1.20، 2.2
239. [#192](https://github.com/Ziad-Sameh-OJO/places-erp/issues/192) **13.2** تجربة الاستيراد على شيتات الكلاينت الحقيقية · بعد 13.1
240. [#193](https://github.com/Ziad-Sameh-OJO/places-erp/issues/193) **13.3** مراجعة أمان قبل الإطلاق + أداء (الصفحات التقيلة والـ indexes)
241. [#194](https://github.com/Ziad-Sameh-OJO/places-erp/issues/194) **13.4** تستات المتصفح (Playwright) لسيناريو الجولة السريعة بتاعة الديمو
242. [#195](https://github.com/Ziad-Sameh-OJO/places-erp/issues/195) **13.5** UAT: سيناريو لكل موديول + جلسات مع الكلاينت + تصليح الملاحظات · بعد كل اللي قبله
243. [#196](https://github.com/Ziad-Sameh-OJO/places-erp/issues/196) **13.6** تدريب لكل قسم + دليل استخدام مختصر · بعد كل اللي قبله
244. [#198](https://github.com/Ziad-Sameh-OJO/places-erp/issues/198) **13.8** ترقية الإصدارات الكبيرة: TypeScript 6 (#34)، و Prisma 7، و ESLint 10
