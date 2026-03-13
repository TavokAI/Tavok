/**
 * TASK-0022: Unit tests for search query builder
 */
import { describe, it, expect, vi } from "vitest";

// Mock @prisma/client to avoid needing generated client in CI
vi.mock("@prisma/client", () => {
  class Sql {
    strings: string[];
    values: unknown[];
    constructor(strings: string[], values: unknown[]) {
      this.strings = strings;
      this.values = values;
    }
  }
  function sqlTag(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): InstanceType<typeof Sql> {
    // Flatten nested Sql objects into the string template (like real Prisma.sql)
    const flatStrings: string[] = [];
    const flatValues: unknown[] = [];
    for (let i = 0; i < strings.length; i++) {
      const prev = flatStrings.length > 0 ? flatStrings.pop()! : "";
      flatStrings.push(prev + strings[i]);
      if (i < values.length) {
        const val = values[i];
        if (val instanceof Sql) {
          // Embed nested SQL inline
          for (let j = 0; j < val.strings.length; j++) {
            const base = flatStrings.pop()!;
            flatStrings.push(base + val.strings[j]);
            if (j < val.values.length) {
              const nested = val.values[j];
              if (nested instanceof Sql) {
                for (let k = 0; k < nested.strings.length; k++) {
                  const b2 = flatStrings.pop()!;
                  flatStrings.push(b2 + nested.strings[k]);
                  if (k < nested.values.length)
                    flatValues.push(nested.values[k]);
                }
              } else {
                flatValues.push(nested);
              }
            }
          }
        } else {
          flatValues.push(val);
        }
      }
    }
    return new Sql(flatStrings, flatValues);
  }
  return {
    Prisma: {
      sql: sqlTag,
      join: (items: unknown[], sep?: unknown) => {
        if (items.length === 0) return new Sql([""], []);
        const strs: string[] = [""];
        const vals: unknown[] = [];
        for (let i = 0; i < items.length; i++) {
          vals.push(items[i]);
          strs.push(
            i < items.length - 1
              ? sep instanceof Sql
                ? sep.strings.join("")
                : " AND "
              : "",
          );
        }
        return new Sql(strs, vals);
      },
      empty: new Sql([""], []),
    },
  };
});

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
    const result = parseSearchFilters(makeParams({ q: "test", has: "file" }));
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
    expect(parseSearchFilters(makeParams({ q: "test", page: "0" })).page).toBe(
      1,
    );
    expect(parseSearchFilters(makeParams({ q: "test", page: "-1" })).page).toBe(
      1,
    );
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
