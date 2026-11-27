import { NextResponse } from "next/server";

/**
 * Who may show the Commerce dashboard inside a frame. Only the host platform origins listed in
 * HOST_PLATFORM_ALLOWED_ORIGINS (the same setting the API uses), read at runtime; with none listed, no site may
 * frame it. Anything that is not a plain http(s) origin is ignored, so a typo cannot widen the list.
 */
function frameAncestors(): string {
  const origins = (process.env.HOST_PLATFORM_ALLOWED_ORIGINS ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter((value) => /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(value));
  return origins.length === 0 ? "'none'" : origins.join(" ");
}

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors()}`);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
