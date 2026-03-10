import { test, expect } from "@playwright/test";
import {
  login,
  ALICE,
  selectServer,
  openChannel,
  waitForWebSocket,
  sendMessage,
  uniqueMsg,
} from "./helpers";

test.describe("Section 14: Reconnection & Resilience", () => {
  test("refresh page mid-conversation — reconnects and loads history", async ({
    page,
  }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    // Send a message before refresh
    const msg = uniqueMsg("Pre-refresh");
    await sendMessage(page, "general", msg);

    // Refresh the page
    await page.reload({ waitUntil: "domcontentloaded" });

    // Re-navigate to the same channel
    await selectServer(page);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    // Previous message should be loaded from history
    await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 });
  });

  test("send message after page refresh — message appears", async ({
    page,
  }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    // Refresh
    await page.reload({ waitUntil: "domcontentloaded" });
    await selectServer(page);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    // Send new message after reconnection
    const msg = uniqueMsg("Post-refresh");
    await sendMessage(page, "general", msg);

    // Message should appear
    await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 });
  });

  // Container-level resilience is tested by the regression harness (K-series tests)
});
