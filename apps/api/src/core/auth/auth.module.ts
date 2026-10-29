import { Global, Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { TokensService } from "./tokens.service";

@Global()
@Module({ providers: [AuthService, TokensService], controllers: [AuthController], exports: [AuthService, TokensService] })
export class AuthModule {}
