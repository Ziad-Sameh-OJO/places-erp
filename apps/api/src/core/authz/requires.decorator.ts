import { SetMetadata } from "@nestjs/common";
import type { Action, ModuleKey } from "@places/domain";

export const REQUIRES = "requires";
/** Every business endpoint declares what it needs, e.g. @Requires("leads", "create"). No declaration = denied. */
export const Requires = (module: ModuleKey, action: Action) => SetMetadata(REQUIRES, { module, action });
