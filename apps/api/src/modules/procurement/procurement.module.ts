import { Module } from "@nestjs/common";
import { OfficeAssetsController } from "./office-assets.controller";
import { OfficeAssetsService } from "./office-assets.service";
import { OfficeAssetsRepository } from "./office-assets.repository";

/** M-08 · المشتريات. So far: the office assets register and the office boys' rota (10.4); requests come with their tasks. */
@Module({
  controllers: [OfficeAssetsController],
  providers: [OfficeAssetsService, OfficeAssetsRepository],
})
export class ProcurementModule {}
