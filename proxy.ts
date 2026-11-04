import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ORIGIN, APP_ORIGIN, MARKETING_ORIGIN } from "./lib/site";

export function proxy(request: NextRequest) {
  // Next.js can use its internal origin in nextUrl; route by the public Host.
  const hostname = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const path = request.nextUrl.pathname;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  const adminPath = path === "/admin" || path.startsWith("/admin/");
  const adminApi = path === "/api/admin" || path.startsWith("/api/admin/");
  if (hostname === "admin.plizzy.in") {
    if (path === "/") {
      const destination = request.nextUrl.clone();
      destination.pathname = "/admin";
      return NextResponse.rewrite(destination);
    }
    if (path === "/admin") return NextResponse.redirect(new URL("/", ADMIN_ORIGIN), 308);
    if (adminApi) return NextResponse.next();
    // The admin origin serves only the dashboard and its read-only API.
    return new NextResponse(null, { status: 404 });
  }
  if (adminApi && !local) return new NextResponse(null, { status: 404 });
  if (adminPath && !local) return NextResponse.redirect(new URL("/", ADMIN_ORIGIN), 308);
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
