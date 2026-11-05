import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@places/db";
import type { ClaimEinvoice, ClaimView, ClaimsView, CollectClaim, NewClaim } from "@places/contracts";
import { CLAIM_STATUS_LABEL, PAY_METHOD, claimStep, formatEGP, fromDecimal, localDate, toDecimal, type ClaimStatus, type ClaimStep, type DocKind } from "@places/domain";
import { AuditService } from "../../core/audit/audit.service";
import { NotificationsService } from "../../core/notifications/notifications.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { DocumentsSetupService } from "../settings/documents-setup.service";
import { VouchersService } from "./vouchers.service";
import { ClaimsRepository, type ClaimRow } from "./claims.repository";
import type { Tx } from "./ledger.repository";

type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const no = (c: { no: number }) => `CL-${c.no}`;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const amount = (c: ClaimRow) => toDecimal(fromDecimal(c.amount.toFixed(2)));
const OPEN: ClaimStatus[] = ["requested", "issued", "approved", "einvoice"];

/**
 * M-07 · 9.17 claims: sales asks → the accountant issues it from the claim template (or rejects it) → the client
 * approves → the e-invoice is uploaded → collected: a receive voucher (9.11) and the cash receipt from the receipt
 * template. Each step is checked by `claimStep`, audited in its transaction, and notifies the other side.
 * Deals (5.1/5.2) aren't built yet: a claim isn't tied to one for now (`dealId` stays empty).
 */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly repo: ClaimsRepository,
    private readonly vouchers: VouchersService,
    private readonly docs: DocumentsSetupService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Finance sees every claim; anyone else only the ones they asked for (scope in the query). */
  private scope(me: CurrentUser): Prisma.ClaimWhereInput {
    return me.grants.can("finance", "view") ? {} : { requestedById: me.id };
  }

  async list(me: CurrentUser, status: "open" | "requested" | "approved" | "paid" | "all"): Promise<ClaimsView> {
    const where = { ...this.scope(me), ...(status === "all" ? {} : status === "open" ? { status: { in: OPEN } } : { status }) };
    const [rows, incomes, entities] = await Promise.all([
      this.repo.list(where), me.grants.can("finance", "create") ? this.vouchers.commissionLines() : [], this.docs.entities(),
    ]);
    return { items: await this.views(rows), incomes, entities };
  }

  async create(me: CurrentUser, input: NewClaim, run: Run): Promise<ClaimView> {
    const c = await run(async (tx) => {
      if (!(await this.repo.entity(input.entityId, tx))) throw new BadRequestException("اختار المطالبة باسم مين");
      const row = await this.repo.create({ company: input.company, unit: input.unit, unitInfo: input.unitInfo, amount: input.amount, side: input.side, kind: input.kind,
        entityId: input.entityId, note: input.note || null, requestedById: me.id }, tx);
      await this.audit.record({ module: "finance", entity: "Claim", entityId: row.id, action: "create", userId: me.id, after: { no: no(row), company: row.company, unit: row.unit, amount: amount(row), entity: row.entityId } }, tx);
      return row;
    });
    await this.notifications.notify({ event: "finance.claim", text: `${me.name} طالب مطالبة ${no(c)} · ${c.company} · ${formatEGP(fromDecimal(amount(c)))}`, link: "/finance" });
    return (await this.views([c]))[0]!;
  }

  /** One step of the claim: checked against its state, saved and audited together. */
  private async step(me: CurrentUser, id: string, step: ClaimStep, run: Run, data: (c: ClaimRow, tx: Tx) => Promise<Prisma.ClaimUncheckedUpdateInput>, onlyMine = false) {
    return run(async (tx) => {
      const c = await this.repo.find({ id, ...(onlyMine ? { requestedById: me.id } : {}) }, tx);
      if (!c) throw new NotFoundException("المطالبة مش موجودة");
      const next = claimStep(c.status as ClaimStatus, step);
      if ("problem" in next) throw new BadRequestException(next.problem);
      const patch = { ...(await data(c, tx)), status: next.status };
      const row = await this.repo.update(id, patch, tx);
      await this.audit.record({ module: "finance", entity: "Claim", entityId: id, action: "update", userId: me.id, before: { status: c.status }, after: { step, ...patch } }, tx);
      return row;
    });
  }

  /** «اعتمد واعمل المطالبة» */
  async issue(me: CurrentUser, id: string, run: Run) {
    const c = await this.step(me, id, "issue", run, async () => ({ issuedById: me.id, issuedAt: new Date() }));
    await this.tell(c, `المطالبة ${no(c)} جاهزة · ابعتها لـ ${c.company}`);
  }

  async reject(me: CurrentUser, id: string, why: string, run: Run) {
    const c = await this.step(me, id, "reject", run, async () => ({ why }));
    await this.tell(c, `المطالبة ${no(c)} اترفضت: ${why}`);
  }

  /** Sales: «العميل اعتمد» → the accountant uploads the e-invoice. */
  async clientApproved(me: CurrentUser, id: string, run: Run) {
    const c = await this.step(me, id, "clientApproved", run, async () => ({ approvedAt: new Date() }), true);
    await this.notifications.notify({ event: "finance.claim", text: `العميل اعتمد المطالبة ${no(c)} (${c.company}) وطالب فاتورة إلكترونية بـ ${formatEGP(fromDecimal(amount(c)))}`, link: "/finance" });
  }

  /** Sales: «العميل دفع · اطلب إيصال» */
  async askReceipt(me: CurrentUser, id: string, run: Run) {
    const c = await this.step(me, id, "askReceipt", run, async (x) => {
      if (x.receiptAskedAt) throw new BadRequestException("الإيصال اتطلب قبل كده");
      return { receiptAskedAt: new Date() };
    }, true);
    await this.notifications.notify({ event: "finance.claim", text: `${me.name}: ${c.company} دفع ${formatEGP(fromDecimal(amount(c)))} وطالب إيصال استلام نقدية (${no(c)}) · سجّل التحصيل`, link: "/finance" });
  }

  async einvoice(me: CurrentUser, id: string, e: ClaimEinvoice, run: Run) {
    if (e.date > localDate(new Date())) throw new BadRequestException("مينفعش تاريخ بعد النهارده");
    const c = await this.step(me, id, "einvoice", run, async () => ({ einvoiceNo: e.no, einvoiceDate: new Date(`${e.date}T00:00:00Z`) }));
    await this.tell(c, `الفاتورة الإلكترونية للمطالبة ${no(c)} اترفعت (${e.no}) · ابلغ العميل`);
  }

  /** «اتحصّلت · اعمل الإيصال»: the receive voucher on the claim's amount, then the receipt's serial, in one transaction. */
  async collect(me: CurrentUser, id: string, input: CollectClaim, run: Run) {
    const c = await this.step(me, id, "collect", run, async (x, tx) => {
      const mv = await this.vouchers.recordClaimReceipt(me, { toId: input.toId, accountId: input.accountId, amount: amount(x), party: x.company, ref: no(x), memo: `تحصيل المطالبة ${no(x)} · ${x.kind} · ${x.unit}`, date: input.date }, tx);
      const kind = (await this.repo.accountKind(input.toId, tx))?.kind ?? "";
      return { moveId: mv.id, receiptNo: await this.repo.nextReceiptNo(tx), payMethod: PAY_METHOD[kind] ?? "تحويل بنكي", paidAt: new Date(`${mv.date}T00:00:00Z`) };
    });
    await this.tell(c, `إيصال استلام النقدية RC-${c.receiptNo} جاهز · ${c.company} · ${formatEGP(fromDecimal(amount(c)))}`);
  }

  /** The claim or its receipt as a PDF page, for whoever can see the claim. */
  async document(me: CurrentUser, id: string, kind: DocKind) {
    const c = await this.repo.find({ id, ...this.scope(me) });
    if (!c) throw new NotFoundException("المطالبة مش موجودة");
    if (kind === "claim" && (c.status === "requested" || c.status === "rejected")) throw new BadRequestException("المطالبة لسه ما اتعملتش");
    if (kind === "receipt" && c.status !== "paid") throw new BadRequestException("الإيصال بيتعمل بعد التحصيل");
    const docNo = kind === "claim" ? no(c) : `RC-${c.receiptNo}`;
    const { title, html } = await this.docs.render(kind, {
      no: docNo, claimNo: no(c), date: day(kind === "claim" ? c.issuedAt : c.paidAt) ?? "", entityId: c.entityId, company: c.company, unit: c.unit,
      unitInfo: c.unitInfo, amount: amount(c), kind: c.kind, payMethod: c.payMethod ?? undefined, einvoiceNo: c.einvoiceNo,
    });
    return { name: `${title} ${docNo}.pdf`, html };
  }

  private tell(c: ClaimRow, text: string) {
    return this.notifications.notify({ event: "finance.claim_ready", text, link: "/finance", userIds: [c.requestedById] });
  }

  private async views(rows: ClaimRow[]): Promise<ClaimView[]> {
    const names = new Map((await this.repo.names([...new Set(rows.map((r) => r.requestedById))])).map((n) => [n.userId, n.name]));
    return rows.map((c) => ({
      id: c.id, no: no(c), company: c.company, unit: c.unit, unitInfo: c.unitInfo, amount: amount(c), side: c.side as "client" | "owner", kind: c.kind,
      entity: c.entity, note: c.note, status: c.status as ClaimStatus, label: CLAIM_STATUS_LABEL[c.status as ClaimStatus], why: c.why,
      by: { id: c.requestedById, name: names.get(c.requestedById) ?? "" }, at: c.createdAt.toISOString(), receiptAsked: !!c.receiptAskedAt,
      einvoice: c.einvoiceNo ? { no: c.einvoiceNo, date: day(c.einvoiceDate)! } : null, receiptNo: c.receiptNo ? `RC-${c.receiptNo}` : null,
      move: c.move ? { id: c.move.id, no: `MV-${c.move.no}` } : null,
    }));
  }
}
