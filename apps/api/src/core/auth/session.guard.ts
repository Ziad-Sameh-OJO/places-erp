import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC } from "./public.decorator";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE } from "./auth.controller";
import { GrantsService } from "../authz/grants.service";

/** Closed by default: every endpoint needs a valid session unless it is marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService, private readonly grants: GrantsService) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = await this.auth.resolve(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw new UnauthorizedException();
    req.user = await this.grants.currentUser(user.id);
    return true;
  }
}
