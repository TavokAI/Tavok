import { describe, it, expect } from "vitest";
import { parseAfterSequence, parseLimit } from "../validation";

describe("parseLimit", () => {
  it("accepts valid values", () => {
    expect(parseLimit("10")).toBe(10);
    expect(parseLimit(null)).toBe(50);
  });

  it("rejects malformed values", () => {
    expect(() => parseLimit("bad")).toThrow(
      /limit must be a number between 1 and 100/,
    );
    expect(() => parseLimit("0")).toThrow(/between 1 and 100/);
    expect(() => parseLimit("101")).toThrow(/between 1 and 100/);
  });
});

describe("parseAfterSequence", () => {
  it("accepts numeric strings", () => {
    expect(parseAfterSequence("0")).toBe("0");
    expect(parseAfterSequence("123")).toBe("123");
  });

  it("rejects malformed values", () => {
    expect(() => parseAfterSequence("")).toThrow(/afterSequence must be/);
    expect(() => parseAfterSequence("abc")).toThrow(/afterSequence must be/);
    expect(() => parseAfterSequence("1.2")).toThrow(/afterSequence must be/);
  });
});
