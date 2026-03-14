import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockValidateInternalSecret } = vi.hoisted(() => ({
  mockPrisma: {
    directMessage: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockValidateInternalSecret: vi.fn(() => true),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/internal-auth", () => ({
  validateInternalSecret: mockValidateInternalSecret,
}));

import {
  DELETE,
  PATCH,
} from "@/app/api/internal/dms/messages/[messageId]/route";
import { GET } from "@/app/api/internal/dms/messages/route";

const routeParams = {
  params: Promise.resolve({ messageId: "msg-1" }),
};

function makePatchRequest(body: unknown) {
  return new Request("http://localhost/api/internal/dms/messages/msg-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

function makeDeleteRequest(body: unknown) {
  return new Request("http://localhost/api/internal/dms/messages/msg-1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

function makeGetRequest(query = "dmId=dm-1") {
  return new Request(`http://localhost/api/internal/dms/messages?${query}`, {
    method: "GET",
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateInternalSecret.mockReturnValue(true);
});

describe("internal DM edit/delete auth", () => {
  it("rejects edits from non-participants", async () => {
    mockPrisma.directMessage.findUnique.mockResolvedValue({
      id: "msg-1",
      authorId: "author-1",
      isDeleted: false,
      dm: {
        participants: [{ userId: "author-1" }, { userId: "friend-1" }],
      },
    });

    const response = await PATCH(
      makePatchRequest({ userId: "outsider-1", content: "Updated" }),
      routeParams,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Not a DM participant",
    });
  });

  it("rejects edits from participants who are not the author", async () => {
    mockPrisma.directMessage.findUnique.mockResolvedValue({
      id: "msg-1",
      authorId: "author-1",
      isDeleted: false,
      dm: {
        participants: [{ userId: "author-1" }, { userId: "friend-1" }],
      },
    });

    const response = await PATCH(
      makePatchRequest({ userId: "friend-1", content: "Updated" }),
      routeParams,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only the author can edit this message",
    });
  });

  it("rejects deletes from participants who are not the author", async () => {
    mockPrisma.directMessage.findUnique.mockResolvedValue({
      id: "msg-1",
      authorId: "author-1",
      isDeleted: false,
      dm: {
        participants: [{ userId: "author-1" }, { userId: "friend-1" }],
      },
    });

    const response = await DELETE(
      makeDeleteRequest({ userId: "friend-1" }),
      routeParams,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Only the author can delete this message",
    });
  });

  it("allows authors who are DM participants to delete messages", async () => {
    mockPrisma.directMessage.findUnique.mockResolvedValue({
      id: "msg-1",
      authorId: "author-1",
      isDeleted: false,
      dm: {
        participants: [{ userId: "author-1" }, { userId: "friend-1" }],
      },
    });
    mockPrisma.directMessage.update.mockResolvedValue({ id: "msg-1" });

    const response = await DELETE(
      makeDeleteRequest({ userId: "author-1" }),
      routeParams,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "msg-1",
      deleted: true,
    });
  });
});

describe("internal DM history payloads", () => {
  it("returns aggregated reactions for reconnect and history payloads", async () => {
    mockPrisma.directMessage.findMany.mockResolvedValue([
      {
        id: "msg-1",
        dmId: "dm-1",
        authorId: "author-1",
        content: "Hello",
        sequence: 42n,
        createdAt: new Date("2026-03-12T12:00:00.000Z"),
        editedAt: null,
        author: {
          id: "author-1",
          displayName: "Alice",
          avatarUrl: null,
          username: "alice",
        },
        reactions: [
          { emoji: "👍", userId: "author-1" },
          { emoji: "👍", userId: "friend-1" },
          { emoji: "🚀", userId: "friend-1" },
        ],
      },
    ]);

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      messages: [
        {
          id: "msg-1",
          dmId: "dm-1",
          authorId: "author-1",
          authorType: "USER",
          authorName: "Alice",
          authorAvatarUrl: null,
          content: "Hello",
          type: "STANDARD",
          streamingStatus: null,
          sequence: "42",
          createdAt: "2026-03-12T12:00:00.000Z",
          editedAt: null,
          reactions: [
            { emoji: "👍", count: 2, userIds: ["author-1", "friend-1"] },
            { emoji: "🚀", count: 1, userIds: ["friend-1"] },
          ],
        },
      ],
      hasMore: false,
    });
  });
});
