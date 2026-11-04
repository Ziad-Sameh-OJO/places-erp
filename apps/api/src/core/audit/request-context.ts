import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Where the current request comes from, so every audit record gets its device and IP (M-09 2.1 step 5)
 * without each service passing them down. Empty outside a request (worker jobs, the seed).
 */
export const requestContext = new AsyncLocalStorage<{ ip: string | undefined; userAgent: string | undefined }>();

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  requestContext.run({ ip: req.ip, userAgent: req.get("user-agent")?.slice(0, 400) }, next);
}
