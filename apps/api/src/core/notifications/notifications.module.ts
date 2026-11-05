import { Global, Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { PushService } from "./push.service";

/** Global: any module can call notify() without importing this one. */
@Global()
@Module({ providers: [NotificationsService, PushService], controllers: [NotificationsController], exports: [NotificationsService] })
export class NotificationsModule {}
