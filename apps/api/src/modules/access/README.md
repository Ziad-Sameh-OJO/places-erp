# M-09 · المستخدمين والصلاحيات ✅

- `access.controller.ts`: `/access/users` (CRUD، إيقاف/تفعيل، فتح، إعادة إيميل التفعيل، لينك تغيير الباسورد، الاستثناءات)، `/access/roles` (جديد/نسخة/تعديل/المصفوفة/مسح)، `/access/audit`.
- الدخول نفسه في `core/auth`: login (+OTP لمن متفعّل عنده)، activate، forgot/reset، change password، me، logout.
- قواعد فوق صلاحية كل endpoint: الـ Super Admin بيدّيه ويشيله Super Admin بس · محدش يقدر يشيل من نفسه «تعديل الصلاحيات» (التغيير بيترجع في نفس الـ transaction) · الأدوار الأساسية والأدوار اللي عليها ناس مابتتمسحش.
- تستات: `apps/api/test/access.e2e.test.ts`.
