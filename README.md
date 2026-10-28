# Places ERP

ERP / CRM لـ Places (by RECA TECH). المرجع الكامل: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## تشغيل على جهازك

```bash
corepack enable                 # pnpm
cp .env.example .env            # واملا SESSION_SECRET (openssl rand -base64 48) و SEED_DEV_PASSWORD
pnpm install
pnpm db:local                   # Postgres من غير Docker (في تاب لوحده) · أو pnpm infra:up لو عندك Docker
pnpm db:migrate && pnpm db:seed # 18 دور · 36 شخص حقيقي · كلهم بيدخلوا بـ SEED_DEV_PASSWORD من غير OTP
pnpm dev                        # web :3000 · api :4000
```

الإيميلات بتاعة الحسابات في `packages/db/prisma/seed-data/people.json` (مثلاً `abdallah.sleem@places.com`).
تستات الـ API الحقيقية (محتاجة الـ API شغال): `pnpm --filter @places/api test:e2e`.

| خدمة | لينك |
|---|---|
| الواجهة | http://localhost:3000 |
| الـ API | http://localhost:4000/api/v1 |
| الإيميلات (Mailpit) | http://localhost:8025 |
| الملفات (MinIO) | http://localhost:9001 |

## أوامر

| الأمر | بيعمل إيه |
|---|---|
| `pnpm test` | كل التستات (قواعد البيزنس في `packages/domain` أهمها) |
| `pnpm typecheck` · `pnpm lint` | فحص الأنواع والكود |
| `pnpm --filter @places/domain test` | تستات قواعد البيزنس بس (من غير أي dependencies) |

## فين ألاقي إيه

- قواعد البيزنس: `packages/domain/src` (الكوميشن، والـ SLA، والحضور، والـ KPIs، والموظف المثالي، والصلاحيات)
- الداتابيز: `packages/db/prisma/schema.prisma`
- موديول مرجعي كامل: `apps/api/src/modules/leads`
- خريطة الموديولات: `docs/modules.md` · القرارات: `docs/adr/` · السيكيوريتي: `docs/security.md` · طريقة الشغل: `docs/conventions.md`
