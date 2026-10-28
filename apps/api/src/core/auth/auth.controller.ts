import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { MODULES } from "@places/domain";
import { Me, type CurrentUser } from "./current-user.decorator";
import type { Request, Response } from "express";
import { z } from "zod";
import { ZodPipe } from "../http/zod.pipe";
import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";

const Login = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
export const SESSION_COOKIE = "places_session";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodPipe(Login)) body: z.infer<typeof Login>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, otpRequired } = await this.auth.login(body.email, body.password, { ip: req.ip, userAgent: req.get("user-agent") });
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    return { otpRequired };
  }

  /** Who is signed in and what they may do: the web app hides what isn't allowed (the API still checks every call). */
  @Get("me")
  me(@Me() me: CurrentUser) {
    const permissions = Object.fromEntries(MODULES.map((m) => [m, [...me.grants.actions(m)]] as const).filter(([, a]) => a.length));
    return { id: me.id, name: me.name, scope: me.grants.scope, permissions };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }
}
