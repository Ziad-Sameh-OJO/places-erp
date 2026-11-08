import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Grants, FieldAccess, FieldRules } from "@places/domain";

export interface CurrentUser { id: string; name: string; roles: string[]; roleLabels: string[]; email: string; emailNotifications: boolean; employeeId: string | null; grants: Grants; fieldRules: FieldRules; fields: FieldAccess; teamIds: string[]; department: string | null }
export const Me = createParamDecorator((_: unknown, ctx: ExecutionContext): CurrentUser => ctx.switchToHttp().getRequest().user);
