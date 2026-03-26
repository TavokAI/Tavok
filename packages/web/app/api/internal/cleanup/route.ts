import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateInternalSecret } from "@/lib/internal-auth";
import fs from "fs/promises";
import path from "path";

/**
 * POST /api/internal/cleanup — Clean up orphaned data (L19)
 *
 * Currently handles:
 * - Orphaned attachments: messageId IS NULL and older than 24 hours
 *   (uploaded but never attached to a message)
 *
 * Auth: X-Internal-Secret header.
 * Call via cron or `make cleanup`.
 */
export async function POST(request: NextRequest) {
  if (!validateInternalSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

  try {
    // Find orphaned attachments (uploaded but never linked to a message)
    const orphans = await prisma.attachment.findMany({
      where: {
        messageId: null,
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        storagePath: true,
        filename: true,
      },
    });

    if (orphans.length === 0) {
      return NextResponse.json({ orphansDeleted: 0, filesDeleted: 0 });
    }

    // Delete files from disk
    const uploadsDir = process.env.UPLOADS_DIR || "/app/uploads";
    let filesDeleted = 0;
    for (const orphan of orphans) {
      try {
        const filePath = path.join(uploadsDir, orphan.storagePath);
        await fs.unlink(filePath);
        filesDeleted++;
      } catch {
        // File may already be gone — that's OK
      }
    }

    // Delete DB records
    const result = await prisma.attachment.deleteMany({
      where: {
        id: { in: orphans.map((o) => o.id) },
      },
    });

    console.log(
      `[cleanup] Deleted ${result.count} orphaned attachments, ${filesDeleted} files`,
    );

    return NextResponse.json({
      orphansDeleted: result.count,
      filesDeleted,
    });
  } catch (error) {
    console.error("[cleanup] Failed:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
