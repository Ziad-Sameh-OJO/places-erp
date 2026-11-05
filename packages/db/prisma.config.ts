// Prisma 7 takes the connection string from here, not from schema.prisma. The package scripts load ../../.env first.
import { defineConfig, env } from "prisma/config";

export default defineConfig({ schema: "prisma/schema.prisma", datasource: { url: env("DATABASE_URL") } });
