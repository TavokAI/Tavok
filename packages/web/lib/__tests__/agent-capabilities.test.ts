import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITIES,
  hasAgentCapability,
  normalizeAgentCapabilities,
} from "../agent-capabilities";

describe("agent capability policy", () => {
  it("treats empty capabilities as legacy full access for non-guest agents", () => {
    expect(
      hasAgentCapability(
        { isGuest: false, capabilities: [] },
        AGENT_CAPABILITIES.READ_HISTORY,
      ),
    ).toBe(true);
  });

  it("treats empty capabilities as no access for guest agents", () => {
    expect(
      hasAgentCapability(
        { isGuest: true, capabilities: [] },
        AGENT_CAPABILITIES.READ_HISTORY,
      ),
    ).toBe(false);
  });

  it("grants guest agents only the explicit capability labels they carry", () => {
    const guest = {
      isGuest: true,
      capabilities: [AGENT_CAPABILITIES.SEND_MESSAGES],
    };

    expect(
      hasAgentCapability(guest, AGENT_CAPABILITIES.SEND_MESSAGES),
    ).toBe(true);
    expect(hasAgentCapability(guest, AGENT_CAPABILITIES.STREAM)).toBe(false);
  });

  it("drops unknown and non-string labels when normalizing capabilities", () => {
    expect(
      normalizeAgentCapabilities([
        AGENT_CAPABILITIES.READ_HISTORY,
        "chat",
        7,
        AGENT_CAPABILITIES.READ_HISTORY,
      ]),
    ).toEqual([AGENT_CAPABILITIES.READ_HISTORY]);
  });
});
