import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { MailLogQuery, Page, Preferences, RuleInput } from "@places/contracts";
import { ZodPipe } from "../http/zod.pipe";
import { Requires, SignedIn } from "../authz/requires.decorator";
import { Me, type CurrentUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "./notifications.service";

const MineQuery = Page.extend({ unread: z.coerce.boolean().default(false) });

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly n: NotificationsService, private readonly audit: AuditService) {}

  @SignedIn() @Get()
  mine(@Me() me: CurrentUser, @Query(new ZodPipe(MineQuery)) q: z.infer<typeof MineQuery>) {
    return this.n.mine(me.id, q.page, q.pageSize, q.unread);
  }

  @SignedIn() @Post(":id/read") @HttpCode(204)
  read(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.n.read(me.id, id);
  }

  @SignedIn() @Put("preferences") @HttpCode(204)
  preferences(@Me() me: CurrentUser, @Body(new ZodPipe(Preferences)) b: z.infer<typeof Preferences>) {
    return this.n.setPreferences(me.id, b.emailNotifications);
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
