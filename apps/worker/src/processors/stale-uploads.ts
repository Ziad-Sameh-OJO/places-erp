/**
 * #209: an upload the browser never finished (closed tab, failed PUT) stays PENDING forever and may leave an object
 * nobody checked. After 24 hours (the upload link lived five minutes) the object is deleted if it's there and the row
 * becomes REJECTED. Idempotent: deleting a missing object is not an error, and the row is only claimed while still PENDING.
 */
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@places/db";
import { env } from "../env.ts";

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT, region: "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
});

export async function staleUploadsTick(now = new Date()): Promise<number> {
  const stale = await prisma.file.findMany({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } }, select: { id: true, key: true } });
  let done = 0;
  for (const f of stale) {
    // storage first: if it's down the row stays PENDING and tomorrow's run tries again
    if (f.key) await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: f.key }));
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.file.updateMany({ where: { id: f.id, status: "PENDING" }, data: { status: "REJECTED" } });
      if (!claimed.count) return;
      await tx.auditLog.create({ data: { module: "files", entity: "File", entityId: f.id, action: "expire", before: { status: "PENDING" }, after: { status: "REJECTED" } } });
      done++;
    });
  }
  return done;
}
