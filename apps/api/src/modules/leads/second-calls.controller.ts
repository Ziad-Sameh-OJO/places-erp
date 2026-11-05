import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { SecondCallDone } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { SecondCallsService } from "./second-calls.service";

/** 11.15 «مكالمات التحقق (Second Calls)»: Operations' list and «Second Call Done» («leads: approve», M-01 4). */
@Controller("leads/second-calls")
export class SecondCallsController {
  constructor(private readonly calls: SecondCallsService) {}

  @Get()
  @Requires("leads", "approve")
  list() {
    return this.calls.list();
  }

  @Post(":id")
  @HttpCode(200)
  @Requires("leads", "approve")
  done(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(SecondCallDone)) body: SecondCallDone) {
    return this.calls.done(me, id, body);
  }
}
