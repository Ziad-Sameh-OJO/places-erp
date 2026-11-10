import { Controller, Get } from "@nestjs/common";
import type { TodayLine } from "@places/contracts";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { BroadcastsService } from "./broadcasts.service";
import { PostsService } from "./posts.service";
import { TasksService } from "./tasks.service";

/** 0.18 · «مهامي النهارده» (demo home.js): the lines from the tasks and from marketing, each only for whom may act on it. */
@Controller("home")
export class MarketingTodayController {
  constructor(private readonly tasks: TasksService, private readonly posts: PostsService, private readonly broadcasts: BroadcastsService) {}

  @Get("tasks")
  @Requires("tasks", "view")
  myTasks(@Me() me: CurrentUser) {
    return this.tasks.today(me);
  }

  /** today's posts for whoever marks them published · the Broadcasts waiting for whoever approves them */
  @Get("marketing")
  @Requires("marketing", "view")
  async marketing(@Me() me: CurrentUser): Promise<TodayLine[]> {
    const [posts, broadcasts] = await Promise.all([
      me.grants.can("marketing", "edit") ? this.posts.today() : [],
      me.grants.can("marketing", "approve") ? this.broadcasts.waiting() : [],
    ]);
    return [...posts, ...broadcasts];
  }
}
