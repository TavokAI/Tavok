import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateInternalSecret } from "@/lib/internal-auth";

/**
 * PATCH /api/internal/dms/messages/{messageId} — Edit a DM message.
 * Called by Gateway when a user edits their DM message. (TASK-0019)
 *
 * Body: { userId: string, content: string }
 * Auth: x-internal-secret + userId must be author and DM participant.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, content } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (typeof content !== "string" || content.trim() === "") {
    return NextResponse.json(
      { error: "content is required and must be non-empty" },
      { status: 400 },
    );
  }

  try {
    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        authorId: true,
        isDeleted: true,
        dm: {
          select: {
            participants: { select: { userId: true } },
          },
        },
      },
    });

    if (!message || message.isDeleted) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const isParticipant = message.dm.participants.some(
      (p) => p.userId === userId,
    );
    if (!isParticipant) {
      return NextResponse.json(
        { error: "Not a DM participant" },
        { status: 403 },
      );
    }

    if (message.authorId !== userId) {
      return NextResponse.json(
        { error: "Only the author can edit this message" },
        { status: 403 },
      );
    }

    const updated = await prisma.directMessage.update({
      where: { id: messageId },
      data: {
        content,
        editedAt: new Date(),
      },
    });

    return NextResponse.json({
      id: updated.id,
      content: updated.content,
      editedAt: updated.editedAt?.toISOString(),
    });
  } catch (error) {
    console.error("[internal/dms/messages] Failed to edit DM message:", error);
    return NextResponse.json(
      { error: "Failed to edit message" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/internal/dms/messages/{messageId} — Soft-delete a DM message.
 * Called by Gateway when a user deletes their DM message. (TASK-0019)
 *
 * Body: { userId: string }
 * Auth: x-internal-secret + userId must be author and DM participant.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        authorId: true,
        isDeleted: true,
        dm: {
          select: {
            participants: { select: { userId: true } },
          },
        },
      },
    });

    if (!message || message.isDeleted) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const isParticipant = message.dm.participants.some(
      (p) => p.userId === userId,
    );
    if (!isParticipant) {
      return NextResponse.json(
        { error: "Not a DM participant" },
        { status: 403 },
      );
    }

    if (message.authorId !== userId) {
      return NextResponse.json(
        { error: "Only the author can delete this message" },
        { status: 403 },
      );
    }

    await prisma.directMessage.update({
      where: { id: messageId },
      data: { isDeleted: true },
    });

    return NextResponse.json({ id: messageId, deleted: true });
  } catch (error) {
    console.error(
      "[internal/dms/messages] Failed to delete DM message:",
      error,
    );
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 },
    );
  }
}
