import { describe, it, expect } from "vitest";
import { canMutateServerScopedResource } from "../api-safety";

describe("rejects_cross_server_channel_patch", () => {
  it("rejects cross-server channel patch", () => {
    expect(canMutateServerScopedResource("server-A", "server-B")).toBe(false);
  });
});
