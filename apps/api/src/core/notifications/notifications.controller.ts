import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Sse, type MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";
import { z } from "zod";
import { MailLogQuery, Page, Preferences, PushEndpointInput, PushSubscriptionInput, RuleInput } from "@places/contracts";
import { ZodPipe } from "../http/zod.pipe";
import { Requires, SignedIn } from "../authz/requires.decorator";
import { Me, type CurrentUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";
import { NotificationStreamService } from "./notification-stream.service";

// M-14 5.3: the bell's filters: unread only, and one type (an event key)
const MineQuery = Page.extend({ unread: z.coerce.boolean().default(false), event: z.string().trim().min(1).max(60).optional() });

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly n: NotificationsService, private readonly push: PushService, private readonly stream: NotificationStreamService, private readonly audit: AuditService) {}

  @SignedIn() @Get()
  mine(@Me() me: CurrentUser, @Query(new ZodPipe(MineQuery)) q: z.infer<typeof MineQuery>) {
    return this.n.mine(me.id, q);
  }

  /** 12.11 · M-14 5.1: my new notifications as they're written (Server-Sent Events), so the bell needs no refresh. */
  @SignedIn() @Sse("stream")
  live(@Me() me: CurrentUser): Observable<MessageEvent> {
    return this.stream.forUser(me.id);
  }

  @SignedIn() @Post(":id/read") @HttpCode(204)
  read(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.n.read(me.id, id);
  }

  @SignedIn() @Put("preferences") @HttpCode(204)
  preferences(@Me() me: CurrentUser, @Body(new ZodPipe(Preferences)) b: z.infer<typeof Preferences>) {
    return this.n.setPreferences(me.id, b.emailNotifications);
  }

  /** M-14 (51) push, from «حسابي»: the server's public key (null = push is off), then this device on / off. */
  @SignedIn() @Get("push/key")
  pushKey() {
    return { publicKey: this.push.publicKey() };
  }

  @SignedIn() @Post("push/subscriptions") @HttpCode(204)
  subscribe(@Me() me: CurrentUser, @Body(new ZodPipe(PushSubscriptionInput)) b: PushSubscriptionInput) {
    return this.push.subscribe(me.id, b);
  }

  @SignedIn() @Delete("push/subscriptions") @HttpCode(204)
  unsubscribe(@Me() me: CurrentUser, @Body(new ZodPipe(PushEndpointInput)) b: z.infer<typeof PushEndpointInput>) {
    return this.push.unsubscribe(me.id, b.endpoint);
  }

  /** «ابعت إشعار تجربة»: to my own devices only. */
  @SignedIn() @Post("push/test") @HttpCode(200)
  async pushTest(@Me() me: CurrentUser) {
    return { devices: await this.push.devices(me.id), sent: await this.push.send([me.id], { title: "إشعار تجربة", body: "الإشعارات شغالة على الجهاز ده", link: "/profile" }) };
  }

  /** The send log is the Super Admin's (M-14 2.3 · 6.1: «تقرير بالإيميلات اللي فشلت»): whoever sets the rules. */
  @Requires("integrations", "edit") @Get("mail-log")
  mailLog(@Query(new ZodPipe(MailLogQuery)) q: MailLogQuery) {
    return this.n.mailLog(q);
  }

  @Requires("integrations", "view") @Get("rules")
  rules() {
    return this.n.rules();
  }

  @Requires("integrations", "edit") @Put("rules/:event")
  async setRule(@Me() me: CurrentUser, @Param("event") event: string, @Body(new ZodPipe(RuleInput)) b: z.infer<typeof RuleInput>) {
    const r = await this.n.setRule(event, b.channels);
    await this.audit.record({ module: "integrations", entity: "NotificationRule", entityId: event, action: "update", userId: me.id, after: b });
    return r;
  }
}
