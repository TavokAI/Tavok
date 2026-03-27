// @ts-nocheck - test doubles intentionally implement only the Prisma surface under test
import { describe, expect, it, vi } from "vitest";
import {
  createStreamLifecycleService,
  StreamLifecycleConflictError,
} from "../stream-lifecycle";

function makeStreamingMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    channelId: "channel-1",
    authorId: "agent-1",
    authorType: "AGENT",
    content: "",
    type: "STREAMING",
    streamingStatus: "ACTIVE",
    sequence: BigInt(42),
    metadata: null,
    thinkingTimeline: null,
    tokenHistory: null,
    checkpoints: null,
    createdAt: new Date("2026-03-27T12:00:00.000Z"),
    updatedAt: new Date("2026-03-27T12:00:00.000Z"),
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    message: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    channel: {
      updateMany: vi.fn(),
    },
    ...overrides,
  };
}

function makeService(tx: ReturnType<typeof makeTx>) {
  const prismaClient = {
    $transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  return {
    service: createStreamLifecycleService({
      prismaClient: prismaClient as never,
    }),
    prismaClient,
  };
}

describe("createStreamLifecycleService", () => {
  it("startStreamPlaceholder creates the placeholder and advances lastSequence in one transaction", async () => {
    const callOrder: string[] = [];
    const tx = makeTx();

    tx.message.findUnique.mockResolvedValue(null);
    tx.message.create.mockImplementation(async ({ data }) => {
      callOrder.push("message.create");
      return makeStreamingMessage(data);
    });
    tx.channel.updateMany.mockImplementation(async () => {
      callOrder.push("channel.updateMany");
      return { count: 1 };
    });

    const { service, prismaClient } = makeService(tx);

    const result = await service.startStreamPlaceholder({
      id: "msg-1",
      channelId: "channel-1",
      authorId: "agent-1",
      authorType: "AGENT",
      sequence: "42",
      content: "",
    });

    expect(prismaClient.$transaction).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(["message.create", "channel.updateMany"]);
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          id: "msg-1",
          channelId: "channel-1",
          authorId: "agent-1",
          authorType: "AGENT",
          content: "",
          type: "STREAMING",
          streamingStatus: "ACTIVE",
          sequence: BigInt(42),
        },
      }),
    );
    expect(tx.channel.updateMany).toHaveBeenCalledWith({
      where: {
        id: "channel-1",
        lastSequence: { lt: BigInt(42) },
      },
      data: { lastSequence: BigInt(42) },
    });
    expect(result).toMatchObject({
      id: "msg-1",
      channelId: "channel-1",
      streamingStatus: "ACTIVE",
      sequence: "42",
      type: "STREAMING",
    });
  });

  it("startStreamPlaceholder is idempotent for the same placeholder", async () => {
    const existing = makeStreamingMessage();
    const tx = makeTx();

    tx.message.findUnique.mockResolvedValue(existing);

    const { service } = makeService(tx);

    const result = await service.startStreamPlaceholder({
      id: "msg-1",
      channelId: "channel-1",
      authorId: "agent-1",
      authorType: "AGENT",
      sequence: "42",
      content: "",
    });

    expect(tx.message.create).not.toHaveBeenCalled();
    expect(tx.channel.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: existing.id,
      streamingStatus: "ACTIVE",
      sequence: "42",
    });
  });

  it("completeStream only allows ACTIVE to COMPLETE", async () => {
    const tx = makeTx();

    tx.message.findUnique.mockResolvedValue(
      makeStreamingMessage({ streamingStatus: "ERROR" }),
    );

    const { service } = makeService(tx);

    await expect(
      service.completeStream({
        messageId: "msg-1",
        content: "done",
      }),
    ).rejects.toBeInstanceOf(StreamLifecycleConflictError);

    expect(tx.message.update).not.toHaveBeenCalled();
  });

  it("failStream only allows ACTIVE to ERROR", async () => {
    const tx = makeTx();

    tx.message.findUnique.mockResolvedValue(
      makeStreamingMessage({ streamingStatus: "COMPLETE" }),
    );

    const { service } = makeService(tx);

    await expect(
      service.failStream({
        messageId: "msg-1",
        content: "*[Error]*",
      }),
    ).rejects.toBeInstanceOf(StreamLifecycleConflictError);

    expect(tx.message.update).not.toHaveBeenCalled();
  });

  it("terminal transitions return the canonical persisted message payload", async () => {
    const tx = makeTx();
    const metadata = {
      model: "claude-sonnet-4-20250514",
      tokensOut: 128,
    };

    tx.message.findUnique.mockResolvedValue(makeStreamingMessage());
    tx.message.update.mockResolvedValue(
      makeStreamingMessage({
        content: "done",
        streamingStatus: "COMPLETE",
        metadata,
        thinkingTimeline: '[{"phase":"Thinking"}]',
        tokenHistory: '[{"o":0,"t":12}]',
        checkpoints: '[{"index":0,"label":"start"}]',
      }),
    );

    const { service } = makeService(tx);

    const result = await service.completeStream({
      messageId: "msg-1",
      content: "done",
      metadata,
      thinkingTimeline: '[{"phase":"Thinking"}]',
      tokenHistory: '[{"o":0,"t":12}]',
      checkpoints: '[{"index":0,"label":"start"}]',
    });

    expect(tx.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg-1" },
        data: {
          content: "done",
          streamingStatus: "COMPLETE",
          metadata,
          thinkingTimeline: '[{"phase":"Thinking"}]',
          tokenHistory: '[{"o":0,"t":12}]',
          checkpoints: '[{"index":0,"label":"start"}]',
        },
      }),
    );
    expect(result).toMatchObject({
      id: "msg-1",
      content: "done",
      streamingStatus: "COMPLETE",
      sequence: "42",
      metadata,
      thinkingTimeline: '[{"phase":"Thinking"}]',
      tokenHistory: '[{"o":0,"t":12}]',
      checkpoints: '[{"index":0,"label":"start"}]',
    });
  });
});
