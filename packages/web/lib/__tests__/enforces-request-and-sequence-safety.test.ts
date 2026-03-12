// @ts-nocheck — test intentionally passes invalid types to verify runtime guards
import { describe, it, expect } from "vitest";
import {
  buildMonotonicLastSequenceUpdate,
  isJsonObjectBody,
  parseNonNegativeSequence,
} from "../api-safety";

describe("enforces_request_and_sequence_safety", () => {
  it("invalid_json_body_is_rejected_by_shared_guard", () => {
    expect(isJsonObjectBody(null)).toBe(false);
    expect(isJsonObjectBody([])).toBe(false);
    expect(isJsonObjectBody("x")).toBe(false);
    expect(isJsonObjectBody(123)).toBe(false);
    expect(isJsonObjectBody({})).toBe(true);
    expect(isJsonObjectBody({ ok: true })).toBe(true);
  });

  it("invalid_sequence_is_rejected_by_shared_parser", () => {
    expect(parseNonNegativeSequence(undefined)).toBeNull();
    expect(parseNonNegativeSequence(null)).toBeNull();
    expect(parseNonNegativeSequence({})).toBeNull();
    expect(parseNonNegativeSequence("-1")).toBeNull();
    expect(parseNonNegativeSequence("abc")).toBeNull();
    expect(parseNonNegativeSequence("")).toBeNull();
  });

  it("valid_sequence_is_parsed_without_precision_loss", () => {
    expect(parseNonNegativeSequence("9007199254740993")).toBe(
      BigInt("9007199254740993"),
    );
    expect(parseNonNegativeSequence(42)).toBe(BigInt(42));
    expect(parseNonNegativeSequence(BigInt(43))).toBe(BigInt(43));
  });

  it("monotonic_last_sequence_update_uses_lt_guard", () => {
    const channelId = "channel-1";
    const sequenceBigInt = BigInt("9007199254740993");

    const update = buildMonotonicLastSequenceUpdate(channelId, sequenceBigInt);

    expect(update).toEqual({
      where: {
        id: channelId,
        lastSequence: { lt: sequenceBigInt },
      },
      data: { lastSequence: sequenceBigInt },
    });
  });
});
