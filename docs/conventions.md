# طريقة الشغل

## التسمية
- الفايلات `kebab-case.ts`، والكلاسات `PascalCase`، والدوال والمتغيرات `camelCase`، والثوابت `UPPER_SNAKE`.
- في NestJS كل ملف اسمه بيقول دوره: `leads.controller.ts` و `leads.service.ts` و `leads.repository.ts` و `leads.module.ts`.
- الكود والكومنتات بالإنجليزي، والنصوص اللي بتظهر لليوزر بالعربي.

## Git
- الفروع: `feature/M-02-tcr-signatures` · `fix/M-01-sla-holiday` · `chore/...`
- الـ commits بنستخدم فيها Conventional Commits: `feat(deals): …` · `fix(hr): …` · `refactor(domain): …` · `test(kpis): …`
- الـ PR يبقى صغير ويعمل حاجة واحدة، ويقول بيطبّق أنهي سؤال أو بند من الركوايرمنتس.

## الكود
- مفيش `any`. ولو مش عارف النوع، استخدم `unknown` وتحقق منه بـ Zod.
- مفيش منطق بيزنس في الـ controller ولا في الكومبوننت. مكانه `packages/domain`.
- مفيش float للفلوس، ومفيش `new Date()` جوه دالة في domain (الوقت بيتبعت كـ parameter).
- الكومنتات بتشرح **ليه** مش **إيه**، ولو القاعدة جاية من الركوايرمنتس اكتب رقمها (Q13، M-05 2.5).

## التستات
- كل قاعدة في domain ليها تست بالأمثلة الرقمية اللي الكلاينت كتبها في الركوايرمنتس.
- كل endpoint جديد بيتجرب بحساب مسموحله وحساب ممنوع.
- كل مرحلة ليها E2E بـ Playwright بيعيد سيناريو الديمو بتاعها.
