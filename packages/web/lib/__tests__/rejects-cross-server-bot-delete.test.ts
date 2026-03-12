import { describe, it, expect } from "vitest";
import { canMutateServerScopedResource } from "../api-safety";

describe("rejects_cross_server_bot_delete", () => {
  it("rejects cross-server bot delete", () => {
    expect(canMutateServerScopedResource("server-A", "server-B")).toBe(false);
  });
});
