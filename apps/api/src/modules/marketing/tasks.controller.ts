import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { CreateTask, EditTask, MoveTask, TaskFilters } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { TasksService } from "./tasks.service";

/** HTTP only: validate input, check the permission, call the service. Who may move which task is the domain's (taskMove). */
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @Requires("tasks", "view")
  list(@Me() me: CurrentUser, @Query(new ZodPipe(TaskFilters)) f: TaskFilters) {
    return this.tasks.list(me, f);
  }

  // before ":id", so it isn't read as a task id
  @Get("options")
  @Requires("tasks", "create")
  options(@Me() me: CurrentUser) {
    return this.tasks.options(me);
  }

  @Get(":id")
  @Requires("tasks", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.tasks.get(me, id);
  }

  @Post()
  @Requires("tasks", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CreateTask)) body: CreateTask) {
    return this.tasks.create(me, body);
  }

  @Post(":id/status")
  @HttpCode(200)
  @Requires("tasks", "edit")
  move(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(MoveTask)) body: MoveTask) {
    return this.tasks.move(me, id, body);
  }

  @Patch(":id")
  @Requires("tasks", "edit")
  edit(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(EditTask)) body: EditTask) {
    return this.tasks.edit(me, id, body);
  }
}
