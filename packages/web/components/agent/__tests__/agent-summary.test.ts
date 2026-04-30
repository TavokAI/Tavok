import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AgentSummaryDialog,
  AgentHoverSummary,
  buildAgentSummary,
  buildAgentSummaryFromMessage,
  type AgentSummaryData,
} from "../agent-summary";

const baseAgent: AgentSummaryData = {
  id: "agent-1",
  name: "Review Bot",
  avatarUrl: null,
  isActive: true,
  llmProvider: "openai",
  llmModel: "gpt-5.5",
  apiEndpoint: "https://api.openai.com/v1",
  temperature: 0.3,
  maxTokens: 4096,
  connectionMethod: "WEBSOCKET",
  triggerMode: "MENTION",
  capabilities: ["history:read", "messages:send", "streams:write"],
  channels: [
    { id: "channel-1", name: "general" },
    { id: "channel-2", name: "launch" },
  ],
  isGuest: true,
  expiresAt: "2026-05-01T12:00:00.000Z",
  revokedAt: null,
  createdAt: "2026-04-30T12:00:00.000Z",
  systemPrompt: "Review proposed changes and call out release risks.",
};

describe("buildAgentSummary", () => {
  it("summarizes the important trust and routing fields for hover", () => {
    const summary = buildAgentSummary(baseAgent);

    expect(summary.statusLabel).toBe("Guest");
    expect(summary.connectionLabel).toBe("SDK");
    expect(summary.triggerLabel).toBe("Mention");
    expect(summary.scopeLabel).toBe("2 channels");
    expect(summary.capabilityLabels).toEqual([
      "History read",
      "Send messages",
      "Stream responses",
    ]);
    expect(summary.modelLabel).toBe("openai / gpt-5.5");
  });

  it("prioritizes revoked and expired states over active status", () => {
    expect(
      buildAgentSummary({
        ...baseAgent,
        revokedAt: "2026-04-30T13:00:00.000Z",
      }).statusLabel,
    ).toBe("Revoked");

    expect(
      buildAgentSummary(
        {
          ...baseAgent,
          expiresAt: "2026-04-29T12:00:00.000Z",
        },
        new Date("2026-04-30T12:00:00.000Z"),
      ).statusLabel,
    ).toBe("Expired");
  });

  it("falls back to message metadata when the agent is no longer in context", () => {
    const agent = buildAgentSummaryFromMessage(undefined, {
      authorId: "agent-archived",
      authorName: "Archived Agent",
      authorAvatarUrl: null,
      streamingStatus: "ERROR",
      metadata: { provider: "anthropic", model: "claude-sonnet" },
    });

    expect(agent).toMatchObject({
      id: "agent-archived",
      name: "Archived Agent",
      isActive: false,
      llmProvider: "anthropic",
      llmModel: "claude-sonnet",
    });
  });
});

describe("agent summary surfaces", () => {
  it("renders a compact hover summary without exposing the full system prompt", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentHoverSummary, {
        agent: baseAgent,
        isStreaming: true,
      }),
    );

    expect(html).toContain("Review Bot");
    expect(html).toContain("Guest");
    expect(html).toContain("SDK");
    expect(html).toContain("2 channels");
    expect(html).toContain("Streaming now");
    expect(html).not.toContain("Review proposed changes");
  });

  it("renders the full clicked summary with permissions, scope, and prompt", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentSummaryDialog, {
        agent: baseAgent,
        isStreaming: false,
        onClose: () => {},
      }),
    );

    expect(html).toContain("Review Bot");
    expect(html).toContain("openai / gpt-5.5");
    expect(html).toContain("https://api.openai.com/v1");
    expect(html).toContain("0.3");
    expect(html).toContain("4096");
    expect(html).toContain("History read");
    expect(html).toContain("Send messages");
    expect(html).toContain("#general");
    expect(html).toContain("#launch");
    expect(html).toContain(
      "Review proposed changes and call out release risks.",
    );
  });
});
