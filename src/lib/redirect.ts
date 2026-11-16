import { NextResponse } from "next/server";

/**
 * Redirect to a path on this site using a relative Location header, so the
 * browser stays on the host it used (and keeps its session cookie) even when
 * the server sees a different internal host name behind a proxy.
 */
export function redirectToPath(path: string, status: 303 | 307 = 303): NextResponse {
  return new NextResponse(null, { status, headers: { Location: path.startsWith("/") ? path : "/" } });
}
