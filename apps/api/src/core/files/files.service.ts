import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { CopyObjectCommand, CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Prisma, PrismaClient } from "@places/db";
import type { StoredFile, UploadRequest, UploadTicket } from "@places/contracts";
import { FILE_KINDS } from "@places/contracts";
import { PRISMA } from "../database/database.module";
import { AuditService } from "../audit/audit.service";
import { env } from "../../config/env";
import type { CurrentUser } from "../auth/current-user.decorator";

/** Links live five minutes: long enough to upload 20 MB on a phone, short enough that a leaked link is useless. */
const LINK_TTL = 300;
/**
 * S12 · each account's upload budget, so nobody can fill the disk with tickets: a few unfinished uploads at a time
 * (a form with several photos), and 2 GB a day (10 of the biggest Content plan videos, 200 MB each).
 */
const MAX_PENDING = 20;
const DAILY_BYTES = 2 * 1024 * 1024 * 1024;
const DAY_MS = 24 * 3_600_000;
/** Where a file lives once it's checked; the upload link writes to `incoming/`, so it can't touch a READY file (S12). */
const finalKey = (id: string, ext: string, at: Date) => `${at.getUTCFullYear()}/${String(at.getUTCMonth() + 1).padStart(2, "0")}/${id}.${ext}`;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "image/vnd.dwg": "dwg", "image/vnd.dxf": "dxf", "video/mp4": "mp4", "video/quicktime": "mov", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx" };
/** «المستندات»: a Word file only ever belongs to a document template or a document issued from one. */
const WORD = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
/** 4.21 · videos only ever belong to a Content plan post. */
const VIDEO = ["video/mp4", "video/quicktime"];
/** An ISO-BMFF box type at bytes 4–8: mp4 starts with «ftyp»; a QuickTime file may start with any of these. */
const MOV_BOXES = ["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"];
/** The first bytes each allowed type must start with: the declared type alone is the uploader's word. */
const SIGNATURE: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  "application/pdf": (b) => ascii(b, 0, 5) === "%PDF-",
  // a .docx is a ZIP: «PK\x03\x04»; whether it really is a Word file is checked when the template reads it
  [WORD[0]!]: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04,
  // 2.35 · AutoCAD: a DWG starts with its version («AC1032»…); a DXF is text that opens with group code 0, or binary
  "image/vnd.dwg": (b) => ascii(b, 0, 4) === "AC10",
  "image/vnd.dxf": (b) => /^\s*0\s*\r?\n/.test(ascii(b, 0, 12)) || ascii(b, 0, 12) === "AutoCAD Bina",
  "video/mp4": (b) => ascii(b, 4, 8) === "ftyp",
  "video/quicktime": (b) => MOV_BOXES.includes(ascii(b, 4, 8)),
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
    const since = new Date(Date.now() - DAY_MS);
    const [pending, today] = await Promise.all([
      this.db.file.count({ where: { uploadedById: me.id, status: "PENDING", createdAt: { gte: since } } }),
      this.db.file.aggregate({ where: { uploadedById: me.id, createdAt: { gte: since } }, _sum: { size: true } }),
    ]);
    if (pending >= MAX_PENDING) throw new HttpException("عندك ملفات كتير لسه بتترفع · كمّلها الأول", HttpStatus.TOO_MANY_REQUESTS);
    if ((today._sum.size ?? 0) + f.size > DAILY_BYTES) throw new HttpException("وصلت لحد الرفع النهارده (2 جيجا) · جرّب بكره", HttpStatus.TOO_MANY_REQUESTS);
    const file = await this.db.$transaction(async (tx) => {
      const row = await tx.file.create({ data: { key: "", name: f.name, mime: f.mime, size: f.size, uploadedById: me.id } });
      // the key never comes from the uploaded name, so no path tricks and no clashes
      const key = `incoming/${row.id}.${EXT[f.mime]}`;
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
    // S12 · a checked file moves out of reach of its upload link (still valid for a few minutes): a second PUT can't swap it
    const key = ok ? finalKey(file.id, EXT[file.mime]!, file.createdAt) : file.key;
    if (ok) await this.s3.send(new CopyObjectCommand({ Bucket: env.S3_BUCKET, Key: key, CopySource: `${env.S3_BUCKET}/${file.key}`, CopySourceIfMatch: head.ETag }));
    await this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: file.key }));
    const done = await this.db.$transaction(async (tx) => {
      const row = await tx.file.update({ where: { id }, data: { status: ok ? "READY" : "REJECTED", key }, select: ROW });
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
      const key = finalKey(row.id, EXT[f.mime] ?? "bin", new Date());
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
    const f = await this.bytes(id);
    return f && `data:${f.mime};base64,${f.body.toString("base64")}`;
  }

  /** A READY file's bytes (a PDF's photos, a folder's ZIP). Null when it's gone or storage is down. */
  async bytes(id: string): Promise<{ mime: string; body: Buffer } | null> {
    const file = await this.db.file.findUnique({ where: { id } });
    if (!file || file.status !== "READY") return null;
    try {
      const obj = await this.s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: file.key }));
      return { mime: file.mime, body: Buffer.from(await obj.Body!.transformToByteArray()) };
    } catch (e) {
      this.log.warn(`couldn't read ${id} (${(e as Error).name})`);
      return null;
    }
  }

  /** Ties the caller's own finished, still-unattached uploads to a record; from then on that record decides who sees them. */
  async attach(me: CurrentUser, ids: string[], entity: string, entityId: string, tx: Prisma.TransactionClient) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const kind = entity === "Post" ? { mime: { notIn: WORD } } : entity === "WordTemplate" ? { mime: { in: WORD } } : { mime: { notIn: [...VIDEO, ...WORD] } };
    // M-04: a PDF past the usual 20 MB (purpose "profile") is the Company Profile's file and nothing else's
    const size = entity === "CompanyProfileBase" ? {} : { NOT: { mime: "application/pdf", size: { gt: FILE_KINDS.pdf.maxBytes } } };
    const n = await tx.file.updateMany({ where: { id: { in: unique }, uploadedById: me.id, status: "READY", entity: null, ...kind, ...size }, data: { entity, entityId } });
    if (n.count !== unique.length) throw new BadRequestException("فيه مرفق مش موجود أو لسه مترفعش");
  }

  /** The files tied to a record, oldest first. */
  of(entity: string, entityId: string) {
    return this.db.file.findMany({ where: { entity, entityId, status: "READY" }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, mime: true, uploadedById: true, createdAt: true } });
  }

  /** Takes a record's file away for good: the row inside the caller's transaction, the object after it (best effort). */
  async remove(id: string, entity: string, entityId: string, tx: Prisma.TransactionClient) {
    const f = await tx.file.findFirst({ where: { id, entity, entityId } });
    if (!f) throw new NotFoundException("الملف مش موجود");
    await tx.file.delete({ where: { id } });
    return () => this.s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: f.key })).then(() => undefined, (e: Error) => this.log.warn(`couldn't delete ${id} (${e.name})`));
  }

  names(ids: string[]) {
    return this.db.file.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, mime: true, uploadedById: true, createdAt: true } });
  }

  /** The generic endpoint only serves your own uploads (the preview right after uploading). */
  async ownDownloadUrl(me: CurrentUser, id: string) {
    if (!(await this.db.file.count({ where: { id, uploadedById: me.id } }))) throw new NotFoundException("الملف مش موجود");
    return this.downloadUrl(id);
  }
}
