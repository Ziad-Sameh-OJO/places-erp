import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@places/db";
import type { DocTemplateInput, DocTemplateView, DocumentsSetup, EntityPatch, EntityView, StampInput } from "@places/contracts";
import { DOC_DEFAULTS, amountInWords, fillTemplate, fromDecimal, type DocKind } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import { FilesService } from "../../core/files/files.service";
import { STAMP_KEY, esc, layout, type StampSetting } from "../../core/documents/documents.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";

const SUPER_ADMIN = "admin";
/** «100,000 ج.م»: Latin digits like the rest of the PDFs; the number alone stays left-to-right. */
const num = (amount: string) => (fromDecimal(amount) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (amount: string) => `${num(amount)} ج.م`;
const lines = (s: string) => esc(s).replace(/\n/g, "<br>");

/** What a claim or a receipt prints (9.17); the preview uses a made-up one. */
export interface DocData {
  no: string; date: string; entityId: string; company: string; unit: string; unitInfo: string; amount: string; kind: string;
  claimNo: string; payMethod?: string | undefined; einvoiceNo?: string | null | undefined;
}

/**
 * M-13 · 12.12: the stamp and signature (Super Admin only), the entities claims go out under (logo + bank), and the
 * claim / receipt templates. Every change is audited; the documents themselves are rendered here so the preview and
 * the real claim are the same page.
 */
@Injectable()
export class DocumentsSetupService {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient, private readonly audit: AuditService, private readonly files: FilesService) {}

  async setup(): Promise<DocumentsSetup> {
    const [entities, rows, stamp] = await Promise.all([
      this.db.entity.findMany({ orderBy: { id: "asc" } }),
      this.db.docTemplate.findMany(),
      this.db.setting.findUnique({ where: { key: STAMP_KEY } }),
    ]);
    const s = (stamp?.value ?? {}) as StampSetting;
    const link = async (id: string | null | undefined) => (id ? (await this.files.downloadUrl(id).catch(() => null))?.url ?? null : null);
    const by = s.by ? (await this.db.employee.findFirst({ where: { userId: s.by }, select: { name: true } }))?.name ?? null : null;
    return {
      entities: await Promise.all(entities.map(async (e): Promise<EntityView> => ({ id: e.id, name: e.name, logo: await link(e.logoFileId), bank: e.bank, accountName: e.accountName, accountNo: e.accountNo, iban: e.iban }))),
      templates: (Object.keys(DOC_DEFAULTS) as DocKind[]).map((kind): DocTemplateView => {
        const r = rows.find((x) => x.kind === kind);
        return { kind, ...(r ? { title: r.title, body: r.body, closing: r.closing } : DOC_DEFAULTS[kind]), custom: !!r };
      }),
      stamp: { stamp: await link(s.stamp), signature: await link(s.signature), by, at: s.at ?? null },
    };
  }

  /** 12.12: only the Super Admin uploads or removes the stamp and the signature. */
  async setStamp(me: CurrentUser, input: StampInput) {
    if (!me.roles.includes(SUPER_ADMIN)) throw new ForbiddenException("الختم والإمضا بيرفعهم الـ Super Admin بس");
    await this.db.$transaction(async (tx) => {
      const before = ((await tx.setting.findUnique({ where: { key: STAMP_KEY } }))?.value ?? {}) as StampSetting;
      if (input.fileId) {
        const f = await tx.file.findFirst({ where: { id: input.fileId, uploadedById: me.id, status: "READY" } });
        if (!f || !["image/png", "image/jpeg"].includes(f.mime)) throw new BadRequestException("ارفع صورة PNG أو JPG");
        await this.files.attach(me, [input.fileId], "Setting", STAMP_KEY, tx);
      }
      const after: StampSetting = { ...before, [input.kind]: input.fileId, by: me.id, at: new Date().toISOString() };
      await tx.setting.upsert({ where: { key: STAMP_KEY }, create: { key: STAMP_KEY, value: { ...after } }, update: { value: { ...after } } });
      await this.audit.record({ module: "master", entity: "Setting", entityId: STAMP_KEY, action: "update", userId: me.id, before: { [input.kind]: before[input.kind] ?? null }, after: { [input.kind]: input.fileId } }, tx);
    });
  }

  async setEntity(me: CurrentUser, id: string, p: EntityPatch) {
    await this.db.$transaction(async (tx) => {
      const before = await tx.entity.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("الجهة مش موجودة");
      if (p.logoFileId) {
        const f = await tx.file.findFirst({ where: { id: p.logoFileId, uploadedById: me.id, status: "READY" } });
        if (!f || !["image/png", "image/jpeg"].includes(f.mime)) throw new BadRequestException("ارفع صورة PNG أو JPG");
        await this.files.attach(me, [p.logoFileId], "Entity", id, tx);
      }
      const data = { bank: p.bank, accountName: p.accountName, accountNo: p.accountNo, iban: p.iban, ...(p.logoFileId ? { logoFileId: p.logoFileId } : {}) };
      await tx.entity.update({ where: { id }, data });
      await this.audit.record({ module: "master", entity: "Entity", entityId: id, action: "update", userId: me.id,
        before: { bank: before.bank, accountName: before.accountName, accountNo: before.accountNo, iban: before.iban, logoFileId: before.logoFileId }, after: data }, tx);
    });
  }

  /** `input` null = «رجّع الافتراضي». */
  async setTemplate(me: CurrentUser, kind: DocKind, input: DocTemplateInput | null) {
    await this.db.$transaction(async (tx) => {
      const before = await tx.docTemplate.findUnique({ where: { kind } });
      if (input) await tx.docTemplate.upsert({ where: { kind }, create: { kind, ...input }, update: input });
      else if (before) await tx.docTemplate.delete({ where: { kind } });
      await this.audit.record({ module: "master", entity: "DocTemplate", entityId: kind, action: input ? "update" : "delete", userId: me.id,
        before: before ? { title: before.title, body: before.body, closing: before.closing } : null, after: input ?? DOC_DEFAULTS[kind] }, tx);
    });
  }

  async entities() {
    return this.db.entity.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
  }

  /** The claim or the receipt as an HTML page (the demo's `doc()`): the entity's logo, the template filled in, the bank details on a claim. */
  async render(kind: DocKind, d: DocData): Promise<{ title: string; html: string }> {
    const [row, e] = await Promise.all([this.db.docTemplate.findUnique({ where: { kind } }), this.db.entity.findUnique({ where: { id: d.entityId } })]);
    const t = row ?? DOC_DEFAULTS[kind];
    const logo = e?.logoFileId ? await this.files.dataUrl(e.logoFileId) : null;
    const words = amountInWords(fromDecimal(d.amount));
    const fill = (s: string) => lines(fillTemplate(s, { الشركة: d.company, الوحدة: d.unit, بيانات_الوحدة: d.unitInfo, المبلغ: money(d.amount), المبلغ_بالحروف: words, نوع_العمولة: d.kind, رقم_المطالبة: d.claimNo, التاريخ: d.date, طريقة_الدفع: d.payMethod ?? "تحويل بنكي" }));
    const kv: [string, string][] = [["التاريخ", d.date], ...(kind === "receipt" && d.einvoiceNo ? [["الفاتورة الإلكترونية", d.einvoiceNo] as [string, string]] : []), ...(kind === "receipt" ? [["رقم المطالبة", d.claimNo] as [string, string]] : [])];
    const bank = kind === "claim" && e && (e.bank || e.accountNo || e.iban)
      ? `<h2>بيانات التحويل</h2><table><tbody>${[["البنك", e.bank || "—"], ["اسم الحساب", e.accountName || e.name], ["رقم الحساب", e.accountNo || "—"], ["IBAN", e.iban || "—"]].map(([k, v]) => `<tr><th>${esc(k)}</th><td><span class="num">${esc(v)}</span></td></tr>`).join("")}</tbody></table>` : "";
    const html = layout(`${t.title} ${d.no}`, `
      <div style="display:flex;align-items:center;gap:12pt;margin-bottom:12pt">${logo ? `<img src="${esc(logo)}" alt="${esc(e?.name)}" style="max-height:60pt;max-width:140pt">` : `<b>${esc(e?.name)}</b>`}
        <div><h1 style="margin:0">${esc(t.title)}</h1><span class="num">${esc(d.no)}</span></div></div>
      <table><tbody>${kv.map(([k, v]) => `<tr><th>${esc(k)}</th><td><span class="num">${esc(v)}</span></td></tr>`).join("")}</tbody></table>
      <p>${fill(t.body)}</p>
      <table><thead><tr><th>البيان</th><th>القيمة</th></tr></thead><tbody>
        <tr><td>الشركة</td><td>${esc(d.company)}</td></tr><tr><td>الوحدة</td><td>${esc(d.unit)} · ${esc(d.unitInfo)}</td></tr>
        <tr><td>المبلغ</td><td><b><span class="num">${num(d.amount)}</span> ج.م</b></td></tr><tr><td>المبلغ بالحروف</td><td>${esc(words)}</td></tr>
      </tbody></table>${bank}<p>${fill(t.closing)}</p>`);
    return { title: t.title, html };
  }
}
