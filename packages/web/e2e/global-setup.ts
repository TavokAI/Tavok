/**
 * Playwright global setup — registers shared test users before any tests run.
 *
 * These users are used across all spec files. Registration is idempotent —
 * if users already exist (e.g., from a previous test run), login is verified instead.
 */
import { chromium } from "@playwright/test";

const TEST_USERS = [
  {
    email: "demo@tavok.ai",
    username: "demouser",
    displayName: "Demo User",
    password: "DemoPass123!",
  },
  {
    email: "alice@tavok.ai",
    username: "alice",
    displayName: "Alice Chen",
    password: "DemoPass123!",
  },
  {
    email: "bob@tavok.ai",
    username: "bob",
    displayName: "Bob Martinez",
    password: "DemoPass123!",
  },
];

async function globalSetup() {
  const browser = await chromium.launch();

  for (const user of TEST_USERS) {
    const context = await browser.newContext({
      baseURL: "http://localhost:5555",
    });
    const page = await context.newPage();

    try {
      // Try to register
      await page.goto("/register");
      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Display Name").fill(user.displayName);
      await page.getByLabel("Username").fill(user.username);
      await page.getByLabel("Password", { exact: true }).fill(user.password);
      await page.getByLabel("Confirm Password").fill(user.password);
      await page.getByRole("button", { name: /continue/i }).click();

      // Wait for navigation away from /register (success → dashboard, or stay on /register if user exists)
      try {
        await page.waitForURL(/^(?!.*\/register)/, { timeout: 10_000 });
      } catch {
        // Still on /register — user likely already exists, verify login works
        await page.goto("/login");
        await page.getByLabel("Email").fill(user.email);
        await page.getByLabel("Password").fill(user.password);
        await page.getByRole("button", { name: /log in/i }).click();
        await page.waitForURL(/^(?!.*\/login)/, { timeout: 10_000 });
      }
    } catch {
      // Ignore errors — user may already exist from a previous run
    } finally {
      await context.close();
    }
  }

  await browser.close();
}

export default globalSetup;
