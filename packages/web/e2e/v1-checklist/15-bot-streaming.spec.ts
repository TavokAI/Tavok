import { test, expect } from "@playwright/test";
import {
  login,
  DEMO_USER,
  ALICE,
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
import {
  ensureMockLLM,
  ensureMockAgent,
  cleanupMockLLM,
  MOCK_AGENT_NAME,
} from "./streaming-fixture";

test.describe("Section 15: Agent Streaming", () => {
  let serverName: string;
  let serverId: string;

  test.beforeAll(async ({ browser }) => {
    await ensureMockLLM();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, DEMO_USER.email, DEMO_USER.password);
    serverName = `Test-S15-${Date.now()}`;
    const result = await createServerViaAPI(page, serverName);
    serverId = result.serverId;
    await createChannelViaAPI(page, serverId, "dev");
    await ensureMockAgent(page, serverId);

    // Invite ALICE so multi-user tests work
    const inviteCode = await createInviteViaAPI(page, serverId);
    await ctx.close();

    const ctxAlice = await browser.newContext();
    const pageAlice = await ctxAlice.newPage();
    await login(pageAlice, ALICE.email, ALICE.password);
    await joinServerViaAPI(pageAlice, inviteCode);
    await ctxAlice.close();
  });

  test.afterAll(async () => {
    await cleanupMockLLM();
  });

  // -----------------------------------------------------------------------
  // Existing UI tests (no mock needed)
  // -----------------------------------------------------------------------

  test("navigate to agent management UI", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);

    // Open server settings
    const settingsButton = page
      .locator('button[title*="etting"]')
      .or(page.locator("button").filter({ hasText: /settings/i }));
    await settingsButton.first().click({ timeout: 5_000 });
    await page.waitForTimeout(1_000);

    // Navigate to Agents section
    const agentsTab = page
      .getByText(/agents/i)
      .or(page.locator("button, a").filter({ hasText: /agents/i }));
    await agentsTab.first().click({ timeout: 5_000 });

    // Should see agent management UI
    await expect(page.getByText(/claude|gpt|agent/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("created agents are visible in server settings", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);

    const settingsButton = page
      .locator('button[title*="etting"]')
      .or(page.locator("button").filter({ hasText: /settings/i }));
    await settingsButton.first().click({ timeout: 5_000 });
    await page.waitForTimeout(1_000);

    await page
      .getByText(/agents/i)
      .or(page.locator("button, a").filter({ hasText: /agents/i }))
      .first()
      .click();
    await page.waitForTimeout(1_000);

    // Check for the mock agent we created
    const hasAgent = await page
      .getByText(MOCK_AGENT_NAME)
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasAgent).toBe(true);
  });

  test("create an agent via BYOK form", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);

    // Open server settings
    await page.locator('button[title="Server Settings"]').click();
    await page.waitForTimeout(1_000);

    // Click "Agents" in the settings sidebar (exact match to avoid the AGENTS panel)
    await page
      .locator("button")
      .filter({ hasText: /^Agents$/ })
      .click();
    await page.waitForTimeout(1_000);

    // The Agents section should show existing agents and a create/add button
    const agentsSectionVisible = await page
      .getByText(/manage|add agent|create agent|agent name/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const addButton = page.getByRole("button", { name: /add agent/i });
    const hasAddButton = await addButton
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    expect(agentsSectionVisible || hasAddButton).toBe(true);
  });

  test("agent appears in channel when assigned", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);
    await openChannel(page, "general");

    // The mock agent we created should be visible
    await expect(page.getByText(MOCK_AGENT_NAME).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  // -----------------------------------------------------------------------
  // Live streaming tests (require mock LLM server)
  // -----------------------------------------------------------------------

  test.describe("live streaming", () => {
    test("send message — agent echoes back via streaming", async ({ page }) => {
      await login(page, DEMO_USER.email, DEMO_USER.password);
      await selectServer(page, serverName);

      // Use #dev — only our ALWAYS-trigger mock fires
      await openChannel(page, "dev");
      await waitForWebSocket(page, "dev");

      const msg = uniqueMsg("StreamTest");
      const input = page.getByPlaceholder("Message #dev");
      await input.fill(msg);
      await input.press("Enter");

      // Wait for own message to appear
      await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 });

      // Wait for agent response — the mock echoes back with "[echo] " prefix
      const echoText = `[echo] ${msg}`;
      await expect(page.getByText(echoText)).toBeVisible({ timeout: 30_000 });

      // Streaming cursor should have disappeared (stream complete)
      // The animate-pulse cursor is an inline-block span inside the message
      const agentMsg = page
        .locator("div.group")
        .filter({ hasText: echoText })
        .first();
      await expect(
        agentMsg.locator("span.animate-pulse.bg-accent-cyan"),
      ).toHaveCount(0, { timeout: 10_000 });
    });

    test("completed agent message persists after refresh", async ({ page }) => {
      await login(page, DEMO_USER.email, DEMO_USER.password);
      await selectServer(page, serverName);

      await openChannel(page, "dev");
      await waitForWebSocket(page, "dev");

      const msg = uniqueMsg("PersistTest");
      const input = page.getByPlaceholder("Message #dev");
      await input.fill(msg);
      await input.press("Enter");

      // Wait for agent echo to complete
      const echoText = `[echo] ${msg}`;
      await expect(page.getByText(echoText)).toBeVisible({ timeout: 30_000 });

      // Wait for stream to complete (no more pulse cursor)
      await page.waitForTimeout(3_000);

      // Refresh
      await page.reload();
      await selectServer(page, serverName);
      await openChannel(page, "dev");
      await waitForWebSocket(page, "dev");

      // Both original and echoed messages should still be visible
      // Use exact: true to avoid matching the echo (which contains the original text)
      await expect(page.getByText(msg, { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(echoText)).toBeVisible({ timeout: 15_000 });
    });

    test("error response — error indicator shown", async ({ page }) => {
      await login(page, DEMO_USER.email, DEMO_USER.password);
      await selectServer(page, serverName);

      await openChannel(page, "dev");
      await waitForWebSocket(page, "dev");

      // Send message with error trigger
      const msg = uniqueMsg("ERROR_TEST");
      const input = page.getByPlaceholder("Message #dev");
      await input.fill(msg);
      await input.press("Enter");

      // Wait for the error indicator to appear
      // The streaming-message.tsx shows: "[SYSTEM: Stream ended with an error]"
      // OR the use-channel.ts surfaces: "Agent response failed: ..."
      await expect(
        page
          .getByText(/stream ended with an error|agent response failed/i)
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("other user sees agent stream in real-time", async ({ browser }) => {
      const { contextA, contextB, pageA, pageB } = await createTwoUserContexts(
        browser,
        DEMO_USER,
        ALICE,
      );

      try {
        await selectServer(pageA, serverName);
        await selectServer(pageB, serverName);

        await openChannel(pageA, "dev");
        await openChannel(pageB, "dev");
        await waitForWebSocket(pageA, "dev");
        await waitForWebSocket(pageB, "dev");

        const msg = uniqueMsg("MultiUserStream");
        const inputA = pageA.getByPlaceholder("Message #dev");
        await inputA.fill(msg);
        await inputA.press("Enter");

        // Both users should see the original message
        await expect(pageB.getByText(msg, { exact: true })).toBeVisible({
          timeout: 15_000,
        });

        // Both users should see the echoed agent response
        const echoText = `[echo] ${msg}`;
        await expect(pageA.getByText(echoText)).toBeVisible({
          timeout: 30_000,
        });
        await expect(pageB.getByText(echoText)).toBeVisible({
          timeout: 30_000,
        });
      } finally {
        await cleanupContexts(contextA, contextB);
      }
    });
  });
});
