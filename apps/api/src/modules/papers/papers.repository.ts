import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";
import { STAMP_KEY, type StampSetting } from "../../core/documents/documents.service";

/** «المستندات»: data access only. */
@Injectable()
export class PapersRepository {
  constructor(@Inject(PRISMA) readonly db: PrismaClient) {}

  templates(where: Prisma.WordTemplateWhereInput = {}) {
    return this.db.wordTemplate.findMany({ where: { AND: [{ archivedAt: null }, where] }, orderBy: { name: "asc" }, include: { _count: { select: { documents: true } } } });
  }
  template(id: string) {
    return this.db.wordTemplate.findFirst({ where: { id, archivedAt: null } });
  }
  file(id: string) {
    return this.db.file.findUnique({ where: { id }, select: { id: true, name: true, mime: true, status: true, uploadedById: true, entity: true } });
  }
  nextCode(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('system.word_document_code_seq') AS n`.then((r) => `DOC-${r[0]!.n}`); // the word_templates migration
  }
  documents(where: Prisma.WordDocumentWhereInput) {
    return this.db.wordDocument.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { template: { select: { id: true, name: true, fields: true } } } });
  }
  document(id: string) {
    return this.db.wordDocument.findUnique({ where: { id }, include: { template: true } });
  }
  /** Names by access.User id (who issued, who decided, the people pickers). */
  names(userIds: string[]) {
    return this.db.employee.findMany({ where: { userId: { in: userIds } }, select: { userId: true, name: true } })
      .then((rows) => new Map(rows.map((r) => [r.userId, r.name])));
  }
  people() {
    return this.db.employee.findMany({ where: { user: { status: { not: "DISABLED" } } }, select: { userId: true, name: true }, orderBy: { name: "asc" } });
  }
  roles() {
    return this.db.role.findMany({ select: { key: true, label: true }, orderBy: { label: "asc" } });
  }
  stamp() {
    return this.db.setting.findUnique({ where: { key: STAMP_KEY } }).then((s) => (s?.value ?? {}) as StampSetting);
  }
}
