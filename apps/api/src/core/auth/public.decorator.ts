import { SetMetadata } from "@nestjs/common";
export const IS_PUBLIC = "isPublic";
/** Marks an endpoint that works without signing in (login, activation, forgot password). Everything else is closed by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
