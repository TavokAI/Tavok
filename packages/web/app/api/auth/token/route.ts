import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/token — Returns the raw JWT string for WebSocket authentication
 * The client calls this to get a token to pass to the Phoenix Gateway
 */
export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, raw: true });

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ token });
}
