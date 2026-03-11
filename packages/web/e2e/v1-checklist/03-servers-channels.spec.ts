import { test, expect } from "@playwright/test";
import {
  login,
  DEMO_USER,
  selectServer,
  openChannel,
  createServerViaUI,
  createChannelViaUI,
  createServerViaAPI,
  createChannelViaAPI,
} from "./helpers";

test.describe("Section 3: Servers & Channels", () => {
  const ts = Date.now();
  let serverName: string;
  let serverId: string;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, DEMO_USER.email, DEMO_USER.password);
    serverName = `Test-S03-${Date.now()}`;
    const result = await createServerViaAPI(page, serverName);
    serverId = result.serverId;
    // Create a "research" channel for channel-switching tests
    await createChannelViaAPI(page, serverId, "research");
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
  });

  test("create a new server with name", async ({ page }) => {
    const newServerName = `Test Server ${ts}`;
    await createServerViaUI(page, newServerName);

    // Server should appear in sidebar
    await page.getByRole("tab", { name: "SERVERS" }).click();
    await expect(page.getByText(newServerName).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("server appears in left sidebar", async ({ page }) => {
    await page.getByRole("tab", { name: "SERVERS" }).click();
    // The API-provisioned server should be visible
    await expect(page.getByText(serverName).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("default channel exists after server creation", async ({ page }) => {
    // Navigate to provisioned server
    await selectServer(page, serverName);
    await page.getByRole("tab", { name: "CHANNELS" }).click();

    // #general channel should exist (created by server creation)
    await expect(
      page.locator("button").filter({ hasText: "general" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("create a second channel", async ({ page }) => {
    await selectServer(page, serverName);
    const channelName = `test-ch-${ts}`;
    await createChannelViaUI(page, channelName);

    // New channel should be visible in sidebar
    await page.getByRole("tab", { name: "CHANNELS" }).click();
    await expect(
      page.locator("button").filter({ hasText: channelName }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("switch between channels — content updates", async ({ page }) => {
    await selectServer(page, serverName);

    // Open #general
    await openChannel(page, "general");
    await expect(page.getByPlaceholder("Message #general")).toBeVisible();

    // Open #research
    await openChannel(page, "research");
    await expect(page.getByPlaceholder("Message #research")).toBeVisible();
  });

  test("create second server — both in sidebar", async ({ page }) => {
    const server2 = `Second Server ${ts}`;
    await createServerViaUI(page, server2);

    await page.getByRole("tab", { name: "SERVERS" }).click();
    // Both servers should be visible
    await expect(page.getByText(serverName).first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(server2).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("switch between servers — channels update", async ({ page }) => {
    await page.getByRole("tab", { name: "SERVERS" }).click();

    // Select the provisioned server
    await page.getByText(serverName).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("tab", { name: "CHANNELS" }).click();

    // Should show the provisioned channels
    await expect(
      page.locator("button").filter({ hasText: "general" }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator("button").filter({ hasText: "research" }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
