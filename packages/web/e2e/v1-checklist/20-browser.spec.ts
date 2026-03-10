import { test, expect } from "@playwright/test";
import {
  login,
  DEMO_USER,
  selectServer,
  openChannel,
  waitForWebSocket,
  sendMessage,
  uniqueMsg,
} from "./helpers";

test.describe("Section 20: Browser Compatibility (Chromium)", () => {
  test("no critical console errors on page load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Filter out expected/benign errors
        const isIgnored =
          text.includes("favicon") ||
          text.includes("manifest") ||
          text.includes("Failed to load resource: net::ERR_") ||
          text.includes("hydration") ||
          text.includes("Warning:") ||
          text.includes("DevTools");
        if (!isIgnored) {
          consoleErrors.push(text);
        }
      }
    });

    await login(page, DEMO_USER.email, DEMO_USER.password);
    await page.waitForTimeout(3_000);

    // Allow some tolerance but flag critical errors
    for (const err of consoleErrors) {
      // These would indicate a real problem
      expect(err).not.toContain("Uncaught");
      expect(err).not.toContain("TypeError");
      expect(err).not.toContain("ReferenceError");
    }
  });

  test("no critical console errors during chat flow", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        const isIgnored =
          text.includes("favicon") ||
          text.includes("manifest") ||
          text.includes("net::ERR_") ||
          text.includes("hydration") ||
          text.includes("Warning:") ||
          text.includes("DevTools");
        if (!isIgnored) {
          consoleErrors.push(text);
        }
      }
    });

    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    // Perform a chat flow
    const msg = uniqueMsg("Console-test");
    await sendMessage(page, "general", msg);

    // Switch channels
    await openChannel(page, "research");
    await page.waitForTimeout(1_000);

    // Switch back
    await openChannel(page, "general");
    await page.waitForTimeout(1_000);

    // Check for critical errors
    const criticalErrors = consoleErrors.filter(
      (e) =>
        e.includes("Uncaught") ||
        e.includes("TypeError") ||
        e.includes("ReferenceError") ||
        e.includes("FATAL"),
    );

    expect(
      criticalErrors,
      `Found ${criticalErrors.length} critical console errors: ${criticalErrors.join("; ")}`,
    ).toHaveLength(0);
  });
});
