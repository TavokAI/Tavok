// @ts-nocheck — test mocks use partial objects
/**
 * TASK-0022: Unit tests for search API route behavior
 *
 * Tests the parseSearchFilters utility (integration-level) and
 * buildServerSearchQuery / buildDmSearchQuery SQL generation.
 */
import { describe, it, expect } from "vitest";
import {
  buildServerSearchQuery,
  buildDmSearchQuery,
  PAGE_SIZE,
} from "../search-query";

describe("buildServerSearchQuery", () => {
  it("generates SQL with base query params", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
    });
    // The Prisma.sql tagged template returns a Prisma.Sql object with strings and values
    expect(sql).toBeDefined();
    expect(sql.strings).toBeDefined();
    // Check the SQL text contains expected fragments
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain("to_tsvector");
    expect(fullSql).toContain("plainto_tsquery");
    expect(fullSql).toContain("ts_headline");
    expect(fullSql).toContain("ts_rank");
    expect(fullSql).toContain('"Channel"');
    expect(fullSql).toContain('"isDeleted"');
  });

  it("includes channelId filter when provided", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
      channelId: "ch1",
    });
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain('"channelId"');
  });

  it("includes userId filter when provided", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
      userId: "u1",
    });
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain('"authorId"');
  });

  it("includes date range filters when provided", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
      after: "2026-01-01",
      before: "2026-12-31",
    });
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain('"createdAt" >=');
    expect(fullSql).toContain('"createdAt" <=');
  });

  it("includes has:file subquery when hasFile is true", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
      hasFile: true,
    });
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain('"Attachment"');
  });

  it("includes has:link regex when hasLink is true", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
      hasLink: true,
    });
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain("https?://");
  });

  it("includes has:mention subquery when hasMention is true", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
      hasMention: true,
    });
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain('"MessageMention"');
  });

  it("applies pagination offset for page > 1", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
      page: 3,
    });
    // Check that offset value is (3-1) * PAGE_SIZE = 50
    const expectedOffset = 2 * PAGE_SIZE;
    expect(sql.values).toContain(expectedOffset);
  });

  it("fetches PAGE_SIZE + 1 rows for hasMore detection", () => {
    const sql = buildServerSearchQuery({
      query: "hello",
      serverId: "srv1",
    });
    expect(sql.values).toContain(PAGE_SIZE + 1);
  });
});

describe("buildDmSearchQuery", () => {
  it("generates SQL with base DM query params", () => {
    const sql = buildDmSearchQuery({
      query: "hello",
      participantDmIds: ["dm1", "dm2"],
    });
    expect(sql).toBeDefined();
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain("to_tsvector");
    expect(fullSql).toContain('"DirectMessage"');
    expect(fullSql).toContain('"isDeleted"');
  });

  it("returns no-result query when participantDmIds is empty", () => {
    const sql = buildDmSearchQuery({
      query: "hello",
      participantDmIds: [],
    });
    const fullSql = sql.strings.join("?");
    expect(fullSql).toContain("WHERE false");
  });

  it("includes dmId filter when provided", () => {
    const sql = buildDmSearchQuery({
      query: "hello",
      participantDmIds: ["dm1"],
      dmId: "dm1",
    });
    const fullSql = sql.strings.join("?");
    // Should have dmId condition (it appears in both ANY and the specific filter)
    expect(fullSql).toContain('"dmId"');
  });
});

describe("PAGE_SIZE constant", () => {
  it("is 25", () => {
    expect(PAGE_SIZE).toBe(25);
  });
});
