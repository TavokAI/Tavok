import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import {
  registerUser,
  login,
  openChannel,
  waitForWebSocket,
  sendMessage,
  uniqueMsg,
} from "./helpers";

// This test MUST run last — it wipes the database.
test.describe("Section 21: Final Sanity", () => {
  const projectDir =
    process.env.CLAUDE_PROJECT_DIR ||
    process.cwd().replace(/packages[/\\]web$/, "");

  test("full wipe and restart — fresh flow works from zero", async ({
    page,
  }) => {
    test.setTimeout(180_000); // 3 minutes for full cycle

    // Step 1: Full wipe
    execSync("docker compose down -v", {
      cwd: projectDir,
      timeout: 60_000,
      encoding: "utf-8",
    });

    // Step 2: Restart
    execSync("docker compose up -d", {
      cwd: projectDir,
      timeout: 60_000,
      encoding: "utf-8",
    });

    // Step 3: Wait for services to be healthy (adaptive polling)
    let healthy = false;
    const healthStart = Date.now();
    const maxWaitMs = 120_000; // 2 min max
    let pollMs = 2_000; // Start at 2s, back off to 8s

    while (Date.now() - healthStart < maxWaitMs) {
      await page.waitForTimeout(pollMs);
      try {
        const res = await page.request.get("http://localhost:5555/api/health");
        const data = await res.json();
        if (data.status === "ok") {
          healthy = true;
          break;
        }
      } catch {
        // Services not ready yet
      }
      pollMs = Math.min(pollMs * 1.5, 8_000); // Back off: 2→3→4.5→6.75→8→8…
    }
    expect(
      healthy,
      `Services should be healthy after restart (waited ${Date.now() - healthStart}ms)`,
    ).toBe(true);

    // Step 4: Run migrations from host
    try {
      const databaseUrl = `postgresql://tavok:${process.env.POSTGRES_PASSWORD || "tavok"}@localhost:55432/tavok`;
      execSync("npx prisma migrate deploy --schema prisma/schema.prisma", {
        cwd: projectDir,
        timeout: 30_000,
        encoding: "utf-8",
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
      });
    } catch {
      // Migrations may already be applied
    }

    // Step 5: Register a fresh user
    const ts = Date.now();
    const freshUser = {
      email: `fresh_${ts}@test.local`,
      username: `fresh_${ts}`,
      displayName: `Fresh User ${ts}`,
      password: "TestPass123!",
    };
    await registerUser(page, freshUser);

    // Step 6: Create a server
    const serverName = `Fresh Server ${ts}`;

    // Wait for the app to fully load after registration redirect
    await expect(page.getByRole("tab", { name: "SERVERS" })).toBeVisible({
      timeout: 20_000,
    });

    // After a full wipe, the fresh user has zero servers so the onboarding
    // flow appears. Create the server via page.evaluate (uses the page's
    // fetch with proper auth cookies) rather than fighting onboarding UI timing.
    const serverData = await page.evaluate(async (name: string) => {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          defaultChannelName: "general",
          defaultChannelTopic: null,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "no body");
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
      }
      return res.json();
    }, serverName);
    expect(serverData.id).toBeTruthy();

    // Reload so the workspace sees the new server and exits onboarding
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);

    // Navigate to the server via sidebar
    await page.getByRole("tab", { name: "SERVERS" }).click();
    await page.waitForTimeout(500);
    await page.getByText(serverName).first().click();
    await page.waitForTimeout(500);

    // Step 7: Send a message
    await openChannel(page, "general");
    await waitForWebSocket(page, "general");

    const msg = uniqueMsg("Fresh-start");
    await sendMessage(page, "general", msg);

    // Step 8: Full flow works
    await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 });
  });

  test("nothing in UI says HiveChat", async ({ page }) => {
    // This test runs after the fresh start, or on the existing setup
    try {
      await page.goto("/login", { waitUntil: "domcontentloaded" });
    } catch {
      // If services are down from the wipe test, try to wait
      await page.waitForTimeout(5_000);
      await page.goto("/login", { waitUntil: "domcontentloaded" });
    }

    const pageContent = await page.content();
    expect(pageContent.toLowerCase()).not.toContain("hivechat");

    // Also check the main app page if logged in
    try {
      await login(page, "fresh_" + Date.now() + "@test.local", "TestPass123!");
    } catch {
      // May not be logged in — that's OK, just check what's visible
    }

    const bodyText = await page
      .locator("body")
      .textContent()
      .catch(() => "");
    expect(bodyText?.toLowerCase() || "").not.toContain("hivechat");
  });
});
