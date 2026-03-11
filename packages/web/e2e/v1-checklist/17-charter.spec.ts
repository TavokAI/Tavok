import { test, expect } from "@playwright/test";
import {
  login,
  DEMO_USER,
  selectServer,
  openChannel,
  createServerViaAPI,
} from "./helpers";
import { ensureMockAgent, MOCK_AGENT_NAME } from "./streaming-fixture";

test.describe("Section 17: Channel Charter & Swarm Modes", () => {
  let serverName: string;
  let serverId: string;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, DEMO_USER.email, DEMO_USER.password);
    serverName = `Test-S17-${Date.now()}`;
    const result = await createServerViaAPI(page, serverName);
    serverId = result.serverId;
    await ensureMockAgent(page, serverId);

    // Create second agent for swarm mode (doesn't need working LLM)
    await page.evaluate(async (args: { serverId: string }) => {
      await fetch(`/api/servers/${args.serverId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dummy Agent",
          llmProvider: "custom",
          llmModel: "dummy",
          apiEndpoint: "http://localhost:1",
          apiKey: "dummy-key",
          systemPrompt: "Dummy agent for swarm mode testing",
          temperature: 0,
          maxTokens: 256,
          triggerMode: "MENTION",
        }),
      });
    }, { serverId });

    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);
  });

  test("open channel settings — swarm mode visible", async ({ page }) => {
    await openChannel(page, "general");

    // Open channel settings via the "Channel Settings" button in the top bar
    const settingsBtn = page.locator('button[title="Channel Settings"]');
    await expect(settingsBtn).toBeVisible({ timeout: 5_000 });
    await settingsBtn.click();

    // The modal should show "Swarm Mode" label (#general has 2+ agents)
    await expect(page.getByText("Swarm Mode")).toBeVisible({ timeout: 5_000 });
  });

  test("set swarm mode — mode is saved", async ({ page }) => {
    await openChannel(page, "general");

    // Open channel settings
    await page.locator('button[title="Channel Settings"]').click();
    await page.waitForTimeout(1_000);

    // The swarm mode select should be visible (2+ agents on #general)
    const swarmSelect = page.locator("select").first();
    await expect(swarmSelect).toBeVisible({ timeout: 5_000 });

    // Find and select "Round Robin"
    const options = swarmSelect.locator("option");
    const count = await options.count();
    let roundRobinValue = "";
    for (let i = 0; i < count; i++) {
      const text = (await options.nth(i).textContent()) || "";
      if (/round.robin/i.test(text)) {
        roundRobinValue = (await options.nth(i).getAttribute("value")) || text;
        break;
      }
    }

    expect(roundRobinValue).toBeTruthy();
    await swarmSelect.selectOption(roundRobinValue);

    // Save
    const saveButton = page
      .getByRole("button", { name: /save|update|apply/i })
      .last();
    await expect(saveButton).toBeVisible({ timeout: 3_000 });
    await saveButton.click();
    await page.waitForTimeout(2_000);

    // Reopen settings and verify the value persisted
    await page.locator('button[title="Channel Settings"]').click();
    await page.waitForTimeout(1_000);

    const reopenedSelect = page.locator("select").first();
    await expect(reopenedSelect).toBeVisible({ timeout: 5_000 });
    const selectedValue = await reopenedSelect.inputValue();
    expect(selectedValue).toBe("ROUND_ROBIN");
  });
});
