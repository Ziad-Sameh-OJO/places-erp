import { Global, Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { PushService } from "./push.service";
import { NotificationStreamService } from "./notification-stream.service";

/** Global: any module can call notify() without importing this one. */
@Global()
@Module({ providers: [NotificationsService, PushService, NotificationStreamService], controllers: [NotificationsController], exports: [NotificationsService, PushService] })
export class NotificationsModule {}
