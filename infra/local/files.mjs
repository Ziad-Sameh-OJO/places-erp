// File storage without Docker: `pnpm files:local` runs a MinIO you installed (on PATH, or MINIO_BIN) on localhost:9000
// (console :9001) over .local/minio-data, with the S3_* keys from .env. With Docker, `pnpm infra:up` starts it instead.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../.local/", import.meta.url)); // not .pathname: it keeps spaces as %20
const env = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const busy = await new Promise((ok) => { const s = connect(9000, "127.0.0.1", () => { s.end(); ok(true); }).on("error", () => ok(false)); });
if (busy) { console.log("something is already running on localhost:9000"); process.exit(0); }

let bin = process.env.MINIO_BIN;
if (!bin) try { bin = execFileSync("which", ["minio"], { encoding: "utf8" }).trim(); } catch { /* not installed */ }
if (!bin) {
  // MinIO stopped publishing binaries (and archived its repo), so there is nothing safe to download automatically
  console.error("minio not found · use Docker (pnpm infra:up), or install a minio build and set MINIO_BIN=/path/to/minio");
  process.exit(1);
}

const data = `${root}minio-data`;
mkdirSync(data, { recursive: true });
const minio = spawn(bin, ["server", data, "--address", "127.0.0.1:9000", "--console-address", "127.0.0.1:9001", "--quiet"], {
  stdio: "inherit",
  env: { ...process.env, MINIO_ROOT_USER: process.env.S3_ACCESS_KEY ?? "places", MINIO_ROOT_PASSWORD: process.env.S3_SECRET_KEY ?? "places-secret" },
});
console.log("minio ready on localhost:9000 · console http://localhost:9001");
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => minio.kill(sig));
minio.on("exit", (code) => process.exit(code ?? 0));
