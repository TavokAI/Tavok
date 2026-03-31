// @ts-nocheck -- route tests use partial Prisma mocks
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockSessionRef, mockAuth, mockReadFile } =
  vi.hoisted(() => {
    const prisma = {
      attachment: {
        findUnique: vi.fn(),
      },
      member: {
        findUnique: vi.fn(),
      },
      directMessage: {
        findFirst: vi.fn(),
      },
    };

    const sessionRef = { current: { user: { id: "user-1" } } as any };
    const auth = vi.fn(() => Promise.resolve(sessionRef.current));
    const readFile = vi.fn(async () => Buffer.from("file-bytes"));

    return {
      mockPrisma: prisma,
      mockSessionRef: sessionRef,
      mockAuth: auth,
      mockReadFile: readFile,
    };
  });

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/auth", () => ({ auth: mockAuth }));
vi.mock("fs/promises", () => ({
  readFile: mockReadFile,
}));

import { GET } from "@/app/api/uploads/[fileId]/route";

const routeParams = {
  params: Promise.resolve({ fileId: "file-1" }),
};

function makeRequest() {
  return new Request("http://localhost/api/uploads/file-1") as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSessionRef.current = { user: { id: "user-1" } };
  mockReadFile.mockResolvedValue(Buffer.from("file-bytes"));
});

describe("GET /api/uploads/[fileId]", () => {
  it("returns 404 when the attachment does not exist", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue(null);

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "File not found",
    });
  });

  it("allows the owner to fetch an unattached pending image upload", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      filename: "draft.png",
      mimeType: "image/png",
      storagePath: "2026/03/file-1_draft.png",
      userId: "user-1",
      messageId: null,
      message: null,
    });

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="draft.png"',
    );
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe(
      "file-bytes",
    );
  });

  it("forbids non-owners from fetching an unattached upload", async () => {
    mockSessionRef.current = { user: { id: "user-2" } };
    mockPrisma.attachment.findUnique.mockResolvedValue({
      filename: "draft.png",
      mimeType: "image/png",
      storagePath: "2026/03/file-1_draft.png",
      userId: "user-1",
      messageId: null,
      message: null,
    });

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("allows a server member to fetch a visible channel attachment", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      filename: "report.pdf",
      mimeType: "application/pdf",
      storagePath: "2026/03/file-1_report.pdf",
      userId: "author-1",
      messageId: "msg-1",
      message: {
        isDeleted: false,
        channel: {
          serverId: "server-1",
        },
      },
    });
    mockPrisma.member.findUnique.mockResolvedValue({ id: "member-1" });

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="report.pdf"',
    );
  });

  it("forbids users outside the server from fetching a channel attachment", async () => {
    mockSessionRef.current = { user: { id: "outsider-1" } };
    mockPrisma.attachment.findUnique.mockResolvedValue({
      filename: "report.pdf",
      mimeType: "application/pdf",
      storagePath: "2026/03/file-1_report.pdf",
      userId: "author-1",
      messageId: "msg-1",
      message: {
        isDeleted: false,
        channel: {
          serverId: "server-1",
        },
      },
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("forbids access when the parent server message has been deleted", async () => {
    mockPrisma.attachment.findUnique.mockResolvedValue({
      filename: "report.pdf",
      mimeType: "application/pdf",
      storagePath: "2026/03/file-1_report.pdf",
      userId: "author-1",
      messageId: "msg-1",
      message: {
        isDeleted: true,
        channel: {
          serverId: "server-1",
        },
      },
    });
    mockPrisma.member.findUnique.mockResolvedValue({ id: "member-1" });

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("allows a DM participant to fetch an upload referenced by a visible DM", async () => {
    mockSessionRef.current = { user: { id: "recipient-1" } };
    mockPrisma.attachment.findUnique.mockResolvedValue({
      filename: "notes.txt",
      mimeType: "text/plain",
      storagePath: "2026/03/file-1_notes.txt",
      userId: "sender-1",
      messageId: null,
      message: null,
    });
    mockPrisma.directMessage.findFirst.mockResolvedValue({ id: "dm-msg-1" });

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="notes.txt"',
    );
  });

  it("forbids users who are not DM participants from fetching a DM upload", async () => {
    mockSessionRef.current = { user: { id: "outsider-1" } };
    mockPrisma.attachment.findUnique.mockResolvedValue({
      filename: "notes.txt",
      mimeType: "text/plain",
      storagePath: "2026/03/file-1_notes.txt",
      userId: "sender-1",
      messageId: null,
      message: null,
    });
    mockPrisma.directMessage.findFirst.mockResolvedValue(null);

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("does not treat a DM-referenced upload as a pending owner-only draft", async () => {
    mockSessionRef.current = { user: { id: "sender-1" } };
    mockPrisma.attachment.findUnique.mockResolvedValue({
      filename: "notes.txt",
      mimeType: "text/plain",
      storagePath: "2026/03/file-1_notes.txt",
      userId: "sender-1",
      messageId: null,
      message: null,
    });
    mockPrisma.directMessage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "dm-msg-hidden-1" });

    const response = await GET(makeRequest(), routeParams);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });
});
