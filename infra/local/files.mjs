// File storage without Docker: `pnpm files:local` runs an S3 server on localhost:9000 with the S3_* keys from .env —
// versitygw, the one production runs (infra/server/README.md; VERSITYGW_BIN, .local/bin or on PATH; data in
// .local/s3-files), else a MinIO you installed (MINIO_BIN or on PATH; data in .local/minio-data), else rclone's
// `serve s3` (RCLONE_BIN or on PATH; data in .local/s3-data). With Docker, `pnpm infra:up` starts versitygw instead.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../.local/", import.meta.url)); // not .pathname: it keeps spaces as %20
const env = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);

const busy = await new Promise((ok) => { const s = connect(9000, "127.0.0.1", () => { s.end(); ok(true); }).on("error", () => ok(false)); });
if (busy) { console.log("something is already running on localhost:9000"); process.exit(0); }

const user = process.env.S3_ACCESS_KEY ?? "places";
const secret = process.env.S3_SECRET_KEY ?? "places-secret";
const find = (name) => {
  for (const cmd of process.platform === "win32" ? ["where", "which"] : ["which"]) {
    try { return execFileSync(cmd, [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/)[0].trim(); } catch { /* not there */ }
  }
};

let server;
const local = `${root}bin/versitygw${process.platform === "win32" ? ".exe" : ""}`;
const vgw = process.env.VERSITYGW_BIN || (existsSync(local) ? local : find("versitygw"));
const minio = !vgw && (process.env.MINIO_BIN || find("minio"));
const rclone = !vgw && !minio && (process.env.RCLONE_BIN || find("rclone"));
if (vgw) {
  // The same flags as production: plain files on disk, their type in a sidecar folder (no xattrs: works on Windows, and
  // a plain copy of both folders is the backup). CORS for the web's origin, which uploads straight to the signed link.
  const data = `${root}s3-files`, meta = `${root}s3-meta`;
  for (const d of [data, meta]) mkdirSync(d, { recursive: true });
  server = spawn(vgw, ["--port", "127.0.0.1:9000", "--iam-dir", meta, "--cors-allow-origin", process.env.WEB_ORIGIN || "*", "--quiet", "posix", "--sidecar", meta, data], {
    stdio: "inherit", env: { ...process.env, ROOT_ACCESS_KEY: user, ROOT_SECRET_KEY: secret },
  });
  console.log(`versitygw ready on localhost:9000 · files in ${data}`);
} else if (minio) {
  const data = `${root}minio-data`;
  mkdirSync(data, { recursive: true });
  server = spawn(minio, ["server", data, "--address", "127.0.0.1:9000", "--console-address", "127.0.0.1:9001", "--quiet"], {
    stdio: "inherit", env: { ...process.env, MINIO_ROOT_USER: user, MINIO_ROOT_PASSWORD: secret },
  });
  console.log("minio ready on localhost:9000 · console http://localhost:9001");
} else if (rclone) {
  // MinIO stopped publishing binaries (its downloads answer 410). The browser uploads straight to the pre-signed link
  // from the web's port, hence CORS; it only listens on 127.0.0.1.
  const data = `${root}s3-data`;
  mkdirSync(data, { recursive: true });
  server = spawn(rclone, ["serve", "s3", data, "--addr", "127.0.0.1:9000", "--allow-origin", "*", "--log-level", "NOTICE"], {
    stdio: "inherit", env: { ...process.env, RCLONE_AUTH_KEY: `"${user},${secret}"` }, // quoted: rclone reads list flags as CSV
  });
  console.log("rclone S3 ready on localhost:9000 (the API creates the bucket on start)");
} else {
  console.error("no S3 server found · use Docker (pnpm infra:up), or put versitygw in .local/bin (infra/server/README.md), or install rclone (winget install Rclone.Rclone)");
  process.exit(1);
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
