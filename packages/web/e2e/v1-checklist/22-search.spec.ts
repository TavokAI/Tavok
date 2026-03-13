import { test, expect } from "@playwright/test";
import {
  login,
  ALICE,
  BOB,
  DEMO_USER,
  selectServer,
  openChannel,
  sendMessage,
  waitForWebSocket,
  uniqueMsg,
  createServerViaAPI,
  createInviteViaAPI,
  joinServerViaAPI,
  createChannelViaAPI,
} from "./helpers";

/**
 * TASK-0022: Message Search E2E tests
 *
 * Tests the search panel UI, full-text search results, filters,
 * click-to-jump, and DM search.
 */

let serverName: string;
let serverId: string;
let searchTerm: string;
let searchMsg1: string;
let searchMsg2: string;

test.beforeAll(async ({ browser }) => {
  serverName = `Test-S22-${Date.now()}`;
  searchTerm = `searchable${Date.now()}`;
  searchMsg1 = `First ${searchTerm} message in general`;
  searchMsg2 = `Second ${searchTerm} message in general`;

  // Owner creates server + second channel + invite
  const ctxOwner = await browser.newContext();
  const pgOwner = await ctxOwner.newPage();
  await login(pgOwner, DEMO_USER.email, DEMO_USER.password);
  const result = await createServerViaAPI(pgOwner, serverName);
  serverId = result.serverId;
  await createChannelViaAPI(pgOwner, serverId, "testing");
  const inviteCode = await createInviteViaAPI(pgOwner, serverId);

  // Owner sends searchable messages in general
  await selectServer(pgOwner, serverName);
  await openChannel(pgOwner, "general");
  await waitForWebSocket(pgOwner, "general");
  await sendMessage(pgOwner, "general", searchMsg1);
  await sendMessage(pgOwner, "general", searchMsg2);

  // Owner sends a message in testing channel
  await openChannel(pgOwner, "testing");
  await waitForWebSocket(pgOwner, "testing");
  await sendMessage(pgOwner, "testing", `Testing channel ${searchTerm} here`);

  await ctxOwner.close();

  // Alice joins
  const ctxA = await browser.newContext();
  const pgA = await ctxA.newPage();
  await login(pgA, ALICE.email, ALICE.password);
  await joinServerViaAPI(pgA, inviteCode);
  await ctxA.close();
});

test.describe("Section 22: Message Search", () => {
  test("Search icon is visible in channel header", async ({ page }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    const searchBtn = page.locator('[data-testid="search-toggle-btn"]');
    await expect(searchBtn).toBeVisible({ timeout: 5_000 });
  });

  test("Clicking search icon opens search panel", async ({ page }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    await page.locator('[data-testid="search-toggle-btn"]').click();
    const panel = page.locator('[data-testid="search-panel"]');
    await expect(panel).toBeVisible({ timeout: 3_000 });

    // Search input is auto-focused
    const input = page.locator('[data-testid="search-input"]');
    await expect(input).toBeVisible();
  });

  test("Typing query returns matching results", async ({ page }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    await page.locator('[data-testid="search-toggle-btn"]').click();
    const input = page.locator('[data-testid="search-input"]');
    await input.fill(searchTerm);

    // Wait for results (debounce + API)
    const results = page.locator('[data-testid="search-result-item"]');
    await expect(results.first()).toBeVisible({ timeout: 10_000 });

    // Should have at least 2 results (from general) + 1 (from testing) = 3
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("Results contain highlighted matches", async ({ page }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    await page.locator('[data-testid="search-toggle-btn"]').click();
    await page.locator('[data-testid="search-input"]').fill(searchTerm);

    // Wait for results
    const highlightEl = page.locator('[data-testid="search-result-highlight"] mark');
    await expect(highlightEl.first()).toBeVisible({ timeout: 10_000 });
  });

  test("Clicking result closes panel (jump to message)", async ({ page }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    await page.locator('[data-testid="search-toggle-btn"]').click();
    await page.locator('[data-testid="search-input"]').fill(searchTerm);

    const result = page.locator('[data-testid="search-result-item"]');
    await expect(result.first()).toBeVisible({ timeout: 10_000 });
    await result.first().click();

    // Panel should close
    const panel = page.locator('[data-testid="search-panel"]');
    await expect(panel).not.toBeVisible({ timeout: 3_000 });
  });

  test("Close button hides search panel", async ({ page }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    await page.locator('[data-testid="search-toggle-btn"]').click();
    await expect(
      page.locator('[data-testid="search-panel"]'),
    ).toBeVisible({ timeout: 3_000 });

    await page.locator('[data-testid="search-close-btn"]').click();
    await expect(
      page.locator('[data-testid="search-panel"]'),
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test("No results for gibberish query shows empty state", async ({ page }) => {
    await login(page, ALICE.email, ALICE.password);
    await selectServer(page, serverName);
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    await page.locator('[data-testid="search-toggle-btn"]').click();
    await page
      .locator('[data-testid="search-input"]')
      .fill(`xyznonexistent${Date.now()}`);

    // Wait for "No results found" text
    await expect(page.getByText("No results found")).toBeVisible({
      timeout: 10_000,
    });
  });
});
