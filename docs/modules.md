# خريطة الموديولات (الركوايرمنتس ← الكود)

| الكود | الموديول | API | الواجهة | قواعد في domain | schema |
|---|---|---|---|---|---|
<!-- ✅ = اتبنى ومتغطي بتستات e2e -->
| M-01 | العملاء المحتملين والتوزيع | `modules/leads` | `features/leads` | `leads.ts` (stages · SLA · LeadRouter · distributeEvenly) | sales |
| M-02 | الصفقات والتحصيل | `modules/deals` | `features/deals` | `commission.ts` (splitDeal · collectionStatus · transactions) | sales |
| M-03 | مخزون الوحدات + Not Active | `modules/inventory` | `features/inventory` | (يتضاف: unit totals · dedupe) | inventory |
| M-04 | التسويق والحملات | `modules/marketing` | `features/marketing` | (يتضاف: qualified rates) | marketing |
| M-05 | الـ HR | `modules/hr` | `features/hr` | `attendance.ts` · `ideal-employee.ts` | hr |
| M-06 | التذاكر | `modules/tickets` | `features/tickets` | (يتضاف: SLA per type) | ops |
| M-07 | المالية | `modules/finance` | `features/finance` | `money.ts` | finance |
| M-08 | المشتريات | `modules/procurement` | `features/procurement` | (يتضاف: approval limits) | finance |
| M-09 ✅ | المستخدمين والصلاحيات | `core/auth` · `core/authz` · `modules/access` | `features/access` · `(auth)/*` | `permissions.ts` | access |
| M-10 | العملاء والملاك | `modules/clients` | `features/clients` | — | sales |
| M-11 | العقود والتحصيل | `modules/contracts` | `features/contracts` | (يتضاف: installments · aging) | finance |
| M-12 | التقارير والتارجت والـ KPIs | `modules/kpis` | `features/kpis` | `kpi.ts` · `team-leader.ts` | kpi |
| M-13 ✅ | الإعدادات | `modules/settings` | `features/settings` | `business-time.ts` | system |
| M-14 ✅ | الإشعارات والإيميل | `core/notifications` · `core/mail` | `features/notifications` · الجرس · حسابي | `notifications.ts` | system |

الجوبز (`apps/worker`): سحب الليد بعد 3 ساعات، وروتيشن الـ No Answer، وتنبيهات العقود، والتقارير المتجدولة، وتحديث الـ KPIs، والإيميلات.
