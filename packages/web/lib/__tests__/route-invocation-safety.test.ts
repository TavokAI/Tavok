import { describe, it, expect } from "vitest";
import {
  createInternalMessagesPostHandler,
  createServerAgentPatchHandler,
  createServerChannelPatchHandler,
} from "../route-handlers";

function makeRequest({
  secret = "test-secret",
  body,
  throwOnJson = false,
}: {
  secret?: string;
  body?: unknown;
  throwOnJson?: boolean;
} = {}) {
  return {
    headers: new Headers({ "x-internal-secret": secret }),
    json: async () => {
      if (throwOnJson) {
        throw new Error("bad json");
      }
      return body;
    },
  };
}

describe("route_invocation_safety", () => {
  it("internal POST returns 400 for invalid JSON body", async () => {
    const originalSecret = process.env.INTERNAL_API_SECRET;
    process.env.INTERNAL_API_SECRET = "test-secret";

    const handler = createInternalMessagesPostHandler({
      prismaClient: {} as any,
    });

    const response = await handler(makeRequest({ body: null }) as any);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid JSON body");

    process.env.INTERNAL_API_SECRET = originalSecret;
  });

  it("internal POST returns 400 for invalid sequence", async () => {
    const originalSecret = process.env.INTERNAL_API_SECRET;
    process.env.INTERNAL_API_SECRET = "test-secret";

    const handler = createInternalMessagesPostHandler({
      prismaClient: {} as any,
    });

    const response = await handler(
      makeRequest({
        body: {
          id: "m1",
          channelId: "c1",
          authorId: "u1",
          authorType: "USER",
          content: "hello",
          type: "STANDARD",
          streamingStatus: null,
          sequence: "not-a-number",
        },
      }) as any,
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("sequence must be a non-negative integer string");

    process.env.INTERNAL_API_SECRET = originalSecret;
  });

  it("internal POST uses monotonic channel lastSequence update guard", async () => {
    const originalSecret = process.env.INTERNAL_API_SECRET;
    process.env.INTERNAL_API_SECRET = "test-secret";

    let updateManyArgs: any = null;
    const sequence = "9007199254740993";

    const handler = createInternalMessagesPostHandler({
      prismaClient: {
        $transaction: async (callback: any) =>
          callback({
            message: {
              create: async ({ data }: any) => ({
                id: data.id,
                channelId: data.channelId,
                authorId: data.authorId,
                authorType: data.authorType,
                content: data.content,
                type: data.type,
                streamingStatus: data.streamingStatus,
                sequence: data.sequence,
                createdAt: new Date("2026-02-25T00:00:00.000Z"),
              }),
            },
            channel: {
              updateMany: async (args: any) => {
                updateManyArgs = args;
                return { count: 1 };
              },
            },
          }),
        user: {
          findUnique: async () => ({ displayName: "Alice", avatarUrl: null }),
        },
        agent: {
          findUnique: async () => null,
        },
      } as any,
    });

    const response = await handler(
      makeRequest({
        body: {
          id: "m1",
          channelId: "c1",
          authorId: "u1",
          authorType: "USER",
          content: "hello",
          type: "STANDARD",
          streamingStatus: null,
          sequence,
        },
      }) as any,
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.sequence).toBe(sequence);
    expect(updateManyArgs).toEqual({
      where: {
        id: "c1",
        lastSequence: { lt: BigInt(sequence) },
      },
      data: { lastSequence: BigInt(sequence) },
    });

    process.env.INTERNAL_API_SECRET = originalSecret;
  });

  it("agent PATCH returns 400 for invalid JSON body", async () => {
    const handler = createServerAgentPatchHandler({
      getServerSession: async () => ({ user: { id: "owner-1" } }),
      authOptions: {},
      prismaClient: {
        server: {
          findUnique: async () => ({ ownerId: "owner-1" }),
        },
        agent: {
          findUnique: async () => ({ serverId: "s1" }),
          update: async () => {
            throw new Error("should not update");
          },
        },
      } as any,
      encrypt: (value: string) => `enc:${value}`,
    });

    const response = await handler(
      {
        json: async () => null,
      } as any,
      { params: Promise.resolve({ serverId: "s1", agentId: "b1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid JSON body");
  });

  it("channel PATCH returns 400 for invalid JSON body", async () => {
    const handler = createServerChannelPatchHandler({
      getServerSession: async () => ({ user: { id: "owner-1" } }),
      authOptions: {},
      prismaClient: {
        server: {
          findUnique: async () => ({ ownerId: "owner-1" }),
        },
        channel: {
          findUnique: async () => ({ serverId: "s1" }),
          update: async () => {
            throw new Error("should not update");
          },
        },
        agent: {
          findUnique: async () => null,
        },
      } as any,
    });

    const response = await handler(
      {
        json: async () => null,
      } as any,
      { params: Promise.resolve({ serverId: "s1", channelId: "c1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid JSON body");
  });
});
