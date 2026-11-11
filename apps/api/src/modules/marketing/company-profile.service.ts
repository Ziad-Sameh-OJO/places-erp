import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@places/db";
import type { CompanyProfileAdmin, CompanyProfileBaseInput, CompanyProfileLatest, CompanyProfileVersionView, DealLogoInput } from "@places/contracts";
import { logoPages, profileChanges, profileLogos } from "@places/domain";
import { PDFDocument } from "pdf-lib";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import { FilesService } from "../../core/files/files.service";
import { DocumentsService, FONT_CSS, esc } from "../../core/documents/documents.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { DealMarketingService } from "../deals/deal-marketing.service";

/** system.File entities: marketing's own PDF (one slot: the newest is the file), the built PDFs, each deal's logo. */
const BASE = "CompanyProfileBase";
const BASE_SLOT = "current";
const BUILT = "CompanyProfile";
const LOGO = "DealLogo";
const VERSIONS_SHOWN = 20;
/** PDF points (1/72 in) → CSS pixels (1/96 in): Chromium takes page sizes in px, in, cm or mm, not pt. */
const PX_PER_PT = 96 / 72;
const NO_FILE = "ارفع ملف الـ Company Profile (PDF) الأول";

/**
 * M-04 · Q26 · the Company Profile: marketing uploads its PDF, a logo on each Done Deal, presses Done on the ones to
 * add; «شوف الشكل الجديد» renders the file + «عملاؤنا» pages, «Update» keeps it as the newest version for everyone.
 */
@Injectable()
export class CompanyProfileService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
    private readonly documents: DocumentsService,
    private readonly deals: DealMarketingService,
  ) {}

  /** Everyone signed in: the newest Company Profile. */
  async latest(): Promise<CompanyProfileLatest> {
    const v = await this.db.companyProfileVersion.findFirst({ orderBy: { createdAt: "desc" } });
    return { latest: v ? (await this.views([v]))[0]! : null };
  }

  /** Marketing's card on «الصفقات». */
  async admin(): Promise<CompanyProfileAdmin> {
    const [base, versions, logos] = await Promise.all([
      this.base(),
      this.db.companyProfileVersion.findMany({ orderBy: { createdAt: "desc" }, take: VERSIONS_SHOWN }),
      this.db.companyProfileLogo.findMany(),
    ]);
    const published = new Set(versions[0]?.dealIds ?? []);
    const links = new Map(await Promise.all(logos.map(async (l) => [l.fileId, await this.files.downloadUrl(l.fileId).then((x) => x.url, () => null)] as const)));
    const c = profileChanges(profileLogos(logos).map((l) => l.dealId), versions[0] ?? null, base?.id ?? null);
    return {
      base: base && { id: base.id, name: base.name, at: base.createdAt.toISOString() },
      versions: await this.views(versions),
      logos: Object.fromEntries(logos.map((l) => [l.dealId, { url: links.get(l.fileId) ?? null, done: !!l.doneAt, published: published.has(l.dealId) }])),
      changes: { added: c.added.length, removed: c.removed.length, newBase: c.newBase, any: c.any },
    };
  }

  /** «ارفع الملف»: the caller's own finished PDF becomes the file the next «Update» builds on. */
  async setBase(me: CurrentUser, input: CompanyProfileBaseInput) {
    const [f] = await this.files.names([input.fileId]);
    if (f?.mime !== "application/pdf") throw new BadRequestException("الـ Company Profile لازم يكون PDF");
    const before = await this.base();
    await this.db.$transaction(async (tx) => {
      await this.files.attach(me, [input.fileId], BASE, BASE_SLOT, tx);
      await this.audit.record({ module: "marketing", entity: "CompanyProfile", entityId: BASE_SLOT, action: "file", userId: me.id, before: { file: before?.name ?? null }, after: { file: f.name } }, tx);
    });
  }

  /** «ارفع لوجو» on a Done Deal: the caller's own finished image; a new one replaces the old (Done stays as it was). */
  async setLogo(me: CurrentUser, dealId: string, input: DealLogoInput) {
    if (!(await this.deals.onSheet(dealId))) throw new NotFoundException("الصفقة دي مش موجودة");
    const [f] = await this.files.names([input.fileId]);
    if (!f?.mime.startsWith("image/")) throw new BadRequestException("اللوجو لازم يكون صورة");
    await this.db.$transaction(async (tx) => {
      const before = await tx.companyProfileLogo.findUnique({ where: { dealId } });
      await this.files.attach(me, [input.fileId], LOGO, dealId, tx);
      await tx.companyProfileLogo.upsert({ where: { dealId }, create: { dealId, fileId: input.fileId }, update: { fileId: input.fileId } });
      await this.audit.record({ module: "marketing", entity: "DealLogo", entityId: dealId, action: "logo", userId: me.id, before: { file: before?.fileId ?? null }, after: { file: input.fileId } }, tx);
    });
  }

  /** «Done» = the logo goes on «عملاؤنا» at the next «Update»; «شيل» takes it back. */
  async setDone(me: CurrentUser, dealId: string, done: boolean) {
    await this.db.$transaction(async (tx) => {
      const l = await tx.companyProfileLogo.findUnique({ where: { dealId } });
      if (!l) throw new BadRequestException("ارفع لوجو الصفقة الأول");
      if (!!l.doneAt === done) return;
      await tx.companyProfileLogo.update({ where: { dealId }, data: done ? { doneAt: new Date(), doneById: me.id } : { doneAt: null, doneById: null } });
      await this.audit.record({ module: "marketing", entity: "DealLogo", entityId: dealId, action: done ? "done" : "undone", userId: me.id, before: { done: !done }, after: { done } }, tx);
    });
  }

  /** «شوف الشكل الجديد»: the PDF an «Update» would keep, nothing saved. */
  async preview(): Promise<Buffer> {
    const base = await this.base();
    if (!base) throw new BadRequestException(NO_FILE);
    return (await this.build(base.id)).pdf;
  }

  /** «Update»: build, keep the PDF, and it's the newest version — what everyone gets from now on. */
  async publish(me: CurrentUser): Promise<CompanyProfileVersionView> {
    const base = await this.base();
    if (!base) throw new BadRequestException(NO_FILE);
    const last = await this.db.companyProfileVersion.findFirst({ orderBy: { createdAt: "desc" } });
    const { pdf, dealIds } = await this.build(base.id);
    if (!profileChanges(dealIds, last, base.id).any) throw new BadRequestException("مفيش جديد يتعمله Update");
    const id = randomUUID();
    const stored = await this.files.store(me, { name: `Places Company Profile.pdf`, mime: "application/pdf", body: pdf, entity: BUILT, entityId: id });
    const v = await this.db.$transaction(async (tx) => {
      const row = await tx.companyProfileVersion.create({ data: { id, baseFileId: base.id, fileId: stored.id, dealIds, createdById: me.id } });
      await this.audit.record({ module: "marketing", entity: "CompanyProfile", entityId: id, action: "publish", userId: me.id, before: { logos: last?.dealIds.length ?? 0 }, after: { logos: dealIds.length, file: base.name } }, tx);
      return row;
    });
    // everyone but the one who pressed it hears of the new version (client, 11 Nov); the home card already shows it
    const everyone = await this.db.user.findMany({ where: { status: "ACTIVE", id: { not: me.id } }, select: { id: true } });
    await this.notifications.notify({ event: "marketing.company_profile", text: `اتعمل Update للـ Company Profile · فيه ${dealIds.length} لوجو في «عملاؤنا» · افتحه من الرئيسية`, link: "/", userIds: everyone.map((u) => u.id) });
    return (await this.views([v]))[0]!;
  }

  private async base() {
    const all = await this.files.of(BASE, BASE_SLOT); // oldest first: the last one is the file
    return all.at(-1) ?? null;
  }

  /** Marketing's PDF + «عملاؤنا» pages the same size as its last page, built with Chromium (Arabic shaping, ADR-0005). */
  private async build(baseFileId: string): Promise<{ pdf: Buffer; dealIds: string[] }> {
    const file = await this.files.bytes(baseFileId);
    if (!file) throw new ServiceUnavailableException("ملف الـ Company Profile مش متاح دلوقتي · جرّب تاني");
    const doc = await PDFDocument.load(file.body, { ignoreEncryption: true }).catch(() => { throw new BadRequestException("ملف الـ PDF ده مش سليم · ارفع نسخة تانية"); });
    const logos = profileLogos(await this.db.companyProfileLogo.findMany({ where: { doneAt: { not: null } } }));
    const names = await this.deals.names(logos.map((l) => l.dealId));
    const shown = logos.filter((l) => names.has(l.dealId)); // a deal that left the sheet (cancelled) leaves «عملاؤنا» too
    if (shown.length) {
      const pics = await Promise.all(shown.map((l) => this.files.dataUrl(l.fileId)));
      const cells = shown.map((l, i) => ({ name: names.get(l.dealId) ?? "", src: pics[i] ?? null }));
      const size = doc.getPage(doc.getPageCount() - 1).getSize();
      const w = Math.round(size.width * PX_PER_PT), h = Math.round(size.height * PX_PER_PT);
      const pages = await this.documents.pdf(clientsHtml(logoPages(cells), w, h), new Date(), { size: { width: `${w}px`, height: `${h}px` } });
      const extra = await PDFDocument.load(pages);
      for (const p of await doc.copyPages(extra, extra.getPageIndices())) doc.addPage(p);
    }
    return { pdf: Buffer.from(await doc.save()), dealIds: shown.map((l) => l.dealId) };
  }

  private async views(rows: Array<{ id: string; fileId: string; dealIds: string[]; createdById: string; createdAt: Date }>): Promise<CompanyProfileVersionView[]> {
    const users = await this.db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, email: true, employee: { select: { name: true } } } });
    const who = new Map(users.map((u) => [u.id, u.employee?.name ?? u.email]));
    const link = (id: string, inline: boolean) => this.files.downloadUrl(id, inline).then((l) => l.url, () => null);
    return Promise.all(rows.map(async (r) => ({
      id: r.id, at: r.createdAt.toISOString(), by: who.get(r.createdById) ?? "", logos: r.dealIds.length,
      url: await link(r.fileId, true), download: await link(r.fileId, false),
    })));
  }
}

/** «عملاؤنا»: each page a grid of 20 logos (5 × 4 landscape, 4 × 5 portrait) with the client's name under each, in the brand's blue. */
function clientsHtml(pages: Array<Array<{ name: string; src: string | null }>>, w: number, h: number): string {
  const u = Math.min(w, h) / 100; // 1% of the short side: the same look on A4, landscape or a square brochure
  const cols = w >= h ? 5 : 4, rows = Math.ceil(20 / cols);
  const body = pages.map((cells, i) => `<section class="pg"><header><span class="bar"></span><h1>عملاؤنا</h1>${pages.length > 1 ? `<small>${i + 1} / ${pages.length}</small>` : ""}</header>
<div class="grid">${cells.map((c) => `<figure>${c.src ? `<div class="pic"><img src="${esc(c.src)}" alt=""></div>` : `<div class="pic none"></div>`}<figcaption>${esc(c.name)}</figcaption></figure>`).join("")}</div>
<footer>Places · عقارات</footer></section>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${FONT_CSS}
* { box-sizing: border-box; margin: 0; }
html, body { width: ${w}px; }
body { font-family: "IBM Plex Sans Arabic", sans-serif; color: #0b1220; }
.pg { width: ${w}px; height: ${h - 1}px; overflow: hidden; padding: ${8 * u}px ${8 * u}px ${5 * u}px; display: flex; flex-direction: column; gap: ${4 * u}px; break-after: page; background: #fff; }
.pg:last-child { break-after: auto; }
header { display: flex; align-items: center; gap: ${2 * u}px; }
header .bar { width: ${1.4 * u}px; height: ${7 * u}px; background: #0037ff; border-radius: ${0.6 * u}px; }
h1 { font-size: ${6 * u}px; font-weight: 700; line-height: 1; }
header small { margin-inline-start: auto; color: #6b7489; font-size: ${2 * u}px; }
.grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr); gap: ${2.4 * u}px; }
figure { min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${1.2 * u}px; border: 1px solid #e3e8f1; border-radius: ${1.6 * u}px; padding: ${1.8 * u}px; }
.pic { flex: 1; width: 100%; min-height: 0; display: flex; align-items: center; justify-content: center; }
.pic img { max-width: 100%; max-height: 100%; object-fit: contain; }
.pic.none { background: #f1f4f9; border-radius: ${u}px; }
figcaption { font-size: ${1.9 * u}px; font-weight: 700; text-align: center; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
footer { text-align: center; color: #6b7489; font-size: ${1.8 * u}px; }
</style></head><body>${body}</body></html>`;
}
