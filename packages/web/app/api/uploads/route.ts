import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateId } from "@/lib/ulid";
import { getImageDimensions } from "@/lib/image-dimensions";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/app/uploads";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/zip",
];

/**
 * Magic byte signatures for server-side file type verification.
 * Prevents clients from spoofing Content-Type headers to upload executables.
 */
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  "image/gif": [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }],
  "image/webp": [{ offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }],
  "application/pdf": [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
  "application/zip": [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
};

function verifyMagicBytes(buffer: Buffer, claimedType: string): boolean {
  const signatures = MAGIC_BYTES[claimedType];
  if (!signatures) {
    // Text types (text/plain, text/markdown, application/json) don't have
    // reliable magic bytes — allow them but reject null bytes as a basic check
    if (claimedType.startsWith("text/") || claimedType === "application/json") {
      return !buffer.subarray(0, 512).includes(0x00);
    }
    return true;
  }
  return signatures.some((sig) =>
    sig.bytes.every((b, i) => buffer[sig.offset + i] === b),
  );
}

export const runtime = "nodejs";

/**
 * POST /api/uploads — Upload a file
 * Multipart form data with field "file"
 * Returns: { fileId, url, filename, mimeType, size }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 10MB)" },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed: ${file.type || "unknown"}` },
        { status: 400 },
      );
    }

    // Verify file content matches claimed MIME type via magic bytes
    const previewBuffer = Buffer.from(await file.arrayBuffer());
    if (!verifyMagicBytes(previewBuffer, file.type)) {
      return NextResponse.json(
        { error: "File content does not match declared type" },
        { status: 400 },
      );
    }

    const fileId = generateId();
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    const safeName = sanitized || "file";

    const now = new Date();
    const subdir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const dirPath = join(UPLOADS_DIR, subdir);
    await mkdir(dirPath, { recursive: true });

    const storagePath = `${subdir}/${fileId}_${safeName}`;
    const fullPath = join(UPLOADS_DIR, storagePath);
    await writeFile(fullPath, previewBuffer);

    // Extract image dimensions if applicable (TASK-0025)
    const dimensions = file.type.startsWith("image/")
      ? getImageDimensions(previewBuffer, file.type)
      : null;

    const attachment = await prisma.attachment.create({
      data: {
        id: fileId,
        userId: session.user.id,
        filename: safeName,
        mimeType: file.type,
        size: file.size,
        storagePath,
        ...(dimensions
          ? { width: dimensions.width, height: dimensions.height }
          : {}),
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
      },
    });

    return NextResponse.json(
      {
        fileId: attachment.id,
        url: `/api/uploads/${attachment.id}`,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        width: attachment.width,
        height: attachment.height,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to upload file:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
