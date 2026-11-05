# M-13 · الإعدادات ✅

`GET /settings` (أي حد مسجّل دخول) · `PUT /settings/:key` (كل إعداد لمدير قسمه، وقواعد الفلوس للـ Super Admin بس: `SETTING_OWNERS` في `@places/domain`) · `/settings/holidays` · `/settings/stages`.
كل مفتاح ليه schema في `@places/contracts/settings.ts`؛ أي مفتاح أو قيمة غلط بتترفض. الإجازات بتمسح الكاش بتاع ساعات الشغل فوراً.
لسه: توزيع المناطق على السيلز (Routing) بيتبني مع M-01 · شرايح الخصم مع M-05 · حدود الموافقات مع M-08.
