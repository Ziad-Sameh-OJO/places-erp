import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

/** M-13 · الإعدادات: lists (areas, channels, categories, vendors, leave types), SLA rules, holidays. */
@Module({ controllers: [SettingsController], providers: [SettingsService] })
export class SettingsModule {}
