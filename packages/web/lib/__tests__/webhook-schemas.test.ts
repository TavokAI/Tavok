import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Tests for webhook route handler zod schemas.
 * Schemas are defined inline in route handlers; we replicate them here
 * to verify validation behavior matches the contract.
 */

// Replicate webhook creation schema from webhooks/route.ts
const webhookCreateSchema = z
  .object({
    channelId: z.string().min(1, "channelId is required"),
    name: z.string().min(1, "name is required"),
    avatarUrl: z.string().nullable().optional(),
  })
  .strict();

// Replicate webhook message schema from webhooks/[token]/route.ts
const VALID_TYPED_TYPES = [
  "TOOL_CALL",
  "TOOL_RESULT",
  "CODE_BLOCK",
  "ARTIFACT",
  "STATUS",
] as const;

const webhookMessageSchema = z
  .object({
    content: z.union([z.string(), z.record(z.unknown())]).optional(),
    streaming: z.boolean().optional(),
    username: z.string().optional(),
    avatarUrl: z.string().optional(),
    type: z.enum(VALID_TYPED_TYPES).optional(),
  })
  .strict();

describe("webhookCreateSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = webhookCreateSchema.safeParse({
      channelId: "ch-123",
      name: "Build Bot",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts input without avatarUrl", () => {
    const result = webhookCreateSchema.safeParse({
      channelId: "ch-123",
      name: "Build Bot",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null avatarUrl", () => {
    const result = webhookCreateSchema.safeParse({
      channelId: "ch-123",
      name: "Build Bot",
      avatarUrl: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty channelId", () => {
    const result = webhookCreateSchema.safeParse({
      channelId: "",
      name: "Bot",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing channelId", () => {
    const result = webhookCreateSchema.safeParse({ name: "Bot" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = webhookCreateSchema.safeParse({
      channelId: "ch-1",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    const result = webhookCreateSchema.safeParse({
      channelId: "ch-1",
      name: "Bot",
      extraField: "value",
    });
    expect(result.success).toBe(false);
  });
});

describe("webhookMessageSchema", () => {
  it("accepts simple text message", () => {
    const result = webhookMessageSchema.safeParse({ content: "Hello world" });
    expect(result.success).toBe(true);
  });

  it("accepts streaming request", () => {
    const result = webhookMessageSchema.safeParse({ streaming: true });
    expect(result.success).toBe(true);
  });

  it("accepts typed message with string content", () => {
    const result = webhookMessageSchema.safeParse({
      type: "TOOL_CALL",
      content: '{"toolName":"search"}',
    });
    expect(result.success).toBe(true);
  });

  it("accepts typed message with object content", () => {
    const result = webhookMessageSchema.safeParse({
      type: "TOOL_RESULT",
      content: { result: "success", data: [1, 2, 3] },
    });
    expect(result.success).toBe(true);
  });

  it("accepts message with username and avatar override", () => {
    const result = webhookMessageSchema.safeParse({
      content: "Build passed",
      username: "CI Bot",
      avatarUrl: "https://example.com/ci.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty body (all fields optional)", () => {
    const result = webhookMessageSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid typed message type", () => {
    const result = webhookMessageSchema.safeParse({
      type: "INVALID_TYPE",
      content: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean streaming", () => {
    const result = webhookMessageSchema.safeParse({ streaming: "true" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    const result = webhookMessageSchema.safeParse({
      content: "test",
      unknownField: true,
    });
    expect(result.success).toBe(false);
  });

  it("validates all five typed message types", () => {
    for (const type of VALID_TYPED_TYPES) {
      const result = webhookMessageSchema.safeParse({ type, content: "test" });
      expect(result.success).toBe(true);
    }
  });
});
