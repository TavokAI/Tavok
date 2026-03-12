import { describe, it, expect } from "vitest";
import { formatTime } from "../format-time";

describe("formatTime", () => {
  it("returns 'Today at ...' for today's date", () => {
    const now = new Date();
    const result = formatTime(now.toISOString());
    expect(result).toMatch(/^Today at /);
  });

  it("returns formatted date for past dates", () => {
    const result = formatTime("2023-06-15T14:30:00Z");
    expect(result).toContain("2023");
    expect(result).toBeTruthy();
  });

  it("handles invalid date strings gracefully", () => {
    // new Date("not-a-date") produces "Invalid Date" — the function doesn't crash
    const result = formatTime("not-a-date");
    expect(typeof result).toBe("string");
  });

  it("handles ISO date strings", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2);
    const result = formatTime(yesterday.toISOString());
    expect(result).not.toMatch(/^Today/);
    expect(result).toBeTruthy();
  });
});
