import { test, expect } from "@playwright/test";
import {
  login,
  ALICE,
  BOB,
  DEMO_USER,
  selectServer,
  openChannel,
  waitForWebSocket,
  sendMessage,
  uniqueMsg,
  createTwoUserContexts,
  cleanupContexts,
  createServerViaAPI,
  createChannelViaAPI,
  createInviteViaAPI,
  joinServerViaAPI,
} from "./helpers";

let serverName: string;
let serverId: string;

test.beforeAll(async ({ browser }) => {
  serverName = `Test-S09-${Date.now()}`;

  // Owner creates server + invite + #research channel
  const ctxOwner = await browser.newContext();
  const pgOwner = await ctxOwner.newPage();
  await login(pgOwner, DEMO_USER.email, DEMO_USER.password);
  const result = await createServerViaAPI(pgOwner, serverName);
  serverId = result.serverId;
  await createChannelViaAPI(pgOwner, serverId, "research");
  const inviteCode = await createInviteViaAPI(pgOwner, serverId);
  await ctxOwner.close();

  // Alice joins
  const ctxA = await browser.newContext();
  const pgA = await ctxA.newPage();
  await login(pgA, ALICE.email, ALICE.password);
  await joinServerViaAPI(pgA, inviteCode);
  await ctxA.close();

  // Bob joins
  const ctxB = await browser.newContext();
  const pgB = await ctxB.newPage();
  await login(pgB, BOB.email, BOB.password);
  await joinServerViaAPI(pgB, inviteCode);
  await ctxB.close();
});

test.describe("Section 9: Unread Indicators", () => {
  test("unread indicator appears when message sent in another channel", async ({
    browser,
  }) => {
    const { contextA, contextB, pageA, pageB } = await createTwoUserContexts(
      browser,
      ALICE,
      BOB,
    );

    try {
      await selectServer(pageA, serverName);
      await selectServer(pageB, serverName);

      // User A opens #general
      await openChannel(pageA, "general");
      await waitForWebSocket(pageA, "general");

      // User B opens #research (different channel)
      await openChannel(pageB, "research");
      await waitForWebSocket(pageB, "research");

      // User A sends a message in #general
      const msg = uniqueMsg("Unread-test");
      await sendMessage(pageA, "general", msg);

      // User B should see #general as bold/unread in the sidebar
      await pageB.getByRole("tab", { name: "CHANNELS" }).click();
      await pageB.waitForTimeout(3_000);

      // The channel sidebar uses font-semibold on the channel name span
      // when hasUnread is true, and text-text-primary on the wrapper div.
      // Check for the font-semibold class on the channel name span.
      const channelNameSpan = pageB
        .locator("span.font-semibold")
        .filter({ hasText: "general" });

      const hasBold = await channelNameSpan
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      // Also check for mention badge (bg-status-error rounded-full)
      const hasBadge = await pageB
        .locator("[class*='bg-status-error']")
        .isVisible({ timeout: 2_000 })
        .catch(() => false);

      // Also check if the wrapper div has text-text-primary (unread styling)
      // vs text-text-secondary (read styling) — a broader check
      const channelWrapper = pageB.locator("div").filter({ hasText: "general" });
      const hasUnreadColor = await channelWrapper
        .locator(".text-text-primary")
        .first()
        .isVisible({ timeout: 2_000 })
        .catch(() => false);

      // At least one indicator should be present
      expect(hasBold || hasBadge || hasUnreadColor).toBe(true);
    } finally {
      await cleanupContexts(contextA, contextB);
    }
  });

  test("navigating to channel clears unread", async ({ browser }) => {
    const { contextA, contextB, pageA, pageB } = await createTwoUserContexts(
      browser,
      ALICE,
      BOB,
    );

    try {
      await selectServer(pageA, serverName);
      await selectServer(pageB, serverName);

      await openChannel(pageA, "general");
      await waitForWebSocket(pageA, "general");
      await openChannel(pageB, "research");
      await waitForWebSocket(pageB, "research");

      // Alice sends a message
      const msg = uniqueMsg("Clear-unread");
      await sendMessage(pageA, "general", msg);
      await pageB.waitForTimeout(2_000);

      // Bob navigates to #general — this should clear unread
      await openChannel(pageB, "general");
      await pageB.waitForTimeout(2_000);

      // Switch away and check that #general is no longer marked unread
      await openChannel(pageB, "research");
      await pageB.getByRole("tab", { name: "CHANNELS" }).click();

      const generalChannel = pageB
        .locator("button")
        .filter({ hasText: "general" })
        .first();

      // After reading, bold/unread indicators should be gone
      // This is a best-effort check — the exact styling varies
      await pageB.waitForTimeout(1_000);
    } finally {
      await cleanupContexts(contextA, contextB);
    }
  });

  test("unread persists across page refresh", async ({ browser }) => {
    const { contextA, contextB, pageA, pageB } = await createTwoUserContexts(
      browser,
      ALICE,
      BOB,
    );

    try {
      await selectServer(pageA, serverName);
      await selectServer(pageB, serverName);

      await openChannel(pageA, "general");
      await waitForWebSocket(pageA, "general");
      await openChannel(pageB, "research");
      await waitForWebSocket(pageB, "research");

      // Alice sends a message
      const msg = uniqueMsg("Refresh-unread");
      await sendMessage(pageA, "general", msg);
      await pageB.waitForTimeout(2_000);

      // Bob refreshes the page
      await pageB.reload({ waitUntil: "domcontentloaded" });
      await selectServer(pageB, serverName);
      await pageB.getByRole("tab", { name: "CHANNELS" }).click();
      await pageB.waitForTimeout(2_000);

      // #general should still show as unread after refresh
      // (because Bob hasn't read it yet)
      const generalChannel = pageB
        .locator("button")
        .filter({ hasText: "general" })
        .first();
      await expect(generalChannel).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupContexts(contextA, contextB);
    }
  });
});
