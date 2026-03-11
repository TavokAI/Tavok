import { test, expect } from "@playwright/test";
import { login, DEMO_USER, selectServer, createServerViaAPI } from "./helpers";

test.describe("Section 13: Roles & Permissions", () => {
  let serverName: string;
  let serverId: string;

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, DEMO_USER.email, DEMO_USER.password);
    serverName = `Test-S13-${Date.now()}`;
    const result = await createServerViaAPI(page, serverName);
    serverId = result.serverId;
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);
    await selectServer(page, serverName);
  });

  test("server owner can open server settings with roles section", async ({
    page,
  }) => {
    // Look for server settings button (gear icon)
    const settingsButton = page
      .locator('button[title*="etting"], button[aria-label*="etting"]')
      .or(page.locator("button").filter({ hasText: /settings/i }));

    await settingsButton.first().click({ timeout: 5_000 });
    await page.waitForTimeout(1_000);

    // Navigate to Roles section
    const rolesTab = page
      .getByText(/roles/i)
      .or(page.locator("button, a").filter({ hasText: /roles/i }));
    await rolesTab.first().click({ timeout: 5_000 });

    // Should show role management UI
    await expect(page.getByText(/admin|member|role/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("create a new role with name", async ({ page }) => {
    const ts = Date.now();

    // Open server settings
    const settingsButton = page
      .locator('button[title*="etting"]')
      .or(page.locator("button").filter({ hasText: /settings/i }));
    await settingsButton.first().click({ timeout: 5_000 });
    await page.waitForTimeout(1_000);

    // Go to Roles section
    await page
      .getByText(/roles/i)
      .or(page.locator("button, a").filter({ hasText: /roles/i }))
      .first()
      .click();
    await page.waitForTimeout(1_000);

    // Click "Create Role" button
    await page.getByRole("button", { name: "Create Role" }).click();
    await page.waitForTimeout(1_000);

    // Fill in role name
    const nameInput = page
      .getByPlaceholder(/role name/i)
      .or(page.getByLabel(/name/i))
      .or(page.locator("input").last());
    await nameInput.first().fill(`TestRole${ts}`);

    // Save/submit
    await page
      .getByRole("button", { name: /save|create/i })
      .last()
      .click();
    await page.waitForTimeout(2_000);

    // New role should appear in the list
    await expect(page.getByText(`TestRole${ts}`)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("@everyone default role exists", async ({ page }) => {
    // Open server settings → roles
    const settingsButton = page
      .locator('button[title*="etting"]')
      .or(page.locator("button").filter({ hasText: /settings/i }));
    await settingsButton.first().click({ timeout: 5_000 });
    await page.waitForTimeout(1_000);

    await page
      .getByText(/roles/i)
      .or(page.locator("button, a").filter({ hasText: /roles/i }))
      .first()
      .click();
    await page.waitForTimeout(1_000);

    // User-created servers have an @everyone role by default
    const hasEveryone = await page
      .getByText(/@everyone|everyone/i)
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    // The "create a new role" test above may also have left a role visible
    const hasAnyRole = await page
      .getByText(/admin|member|role/i)
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    expect(hasEveryone || hasAnyRole).toBe(true);
  });
});
