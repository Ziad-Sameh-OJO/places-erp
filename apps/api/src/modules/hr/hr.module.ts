import { Module } from "@nestjs/common";
import { HrController } from "./hr.controller";
import { HrRepository } from "./hr.repository";
import { HrService } from "./hr.service";
import { AttendanceService } from "./attendance.service";
import { LeavesService } from "./leaves.service";
import { PeopleCareService } from "./people-care.service";
import { ExcusesService } from "./excuses.service";
import { TicketsModule } from "../tickets/tickets.module";

/**
 * M-05 · الموارد البشرية. 7.1: the employee file; HrService is exported for payroll (9.14) and attendance (7.2);
 * AttendanceService for the approved deductions payroll reads (7.9); LeavesService for who's on leave in lead routing (1.15).
 */
@Module({ imports: [TicketsModule], controllers: [HrController], providers: [HrService, HrRepository, AttendanceService, LeavesService, PeopleCareService, ExcusesService], exports: [HrService, AttendanceService, LeavesService] })
export class HrModule {}
