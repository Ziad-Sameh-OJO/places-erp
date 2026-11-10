-- T-34 · M-12: the «[أوتوماتيك]» KPI items that had no metric get the one that measures them (seed-data/kpi-q4-2026.json).
-- Data only, for the cards already made: an item someone already set (metric not null) or changed to another method is left.
UPDATE "kpi"."KpiItem" i SET "metric" = 'budgetUse', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'ahmed.islam@places.com' AND i."title" = 'الميزانية' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'sheetsOnTime', "params" = '{}'::jsonb, "method" = 'system', "required" = NULL, "report" = NULL, "enteredBy" = ARRAY['follower']::TEXT[]
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'nancy.islam@places.com' AND i."title" = 'إصدار وإرسال ملف التارجت الفصلي (مع بنود المكافآت)' AND i."metric" IS NULL AND i."method" = 'report';

UPDATE "kpi"."KpiItem" i SET "metric" = 'payrollOnTime', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'ahmed.ashraf@places.com' AND i."title" = 'صرف المرتبات في أول 5 أيام من الشهر' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'commissionSameDay', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'ahmed.ashraf@places.com' AND i."title" = 'حساب العمولة في نفس يوم ظهور التحصيل' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'monthClose', "params" = '{}'::jsonb, "method" = 'system', "required" = NULL, "report" = NULL, "enteredBy" = ARRAY['follower']::TEXT[]
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'ahmed.ashraf@places.com' AND i."title" = 'التقرير المالي الشهري قبل يوم 5' AND i."metric" IS NULL AND i."method" = 'report';

UPDATE "kpi"."KpiItem" i SET "metric" = 'att', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'ahmed.ashraf@places.com' AND i."title" = 'الحضور الثابت (الاتنين والخميس 17:00–19:00) والمواعيد' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'oneOnOnes', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'basant.elsawy@places.com' AND i."title" = 'One-to-One meetings ومتابعة المواعيد الثابتة' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'tickets', "params" = '{"ttype":"hr_letter"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'basant.elsawy@places.com' AND i."title" = 'HR Letters والتأمينات خلال 24 ساعة' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'postsOnTime', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'rahma.hassan@places.com' AND i."title" = 'الالتزام بالخطة الشهرية (محتوى + حملات) + Daily Report' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'broadcastPlan', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'rahma.hassan@places.com' AND i."title" = 'الـ Broadcast في مواعيده (يومين في الأسبوع) + Hot Inventory' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'photo72', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'abdelrahman.bayoumi@places.com' AND i."title" = 'تصوير الوحدات الجديدة خلال 72 ساعة' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'retouch48', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'abdelrahman.bayoumi@places.com' AND i."title" = 'تسليم المواد متعدّلة خلال 48 ساعة' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'tasksOnTime', "params" = '{"tkind":"photo"}'::jsonb, "method" = 'system', "required" = NULL, "report" = NULL, "enteredBy" = ARRAY['follower']::TEXT[]
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'abdelrahman.bayoumi@places.com' AND i."title" = 'تنفيذ خطة التصوير الأسبوعية' AND i."metric" IS NULL AND i."method" = 'manual';

UPDATE "kpi"."KpiItem" i SET "metric" = 'tasksFirstTime', "params" = '{}'::jsonb, "method" = 'system', "required" = NULL, "report" = NULL, "enteredBy" = ARRAY['follower']::TEXT[]
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'abdelrahman.bayoumi@places.com' AND i."title" = 'جودة المواد (اتقبلت من أول مرة)' AND i."metric" IS NULL AND i."method" = 'manual';

UPDATE "kpi"."KpiItem" i SET "metric" = 'callsDaily', "params" = '{"per":"quarter"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'hadeer.tarek@places.com' AND i."title" = 'عدد المكالمات اليومية' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'unitsEntered', "params" = '{}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'manar.ahmed@places.com' AND i."title" = 'عدد الإنفنتوري الجديد في الربع' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'tickets', "params" = '{"dept":"Inventory"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'manar.ahmed@places.com' AND i."title" = 'التزام فريقها بالـ SLAs (Lists، معاينات)' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'unitsEntered', "params" = '{"by":"me"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'randa.mohamed@places.com' AND i."title" = 'عدد الإنفنتوري الجديد في الربع' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'tasksOnTime', "params" = '{"tkind":"team"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'sara.abdelhalim@places.com' AND i."title" = 'مهام منار اليومية (حد أقصى 30 في اليوم)' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'tasksOnTime', "params" = '{"tkind":"team"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'marwa.mostafa@places.com' AND i."title" = 'مهام منار اليومية (حد أقصى 30 في اليوم)' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'tasksOnTime', "params" = '{}'::jsonb, "method" = 'system', "required" = NULL, "report" = NULL, "enteredBy" = ARRAY['follower']::TEXT[]
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND u."email" = 'mokhtar.gamal@places.com' AND i."title" = 'تنفيذ المهام اللي الإدارة بتديهاله' AND i."metric" IS NULL AND i."method" = 'manual';

UPDATE "kpi"."KpiItem" i SET "metric" = 'visitsDone', "params" = '{"kind":"Visit","per":"quarter"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND e."teamLeaderId" IS NOT NULL AND i."title" = 'Showings (معاينات)' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'visitsDone', "params" = '{"kind":"Meeting","per":"quarter"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND e."teamLeaderId" IS NOT NULL AND i."title" = 'Meetings' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'unitsBrought', "params" = '{"per":"quarter"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND e."teamLeaderId" IS NOT NULL AND i."title" = 'Inventory (وحدات جابها)' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'calls', "params" = '{"per":"quarter","avg":"week"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2026-Q4' AND e."teamLeaderId" IS NOT NULL AND i."title" = 'Calls & Broadcast' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'teamSla', "params" = '{"per":"quarter"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2027-Q1' AND u."email" IN ('abdallah.sleem@places.com', 'mahmoud.ali@places.com', 'abdelrahman.younes@places.com', 'mostafa.ezzat@places.com') AND i."title" = 'التزام الفريق بالـ SLA (أول أكشن خلال ساعتين ونص)' AND i."metric" IS NULL AND i."method" = 'system';

UPDATE "kpi"."KpiItem" i SET "metric" = 'visitsDone', "params" = '{"kind":"Visit","per":"quarter","of":"team"}'::jsonb
FROM "kpi"."KpiCard" c JOIN "hr"."Employee" e ON e."id" = c."employeeId" JOIN "access"."User" u ON u."id" = e."userId"
WHERE i."cardId" = c."id" AND c."quarter" = '2027-Q1' AND u."email" IN ('abdallah.sleem@places.com', 'mahmoud.ali@places.com', 'abdelrahman.younes@places.com', 'mostafa.ezzat@places.com') AND i."title" = 'Showings الفريق' AND i."metric" IS NULL AND i."method" = 'system';
