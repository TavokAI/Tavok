import { describe, it, expect } from "vitest";
import { serializeSequence } from "../api-safety";

describe("returns_sequence_as_safe_string", () => {
  it("returns sequence as safe string", () => {
    const unsafeSequence = BigInt(Number.MAX_SAFE_INTEGER) + 2n;
    expect(serializeSequence(unsafeSequence)).toBe("9007199254740993");
  });
});
