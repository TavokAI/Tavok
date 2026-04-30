import { describe, expect, it } from "vitest";
import { normalizeAgentAuditEvents } from "../agent-audit-log";
import { getCapabilityLabel } from "../types";

describe("agent capability labels", () => {
  it("uses understandable labels for known capability identifiers", () => {
    expect(getCapabilityLabel("channel_history_read")).toBe("History read");
    expect(getCapabilityLabel("history:read")).toBe("History read");
    expect(getCapabilityLabel("messages:send")).toBe("Send messages");
    expect(getCapabilityLabel("stream")).toBe("Stream responses");
    expect(getCapabilityLabel("streams:write")).toBe("Stream responses");
    expect(getCapabilityLabel("typed_artifact_send")).toBe(
      "Send typed artifacts",
    );
    expect(getCapabilityLabel("artifacts:send")).toBe("Send typed artifacts");
    expect(getCapabilityLabel("trigger_other_agents")).toBe(
      "Trigger other agents",
    );
    expect(getCapabilityLabel("agents:trigger")).toBe("Trigger other agents");
  });

  it("prettifies unknown capabilities instead of leaking raw identifiers", () => {
    expect(getCapabilityLabel("custom_tool.execute")).toBe(
      "Custom tool execute",
    );
  });
});

describe("agent audit event normalization", () => {
  it("accepts stdout-style audit JSON from the future API route", () => {
    const events = normalizeAgentAuditEvents({
      events: [
        {
          agent_id: "agent-1",
          server_id: "server-1",
          action: "channel_history_read",
          channel_id: "channel-1",
          message_id: "message-1",
          ts: "2026-04-29T12:00:00.000Z",
          meta: { count: 25 },
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "2026-04-29T12:00:00.000Z-agent-1-channel_history_read",
        agentId: "agent-1",
        agentName: null,
        action: "channel_history_read",
        actionLabel: "History read",
        channelId: "channel-1",
        messageId: "message-1",
        metadata: { count: 25 },
        createdAt: "2026-04-29T12:00:00.000Z",
      },
    ]);
  });
});
