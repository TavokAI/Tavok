import { test, expect } from "@playwright/test";
import {
  login,
  DEMO_USER,
  selectServer,
  openChannel,
  waitForWebSocket,
  uniqueMsg,
  createServerViaAPI,
  createChannelViaAPI,
} from "./helpers";
import {
  ensureMockLLM,
  ensureMockAgent,
  cleanupMockLLM,
} from "./streaming-fixture";

test.describe("Section 16: Tool Execution (MCP Interface)", () => {
  let serverName: string;
  let serverId: string;

  test.beforeAll(async ({ browser }) => {
    await ensureMockLLM();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, DEMO_USER.email, DEMO_USER.password);
    serverName = `Test-S16-${Date.now()}`;
    const result = await createServerViaAPI(page, serverName);
    serverId = result.serverId;
    await createChannelViaAPI(page, serverId, "dev");
    await ensureMockAgent(page, serverId);
    await ctx.close();
  });

  test.afterAll(async () => {
    await cleanupMockLLM();
  });

  test("agent calls tool — final response proves tool was executed", async ({
    page,
  }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);

    await openChannel(page, "dev");
    await waitForWebSocket(page, "dev");

    // Send TOOL_TEST trigger — mock LLM returns tool_calls for current_time,
    // Go proxy executes current_time, calls LLM again with result,
    // mock LLM returns "[tool-done] The current_time tool returned successfully."
    const msg = uniqueMsg("TOOL_TEST");
    const input = page.getByPlaceholder("Message #dev");
    await input.fill(msg);
    await input.press("Enter");

    // Wait for own message
    await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 });

    // Wait for agent's final response after tool execution
    // This proves: LLM requested tool -> proxy executed -> LLM got result -> responded
    await expect(page.getByText("[tool-done]").first()).toBeVisible({
      timeout: 30_000,
    });

    // Streaming cursor should have disappeared (stream complete)
    const agentMsg = page
      .locator("div.group")
      .filter({ hasText: "[tool-done]" })
      .first();
    await expect(
      agentMsg.locator("span.animate-pulse.bg-accent-cyan"),
    ).toHaveCount(0, { timeout: 10_000 });
  });

  test("tool result message persists after page refresh", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);

    await openChannel(page, "dev");
    await waitForWebSocket(page, "dev");

    const msg = uniqueMsg("TOOL_TEST");
    const input = page.getByPlaceholder("Message #dev");
    await input.fill(msg);
    await input.press("Enter");

    // Wait for full tool cycle to complete
    const finalText = "current_time tool returned successfully";
    await expect(page.getByText(finalText).first()).toBeVisible({
      timeout: 30_000,
    });

    // Wait for stream completion
    await page.waitForTimeout(2_000);

    // Refresh and verify persistence
    await page.reload();
    await selectServer(page, serverName);
    await openChannel(page, "dev");
    await waitForWebSocket(page, "dev");

    // Both original and tool-result messages should persist
    await expect(page.getByText(msg)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(finalText).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
