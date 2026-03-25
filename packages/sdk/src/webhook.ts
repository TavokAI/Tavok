/**
 * Tavok SDK Webhook Handler — receive outbound webhook triggers from Tavok.
 *
 * For agents using the WEBHOOK connection method, Tavok POSTs to the agent's
 * webhookUrl when a message triggers the agent. This module provides helpers to
 * verify HMAC signatures and process the incoming payloads.
 *
 * Ported from the Python SDK (`sdk/python/tavok/webhook.py`).
 *
 * @example
 * ```typescript
 * import { WebhookHandler } from "@tavok/sdk/webhook";
 *
 * const handler = new WebhookHandler("your-webhook-secret");
 *
 * // Express example
 * app.post("/webhook", (req, res) => {
 *   const event = handler.verifyAndParse({
 *     body: req.body, // raw Buffer
 *     headers: req.headers,
 *   });
 *   res.json({ content: `Echo: ${event.triggerMessage.content}` });
 * });
 * ```
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { WebhookEvent } from "./types";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Raised when webhook signature verification fails. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

// ---------------------------------------------------------------------------
// WebhookHandler
// ---------------------------------------------------------------------------

/** Shape of the incoming request passed to {@link WebhookHandler.verifyAndParse}. */
export interface WebhookRequest {
  /** Raw request body — Buffer or string. */
  body: Buffer | string;
  /** Request headers (Express-style, values may be string or string[]). */
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Handler for verifying and parsing Tavok outbound webhook payloads.
 *
 * Uses HMAC-SHA256 to verify the `X-Tavok-Signature` header.
 */
export class WebhookHandler {
  private readonly _secret: string;

  /**
   * @param secret - The webhook secret from agent registration.
   */
  constructor(secret: string) {
    this._secret = secret;
  }

  /**
   * Verify the HMAC-SHA256 signature of a webhook payload.
   *
   * @param body - Raw request body (Buffer or string).
   * @param signature - The `X-Tavok-Signature` header value (`sha256=<hex>`).
   * @returns `true` if signature is valid, `false` otherwise.
   */
  verifySignature(body: Buffer | string, signature: string): boolean {
    if (!signature.startsWith("sha256=")) {
      return false;
    }

    const expectedHex = signature.slice(7);
    const bodyBuf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
    const computed = createHmac("sha256", this._secret)
      .update(bodyBuf)
      .digest("hex");

    // Timing-safe comparison to prevent timing attacks
    try {
      return timingSafeEqual(
        Buffer.from(computed, "hex"),
        Buffer.from(expectedHex, "hex"),
      );
    } catch {
      // If lengths differ, timingSafeEqual throws — treat as mismatch
      return false;
    }
  }

  /**
   * Parse a webhook payload without signature verification.
   *
   * @param body - Raw request body (Buffer or string).
   * @returns Parsed {@link WebhookEvent}.
   */
  parse(body: Buffer | string): WebhookEvent {
    const text = typeof body === "string" ? body : body.toString("utf-8");
    const data = JSON.parse(text) as Record<string, unknown>;

    const triggerRaw = (data.triggerMessage ?? {}) as Record<string, unknown>;
    const contextRaw = (data.contextMessages ?? []) as Array<Record<string, unknown>>;

    return {
      type: (data.event as string) ?? "message",
      channelId: (data.channelId as string) ?? "",
      triggerMessage: {
        id: (triggerRaw.id as string) ?? "",
        content: (triggerRaw.content as string) ?? "",
        authorName: (triggerRaw.authorName as string) ?? "",
        authorType: (triggerRaw.authorType as string) ?? "USER",
      },
      contextMessages: contextRaw.map((m) => ({
        role: (m.role as string) ?? "user",
        content: (m.content as string) ?? "",
      })),
      callbackUrl: (data.callbackUrl as string) ?? null,
      raw: data,
    };
  }

  /**
   * Verify the signature and parse the webhook request in one step.
   *
   * @param req - Object with `body` (Buffer or string) and `headers`.
   * @returns Parsed {@link WebhookEvent}.
   * @throws {@link WebhookVerificationError} if signature is missing or invalid.
   */
  verifyAndParse(req: WebhookRequest): WebhookEvent {
    const rawSig =
      req.headers["x-tavok-signature"] ?? req.headers["X-Tavok-Signature"];

    const signature = Array.isArray(rawSig) ? rawSig[0] : rawSig;

    if (!signature) {
      throw new WebhookVerificationError("Missing X-Tavok-Signature header");
    }

    if (!this.verifySignature(req.body, signature)) {
      throw new WebhookVerificationError("Invalid webhook signature");
    }

    return this.parse(req.body);
  }
}
