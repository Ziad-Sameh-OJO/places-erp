# notifications (M-14)
In-app (WebSocket) + Web Push + email, per the rules in `NotificationRule`. Important ones (Alarm, lead pulled,
5th Excuse) stay until read. Services publish an event; this module decides who gets it and on which channel.
