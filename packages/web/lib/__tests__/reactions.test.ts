import { describe, it, expect } from "vitest";
import { aggregateReactions, ALLOWED_EMOJIS } from "../reactions";

describe("aggregateReactions", () => {
  it("aggregates reactions by emoji", () => {
    const input = [
      { emoji: "👍", userId: "user1" },
      { emoji: "👍", userId: "user2" },
      { emoji: "❌", userId: "user1" },
    ];
    const result = aggregateReactions(input);
    expect(result).toHaveLength(2);

    const thumbsUp = result.find((r) => r.emoji === "👍");
    expect(thumbsUp).toBeDefined();
    expect(thumbsUp!.count).toBe(2);
    expect(thumbsUp!.userIds).toEqual(["user1", "user2"]);

    const cross = result.find((r) => r.emoji === "❌");
    expect(cross).toBeDefined();
    expect(cross!.count).toBe(1);
    expect(cross!.userIds).toEqual(["user1"]);
  });

  it("returns empty array for empty input", () => {
    expect(aggregateReactions([])).toEqual([]);
  });

  it("handles single reaction", () => {
    const result = aggregateReactions([{ emoji: "🚀", userId: "user1" }]);
    expect(result).toEqual([
      { emoji: "🚀", count: 1, userIds: ["user1"] },
    ]);
  });
});

describe("ALLOWED_EMOJIS", () => {
  it("contains expected emojis", () => {
    expect(ALLOWED_EMOJIS).toContain("👍");
    expect(ALLOWED_EMOJIS).toContain("👎");
    expect(ALLOWED_EMOJIS).toHaveLength(5);
  });
});
