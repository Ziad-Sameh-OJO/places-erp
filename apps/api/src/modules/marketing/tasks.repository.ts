import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@places/db";
import { PRISMA } from "../../core/database/database.module";

const ROW = {
  id: true, kind: true, title: true, byUserId: true, toUserId: true, dueOn: true, status: true, returned: true, note: true,
  doneAt: true, createdAt: true,
  unit: { select: { id: true, code: true, project: true, area: true, floor: true, building: true, ownerName: true, ownerPhone: true, enteredAt: true } },
} satisfies Prisma.TaskSelect;
export type TaskRecord = Prisma.TaskGetPayload<{ select: typeof ROW }>;

/** Data access only. The caller's scope is always ANDed into the query. */
@Injectable()
export class TasksRepository {
  constructor(@Inject(PRISMA) private readonly db: PrismaClient) {}

  list(where: Prisma.TaskWhereInput, take: number) {
    return this.db.task.findMany({ where, select: ROW, orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }], take });
  }

  /** Shoots and Retouch Done in [from, to), in the scope: the SLA report (M-12). */
  doneBetween(scope: Prisma.TaskWhereInput, from: Date, to: Date) {
    return this.db.task.findMany({
      where: { AND: [scope, { kind: { in: ["photo", "retouch"] }, status: "done", doneAt: { gte: from, lt: to } }] },
      select: { kind: true, status: true, createdAt: true, doneAt: true, returned: true, unit: { select: { enteredAt: true } } },
    });
  }

  find(scope: Prisma.TaskWhereInput, id: string) {
    return this.db.task.findFirst({ where: { AND: [scope, { id }] }, select: ROW });
  }

  /** Active accounts holding one of these roles (who a kind of task can go to). */
  async withRoles(roles: readonly string[]) {
    const rows = await this.db.user.findMany({
      where: { status: "ACTIVE", roles: { some: { role: { key: { in: [...roles] } } } } },
      select: { id: true, email: true, employee: { select: { name: true } } },
    });
    return rows.map((u) => ({ id: u.id, name: u.employee?.name ?? u.email }));
  }

  async departmentPeople(department: string): Promise<string[]> {
    return (await this.db.user.findMany({ where: { employee: { department } }, select: { id: true } })).map((u) => u.id);
  }

  async accountsOf(employeeIds: string[]): Promise<string[]> {
    return (await this.db.user.findMany({ where: { employee: { id: { in: employeeIds } } }, select: { id: true } })).map((u) => u.id);
  }

  async names(userIds: string[]): Promise<Map<string, string>> {
    const rows = await this.db.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, email: true, employee: { select: { name: true } } } });
    return new Map(rows.map((u) => [u.id, u.employee?.name ?? u.email]));
  }

  create(tx: Prisma.TransactionClient, data: Prisma.TaskUncheckedCreateInput) {
    return tx.task.create({ data, select: { id: true } });
  }

  /** Only while the task is still in `status`: two people moving it at once can't both win. */
  update(tx: Prisma.TransactionClient, id: string, status: string, data: Prisma.TaskUncheckedUpdateInput) {
    return tx.task.updateMany({ where: { id, status }, data });
  }
}
