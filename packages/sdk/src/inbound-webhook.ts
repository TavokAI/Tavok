/**
 * Tavok SDK Inbound Webhook client.
 *
 * Fire-and-forget pattern for agents that POST messages into Tavok
 * via a webhook URL (which embeds the authentication token).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for sending a webhook message. */
export interface WebhookSendOptions {
  /** Display name override for the message author. */
  username?: string;
  /** Avatar URL override for the message author. */
  avatarUrl?: string;
}

/** Response from a successful webhook send. */
export interface WebhookSendResult {
  messageId: string;
  sequence: string;
}

// ---------------------------------------------------------------------------
// InboundWebhookClient
// ---------------------------------------------------------------------------

/**
 * Client for posting messages into Tavok via an inbound webhook URL.
 *
 * The webhook URL already contains the authentication token (`whk_...`),
 * so no separate API key is needed.
 *
 * @example
 * ```typescript
 * const webhook = new InboundWebhookClient(
 *   "https://tavok.example.com/api/v1/webhooks/whk_abc123",
 * );
 *
 * const result = await webhook.send("Hello from webhook!");
 * console.log(result.messageId);
 * ```
 */
export class InboundWebhookClient {
  private readonly _webhookUrl: string;

  /**
   * @param webhookUrl - The full webhook URL including the `whk_` token segment.
   */
  constructor(webhookUrl: string) {
    this._webhookUrl = webhookUrl;
  }

  /**
   * Send a message to the channel associated with this webhook.
   *
   * @param content - Message text.
   * @param opts - Optional username and avatar overrides.
   * @returns The created message's ID and sequence number.
   */
  async send(content: string, opts?: WebhookSendOptions): Promise<WebhookSendResult> {
    const payload: Record<string, unknown> = { content };
    if (opts?.username) {
      payload.username = opts.username;
    }
    if (opts?.avatarUrl) {
      payload.avatarUrl = opts.avatarUrl;
    }

    const response = await fetch(this._webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook send failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    return {
      messageId: json.messageId as string,
      sequence: json.sequence as string,
    };
  }
}
