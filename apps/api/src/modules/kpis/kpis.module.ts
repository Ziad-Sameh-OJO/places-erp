import { Module } from "@nestjs/common";
import { KpisController } from "./kpis.controller";
import { KpisRepository } from "./kpis.repository";
import { KpisService } from "./kpis.service";

/** M-12 · KPI cards: my card, my team, the whole company, the item source editor, a new quarter, the KPI watcher (11.1–11.4 · 11.11 · 11.14). */
@Module({ controllers: [KpisController], providers: [KpisService, KpisRepository] })
export class KpisModule {}
