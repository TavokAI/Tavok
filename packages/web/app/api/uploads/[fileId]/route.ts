import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/db";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";

export const runtime = "nodejs";

function getDirectMessageFileToken(fileId: string) {
  return `[file:${fileId}:`;
}

/**
 * GET /api/uploads/[fileId] — Serve an uploaded file
 * Auth:
 * - server attachments: requester must still be able to see the parent message
 * - DM attachments: requester must be a participant in a visible DM that
 *   references the file
 * - unattached uploads: only the owner can fetch them while pending send
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const session = await auth();
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
            isDeleted: true,
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

    // Attached server message: membership alone is not enough if the message
    // has been deleted or otherwise hidden.
    if (attachment.messageId) {
      if (!attachment.message || attachment.message.isDeleted) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

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
      const dmFileToken = getDirectMessageFileToken(fileId);

      const visibleDmReference = await prisma.directMessage.findFirst({
        where: {
          isDeleted: false,
          content: { contains: dmFileToken },
          dm: {
            participants: {
              some: { userId },
            },
          },
        },
        select: { id: true },
      });

      if (!visibleDmReference) {
        const anyDmReference = await prisma.directMessage.findFirst({
          where: {
            content: { contains: dmFileToken },
          },
          select: { id: true },
        });

        if (anyDmReference || attachment.userId !== userId) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
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
