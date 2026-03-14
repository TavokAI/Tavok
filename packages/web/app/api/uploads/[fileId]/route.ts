import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { readFile } from "fs/promises";
import { join } from "path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";

export const runtime = "nodejs";

/**
 * GET /api/uploads/[fileId] — Serve an uploaded file
 * Auth: logged-in user who owns the unattached upload or is a member of the
 * server that contains the message the attachment belongs to.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: fileId },
      select: {
        filename: true,
        mimeType: true,
        storagePath: true,
        userId: true,
        messageId: true,
        message: {
          select: {
            channel: {
              select: { serverId: true },
            },
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Authorization check
    if (!attachment.messageId) {
      // Unattached upload — only the owner can access it
      if (attachment.userId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (attachment.message) {
      // Attached to a message — user must be a member of the server
      const member = await prisma.member.findUnique({
        where: {
          userId_serverId: {
            userId,
            serverId: attachment.message.channel.serverId,
          },
        },
        select: { id: true },
      });

      if (!member) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // messageId set but message not found (deleted) — only owner
      if (attachment.userId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const fullPath = join(UPLOADS_DIR, attachment.storagePath);
    const buffer = await readFile(fullPath);
    const disposition = attachment.mimeType.startsWith("image/")
      ? "inline"
      : "attachment";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `${disposition}; filename="${attachment.filename}"`,
        "Content-Security-Policy": "default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Failed to serve file:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
