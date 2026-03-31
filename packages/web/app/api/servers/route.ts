import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createServerWithDefaultChannel,
  listServersForUser,
  normalizeDefaultChannelName,
} from "@/lib/services/ServerService";

/**
 * GET /api/servers — List servers the current user is a member of
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const servers = await listServersForUser(prisma, session.user.id);
    return NextResponse.json({ servers });
  } catch (error) {
    console.error("[servers] Failed to list servers:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/servers — Create a new server
 * Body: {
 *   name: string;
 *   iconUrl?: string | null;
 *   defaultChannelName?: string;
 *   defaultChannelTopic?: string | null;
 * }
 * Creates server + default #general channel + owner membership in a transaction
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = body.name?.trim();
    const iconUrl =
      typeof body.iconUrl === "string" && body.iconUrl.trim().length > 0
        ? body.iconUrl.trim()
        : null;
    const defaultChannelNameRaw =
      typeof body.defaultChannelName === "string"
        ? body.defaultChannelName
        : "general";
    const defaultChannelName = normalizeDefaultChannelName(
      defaultChannelNameRaw,
    );
    const defaultChannelTopic =
      typeof body.defaultChannelTopic === "string" &&
      body.defaultChannelTopic.trim().length > 0
        ? body.defaultChannelTopic.trim().slice(0, 300)
        : null;

    if (!name || name.length < 1 || name.length > 100) {
      return NextResponse.json(
        { error: "Server name must be 1-100 characters" },
        { status: 400 },
      );
    }

    const server = await createServerWithDefaultChannel(prisma, {
      userId: session.user.id,
      name,
      iconUrl,
      defaultChannelName,
      defaultChannelTopic,
    });

    return NextResponse.json(
      server,
      { status: 201 },
    );
  } catch (error) {
    console.error("[servers] Failed to create server:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
