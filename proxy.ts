import { NextRequest, NextResponse } from "next/server";
import { APP_ORIGIN, MARKETING_ORIGIN } from "./lib/site";

export function proxy(request: NextRequest) {
  // Next.js can use its internal origin in nextUrl; route by the public Host.
  const hostname = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const marketing = hostname === "plizzy.in" || hostname === "www.plizzy.in";
  if (marketing) {
    if (request.nextUrl.pathname === "/") {
      const landing = request.nextUrl.clone();
      landing.pathname = "/welcome";
      return NextResponse.rewrite(landing);
    }
    if (request.nextUrl.pathname === "/welcome") {
      return NextResponse.redirect(new URL("/", MARKETING_ORIGIN), 308);
    }
    // Assign path/search separately so a path beginning // cannot change origin.
    const destination = new URL(APP_ORIGIN);
    destination.pathname = request.nextUrl.pathname;
    destination.search = request.nextUrl.search;
    return NextResponse.redirect(destination, 308);
  }
  if (hostname === "app.plizzy.in" && request.nextUrl.pathname === "/welcome") {
    return NextResponse.redirect(new URL(MARKETING_ORIGIN), 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg|apple-icon.png|icons/|app.webmanifest).*)"],
};
