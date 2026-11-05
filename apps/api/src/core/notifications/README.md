# notifications (M-14) ✅

`NotificationsService.notify({ event, text, link?, userIds? })` من أي service. الحدث بيحدد لمين (أدوار القاعدة + ناس بعينهم) وعلى أنهي قناة
(القواعد في `@places/domain/notifications.ts`، والأدمن بيعدّلها من `/notifications/rules`). الإيميل بيتشال لو الشخص قافله، إلا الإشعارات المهمة.
الإيميل (12.9): `MailService.send` بيكتبه في `MailLog` والـ worker (`mail-outbox`) بيبعته خلال دقيقة، ويعيد المحاولة 3 مرات، وبعدها «الإيميل فشل» وتنبيه للـ Super Admin. من غير `SMTP_URL` (development) بيتكتب في `.local/outbox/` على طول. السجل: `GET /notifications/mail-log` (integrations: edit).
لسه: Push (محتاج VAPID + الـ PWA) · WebSocket للجرس (دلوقتي الجرس بيتحدّث كل دقيقة).
