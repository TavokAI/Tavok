import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { WebhookHandler, WebhookVerificationError } from "../webhook";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET): string {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

const samplePayload = JSON.stringify({
  event: "message",
  channelId: "ch-abc",
  triggerMessage: {
    id: "msg-1",
    content: "Hello bot",
    authorName: "Alice",
    authorType: "USER",
  },
  contextMessages: [
    { role: "user", content: "Hello bot" },
    { role: "assistant", content: "Hi there!" },
  ],
  callbackUrl: "http://localhost:5555/callback",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebhookHandler", () => {
  const handler = new WebhookHandler(SECRET);

  // ---- verifySignature() ------------------------------------------------

  describe("verifySignature()", () => {
    it("should accept a valid signature (string body)", () => {
      const sig = sign(samplePayload);
      expect(handler.verifySignature(samplePayload, sig)).toBe(true);
    });

    it("should accept a valid signature (Buffer body)", () => {
      const buf = Buffer.from(samplePayload, "utf-8");
      const sig = sign(samplePayload);
      expect(handler.verifySignature(buf, sig)).toBe(true);
    });

    it("should reject an invalid signature", () => {
      const badSig = "sha256=0000000000000000000000000000000000000000000000000000000000000000";
      expect(handler.verifySignature(samplePayload, badSig)).toBe(false);
    });

    it("should reject a signature without sha256= prefix", () => {
      const hex = createHmac("sha256", SECRET)
        .update(samplePayload)
        .digest("hex");
      expect(handler.verifySignature(samplePayload, hex)).toBe(false);
    });

    it("should reject a signature signed with a different secret", () => {
      const wrongSig = sign(samplePayload, "wrong-secret");
      expect(handler.verifySignature(samplePayload, wrongSig)).toBe(false);
    });
  });

  // ---- parse() ----------------------------------------------------------

  describe("parse()", () => {
    it("should parse a string body into WebhookEvent", () => {
      const event = handler.parse(samplePayload);

      expect(event.type).toBe("message");
      expect(event.channelId).toBe("ch-abc");
      expect(event.triggerMessage.id).toBe("msg-1");
      expect(event.triggerMessage.content).toBe("Hello bot");
      expect(event.triggerMessage.authorName).toBe("Alice");
      expect(event.triggerMessage.authorType).toBe("USER");
      expect(event.contextMessages).toHaveLength(2);
      expect(event.contextMessages[0]).toEqual({ role: "user", content: "Hello bot" });
      expect(event.contextMessages[1]).toEqual({
        role: "assistant",
        content: "Hi there!",
      });
      expect(event.callbackUrl).toBe("http://localhost:5555/callback");
      expect(event.raw).toBeDefined();
    });

    it("should parse a Buffer body", () => {
      const buf = Buffer.from(samplePayload, "utf-8");
      const event = handler.parse(buf);
      expect(event.type).toBe("message");
      expect(event.triggerMessage.content).toBe("Hello bot");
    });

    it("should default missing fields gracefully", () => {
      const minimal = JSON.stringify({ event: "message" });
      const event = handler.parse(minimal);

      expect(event.channelId).toBe("");
      expect(event.triggerMessage.id).toBe("");
      expect(event.triggerMessage.authorType).toBe("USER");
      expect(event.contextMessages).toEqual([]);
      expect(event.callbackUrl).toBeNull();
    });
  });

  // ---- verifyAndParse() -------------------------------------------------

  describe("verifyAndParse()", () => {
    it("should verify and parse a valid request", () => {
      const sig = sign(samplePayload);
      const event = handler.verifyAndParse({
        body: samplePayload,
        headers: { "x-tavok-signature": sig },
      });

      expect(event.type).toBe("message");
      expect(event.triggerMessage.content).toBe("Hello bot");
    });

    it("should accept X-Tavok-Signature (capitalized) header", () => {
      const sig = sign(samplePayload);
      const event = handler.verifyAndParse({
        body: samplePayload,
        headers: { "X-Tavok-Signature": sig },
      });

      expect(event.type).toBe("message");
    });

    it("should throw WebhookVerificationError for missing signature", () => {
      expect(() =>
        handler.verifyAndParse({
          body: samplePayload,
          headers: {},
        }),
      ).toThrow(WebhookVerificationError);

      expect(() =>
        handler.verifyAndParse({
          body: samplePayload,
          headers: {},
        }),
      ).toThrow("Missing X-Tavok-Signature header");
    });

    it("should throw WebhookVerificationError for invalid signature", () => {
      expect(() =>
        handler.verifyAndParse({
          body: samplePayload,
          headers: {
            "x-tavok-signature": "sha256=badhex00000000000000000000000000000000000000000000000000000000",
          },
        }),
      ).toThrow(WebhookVerificationError);

      expect(() =>
        handler.verifyAndParse({
          body: samplePayload,
          headers: {
            "x-tavok-signature": "sha256=badhex00000000000000000000000000000000000000000000000000000000",
          },
        }),
      ).toThrow("Invalid webhook signature");
    });

    it("should work with Buffer body in verifyAndParse", () => {
      const buf = Buffer.from(samplePayload, "utf-8");
      const sig = sign(samplePayload);
      const event = handler.verifyAndParse({
        body: buf,
        headers: { "x-tavok-signature": sig },
      });

      expect(event.type).toBe("message");
    });
  });

  // ---- Error type -------------------------------------------------------

  describe("WebhookVerificationError", () => {
    it("should be an instance of Error", () => {
      const err = new WebhookVerificationError("test");
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(WebhookVerificationError);
      expect(err.name).toBe("WebhookVerificationError");
      expect(err.message).toBe("test");
    });
  });
});
