import { describe, it, expect } from "vitest";
import { generateInviteCode } from "../invite-code";

describe("generateInviteCode", () => {
  it("generates an 8-character code", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(8);
  });

  it("contains only alphanumeric characters", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it("generates unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateInviteCode());
    }
    // With ~47.6 bits of entropy, collisions in 100 codes are astronomically unlikely
    expect(codes.size).toBe(100);
  });
});
