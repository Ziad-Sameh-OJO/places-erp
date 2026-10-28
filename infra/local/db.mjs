// Local PostgreSQL without Docker (pnpm db:local). Data lives in .local/pg and survives restarts; Ctrl+C stops it.
// Same user/database/port as infra/docker/docker-compose.yml, so DATABASE_URL in .env.example works for both.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dir = new URL("../../.local/pg", import.meta.url).pathname;
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "places", password: "places", port: 5432, persistent: true });

if (!existsSync(dir)) await pg.initialise();
await pg.start();
await pg.createDatabase("places").catch(() => {}); // already there
console.log("postgres ready on localhost:5432 (Ctrl+C to stop)");
process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
