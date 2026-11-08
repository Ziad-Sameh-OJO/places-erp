import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CreateTask, EditTask, MoveTask, TaskFilters, TaskSlaQuery, TaskUnitQuery, UnitPhotosInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { writeZip } from "../../core/files/zip";
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

  /** M-12: the photo / Retouch SLA and «accepted the first time», of the caller's scope. */
  @Get("sla")
  @Requires("tasks", "view")
  sla(@Me() me: CurrentUser, @Query(new ZodPipe(TaskSlaQuery)) q: TaskSlaQuery) {
    return this.tasks.slaReport(me, q);
  }

  @Get("units")
  @Requires("tasks", "create")
  units(@Query(new ZodPipe(TaskUnitQuery)) f: TaskUnitQuery) {
    return this.tasks.units(f.q);
  }

  @Get(":id")
  @Requires("tasks", "view")
  get(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.tasks.get(me, id);
  }

  /** 4.12: the unit's Pic & Info folder from its Retouch task (who may is the domain's retouchFolder). */
  @Get(":id/photos")
  @Requires("tasks", "view")
  photos(@Me() me: CurrentUser, @Param("id") id: string) {
    return this.tasks.photos(me, id);
  }

  @Get(":id/photos/zip")
  @Requires("tasks", "view")
  async photosZip(@Me() me: CurrentUser, @Param("id") id: string, @Res() res: Response) {
    const z = await this.tasks.photosZip(me, id);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(z.filename)}`);
    await writeZip(res, z.entries);
    res.end();
  }

  /** 4.12: the designer's edited photos, into the unit's folder. */
  @Post(":id/photos")
  @Requires("tasks", "edit")
  addPhotos(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(UnitPhotosInput)) b: UnitPhotosInput) {
    return this.tasks.addPhotos(me, id, b.fileIds);
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
