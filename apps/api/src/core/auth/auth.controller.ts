import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { ChangePassword, Forgot, Login, Logout, Otp, SetPassword } from "@places/contracts";
import { MODULES } from "@places/domain";
import { ZodPipe } from "../http/zod.pipe";
import { SignedIn } from "../authz/requires.decorator";
import { Public } from "./public.decorator";
import { Me, type CurrentUser } from "./current-user.decorator";
import { AuthService } from "./auth.service";

export const SESSION_COOKIE = "places_session";
const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get("user-agent") });

/** Sign-in endpoints are rate-limited harder than the rest: 10 a minute per IP (not «me», which every page load calls). */
const SIGN_IN_LIMIT = { default: { ttl: 60_000, limit: 10 } };
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  private setCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  }

  @Public() @Post("login") @HttpCode(200) @Throttle(SIGN_IN_LIMIT)
  async login(@Body(new ZodPipe(Login)) b: z.infer<typeof Login>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, otpRequired } = await this.auth.login(b.email, b.password, meta(req));
    if (token) this.setCookie(res, token);
    return { otpRequired };
  }

  @Public() @Post("otp") @HttpCode(200) @Throttle(SIGN_IN_LIMIT)
  async otp(@Body(new ZodPipe(Otp)) b: z.infer<typeof Otp>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.setCookie(res, await this.auth.verifyOtp(b.email, b.code, meta(req)));
    return { ok: true };
  }

  /** «ابعت كود تاني» on the code screen (M-09 2.4). Public: the person has no session yet. */
  @Public() @Post("otp/resend") @HttpCode(204) @Throttle(SIGN_IN_LIMIT)
  resendOtp(@Body(new ZodPipe(Forgot)) b: z.infer<typeof Forgot>) {
    return this.auth.resendOtp(b.email);
  }

  @Public() @Post("activate") @HttpCode(204) @Throttle(SIGN_IN_LIMIT)
  activate(@Body(new ZodPipe(SetPassword)) b: z.infer<typeof SetPassword>) {
    return this.auth.setPassword(b.token, b.password, "INVITE");
  }

  @Public() @Post("forgot") @HttpCode(204) @Throttle(SIGN_IN_LIMIT)
  forgot(@Body(new ZodPipe(Forgot)) b: z.infer<typeof Forgot>) {
    return this.auth.forgot(b.email);
  }

  @Public() @Post("reset") @HttpCode(204) @Throttle(SIGN_IN_LIMIT)
  reset(@Body(new ZodPipe(SetPassword)) b: z.infer<typeof SetPassword>) {
    return this.auth.setPassword(b.token, b.password, "RESET");
  }

  /** Who is signed in and what they may do: the web app hides what isn't allowed (the API still checks every call). */
  @SignedIn() @Get("me")
  async me(@Me() me: CurrentUser) {
    const permissions = Object.fromEntries(MODULES.map((m) => [m, [...me.grants.actions(m)]] as const).filter(([, a]) => a.length));
    return { id: me.id, employeeId: me.employeeId, name: me.name, email: me.email, emailNotifications: me.emailNotifications, roles: me.roles, roleLabels: me.roleLabels, scope: me.grants.scope, permissions, fields: me.fieldRules,
      profile: await this.auth.profile(me.id) };
  }

  @SignedIn() @Post("password") @HttpCode(204)
  changePassword(@Me() me: CurrentUser, @Body(new ZodPipe(ChangePassword)) b: z.infer<typeof ChangePassword>, @Req() req: Request) {
    return this.auth.changePassword(me.id, b.current, b.next, req.cookies?.[SESSION_COOKIE]);
  }

  @SignedIn() @Post("logout") @HttpCode(204)
  async logout(@Me() me: CurrentUser, @Body(new ZodPipe(Logout)) b: Logout, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE], me.id, b.endpoint);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }
}
