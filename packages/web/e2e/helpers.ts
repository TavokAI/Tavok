import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Log in via the credentials form and wait for the app to load.
 * Uses the form UI (not API) to match real user flows. Handles
 * Docker/CI environments where page load may be slow by using
 * domcontentloaded instead of the default 'load' wait condition.
 */
export async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /log in/i }).click();

  // Wait for URL to change from /login. Use domcontentloaded instead
  // of load since the app page may hold the load event for WebSocket
  // or data fetching that takes time in Docker environments.
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });

  // Wait for the app layout to render
  await expect(
    page.getByRole("button", { name: "SERVERS" }),
  ).toBeVisible({ timeout: 15_000 });
}
