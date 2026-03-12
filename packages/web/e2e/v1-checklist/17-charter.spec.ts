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
    await page.evaluate(
      async (args: { serverId: string }) => {
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
      },
      { serverId },
    );

    // Assign both agents to the default channel
    await page.evaluate(
      async (args: { serverId: string }) => {
        try {
          // Get all agents
          const agentRes = await fetch(`/api/servers/${args.serverId}/agents`);
          if (!agentRes.ok) return;
          const agentData = await agentRes.json();
          const agentList = agentData?.agents ?? agentData;
          if (!Array.isArray(agentList) || agentList.length < 2) return;
          const agentIds = agentList.map((a: { id: string }) => a.id);

          // Get default channel
          const channelRes = await fetch(
            `/api/servers/${args.serverId}/channels`,
          );
          if (!channelRes.ok) return;
          const channels = await channelRes.json();
          if (!Array.isArray(channels) || channels.length === 0) return;

          // Assign agents to channel
          await fetch(
            `/api/servers/${args.serverId}/channels/${channels[0].id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentIds }),
            },
          );
        } catch {
          // Best-effort assignment — tests will handle missing assignment
        }
      },
      { serverId },
    );

    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);
  });

  // -----------------------------------------------------------------------
  // Settings Modal Tests
  // -----------------------------------------------------------------------

  test("open channel settings — swarm mode visible", async ({ page }) => {
    await openChannel(page, "general");

    // Open channel settings via the "Channel Settings" button in the top bar
    const settingsBtn = page.locator('button[title="Channel Settings"]');
    await expect(settingsBtn).toBeVisible({ timeout: 5_000 });
    await settingsBtn.click();
    await page.waitForTimeout(1_000);

    // Ensure both agents are checked (select all checkboxes)
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check();
      }
    }
    await page.waitForTimeout(500);

    // The modal should show "Swarm Mode" label (2+ agents selected)
    await expect(page.getByText("Swarm Mode")).toBeVisible({ timeout: 5_000 });
  });

  test("set swarm mode — mode is saved", async ({ page }) => {
    await openChannel(page, "general");

    // Open channel settings
    await page.locator('button[title="Channel Settings"]').click();
    await page.waitForTimeout(1_000);

    // Ensure both agents are checked
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check();
      }
    }
    await page.waitForTimeout(500);

    // The swarm mode select should be visible (2+ agents selected)
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

  test("charter config persistence — goal, rules, max turns", async ({
    page,
  }) => {
    await openChannel(page, "general");

    // Open channel settings
    await page.locator('button[title="Channel Settings"]').click();
    await page.waitForTimeout(1_000);

    // Ensure both agents are checked
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check();
      }
    }
    await page.waitForTimeout(500);

    // Ensure swarm mode is set (so charter fields are visible)
    const swarmSelect = page.locator("select").first();
    await expect(swarmSelect).toBeVisible({ timeout: 5_000 });
    await swarmSelect.selectOption("STRUCTURED_DEBATE");
    await page.waitForTimeout(500);

    // Fill in goal
    const goalInput = page.locator('[data-testid="charter-goal-input"]');
    await expect(goalInput).toBeVisible({ timeout: 3_000 });
    await goalInput.fill("Review the authentication module");

    // Fill in rules
    const rulesInput = page.locator('[data-testid="charter-rules-input"]');
    await rulesInput.fill("Each agent focuses on one concern");

    // Fill in max turns
    const maxTurnsInput = page.locator(
      '[data-testid="charter-max-turns-input"]',
    );
    await maxTurnsInput.fill("6");

    // Save
    await page
      .getByRole("button", { name: /save|update|apply/i })
      .last()
      .click();
    await page.waitForTimeout(2_000);

    // Reopen and verify persistence
    await page.locator('button[title="Channel Settings"]').click();
    await page.waitForTimeout(1_000);

    await expect(goalInput).toHaveValue("Review the authentication module");
    await expect(rulesInput).toHaveValue("Each agent focuses on one concern");
    await expect(maxTurnsInput).toHaveValue("6");
  });

  test("agent order for Round Robin — order controls visible", async ({
    page,
  }) => {
    await openChannel(page, "general");

    // Open channel settings
    await page.locator('button[title="Channel Settings"]').click();
    await page.waitForTimeout(1_000);

    // Ensure both agents are checked
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      if (!(await checkboxes.nth(i).isChecked())) {
        await checkboxes.nth(i).check();
      }
    }
    await page.waitForTimeout(500);

    // Select Round Robin mode
    const swarmSelect = page.locator("select").first();
    await expect(swarmSelect).toBeVisible({ timeout: 5_000 });
    await swarmSelect.selectOption("ROUND_ROBIN");
    await page.waitForTimeout(500);

    // Agent order list should be visible
    const orderList = page.locator('[data-testid="agent-order-list"]');
    await expect(orderList).toBeVisible({ timeout: 3_000 });

    // Should have at least 2 agents listed
    const orderItems = orderList.locator("> div");
    await expect(orderItems).toHaveCount(2, { timeout: 3_000 });

    // Up/down buttons should exist
    const upBtn = page.locator('[data-testid="agent-order-up-1"]');
    await expect(upBtn).toBeVisible();
    const downBtn = page.locator('[data-testid="agent-order-down-0"]');
    await expect(downBtn).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Charter Lifecycle Tests (via API — more reliable than WebSocket timing)
  // -----------------------------------------------------------------------

  test("start charter — header shows ACTIVE status", async ({ page }) => {
    await openChannel(page, "general");

    // First ensure we have a non-default swarm mode set via API
    await page.evaluate(
      async (args: { serverId: string }) => {
        // Get the channel
        const channelRes = await fetch(
          `/api/servers/${args.serverId}/channels`,
        );
        const channels = await channelRes.json();
        const general = channels[0];

        // Set Round Robin mode
        await fetch(`/api/servers/${args.serverId}/channels/${general.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            swarmMode: "ROUND_ROBIN",
            charterMaxTurns: 4,
          }),
        });
      },
      { serverId },
    );

    // Reload to pick up charter state
    await page.reload();
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await page.waitForTimeout(2_000);

    // Should see "Start Charter" button
    const startBtn = page.locator('[data-testid="charter-start-btn"]');
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();
    await page.waitForTimeout(2_000);

    // Should see ACTIVE charter status (pulsing dot)
    const statusDot = page.locator('[data-testid="charter-status-dot"]');
    await expect(statusDot).toBeVisible({ timeout: 5_000 });

    // Should see mode label
    await expect(page.getByText("Round Robin")).toBeVisible({ timeout: 3_000 });
  });

  test("pause charter — header shows PAUSED state", async ({ page }) => {
    await openChannel(page, "general");

    // Ensure charter is ACTIVE via API
    await page.evaluate(
      async (args: { serverId: string }) => {
        const channelRes = await fetch(
          `/api/servers/${args.serverId}/channels`,
        );
        const channels = await channelRes.json();
        const general = channels[0];

        // Ensure mode is set
        await fetch(`/api/servers/${args.serverId}/channels/${general.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ swarmMode: "ROUND_ROBIN" }),
        });

        // Start charter
        await fetch(
          `/api/servers/${args.serverId}/channels/${general.id}/charter`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start" }),
          },
        );
      },
      { serverId },
    );

    // Reload to get fresh charter state
    await page.reload();
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await page.waitForTimeout(2_000);

    // Should see Pause button
    const pauseBtn = page.locator('[data-testid="charter-pause-btn"]');
    await expect(pauseBtn).toBeVisible({ timeout: 10_000 });
    await pauseBtn.click();
    await page.waitForTimeout(2_000);

    // Should see "Paused" text
    await expect(page.getByText("Paused")).toBeVisible({ timeout: 5_000 });

    // Should see Resume button
    const resumeBtn = page.locator('[data-testid="charter-resume-btn"]');
    await expect(resumeBtn).toBeVisible({ timeout: 5_000 });
  });

  test("resume charter — returns to ACTIVE", async ({ page }) => {
    await openChannel(page, "general");

    // Ensure charter is PAUSED via API
    await page.evaluate(
      async (args: { serverId: string }) => {
        const channelRes = await fetch(
          `/api/servers/${args.serverId}/channels`,
        );
        const channels = await channelRes.json();
        const general = channels[0];

        await fetch(`/api/servers/${args.serverId}/channels/${general.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ swarmMode: "ROUND_ROBIN" }),
        });

        // Start then pause
        await fetch(
          `/api/servers/${args.serverId}/channels/${general.id}/charter`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start" }),
          },
        );
        await fetch(
          `/api/servers/${args.serverId}/channels/${general.id}/charter`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "pause" }),
          },
        );
      },
      { serverId },
    );

    // Reload to get fresh state
    await page.reload();
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await page.waitForTimeout(2_000);

    // Should see Resume button
    const resumeBtn = page.locator('[data-testid="charter-resume-btn"]');
    await expect(resumeBtn).toBeVisible({ timeout: 10_000 });
    await resumeBtn.click();
    await page.waitForTimeout(2_000);

    // Should return to ACTIVE (status dot visible, Pause button visible)
    const statusDot = page.locator('[data-testid="charter-status-dot"]');
    await expect(statusDot).toBeVisible({ timeout: 5_000 });
    const pauseBtn = page.locator('[data-testid="charter-pause-btn"]');
    await expect(pauseBtn).toBeVisible({ timeout: 5_000 });
  });

  test("end charter — shows completed state", async ({ page }) => {
    await openChannel(page, "general");

    // Ensure charter is ACTIVE via API
    await page.evaluate(
      async (args: { serverId: string }) => {
        const channelRes = await fetch(
          `/api/servers/${args.serverId}/channels`,
        );
        const channels = await channelRes.json();
        const general = channels[0];

        await fetch(`/api/servers/${args.serverId}/channels/${general.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ swarmMode: "ROUND_ROBIN" }),
        });

        await fetch(
          `/api/servers/${args.serverId}/channels/${general.id}/charter`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start" }),
          },
        );
      },
      { serverId },
    );

    // Reload
    await page.reload();
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await page.waitForTimeout(2_000);

    // Should see End button
    const endBtn = page.locator('[data-testid="charter-end-btn"]');
    await expect(endBtn).toBeVisible({ timeout: 10_000 });
    await endBtn.click();
    await page.waitForTimeout(2_000);

    // Should show completed state
    const completed = page.locator('[data-testid="charter-completed"]');
    await expect(completed).toBeVisible({ timeout: 5_000 });
    await expect(completed).toContainText("Charter completed");
  });

  test("restart charter from completed — shows ACTIVE again", async ({
    page,
  }) => {
    await openChannel(page, "general");

    // Ensure charter is COMPLETED via API
    await page.evaluate(
      async (args: { serverId: string }) => {
        const channelRes = await fetch(
          `/api/servers/${args.serverId}/channels`,
        );
        const channels = await channelRes.json();
        const general = channels[0];

        await fetch(`/api/servers/${args.serverId}/channels/${general.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ swarmMode: "ROUND_ROBIN" }),
        });

        // Start then end
        await fetch(
          `/api/servers/${args.serverId}/channels/${general.id}/charter`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start" }),
          },
        );
        await fetch(
          `/api/servers/${args.serverId}/channels/${general.id}/charter`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "end" }),
          },
        );
      },
      { serverId },
    );

    // Reload
    await page.reload();
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await page.waitForTimeout(2_000);

    // Should see Restart button next to completed text
    const restartBtn = page.locator('[data-testid="charter-restart-btn"]');
    await expect(restartBtn).toBeVisible({ timeout: 10_000 });
    await restartBtn.click();
    await page.waitForTimeout(2_000);

    // Should be ACTIVE again
    const statusDot = page.locator('[data-testid="charter-status-dot"]');
    await expect(statusDot).toBeVisible({ timeout: 5_000 });
  });
});
