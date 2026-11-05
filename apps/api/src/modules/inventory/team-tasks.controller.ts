import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { TeamTaskInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { TeamTasksService } from "./team-tasks.service";

/**
 * 2.16 · Manar's daily tasks («مهمة للفريق», `inventory: approve`). The person a task is for reaches only their own
 * (`mine`, `done`): Sara and Marwa don't need the inventory itself for that.
 */
@Controller("inventory/team-tasks")
export class TeamTasksController {
  constructor(private readonly tasks: TeamTasksService) {}

  @Get("team")
  @Requires("inventory", "approve")
  team(@Me() me: CurrentUser) {
    return this.tasks.team(me);
  }

  @Get()
  @Requires("inventory", "approve")
  given(@Me() me: CurrentUser) {
    return this.tasks.given(me);
  }

  @Post()
  @Requires("inventory", "approve")
  give(@Me() me: CurrentUser, @Body(new ZodPipe(TeamTaskInput)) b: TeamTaskInput) {
    return this.tasks.give(me, b);
  }

  @Get("mine")
  @SignedIn()
  mine(@Me() me: CurrentUser) {
    return this.tasks.mine(me);
  }

  @Post(":id/done")
  @HttpCode(204)
  @SignedIn()
  done(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.tasks.done(me, id);
  }
}
