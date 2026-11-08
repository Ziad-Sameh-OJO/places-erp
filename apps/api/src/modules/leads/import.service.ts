import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import type { CompanyImportRow, LeadImportRow } from "@places/contracts";
import { PRISMA } from "../../core/database/database.module";
import { AuditService } from "../../core/audit/audit.service";
import type { CurrentUser } from "../../core/auth/current-user.decorator";
import { IMPORT_TX, type ImportReport, type ParsedSheet } from "../../core/http/import";
import { ClientsService } from "../clients/clients.service";
import { LeadsRepository } from "./leads.repository";

/**
 * 13.1 · the old leads and the company archive from their templates, each in one transaction. Duplicates (a lead with
 * one of the mobiles, M-01's rule · a company with the same name and number, its unique key) are skipped, not merged.
 * `save` false = the preview's counts, nothing written.
 */
@Injectable()
export class LeadImportService {
  constructor(
    @Inject(PRISMA) private readonly db: PrismaClient,
    private readonly repo: LeadsRepository,
    private readonly audit: AuditService,
    private readonly clients: ClientsService,
  ) {}

  /** Old leads come in Fresh and unassigned (Operations hands them out), not through today's rotation or its notifications. */
  leads(me: CurrentUser, sheet: ParsedSheet<LeadImportRow>, save: boolean) {
    const seen = new Set<string>();
    const fixed = me.fields.fixed("leads"); // M-09: a column the person may not set comes in empty
    return this.each(sheet, save, async (tx, typed) => {
      const r = { ...typed, ...(fixed.has("space") ? { space: undefined } : {}), ...(fixed.has("budget") ? { budget: undefined } : {}),
        ...(fixed.has("note") ? { note: undefined } : {}), ...(fixed.has("company") ? { company: undefined } : {}) };
      if (r.phones.some((p) => seen.has(p)) || (await tx.lead.findFirst({ where: { phones: { hasSome: r.phones } }, select: { id: true } }))) return false;
      r.phones.forEach((p) => seen.add(p));
      if (!save) return true;
      const [{ n }] = (await this.repo.nextCode(tx)) as [{ n: bigint }];
      const company = r.company ? await this.repo.companyByName(tx, r.company) : null;
      const at = r.arrivedAt ? new Date(`${r.arrivedAt}T00:00:00Z`) : undefined;
      const lead = await tx.lead.create({
        data: {
          code: `L-${n}`, name: r.name, phones: r.phones, area: r.area, type: r.type, space: r.space ?? null, budget: r.budget ?? null,
          channel: r.channel, note: r.note ?? null, companyId: company?.id ?? null, createdById: me.id,
          clientId: await this.clients.fileOf(tx, r.phones), // M-10 2.3: a returning client's lead joins their file
          ...(at ? { arrivedAt: at, createdAt: at } : {}),
        },
      });
      await this.audit.record({ module: "leads", entity: "Lead", entityId: lead.id, action: "import", userId: me.id, after: lead }, tx);
      return true;
    });
  }

  companies(me: CurrentUser, sheet: ParsedSheet<CompanyImportRow>, save: boolean) {
    const seen = new Set<string>();
    return this.each(sheet, save, async (tx, r) => {
      const number = r.number ?? null;
      const key = `${r.name.toLowerCase()}|${number}`;
      if (seen.has(key) || (await tx.company.findFirst({ where: { name: { equals: r.name, mode: "insensitive" }, number }, select: { id: true } }))) return false;
      seen.add(key);
      if (!save) return true;
      const day = (d?: string) => (d ? new Date(`${d}T00:00:00Z`) : null);
      const c = await tx.company.create({
        data: {
          name: r.name, category: r.category, number, contactName: r.contactName ?? null, contactTitle: r.contactTitle ?? null, email: r.email ?? null,
          currentLocation: r.currentLocation ?? null, currentSpace: r.currentSpace ?? null, contractStart: day(r.contractStart), contractEnd: day(r.contractEnd),
          averageRent: r.averageRent ?? null, annualEscalation: r.annualEscalation ?? null, feedback: r.feedback ?? null,
        },
      });
      await this.audit.record({ module: "leads", entity: "Company", entityId: c.id, action: "import", userId: me.id, after: c }, tx);
      return true;
    });
  }

  /** `add` says whether the row is new (and saves it when saving). */
  private async each<T>(sheet: ParsedSheet<T>, save: boolean, add: (tx: Prisma.TransactionClient, row: T) => Promise<boolean>): Promise<ImportReport> {
    let added = 0, duplicates = 0;
    const run = async (tx: Prisma.TransactionClient) => { for (const { data } of sheet.rows) if (await add(tx, data)) added++; else duplicates++; };
    if (save) await this.db.$transaction(run, IMPORT_TX);
    else await run(this.db);
    return { added, duplicates, errors: sheet.errors };
  }
}
