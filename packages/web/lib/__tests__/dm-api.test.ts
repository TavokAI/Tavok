import { describe, expect, it } from "vitest";
import {
  getCreatedDmIdFromResponse,
  getDmListFromResponse,
} from "@/lib/dm-api";

describe("DM API response helpers", () => {
  it("reads DM list entries from the dms field", () => {
    expect(
      getDmListFromResponse({
        dms: [{ id: "dm-1" }, { id: "dm-2" }],
      }),
    ).toEqual([{ id: "dm-1" }, { id: "dm-2" }]);
  });

  it("does not treat legacy conversations as the DM list response", () => {
    expect(
      getDmListFromResponse({
        conversations: [{ id: "dm-legacy" }],
      }),
    ).toEqual([]);
  });

  it("reads the created DM id from the nested dm payload", () => {
    expect(
      getCreatedDmIdFromResponse({
        dm: { id: "dm-123" },
      }),
    ).toBe("dm-123");
  });

  it("does not read a top-level id from DM creation responses", () => {
    expect(
      getCreatedDmIdFromResponse({
        id: "dm-top-level",
      }),
    ).toBeNull();
  });
});
