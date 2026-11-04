import { Module } from "@nestjs/common";
import { HrController } from "./hr.controller";
import { HrRepository } from "./hr.repository";
import { HrService } from "./hr.service";
import { AttendanceService } from "./attendance.service";

/** M-05 · الموارد البشرية. 7.1: the employee file; HrService is exported for payroll (9.14) and attendance (7.2). */
@Module({ controllers: [HrController], providers: [HrService, HrRepository, AttendanceService], exports: [HrService] })
export class HrModule {}
