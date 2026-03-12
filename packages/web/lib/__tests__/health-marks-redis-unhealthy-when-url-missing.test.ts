import { describe, it, expect } from "vitest";
import { getRedisHealthStatus } from "../api-safety";

describe("health_marks_redis_unhealthy", () => {
  it("marks redis unhealthy when url is missing", async () => {
    let probeCalled = false;

    const status = await getRedisHealthStatus(undefined, async () => {
      probeCalled = true;
      return true;
    });

    expect(status).toBe("unhealthy");
    expect(probeCalled).toBe(false);
  });

  it("marks redis unhealthy when probe throws", async () => {
    const status = await getRedisHealthStatus(
      "redis://localhost:6379",
      async () => {
        throw new Error("probe failed");
      },
    );

    expect(status).toBe("unhealthy");
  });
});
