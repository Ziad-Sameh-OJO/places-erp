import { NextResponse, type NextRequest } from "next/server";

/** Without a session cookie, every page except /login redirects to /login (the API still checks every request). */
export function middleware(req: NextRequest) {
  if (!req.cookies.has("places_session") && !req.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next|api|favicon|manifest|icons).*)"] };
