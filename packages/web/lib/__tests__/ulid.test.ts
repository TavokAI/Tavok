import { describe, it, expect } from "vitest";
import { generateId } from "../ulid";

describe("generateId", () => {
  it("returns a 26-character ULID string", () => {
    const id = generateId();
    expect(id).toHaveLength(26);
  });

  it("returns only valid ULID characters (Crockford Base32)", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it("generates time-ordered IDs across different milliseconds", async () => {
    const id1 = generateId();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const id2 = generateId();
    // ULIDs are lexicographically sortable by time when generated in different milliseconds
    expect(id2 > id1).toBe(true);
  });
});
