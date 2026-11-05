import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/activate", "/reset"];

/** Without a session cookie, every page except the sign-in ones redirects to /login (the API still checks every request). */
export function middleware(req: NextRequest) {
  if (!req.cookies.has("places_session") && !PUBLIC.some((p) => req.nextUrl.pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next|api|favicon|manifest|icons|sw.js).*)"] };
