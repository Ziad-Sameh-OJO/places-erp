import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { env } from "./config/env";
import { AllExceptionsFilter } from "./core/http/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // 13.3: every browser call comes through the web app's /api rewrite, so without this req.ip is the web server for
  // everyone: one shared rate-limit bucket (10 logins a minute for the whole company) and the wrong IP in the audit log
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true }); // only our own web app, with the session cookie
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
bootstrap();
