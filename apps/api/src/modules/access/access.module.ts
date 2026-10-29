import { Module } from "@nestjs/common";
import { AccessController } from "./access.controller";
import { AccessService } from "./access.service";
import { AccessRepository } from "./access.repository";

/** M-09 · المستخدمين والصلاحيات: users, invites, roles, the matrix, per-person exceptions, the audit log. */
@Module({ controllers: [AccessController], providers: [AccessService, AccessRepository] })
export class AccessModule {}
