import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import type { PrismaClient } from "@places/db";
import { ClaimEinvoice, ClaimFilter, CollectClaim, Id, NewClaim, RejectClaim } from "@places/contracts";
import { DOC_KINDS, type DocKind } from "@places/domain";
import { PRISMA } from "../../core/database/database.module";
import { DocumentsService, sendPdf } from "../../core/documents/documents.service";
import { ZodPipe } from "../../core/http/zod.pipe";
import { Requires, SignedIn } from "../../core/authz/requires.decorator";
import { Me, type CurrentUser } from "../../core/auth/current-user.decorator";
import { ClaimsService } from "./claims.service";
import type { Tx } from "./ledger.repository";

const DocQuery = z.object({ doc: z.enum(DOC_KINDS).default("claim") });

/**
 * HTTP only. M-07 9.17: sales asks for a claim and reports the client's approval / payment («deals: create»); the
 * accountant issues, rejects («finance: approve»), records the e-invoice («finance: edit») and collects («finance: create»).
 * Reading is signed-in with the scope in the query: finance sees all, others the claims they asked for.
 */
@Controller("claims")
export class ClaimsController {
  constructor(private readonly claims: ClaimsService, private readonly docs: DocumentsService, @Inject(PRISMA) private readonly db: PrismaClient) {}

  private readonly run = <T>(fn: (tx: Tx) => Promise<T>) => this.db.$transaction(fn);

  @Get() @SignedIn()
  list(@Me() me: CurrentUser, @Query(new ZodPipe(ClaimFilter)) q: z.infer<typeof ClaimFilter>) { return this.claims.list(me, q.status); }

  @Post() @Requires("deals", "create")
  create(@Me() me: CurrentUser, @Body(new ZodPipe(NewClaim)) b: NewClaim) { return this.claims.create(me, b, this.run); }

  @Post(":id/issue") @Requires("finance", "approve") @HttpCode(204)
  issue(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) { return this.claims.issue(me, id, this.run); }

  @Post(":id/reject") @Requires("finance", "approve") @HttpCode(204)
  reject(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(RejectClaim)) b: { why: string }) { return this.claims.reject(me, id, b.why, this.run); }

  @Post(":id/client-approved") @Requires("deals", "create") @HttpCode(204)
  clientApproved(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) { return this.claims.clientApproved(me, id, this.run); }

  @Post(":id/ask-receipt") @Requires("deals", "create") @HttpCode(204)
  askReceipt(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string) { return this.claims.askReceipt(me, id, this.run); }

  @Post(":id/einvoice") @Requires("finance", "edit") @HttpCode(204)
  einvoice(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(ClaimEinvoice)) b: ClaimEinvoice) { return this.claims.einvoice(me, id, b, this.run); }

  @Post(":id/collect") @Requires("finance", "create") @HttpCode(204)
  collect(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Body(new ZodPipe(CollectClaim)) b: CollectClaim) { return this.claims.collect(me, id, b, this.run); }

  /** The claim (`doc=claim`) or the cash receipt (`doc=receipt`), with the stamp and signature. */
  @Get(":id/pdf") @SignedIn()
  async pdf(@Me() me: CurrentUser, @Param("id", new ZodPipe(Id)) id: string, @Query(new ZodPipe(DocQuery)) q: { doc: DocKind }, @Res() res: Response) {
    const { name, html } = await this.claims.document(me, id, q.doc);
    sendPdf(res, name, await this.docs.pdf(html));
  }
}
