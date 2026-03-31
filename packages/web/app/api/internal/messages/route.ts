import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseAfterSequence, parseLimit } from "@/lib/validation";
import { createInternalMessagesPostHandler } from "@/lib/route-handlers";
import { validateInternalSecret } from "@/lib/internal-auth";
import { listInternalMessages } from "@/lib/services/MessageService";

export const POST = createInternalMessagesPostHandler({ prismaClient: prisma });

export async function GET(request: NextRequest) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get("channelId");

  if (!channelId) {
    return NextResponse.json(
      { error: "channelId is required" },
      { status: 400 },
    );
  }

  try {
    const afterSequence = searchParams.get("afterSequence");
    const before = searchParams.get("before");
    let limit = 50;
    try {
      limit = parseLimit(searchParams.get("limit"));
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }

    let parsedAfterSequence: string | null = null;
    if (afterSequence !== null) {
      try {
        parsedAfterSequence = parseAfterSequence(afterSequence);
      } catch (error) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 },
        );
      }
    }

    const payload = await listInternalMessages(prisma, {
      channelId,
      afterSequence: parsedAfterSequence,
      before,
      limit,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[internal/messages] Failed to fetch messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}
