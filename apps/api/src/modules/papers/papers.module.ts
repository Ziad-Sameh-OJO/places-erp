import { Module } from "@nestjs/common";
import { PapersController } from "./papers.controller";
import { PapersRepository } from "./papers.repository";
import { PapersService } from "./papers.service";

/** «المستندات» (client, 25 Nov): Word templates and the documents issued from them. */
@Module({ controllers: [PapersController], providers: [PapersService, PapersRepository] })
export class PapersModule {}
