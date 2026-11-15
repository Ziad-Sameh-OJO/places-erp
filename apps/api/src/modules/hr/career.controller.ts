import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CareerMoveInput, CareerTrackInput } from "@places/contracts";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { CareerService } from "./career.service";

/** HTTP only. M-05 · «المسار الوظيفي» (HR, 15 Nov): the tracks, everyone's level and who's due a promotion. */
@Controller("hr/career")
export class CareerController {
  constructor(private readonly career: CareerService) {}

  @Get()
  @Requires("hr", "view")
  view(@Me() me: CurrentUser) {
    return this.career.view(me);
  }

  @Post("tracks")
  @Requires("hr", "edit")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(CareerTrackInput)) body: CareerTrackInput) {
    return this.career.saveTrack(me, null, body);
  }

  @Put("tracks/:id")
  @Requires("hr", "edit")
  update(@Me() me: CurrentUser, @Param("id") id: string, @Body(new ZodPipe(CareerTrackInput)) body: CareerTrackInput) {
    return this.career.saveTrack(me, id, body);
  }

  @Delete("tracks/:id")
  @Requires("hr", "edit")
  @HttpCode(204)
  async remove(@Me() me: CurrentUser, @Param("id") id: string) {
    await this.career.deleteTrack(me, id);
  }

  /** HR sets someone's level or records a promotion (new level, day, note). */
  @Post("moves")
  @Requires("hr", "edit")
  move(@Me() me: CurrentUser, @Body(new ZodPipe(CareerMoveInput)) body: CareerMoveInput) {
    return this.career.move(me, body);
  }
}
