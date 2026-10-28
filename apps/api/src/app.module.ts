import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { DatabaseModule } from "./core/database/database.module";
import { AuthModule } from "./core/auth/auth.module";
import { AuthzModule } from "./core/authz/authz.module";
import { AuditModule } from "./core/audit/audit.module";
import { BusinessTimeModule } from "./core/business-time/business-time.module";
import { SessionGuard } from "./core/auth/session.guard";
import { PoliciesGuard } from "./core/authz/policies.guard";
import { LeadsModule } from "./modules/leads/leads.module";

/**
 * Guards run in this order on every request: rate limit → signed in (unless @Public) → allowed (@Requires).
 * Business modules are added here one by one as they are built (see docs/modules.md for the order).
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule, AuthModule, AuthzModule, AuditModule, BusinessTimeModule,
    LeadsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PoliciesGuard },
  ],
})
export class AppModule {}
