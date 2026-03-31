import type {
  AuthorType,
  MessageType,
  Prisma,
  PrismaClient,
  StreamStatus,
} from "@prisma/client";
import {
  buildMonotonicLastSequenceUpdate,
  parseNonNegativeSequence,
  serializeSequence,
} from "./api-safety";
import type { MessageMetadata } from "./message-metadata-contract";

const streamLifecycleSelect = {
  id: true,
  channelId: true,
  authorId: true,
  authorType: true,
  content: true,
  type: true,
  streamingStatus: true,
  sequence: true,
  metadata: true,
  thinkingTimeline: true,
  tokenHistory: true,
  checkpoints: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MessageSelect;

type StreamLifecycleRecord = Prisma.MessageGetPayload<{
  select: typeof streamLifecycleSelect;
}>;

interface StreamLifecycleDeps {
  prismaClient: Pick<PrismaClient, "$transaction">;
}

export interface StreamLifecycleMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorType: AuthorType;
  content: string;
  type: MessageType;
  streamingStatus: StreamStatus | null;
  sequence: string;
  metadata: Prisma.JsonValue | null;
  thinkingTimeline: string | null;
  tokenHistory: string | null;
  checkpoints: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StartStreamPlaceholderInput {
  id: string;
  channelId: string;
  authorId: string;
  authorType: AuthorType;
  sequence: string | number | bigint;
  content?: string;
}

interface TerminalStreamInput {
  messageId: string;
  content: string;
  metadata?: MessageMetadata;
  thinkingTimeline?: string;
  tokenHistory?: string;
  checkpoints?: string;
}

export class StreamLifecycleConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "StreamLifecycleConflictError";
  }
}

export class StreamLifecycleNotFoundError extends Error {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "StreamLifecycleNotFoundError";
  }
}

export function createStreamLifecycleService({
  prismaClient,
}: StreamLifecycleDeps) {
  return {
    async startStreamPlaceholder(
      input: StartStreamPlaceholderInput,
    ): Promise<StreamLifecycleMessage> {
      const sequenceBigInt = parseNonNegativeSequence(input.sequence);
      if (sequenceBigInt === null) {
        throw new TypeError("sequence must be a non-negative integer string");
      }

      const record = await prismaClient.$transaction(async (tx) => {
        const existing = await tx.message.findUnique({
          where: { id: input.id },
          select: streamLifecycleSelect,
        });

        if (existing) {
          if (isIdempotentStart(existing, input, sequenceBigInt)) {
            return existing;
          }

          throw new StreamLifecycleConflictError(
            "Stream placeholder already exists with different state",
          );
        }

        const created = await tx.message.create({
          data: {
            id: input.id,
            channelId: input.channelId,
            authorId: input.authorId,
            authorType: input.authorType,
            content: input.content ?? "",
            type: "STREAMING",
            streamingStatus: "ACTIVE",
            sequence: sequenceBigInt,
          },
          select: streamLifecycleSelect,
        });

        await tx.channel.updateMany({
          ...buildMonotonicLastSequenceUpdate(input.channelId, sequenceBigInt),
        });

        return created;
      });

      return toStreamLifecycleMessage(record);
    },

    async completeStream(
      input: TerminalStreamInput,
    ): Promise<StreamLifecycleMessage> {
      return transitionTerminalState(prismaClient, input, "COMPLETE");
    },

    async failStream(
      input: TerminalStreamInput,
    ): Promise<StreamLifecycleMessage> {
      return transitionTerminalState(prismaClient, input, "ERROR");
    },
  };
}

async function transitionTerminalState(
  prismaClient: Pick<PrismaClient, "$transaction">,
  input: TerminalStreamInput,
  nextStatus: StreamStatus,
): Promise<StreamLifecycleMessage> {
  const record = await prismaClient.$transaction(async (tx) => {
    const existing = await tx.message.findUnique({
      where: { id: input.messageId },
      select: streamLifecycleSelect,
    });

    if (!existing) {
      throw new StreamLifecycleNotFoundError("Stream message not found");
    }

    if (existing.type !== "STREAMING") {
      throw new StreamLifecycleConflictError(
        "Only STREAMING messages can use the stream lifecycle",
      );
    }

    if (existing.streamingStatus === nextStatus) {
      return existing;
    }

    if (existing.streamingStatus !== "ACTIVE") {
      throw new StreamLifecycleConflictError(
        `Invalid stream transition ${existing.streamingStatus} -> ${nextStatus}`,
      );
    }

    try {
      return await tx.message.update({
        where: {
          id: input.messageId,
          streamingStatus: "ACTIVE",
        },
        data: buildTerminalUpdateData(input, nextStatus),
        select: streamLifecycleSelect,
      });
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        throw new StreamLifecycleConflictError(
          `Invalid stream transition ACTIVE -> ${nextStatus}`,
        );
      }
      throw error;
    }
  });

  return toStreamLifecycleMessage(record);
}

function isPrismaNotFoundError(
  error: unknown,
): error is Error & { code: string } {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

function buildTerminalUpdateData(
  input: TerminalStreamInput,
  nextStatus: StreamStatus,
) {
  const updateData: Prisma.MessageUpdateInput = {
    content: input.content,
    streamingStatus: nextStatus,
  };

  if (input.metadata !== undefined) {
    updateData.metadata = input.metadata as Prisma.InputJsonValue;
  }
  if (input.thinkingTimeline !== undefined) {
    updateData.thinkingTimeline = input.thinkingTimeline;
  }
  if (input.tokenHistory !== undefined) {
    updateData.tokenHistory = input.tokenHistory;
  }
  if (input.checkpoints !== undefined) {
    updateData.checkpoints = input.checkpoints;
  }

  return updateData;
}

function isIdempotentStart(
  existing: StreamLifecycleRecord,
  input: StartStreamPlaceholderInput,
  sequenceBigInt: bigint,
) {
  return (
    existing.channelId === input.channelId &&
    existing.authorId === input.authorId &&
    existing.authorType === input.authorType &&
    existing.content === (input.content ?? "") &&
    existing.type === "STREAMING" &&
    existing.streamingStatus === "ACTIVE" &&
    existing.sequence === sequenceBigInt
  );
}

function toStreamLifecycleMessage(
  record: StreamLifecycleRecord,
): StreamLifecycleMessage {
  return {
    id: record.id,
    channelId: record.channelId,
    authorId: record.authorId,
    authorType: record.authorType,
    content: record.content,
    type: record.type,
    streamingStatus: record.streamingStatus,
    sequence: serializeSequence(record.sequence),
    metadata: record.metadata,
    thinkingTimeline: record.thinkingTimeline,
    tokenHistory: record.tokenHistory,
    checkpoints: record.checkpoints,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
