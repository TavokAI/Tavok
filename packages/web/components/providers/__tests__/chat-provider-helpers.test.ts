import { describe, it, expect, vi, beforeEach } from "vitest";
import { mergeServerData, fetchAndSet } from "../chat-provider";

// ─── mergeServerData ────────────────────────────────────────────────

describe("mergeServerData", () => {
  const EMPTY = { channels: [], members: [], agents: [] };

  it("creates a new entry when server ID is absent", () => {
    const result = mergeServerData({}, "s1", {
      channels: [{ id: "c1" }] as never[],
    });
    expect(result.s1).toEqual({ ...EMPTY, channels: [{ id: "c1" }] });
  });

  it("merges into an existing entry without clobbering other keys", () => {
    const prev = {
      s1: {
        channels: [{ id: "c1" }] as never[],
        members: [{ id: "m1" }] as never[],
        agents: [],
      },
    };
    const result = mergeServerData(prev, "s1", {
      agents: [{ id: "a1" }] as never[],
    });
    expect(result.s1.channels).toEqual([{ id: "c1" }]);
    expect(result.s1.members).toEqual([{ id: "m1" }]);
    expect(result.s1.agents).toEqual([{ id: "a1" }]);
  });

  it("does not mutate the previous object", () => {
    const prev = { s1: { ...EMPTY } };
    const result = mergeServerData(prev, "s1", {
      channels: [{ id: "c2" }] as never[],
    });
    expect(prev.s1.channels).toEqual([]);
    expect(result.s1.channels).toEqual([{ id: "c2" }]);
  });

  it("leaves other server entries unchanged", () => {
    const prev = {
      s1: { ...EMPTY, channels: [{ id: "c1" }] as never[] },
      s2: { ...EMPTY, members: [{ id: "m2" }] as never[] },
    };
    const result = mergeServerData(prev, "s1", { agents: [] });
    expect(result.s2).toBe(prev.s2);
  });

  it("fills missing keys from EMPTY_SERVER_DATA defaults", () => {
    const result = mergeServerData({}, "s1", {});
    expect(result.s1).toEqual(EMPTY);
  });
});

// ─── fetchAndSet ────────────────────────────────────────────────────

describe("fetchAndSet", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches, parses JSON, and calls onSuccess with the extracted array", async () => {
    const items = [{ id: "1" }, { id: "2" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ things: items }),
      }),
    );
    const onSuccess = vi.fn();

    const result = await fetchAndSet("/api/test", "things", onSuccess);

    expect(fetch).toHaveBeenCalledWith("/api/test");
    expect(onSuccess).toHaveBeenCalledWith(items);
    expect(result).toEqual({ things: items });
  });

  it("returns null and does not call onSuccess on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const onSuccess = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchAndSet("/api/fail", "data", onSuccess);

    expect(result).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ChatProvider] Failed to fetch data"),
    );
  });

  it("returns null on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure")),
    );
    const onSuccess = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchAndSet("/api/boom", "items", onSuccess);

    expect(result).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("passes empty array when key is missing from response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ other: "value" }),
      }),
    );
    const onSuccess = vi.fn();

    await fetchAndSet("/api/test", "missing", onSuccess);

    expect(onSuccess).toHaveBeenCalledWith([]);
  });

  it("returns the full response data for additional field extraction", async () => {
    const responseData = { items: [{ id: "1" }], name: "Test", count: 5 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      }),
    );

    const result = await fetchAndSet("/api/test", "items", vi.fn());

    expect(result).toEqual(responseData);
    expect((result as Record<string, unknown>).name).toBe("Test");
    expect((result as Record<string, unknown>).count).toBe(5);
  });
});
