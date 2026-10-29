import { SetMetadata } from "@nestjs/common";
import type { Action, ModuleKey } from "@places/domain";

export const REQUIRES = "requires";
/** Every business endpoint declares what it needs, e.g. @Requires("leads", "create"). No declaration = denied. */
export const Requires = (module: ModuleKey, action: Action) => SetMetadata(REQUIRES, { module, action });
/** For what belongs to the person themself (my notifications, my password): a session is enough. Still explicit. */
export const SignedIn = () => SetMetadata(REQUIRES, "signed-in");
