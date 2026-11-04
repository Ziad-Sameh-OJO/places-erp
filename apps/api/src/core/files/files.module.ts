import { Global, Module } from "@nestjs/common";
import { FilesService } from "./files.service";
import { FilesController } from "./files.controller";

/** Global: any module can attach files and hand out download links without importing this one. */
@Global()
@Module({ providers: [FilesService], controllers: [FilesController], exports: [FilesService] })
export class FilesModule {}
