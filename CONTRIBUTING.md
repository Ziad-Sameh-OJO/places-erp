# إزاي نشتغل على الريبو

الأركيتكتشر في [ARCHITECTURE.md](ARCHITECTURE.md)، ومين بيعمل إيه في [docs/team.md](docs/team.md)، وقواعد الكود في [docs/conventions.md](docs/conventions.md).

## أول مرة
اتبع خطوات «تشغيل على جهازك» في [README.md](README.md). محتاج Node 24 (`nvm use`)، و pnpm (`corepack enable`)، و Postgres (Docker أو `pnpm db:local`).

## دورة أي تاسك
1. **خد issue** من الـ Milestone الحالية، وحط نفسك Assignee. مفيش شغل من غير issue.
2. **فرع من `main`:** `git switch -c feature/M-01-lead-routing` (أو `fix/…` و `chore/…`).
3. **اشتغل بالترتيب:**
   - القاعدة في `packages/domain` + تستها،
   - بعدين الـ API (controller ← service ← repository) + تست e2e،
   - بعدين الواجهة على شكل الديمو (design-2)، ديسكتوب وموبايل.
4. **قبل الـ push:**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @places/api test:e2e
   ```
5. **افتح PR** على `main` بالـ template، واكتب `Closes #رقم` واربطه بالـ issue. خليه صغير (أقل من ~400 سطر)؛ لو كبر، قسّمه.
6. **الـ CI لازم يبقى أخضر**، ومحتاج موافقة واحدة على الأقل (`CODEOWNERS` بيطلب التيم ليد تلقائياً).
7. **Squash and merge.** الفرع بيتمسح لوحده.

## قواعد مهمة
- **`main` محمي:** مفيش push مباشر عليه، ولا merge والـ CI أحمر.
- **Commits:** نستخدم [Conventional Commits](https://www.conventionalcommits.org/)، زي `feat(leads): pull after 3 working hours` و `fix(hr): excuse count resets monthly`.
- **Migrations:** migration واحدة في كل PR، وبيراجعها التيم ليد. **ممنوع** تعدّل migration اتدمجت قبل كده؛ اعمل واحدة جديدة.
- **الأسرار:** في `.env` بس (مش بيترفع). لو سر اتسرّب في commit، بلّغ التيم ليد فوراً عشان يتغيّر.
- **بيانات حقيقية:** أسماء الموظفين والعملاء مايتحطوش في issues، أو screenshots عامة، أو logs.
- **أي سؤال للكلاينت** يتكتب في الـ issue بـ label اسمه `needs-client`، ومحدش يخمّن قاعدة بيزنس.

## Labels
`feature` · `bug` · `chore` · `needs-client` · `blocked` · `track:sales` · `track:ops` · `track:core` · `M-01` … `M-14`
