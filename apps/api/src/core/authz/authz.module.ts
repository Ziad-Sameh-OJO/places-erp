import { Global, Module } from "@nestjs/common";
import { GrantsService } from "./grants.service";

@Global()
@Module({ providers: [GrantsService], exports: [GrantsService] })
export class AuthzModule {}
