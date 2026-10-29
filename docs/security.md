# السيكيوريتي · Checklist

| الخطر (OWASP) | الحماية عندنا | فين |
|---|---|---|
| Broken Access Control | مقفول بالافتراضي · `@Requires` إجباري · نطاق البيانات في الـ query | `core/authz` |
| Cryptographic Failures | argon2id · توكن الجلسة متخزن hash · HTTPS بس في production | `core/auth` |
| Injection | Prisma parameterized · Zod على كل مدخل · مفيش raw SQL من مدخلات اليوزر | `core/http`, `contracts` |
| Insecure Design | القواعد في domain ومتغطية بتستات · فلوس integer · Audit لكل تعديل | `packages/domain`, `core/audit` |
| Security Misconfiguration | helmet · CORS لدومين واحد · السيرفر مايقومش من غير أسرار | `main.ts`, `config/env.ts` |
| Vulnerable Components | Dependabot · `pnpm audit` في الـ CI · نسخ متثبتة بالـ lockfile | `.github` |
| Auth Failures | قفل بعد 5 محاولات · رسالة غلط واحدة · انتهاء الجلسة · OTP اختياري لكل شخص | `core/auth` |
| Data Integrity | transactions للفلوس · unique constraints · optimistic updates في الجوبز | `db`, `worker` |
| Logging & Monitoring | Audit Log · health check · مفيش بيانات شخصية في الـ logs | `core/audit` |
| SSRF | مفيش fetch لـ URLs جاية من اليوزر · الملفات بروابط pre-signed | `core/files` |

قبل أي release: `pnpm audit`، ومراجعة الـ endpoints الجديدة، وتجربة الصلاحيات بكل دور.
