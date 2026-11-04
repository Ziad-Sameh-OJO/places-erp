import { Global, Module } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";

/** Global: every module that prints (TCR, unit PDF, receipts) uses DocumentsService. */
@Global()
@Module({ providers: [DocumentsService], controllers: [DocumentsController], exports: [DocumentsService] })
export class DocumentsModule {}
