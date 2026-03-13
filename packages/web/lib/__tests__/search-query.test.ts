/**
 * TASK-0022: Unit tests for search query builder
 */
import { describe, it, expect } from "vitest";
import { parseSearchFilters } from "../search-query";

describe("parseSearchFilters", () => {
  function makeParams(params: Record<string, string>): URLSearchParams {
    return new URLSearchParams(params);
  }

  it("parses a basic query", () => {
    const result = parseSearchFilters(makeParams({ q: "hello world" }));
    expect(result.query).toBe("hello world");
    expect(result.page).toBe(1);
    expect(result.hasFile).toBe(false);
    expect(result.hasLink).toBe(false);
    expect(result.hasMention).toBe(false);
  });

  it("throws when query is empty", () => {
    expect(() => parseSearchFilters(makeParams({}))).toThrow(
      "Search query is required",
    );
    expect(() => parseSearchFilters(makeParams({ q: "" }))).toThrow(
      "Search query is required",
    );
    expect(() => parseSearchFilters(makeParams({ q: "   " }))).toThrow(
      "Search query is required",
    );
  });

  it("throws when query exceeds max length", () => {
    const longQuery = "a".repeat(201);
    expect(() => parseSearchFilters(makeParams({ q: longQuery }))).toThrow(
      "200 characters or less",
    );
  });

  it("accepts query at max length", () => {
    const maxQuery = "a".repeat(200);
    const result = parseSearchFilters(makeParams({ q: maxQuery }));
    expect(result.query).toBe(maxQuery);
  });

  it("parses optional filters", () => {
    const result = parseSearchFilters(
      makeParams({
        q: "test",
        channelId: "ch1",
        userId: "u1",
        after: "2026-01-01",
        before: "2026-12-31",
      }),
    );
    expect(result.channelId).toBe("ch1");
    expect(result.userId).toBe("u1");
    expect(result.after).toBe("2026-01-01");
    expect(result.before).toBe("2026-12-31");
  });

  it("parses has:file,link,mention filters", () => {
    const result = parseSearchFilters(
      makeParams({ q: "test", has: "file,link,mention" }),
    );
    expect(result.hasFile).toBe(true);
    expect(result.hasLink).toBe(true);
    expect(result.hasMention).toBe(true);
  });

  it("parses has filter with single value", () => {
    const result = parseSearchFilters(
      makeParams({ q: "test", has: "file" }),
    );
    expect(result.hasFile).toBe(true);
    expect(result.hasLink).toBe(false);
    expect(result.hasMention).toBe(false);
  });

  it("ignores unknown has values", () => {
    const result = parseSearchFilters(
      makeParams({ q: "test", has: "file,unknown,link" }),
    );
    expect(result.hasFile).toBe(true);
    expect(result.hasLink).toBe(true);
    expect(result.hasMention).toBe(false);
  });

  it("parses page number", () => {
    const result = parseSearchFilters(makeParams({ q: "test", page: "3" }));
    expect(result.page).toBe(3);
  });

  it("defaults page to 1 for invalid values", () => {
    expect(
      parseSearchFilters(makeParams({ q: "test", page: "abc" })).page,
    ).toBe(1);
    expect(
      parseSearchFilters(makeParams({ q: "test", page: "0" })).page,
    ).toBe(1);
    expect(
      parseSearchFilters(makeParams({ q: "test", page: "-1" })).page,
    ).toBe(1);
  });

  it("returns undefined for omitted optional filters", () => {
    const result = parseSearchFilters(makeParams({ q: "test" }));
    expect(result.channelId).toBeUndefined();
    expect(result.userId).toBeUndefined();
    expect(result.after).toBeUndefined();
    expect(result.before).toBeUndefined();
  });

  it("trims whitespace from query", () => {
    const result = parseSearchFilters(makeParams({ q: "  hello  " }));
    expect(result.query).toBe("hello");
  });
});
