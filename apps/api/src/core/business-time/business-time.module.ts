import { Global, Module } from "@nestjs/common";
import { BusinessTimeService } from "./business-time.service";

@Global()
@Module({ providers: [BusinessTimeService], exports: [BusinessTimeService] })
export class BusinessTimeModule {}
