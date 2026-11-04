import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { SettingsModule } from "../settings/settings.module";
import { OfficeAssetsController } from "./office-assets.controller";
import { OfficeAssetsService } from "./office-assets.service";
import { OfficeAssetsRepository } from "./office-assets.repository";
import { PurchasesController } from "./purchases.controller";
import { PurchasesService } from "./purchases.service";
import { PurchasesRepository } from "./purchases.repository";

/** M-08 · المشتريات: purchase requests through approval to finance's payment (10.1–10.3), the office assets register and the office boys' rota (10.4). */
@Module({
  imports: [FinanceModule, SettingsModule],
  controllers: [PurchasesController, OfficeAssetsController],
  providers: [PurchasesService, PurchasesRepository, OfficeAssetsService, OfficeAssetsRepository],
})
export class ProcurementModule {}
