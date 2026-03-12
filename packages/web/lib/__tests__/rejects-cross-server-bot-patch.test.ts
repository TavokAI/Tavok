import { describe, it, expect } from "vitest";
import { canMutateServerScopedResource } from "../api-safety";

describe("rejects_cross_server_bot_patch", () => {
  it("rejects cross-server bot patch", () => {
    expect(canMutateServerScopedResource("server-A", "server-B")).toBe(false);
  });
});
