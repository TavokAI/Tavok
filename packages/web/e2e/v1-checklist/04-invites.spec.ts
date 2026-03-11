import { test, expect } from "@playwright/test";
import {
  login,
  registerUser,
  DEMO_USER,
  selectServer,
  openChannel,
  waitForWebSocket,
  sendMessage,
  uniqueMsg,
  createServerViaAPI,
  createInviteViaAPI,
} from "./helpers";

test.describe("Section 4: Invite Links", () => {
  const ts = Date.now();
  let serverName: string;
  let inviteCode: string;

  test.beforeAll(async ({ browser }) => {
    serverName = `Test-S04-${Date.now()}`;

    // Owner creates server + invite
    const ctxOwner = await browser.newContext();
    const pgOwner = await ctxOwner.newPage();
    await login(pgOwner, DEMO_USER.email, DEMO_USER.password);
    const result = await createServerViaAPI(pgOwner, serverName);
    inviteCode = await createInviteViaAPI(pgOwner, result.serverId);
    await ctxOwner.close();
  });

  test("full invite flow: register, accept invite, interact", async ({
    browser,
  }) => {
    // Register a brand new user
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      const userB = {
        email: `invite_${ts}@test.local`,
        username: `inv_${ts}`,
        displayName: `Invited User ${ts}`,
        password: "TestPass123!",
      };

      await registerUser(pageB, userB);

      // Wait for dashboard
      await expect(pageB.getByRole("tab", { name: "SERVERS" })).toBeVisible({
        timeout: 15_000,
      });

      // Navigate to invite URL using the dynamically created invite code
      await pageB.goto(`/invite/${inviteCode}`);
      await pageB.waitForTimeout(2_000);

      // Look for "Join" button or auto-accept
      const joinButton = pageB.getByRole("button", { name: /join/i });
      if (await joinButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await joinButton.click();
        await pageB.waitForTimeout(2_000);
      }

      // User B should now be in the server
      await pageB.getByRole("tab", { name: "SERVERS" }).click();
      await expect(pageB.getByText(serverName).first()).toBeVisible({
        timeout: 10_000,
      });

      // User B can see channels
      await selectServer(pageB, serverName);
      await pageB.getByRole("tab", { name: "CHANNELS" }).click();
      await expect(
        pageB.locator("button").filter({ hasText: "general" }),
      ).toBeVisible({ timeout: 5_000 });

      // User B can send a message
      await openChannel(pageB, "general");
      await waitForWebSocket(pageB, "general");
      const msg = uniqueMsg("Invite test");
      await sendMessage(pageB, "general", msg);
    } finally {
      await contextB.close();
    }
  });
});
