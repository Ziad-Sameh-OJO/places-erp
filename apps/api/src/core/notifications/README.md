# notifications (M-14) ✅

`NotificationsService.notify({ event, text, link?, userIds? })` من أي service. الحدث بيحدد لمين (أدوار القاعدة + ناس بعينهم) وعلى أنهي قناة
(القواعد في `@places/domain/notifications.ts`، والأدمن بيعدّلها من `/notifications/rules`). الإيميل بيتشال لو الشخص قافله، إلا الإشعارات المهمة.
الإيميل (12.9): `MailService.send` بيكتبه في `MailLog` والـ worker (`mail-outbox`) بيبعته خلال دقيقة، ويعيد المحاولة 3 مرات، وبعدها «الإيميل فشل» وتنبيه للـ Super Admin. من غير `SMTP_URL` (development) بيتكتب في `.local/outbox/` على طول. السجل: `GET /notifications/mail-log` (integrations: edit).

سيرفر الإيميل (M-14 3.1): الـ Super Admin بيظبطه من صفحة الإشعارات والإيميل (`GET/PUT /notifications/mail/server`): السيرفر والبورت، والإيميل والـ App Password، واسم المرسل وإيميل الإرسال. الباسورد بيتحفظ في `Setting mailServer` متشفّر بمفتاح من `SESSION_SECRET`، ومابيرجعش للمتصفح، ومابيتكتبش في الـ Audit. الـ worker بيقراه كل دقيقة (`mailRoute` في `@places/db`)، ولو مش محطوط بيرجع لـ `SMTP_URL` / `MAIL_FROM`. «ابعت إيميل تجربة» بيبعت على طول بالسيرفر المحفوظ، وبيرجّع الغلط لو حصل.
لسه: Push (محتاج VAPID + الـ PWA) · WebSocket للجرس (دلوقتي الجرس بيتحدّث كل دقيقة).
