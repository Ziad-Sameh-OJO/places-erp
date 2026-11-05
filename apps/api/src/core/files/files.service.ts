import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Prisma, PrismaClient } from "@places/db";
import type { StoredFile, UploadRequest, UploadTicket } from "@places/contracts";
import { PRISMA } from "../database/database.module";
import { AuditService } from "../audit/audit.service";
import { env } from "../../config/env";
import type { CurrentUser } from "../auth/current-user.decorator";

/** Links live five minutes: long enough to upload 20 MB on a phone, short enough that a leaked link is useless. */
const LINK_TTL = 300;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
/** The first bytes each allowed type must start with: the declared type alone is the uploader's word. */
const SIGNATURE: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  "application/pdf": (b) => ascii(b, 0, 5) === "%PDF-",
};
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const ROW = { id: true, name: true, mime: true, size: true, status: true, createdAt: true } as const;

/**
 * Object storage (S3/MinIO). The bytes never pass through the API: it checks the request, hands out a short pre-signed
 * PUT link with the size and type signed in, checks the stored object afterwards, and hands out short GET links.
 * Modules decide who may read a file (by the record it belongs to) and call downloadUrl().
 */
@Injectable()
export class FilesService implements OnModuleInit {
  private readonly log = new Logger("files");
  private readonly s3 = new S3Client({
    endpoint: env.S3_ENDPOINT, region: "us-east-1", forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });

  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService) {}

  /** Creates the bucket on a fresh MinIO. Storage being down must not stop the API: only uploads fail. */
  async onModuleInit() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET })).catch(() => this.s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET })));
    } catch (e) {
      this.log.warn(`file storage unreachable at ${env.S3_ENDPOINT} (${(e as Error).name}) · run pnpm files:local`);
    }
  }

  async requestUpload(me: CurrentUser, f: UploadRequest): Promise<UploadTicket> {
    const file = await this.db.$transaction(async (tx) => {
      const row = await tx.file.create({ data: { key: "", name: f.name, mime: f.mime, size: f.size, uploadedById: me.id } });
      const now = new Date();
      // the key never comes from the uploaded name, so no path tricks and no clashes
      const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${row.id}.${EXT[f.mime]}`;
      await this.audit.record({ module: "files", entity: "File", entityId: row.id, action: "create", userId: me.id, after: { name: f.name, mime: f.mime, size: f.size } }, tx);
      return tx.file.update({ where: { id: row.id }, data: { key } });
    });
    const url = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: file.key, ContentType: f.mime, ContentLength: f.size }), {
      expiresIn: LINK_TTL, signableHeaders: new Set(["content-type", "content-length"]),
    });
    return { id: file.id, url, headers: { "Content-Type": f.mime }, expiresIn: LINK_TTL };
  }

  /** After the browser's PUT: the object must be there with the size and type that were asked for. */
  async complete(me: CurrentUser, id: string): Promise<StoredFile> {
    const file = await this.db.file.findFirst({ where: { id, uploadedById: me.id } });
    if (!file) throw new NotFoundException("الملف مش موجود");
    if (file.status !== "PENDING") throw new ConflictException("الملف ده اتأكد قبل كده");
    const head = await this.s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: file.key })).catch(() => null);
    if (!head) throw new ConflictException("الملف لسه مترفعش");
    let ok = head.ContentLength === file.size && head.ContentType === file.mime;
    if (ok) {
      const start = await this.s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: file.key, Range: "bytes=0-11" }));
      ok = SIGNATURE[file.mime]?.(await start.Body!.transformToByteArray()) ?? false;
    }
    if (!ok) await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: file.key }));
    const done = await this.db.$transaction(async (tx) => {
      const row = await tx.file.update({ where: { id }, data: { status: ok ? "READY" : "REJECTED" }, select: ROW });
      await this.audit.record({ module: "files", entity: "File", entityId: id, action: "update", userId: me.id, before: { status: "PENDING" }, after: { status: row.status } }, tx);
      return row;
    });
    if (!ok) throw new BadRequestException("الملف اللي اترفع مش مطابق للي اتطلب");
    return { ...done, createdAt: done.createdAt.toISOString() };
  }

  /** A file the API made itself (a PDF, an export): straight into storage, READY, audited. */
  async store(me: CurrentUser, f: { name: string; mime: string; body: Buffer; entity?: string; entityId?: string }) {
    const file = await this.db.$transaction(async (tx) => {
      const row = await tx.file.create({ data: { key: "", name: f.name, mime: f.mime, size: f.body.length, uploadedById: me.id, status: "READY", entity: f.entity ?? null, entityId: f.entityId ?? null } });
      const now = new Date();
      const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${row.id}.${EXT[f.mime] ?? "bin"}`;
      await this.audit.record({ module: "files", entity: "File", entityId: row.id, action: "create", userId: me.id, after: { name: f.name, mime: f.mime, size: f.body.length, generated: true } }, tx);
      const saved = await tx.file.update({ where: { id: row.id }, data: { key } });
      // inside the transaction: if storage refuses, the record isn't kept either
      await this.s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: f.body, ContentType: f.mime }));
      return saved;
    });
    return { id: file.id, name: file.name, ...(await this.downloadUrl(file.id)) };
  }

  /** A short GET link. Callers check who may see the file first (by the record it belongs to). */
  async downloadUrl(id: string, inline = true) {
    const file = await this.db.file.findUnique({ where: { id } });
    if (!file || file.status !== "READY") throw new NotFoundException("الملف مش موجود");
    const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`;
    const url = await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: file.key, ResponseContentDisposition: disposition }), { expiresIn: LINK_TTL });
    return { url, expiresIn: LINK_TTL };
  }

  /** A READY image as a data: URL, for a PDF (it never fetches anything). Null when it's gone or storage is down. */
  async dataUrl(id: string): Promise<string | null> {
    const file = await this.db.file.findUnique({ where: { id } });
    if (!file || file.status !== "READY") return null;
    try {
      const obj = await this.s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: file.key }));
      return `data:${file.mime};base64,${Buffer.from(await obj.Body!.transformToByteArray()).toString("base64")}`;
    } catch (e) {
      this.log.warn(`couldn't read ${id} (${(e as Error).name})`);
      return null;
    }
  }

  /** Ties the caller's own finished, still-unattached uploads to a record; from then on that record decides who sees them. */
  async attach(me: CurrentUser, ids: string[], entity: string, entityId: string, tx: Prisma.TransactionClient) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const n = await tx.file.updateMany({ where: { id: { in: unique }, uploadedById: me.id, status: "READY", entity: null }, data: { entity, entityId } });
    if (n.count !== unique.length) throw new BadRequestException("فيه مرفق مش موجود أو لسه مترفعش");
  }

  names(ids: string[]) {
    return this.db.file.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  }

  /** The generic endpoint only serves your own uploads (the preview right after uploading). */
  async ownDownloadUrl(me: CurrentUser, id: string) {
    if (!(await this.db.file.count({ where: { id, uploadedById: me.id } }))) throw new NotFoundException("الملف مش موجود");
    return this.downloadUrl(id);
  }
}
