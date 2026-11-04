// Local PostgreSQL without Docker (pnpm db:local). Data lives in .local/pg and survives restarts; Ctrl+C stops it.
// Same user/database/port as infra/docker/docker-compose.yml, so DATABASE_URL in .env.example works for both.
import EmbeddedPostgres from "embedded-postgres";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { connect } from "node:net";

// the port comes from DATABASE_URL in .env, so a Postgres already installed on 5432 can stay where it is
try { process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url))); } catch { /* no .env: defaults */ }
const port = Number(new URL(process.env.DATABASE_URL ?? "postgresql://localhost:5432").port || 5432);

// already running (another tab, or left over from an earlier run)? then there's nothing to do
const busy = await new Promise((ok) => { const s = connect(port, "127.0.0.1", () => { s.end(); ok(true); }).on("error", () => ok(false)); });
if (busy) { console.log(`postgres is already running on localhost:${port}`); process.exit(0); }

const dir = fileURLToPath(new URL("../../.local/pg", import.meta.url)); // not .pathname: it keeps spaces as %20
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "places", password: "places", port, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C"] }); // UTF8 for Arabic, whatever the Windows locale

if (!existsSync(dir)) await pg.initialise();
await pg.start();
await pg.createDatabase("places").catch(() => {}); // already there
console.log(`postgres ready on localhost:${port} (Ctrl+C to stop)`);
process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
