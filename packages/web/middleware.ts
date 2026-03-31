import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { RateLimiter } from "@/lib/rate-limit";

const loginLimiter = new RateLimiter({ max: 30, windowSec: 60 });

const publicRoutes = ["/login", "/register"];

// DESIGN NOTE (API-001): These prefixes bypass the middleware session check
// intentionally. Each route under these prefixes handles its own auth:
//   /api/auth     - Auth.js callbacks
//   /api/health   - Unauthenticated health checks
//   /api/internal - Service-to-service calls via x-internal-secret
//   /api/v1       - Agent API calls via API keys
const publicPrefixes = ["/api/auth", "/api/health", "/api/internal", "/api/v1"];

const { auth: withAuth } = NextAuth(authConfig);

function isPublicRoute(pathname: string): boolean {
  if (publicRoutes.includes(pathname)) return true;
  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export default withAuth(async function middleware(
  request: NextRequest & {
    auth: { user?: unknown } | null;
  },
) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  if (
    pathname.startsWith("/api/auth/callback/credentials") &&
    request.method === "POST"
  ) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = loginLimiter.check(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            "x-request-id": requestId,
          },
        },
      );
    }
  }

  const session = request.auth;

  if (session && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublicRoute(pathname)) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
