# Places ERP

ERP / CRM لـ Places (by RECA TECH). المرجع الكامل: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## تشغيل على جهازك

```bash
corepack enable                 # pnpm
cp .env.example .env            # واملا SESSION_SECRET (openssl rand -base64 48)
pnpm install
pnpm infra:up                   # Postgres · Redis · Mailpit · MinIO
pnpm db:migrate && pnpm db:seed
pnpm dev                        # web :3000 · api :4000 · worker
```

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
