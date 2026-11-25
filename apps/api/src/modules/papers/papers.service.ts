import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import JSZip from "jszip";
import type { DecideDocument, IssueDocument, NewTemplate, PaperOptions, PaperRow, TemplateCard, TemplateField, TemplateSettings, TemplateView } from "@places/contracts";
import { addImagePart, fillWordTemplate, imageMarks, imageRun, imageSize, managesTemplates, seesTemplate, templateFields, type TemplateMode } from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { PapersRepository } from "./papers.repository";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const NO_TEMPLATE = "القالب مش موجود";
const NO_DOC = "المستند مش موجود";
type Stored = { id: number; label: string; context: string; named: boolean; skip: boolean };
type Template = NonNullable<Awaited<ReturnType<PapersRepository["template"]>>>;

/**
 * «المستندات» (client, 25 Nov): the manager (Super Admin, Office Manager) uploads a Word file as it is and names its
 * blanks; whoever may see a template fills them and downloads the filled Word file. «بلّغ بس» issues it at once and
 * tells the people the template lists; «لازم موافقة» waits for one of its approvers. Everyone keeps what they issued
 * in «مستنداتي».
 */
@Injectable()
export class PapersService {
  constructor(private readonly repo: PapersRepository, private readonly files: FilesService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  private manager(me: CurrentUser) {
    if (!managesTemplates(me.roles)) throw new ForbiddenException("القوالب بيظبطها الـ Super Admin والـ Office Manager");
  }

  /** The templates this person may issue documents from. */
  async cards(me: CurrentUser): Promise<TemplateCard[]> {
    const all = await this.repo.templates({ active: true });
    return all.filter((t) => seesTemplate(t, me)).map((t) => ({
      id: t.id, name: t.name, mode: t.mode as TemplateMode,
      fields: (t.fields as Stored[]).filter((f) => !f.skip).map((f) => ({ id: f.id, label: f.label })),
    }));
  }

  async manage(me: CurrentUser): Promise<TemplateView[]> {
    this.manager(me);
    const all = await this.repo.templates();
    const files = new Map((await this.files.names(all.map((t) => t.fileId))).map((f) => [f.id, f.name]));
    return Promise.all(all.map(async (t) => this.view(t, files.get(t.fileId) ?? "", t._count.documents)));
  }

  options(me: CurrentUser): Promise<PaperOptions> {
    this.manager(me);
    return Promise.all([this.repo.roles(), this.repo.people()]).then(([roles, people]) => ({
      roles: roles.map((r) => ({ key: r.key, name: r.label })), people: people.map((p) => ({ id: p.userId, name: p.name })),
    }));
  }

  /** Upload: the file is read once to find its fields; it's a template only if Word can open it. */
  async create(me: CurrentUser, input: NewTemplate): Promise<TemplateView> {
    this.manager(me);
    const f = await this.repo.file(input.fileId);
    if (!f || f.uploadedById !== me.id || f.status !== "READY" || f.entity) throw new BadRequestException("ارفع ملف الوورد الأول");
    if (f.mime !== DOCX) throw new BadRequestException("القالب لازم يبقى ملف Word (.docx)");
    const xml = await this.documentXml(f.id);
    const fields: Stored[] = templateFields(xml).map((x) => ({ ...x, skip: false }));
    const t = await this.repo.db.$transaction(async (tx) => {
      const row = await tx.wordTemplate.create({ data: { name: input.name, fileId: f.id, fields, createdById: me.id } });
      await this.files.attach(me, [f.id], "WordTemplate", row.id, tx);
      await this.audit.record({ module: "master", entity: "WordTemplate", entityId: row.id, action: "create", userId: me.id, after: { name: row.name, fields: fields.length } }, tx);
      return row;
    });
    return this.view(t, f.name, 0, xml);
  }

  async update(me: CurrentUser, id: string, input: TemplateSettings): Promise<TemplateView> {
    this.manager(me);
    const t = await this.repo.template(id);
    if (!t) throw new NotFoundException(NO_TEMPLATE);
    const stored = t.fields as Stored[], named = new Map(input.fields.map((f) => [f.id, f]));
    if (input.fields.some((f) => !stored.some((s) => s.id === f.id))) throw new BadRequestException("فيه خانة مش في الملف");
    // the file decides which fields exist; the manager only names them or marks them «مش خانة»
    const fields: Stored[] = stored.map((s) => ({ ...s, label: named.get(s.id)?.label ?? s.label, skip: named.get(s.id)?.skip ?? s.skip }));
    const data = { name: input.name, fields, seeRoles: input.seeRoles, seeUserIds: input.seeUserIds, mode: input.mode, approverIds: input.approverIds, notifyIds: input.notifyIds, stamp: input.stamp, active: input.active };
    const saved = await this.repo.db.$transaction(async (tx) => {
      const row = await tx.wordTemplate.update({ where: { id }, data });
      await this.audit.record({ module: "master", entity: "WordTemplate", entityId: id, action: "update", userId: me.id,
        before: { name: t.name, fields: t.fields, seeRoles: t.seeRoles, seeUserIds: t.seeUserIds, mode: t.mode, approverIds: t.approverIds, notifyIds: t.notifyIds, stamp: t.stamp, active: t.active },
        after: data }, tx);
      return row;
    });
    const [file] = await this.files.names([saved.fileId]);
    return this.view(saved, file?.name ?? "", await this.repo.db.wordDocument.count({ where: { templateId: id } }));
  }

  /** Removed from the lists; the documents issued from it stay in their owners' «مستنداتي». */
  async archive(me: CurrentUser, id: string) {
    this.manager(me);
    const t = await this.repo.template(id);
    if (!t) throw new NotFoundException(NO_TEMPLATE);
    await this.repo.db.$transaction(async (tx) => {
      await tx.wordTemplate.update({ where: { id }, data: { archivedAt: new Date(), active: false } });
      await this.audit.record({ module: "master", entity: "WordTemplate", entityId: id, action: "archive", userId: me.id, before: { name: t.name } }, tx);
    });
  }

  /** Fill the template: the Word file is made now; with «لازم موافقة» it's downloadable once approved. */
  async issue(me: CurrentUser, input: IssueDocument): Promise<PaperRow> {
    const t = await this.repo.template(input.templateId);
    if (!t || !t.active || !seesTemplate(t, me)) throw new NotFoundException(NO_TEMPLATE);
    const fields = (t.fields as Stored[]).filter((f) => !f.skip);
    const values: Record<number, string> = {};
    for (const f of fields) { const v = input.values[String(f.id)]?.trim(); if (v) values[f.id] = v; }
    if (!Object.keys(values).length && fields.length) throw new BadRequestException("املا خانة واحدة على الأقل");
    const body = await this.build(t, values);
    const approve = (t.mode as TemplateMode) === "approve";
    const doc = await this.repo.db.$transaction(async (tx) => {
      const code = await this.repo.nextCode(tx);
      const row = await tx.wordDocument.create({ data: { code, templateId: t.id, userId: me.id, values, status: approve ? "pending" : "ready" } });
      await this.audit.record({ module: "master", entity: "WordDocument", entityId: row.id, action: "create", userId: me.id, after: { code, template: t.name, values, status: row.status } }, tx);
      return row;
    });
    let fileId: string;
    try {
      fileId = (await this.files.store(me, { name: `${t.name} ${doc.code}.docx`, mime: DOCX, body, entity: "WordDocument", entityId: doc.id })).id;
    } catch (e) {
      await this.repo.db.wordDocument.delete({ where: { id: doc.id } }); // no document without its file
      throw e;
    }
    await this.repo.db.wordDocument.update({ where: { id: doc.id }, data: { fileId } });
    const link = "/papers";
    if (approve) await this.notifications.notify({ event: "paper.request", text: `${me.name} طالب «${t.name}» (${doc.code}) · مستني موافقتك`, link: `${link}?tab=approvals`, userIds: t.approverIds });
    else if (t.notifyIds.length) await this.notifications.notify({ event: "paper.issued", text: `${me.name} طلّع «${t.name}» (${doc.code})`, link, userIds: t.notifyIds });
    return (await this.rows([doc.id], me))[0]!;
  }

  mine(me: CurrentUser) {
    return this.repo.documents({ userId: me.id }).then((d) => this.toRows(d, me));
  }

  /** What waits for me, then what I decided lately. */
  async approvals(me: CurrentUser) {
    const docs = await this.repo.documents({ template: { approverIds: { has: me.id } }, OR: [{ status: "pending" }, { decidedById: me.id }] });
    return this.toRows(docs.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending")), me);
  }

  async decide(me: CurrentUser, id: string, input: DecideDocument): Promise<PaperRow> {
    const d = await this.repo.document(id);
    if (!d || !d.template.approverIds.includes(me.id)) throw new NotFoundException(NO_DOC);
    if (d.status !== "pending") throw new BadRequestException("المستند ده اتقرر فيه قبل كده");
    const status = input.approve ? "approved" : "rejected";
    await this.repo.db.$transaction(async (tx) => {
      await tx.wordDocument.update({ where: { id }, data: { status, decidedById: me.id, decidedAt: new Date(), decisionNote: input.note ?? null } });
      await this.audit.record({ module: "master", entity: "WordDocument", entityId: id, action: input.approve ? "approve" : "reject", userId: me.id,
        before: { status: "pending" }, after: { status, note: input.note ?? null } }, tx);
    });
    const what = `«${d.template.name}» (${d.code})`;
    await this.notifications.notify({ event: "paper.decided", text: input.approve ? `${me.name} وافق على ${what} · تقدر تنزّله` : `${me.name} رفض ${what}: ${input.note}`, link: "/papers", userIds: [d.userId] });
    if (input.approve && d.template.notifyIds.length) {
      const by = (await this.repo.names([d.userId])).get(d.userId) ?? "";
      await this.notifications.notify({ event: "paper.issued", text: `${by} طلّع ${what} · وافق عليه ${me.name}`, link: "/papers", userIds: d.template.notifyIds });
    }
    return (await this.rows([id], me))[0]!;
  }

  /** The filled file: its owner once it may be used; its approvers and the managers to read it any time. */
  async download(me: CurrentUser, id: string) {
    const d = await this.repo.document(id);
    if (!d?.fileId) throw new NotFoundException(NO_DOC);
    const reviewer = d.template.approverIds.includes(me.id) || managesTemplates(me.roles);
    if (!reviewer && !(d.userId === me.id && (d.status === "ready" || d.status === "approved"))) throw new NotFoundException(NO_DOC);
    return this.files.downloadUrl(d.fileId, false);
  }

  /** The template as uploaded, for the manager to check it. */
  async templateFile(me: CurrentUser, id: string) {
    this.manager(me);
    const t = await this.repo.template(id);
    if (!t) throw new NotFoundException(NO_TEMPLATE);
    return this.files.downloadUrl(t.fileId, false);
  }

  private async documentXml(fileId: string): Promise<string> {
    const f = await this.files.bytes(fileId);
    if (!f) throw new BadRequestException("الملف مش متاح دلوقتي، جرّب تاني");
    const xml = await JSZip.loadAsync(f.body).then((z) => z.file("word/document.xml")?.async("string")).catch(() => undefined);
    if (!xml) throw new BadRequestException("ده مش ملف Word سليم (.docx)");
    return xml;
  }

  /** The filled .docx: the values in the blanks, and the stamp and signature where the file marks them (if it prints them). */
  private async build(t: Template, values: Record<number, string>): Promise<Buffer> {
    const f = await this.files.bytes(t.fileId);
    if (!f) throw new BadRequestException("ملف القالب مش متاح دلوقتي، جرّب تاني");
    const zip = await JSZip.loadAsync(f.body);
    const xml = await zip.file("word/document.xml")!.async("string");
    const images: { stamp?: string; signature?: string } = {};
    if (t.stamp) {
      const marks = imageMarks(xml), s = await this.repo.stamp();
      const rels = zip.file("word/_rels/document.xml.rels");
      let relsXml = rels ? await rels.async("string") : "";
      let types = await zip.file("[Content_Types].xml")!.async("string");
      for (const [k, widthCm, n] of [["stamp", 3.5, 1], ["signature", 4.5, 2]] as const) {
        const fileId = s[k];
        if (!marks[k] || !fileId || !relsXml) continue;
        const img = await this.files.bytes(fileId);
        const size = img && imageSize(img.body);
        if (!img || !size) continue;
        const ext = img.mime === "image/png" ? "png" : "jpeg", rel = `rIdPlaces${n}`;
        zip.file(`word/media/places-${k}.${ext}`, img.body);
        ({ rels: relsXml, types } = addImagePart({ rels: relsXml, types }, { relId: rel, target: `media/places-${k}.${ext}`, ext, mime: img.mime }));
        images[k] = imageRun(rel, n, size, widthCm);
      }
      if (rels) zip.file("word/_rels/document.xml.rels", relsXml);
      zip.file("[Content_Types].xml", types);
    }
    zip.file("word/document.xml", fillWordTemplate(xml, values, images));
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  }

  private async view(t: Template, fileName: string, issued: number, xml?: string): Promise<TemplateView> {
    const marks = imageMarks(xml ?? await this.documentXml(t.fileId).catch(() => ""));
    return {
      id: t.id, name: t.name, mode: t.mode as TemplateMode, fields: t.fields as unknown as TemplateField[], file: { id: t.fileId, name: fileName },
      seeRoles: t.seeRoles, seeUserIds: t.seeUserIds, approverIds: t.approverIds, notifyIds: t.notifyIds, stamp: t.stamp, active: t.active,
      marks, issued, updatedAt: t.updatedAt.toISOString(),
    };
  }

  private async rows(ids: string[], me: CurrentUser) {
    return this.toRows(await this.repo.documents({ id: { in: ids } }), me);
  }

  private async toRows(docs: Awaited<ReturnType<PapersRepository["documents"]>>, me: CurrentUser): Promise<PaperRow[]> {
    const names = await this.repo.names([...new Set(docs.flatMap((d) => [d.userId, ...(d.decidedById ? [d.decidedById] : [])]))]);
    return docs.map((d) => {
      const fields = d.template.fields as Stored[], vals = d.values as Record<string, string>;
      return {
        id: d.id, code: d.code, template: { id: d.template.id, name: d.template.name }, by: { id: d.userId, name: names.get(d.userId) ?? "" },
        values: fields.filter((f) => vals[String(f.id)]).map((f) => ({ label: f.label, value: vals[String(f.id)]! })),
        status: d.status as PaperRow["status"],
        canDownload: !!d.fileId && (d.userId !== me.id || d.status === "ready" || d.status === "approved"),
        decidedBy: d.decidedById ? names.get(d.decidedById) ?? null : null, decidedAt: d.decidedAt?.toISOString() ?? null, note: d.decisionNote,
        createdAt: d.createdAt.toISOString(),
      };
    });
  }
}
