import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Action, ModuleKey } from "@places/domain";
import { IS_PUBLIC } from "../auth/public.decorator";
import { REQUIRES } from "./requires.decorator";
import type { CurrentUser } from "../auth/current-user.decorator";

/** Deny by default: an endpoint without @Requires is forbidden, so a forgotten check fails safe. */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const need = this.reflector.getAllAndOverride<{ module: ModuleKey; action: Action } | "signed-in">(REQUIRES, [ctx.getHandler(), ctx.getClass()]);
    if (!need) throw new ForbiddenException();
    if (need === "signed-in") return true;
    const user: CurrentUser = ctx.switchToHttp().getRequest().user;
    if (!user.grants.can(need.module, need.action)) throw new ForbiddenException();
    return true;
  }
}
