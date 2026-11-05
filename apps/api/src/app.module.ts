import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { DatabaseModule } from "./core/database/database.module";
import { AuthModule } from "./core/auth/auth.module";
import { AuthzModule } from "./core/authz/authz.module";
import { AuditModule } from "./core/audit/audit.module";
import { requestContextMiddleware } from "./core/audit/request-context";
import { BusinessTimeModule } from "./core/business-time/business-time.module";
import { SessionGuard } from "./core/auth/session.guard";
import { PoliciesGuard } from "./core/authz/policies.guard";
import { MailModule } from "./core/mail/mail.module";
import { NotificationsModule } from "./core/notifications/notifications.module";
import { FilesModule } from "./core/files/files.module";
import { DocumentsModule } from "./core/documents/documents.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { AccessModule } from "./modules/access/access.module";
import { HandoverModule } from "./modules/access/handover.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { ProcurementModule } from "./modules/procurement/procurement.module";
import { HrModule } from "./modules/hr/hr.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { KpisModule } from "./modules/kpis/kpis.module";
import { MarketingModule } from "./modules/marketing/marketing.module";
import { DealsModule } from "./modules/deals/deals.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { ImportsModule } from "./modules/imports/imports.module";

/**
 * Guards run in this order on every request: rate limit → signed in (unless @Public) → allowed (@Requires).
 * Business modules are added here one by one as they are built (see docs/modules.md for the order).
 */
@Module({
  imports: [
    // rate limits protect production; locally they'd only get in the way of the e2e tests
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }], skipIf: () => process.env.NODE_ENV !== "production" }),
    DatabaseModule, MailModule, AuthModule, AuthzModule, AuditModule, BusinessTimeModule, NotificationsModule, FilesModule, DocumentsModule,
    AccessModule, HandoverModule, SettingsModule, LeadsModule, InventoryModule, FinanceModule, ProcurementModule, HrModule, TicketsModule, KpisModule, MarketingModule, DealsModule, ContractsModule, ClientsModule, ImportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
  ],
})
export class AppModule implements NestModule {
  // after the body parsers, so the request's device and IP reach every audit record written while serving it
  configure(consumer: MiddlewareConsumer) { consumer.apply(requestContextMiddleware).forRoutes("*"); }
}
