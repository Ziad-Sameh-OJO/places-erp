# notifications (M-14) ✅

`NotificationsService.notify({ event, text, link?, userIds? })` من أي service. الحدث بيحدد لمين (أدوار القاعدة + ناس بعينهم) وعلى أنهي قناة
(القواعد في `@places/domain/notifications.ts`، والأدمن بيعدّلها من `/notifications/rules`). الإيميل بيتشال لو الشخص قافله، إلا الإشعارات المهمة.
لسه: Push (محتاج VAPID + الـ PWA) · WebSocket للجرس (دلوقتي الجرس بيتحدّث كل دقيقة).
