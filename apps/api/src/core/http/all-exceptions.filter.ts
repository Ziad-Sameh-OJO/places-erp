import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { ZodError } from "zod";

/** One error shape for the whole API; internal details are logged, never sent to the browser. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger("HTTP");

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (err instanceof ZodError) return res.status(HttpStatus.BAD_REQUEST).json({ error: "validation", issues: err.issues });
    if (err instanceof HttpException) return res.status(err.getStatus()).json({ error: err.message });
    this.log.error(err);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: "internal" });
  }
}
