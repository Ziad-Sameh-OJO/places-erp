// Local Redis without Docker (pnpm redis:local), for the BullMQ jobs. Same port as docker-compose (6379).
// Uses `redis-server` if it's installed (e.g. Homebrew); otherwise the first run downloads the official source
// and builds only the server into .local/redis (needs make + a C compiler, about a minute). Ctrl+C stops it.
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { cpus } from "node:os";

const root = fileURLToPath(new URL("../../.local/", import.meta.url)); // not .pathname: it keeps spaces as %20
const built = `${root}redis/src/redis-server`;

function findBinary() {
  if (process.env.REDIS_SERVER_BIN) return process.env.REDIS_SERVER_BIN;
  try { return execFileSync("which", ["redis-server"], { encoding: "utf8" }).trim(); } catch { /* not installed */ }
  return existsSync(built) ? built : null;
}

function build() {
  console.log("redis-server not found · downloading the official source and building it (first run only)…");
  mkdirSync(`${root}redis`, { recursive: true });
  execFileSync("sh", ["-c", `curl -fsSL https://download.redis.io/redis-stable.tar.gz | tar xz -C "${root}redis" --strip-components 1`], { stdio: "inherit" });
  // only the server: the module tests need extra toolchain pieces and aren't needed to run Redis
  execFileSync("make", ["-C", `${root}redis/src`, "redis-server", "MALLOC=libc", "BUILD_TLS=no", `-j${Math.max(2, cpus().length)}`], { stdio: "inherit" });
  return built;
}

const bin = findBinary() ?? build();
mkdirSync(`${root}redis-data`, { recursive: true });
const redis = spawn(bin, ["--port", "6379", "--bind", "127.0.0.1", "--dir", `${root}redis-data`], { stdio: ["ignore", "pipe", "inherit"] });
redis.stdout.on("data", (d) => { if (String(d).includes("Ready to accept connections")) console.log("redis ready on localhost:6379 (Ctrl+C to stop)"); });
redis.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => redis.kill("SIGINT"));
