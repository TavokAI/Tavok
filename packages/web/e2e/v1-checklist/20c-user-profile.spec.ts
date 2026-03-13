import { test, expect } from "@playwright/test";
import {
  login,
  DEMO_USER,
  ALICE,
  selectServer,
  openChannel,
  waitForWebSocket,
  sendMessage,
  createServerViaAPI,
  createInviteViaAPI,
  joinServerViaAPI,
  uniqueMsg,
} from "./helpers";

/**
 * TASK-0024: User Profile & Settings E2E tests
 *
 * Tests the user profile button, popover, settings modal,
 * profile card popup from chat messages, and DM navigation.
 */

let serverName: string;
let serverId: string;

test.beforeAll(async ({ browser }) => {
  serverName = `Profile-S24-${Date.now()}`;

  // Owner creates server + invite
  const ctxOwner = await browser.newContext();
  const pgOwner = await ctxOwner.newPage();
  await login(pgOwner, DEMO_USER.email, DEMO_USER.password);
  const result = await createServerViaAPI(pgOwner, serverName);
  serverId = result.serverId;
  const inviteCode = await createInviteViaAPI(pgOwner, serverId);
  await ctxOwner.close();

  // Alice joins as a member
  const ctxA = await browser.newContext();
  const pgA = await ctxA.newPage();
  await login(pgA, ALICE.email, ALICE.password);
  await joinServerViaAPI(pgA, inviteCode);
  await ctxA.close();
});

test.describe("Section 24: User Profile & Settings", () => {
  test("User profile button is visible in left panel", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);

    const profileBtn = page.getByTestId("user-profile-btn");
    await expect(profileBtn).toBeVisible({ timeout: 10_000 });
    // Should show the display name
    await expect(profileBtn).toContainText(DEMO_USER.displayName);
  });

  test("Clicking profile button shows popover with user info", async ({
    page,
  }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);

    await page.getByTestId("user-profile-btn").click();

    const popover = page.getByTestId("user-profile-popover");
    await expect(popover).toBeVisible({ timeout: 5_000 });
    // Popover should show display name and username
    await expect(popover).toContainText(DEMO_USER.displayName);
    await expect(popover).toContainText(`@${DEMO_USER.username}`);
    // Should show status options
    await expect(popover).toContainText("Online");
    await expect(popover).toContainText("Away");
    await expect(popover).toContainText("Do Not Disturb");
  });

  test("Edit Profile button opens settings modal", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);

    // Open popover
    await page.getByTestId("user-profile-btn").click();
    await expect(page.getByTestId("user-profile-popover")).toBeVisible({
      timeout: 5_000,
    });

    // Click Edit Profile
    await page.getByTestId("edit-profile-btn").click();

    // Settings modal should appear
    const modal = page.getByTestId("profile-settings-modal");
    await expect(modal).toBeVisible({ timeout: 5_000 });
    // Popover should be dismissed
    await expect(page.getByTestId("user-profile-popover")).not.toBeVisible();
  });

  test("Display name can be changed and saved", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);

    // Open settings modal via profile button
    await page.getByTestId("user-profile-btn").click();
    await page.getByTestId("edit-profile-btn").click();
    await expect(page.getByTestId("profile-settings-modal")).toBeVisible({
      timeout: 5_000,
    });

    // Change display name
    const nameInput = page.locator("#displayName");
    await nameInput.clear();
    await nameInput.fill("Demo User Updated");

    // Save
    await page.getByTestId("profile-save-btn").click();

    // Wait for success message
    await expect(page.getByText("Profile updated")).toBeVisible({
      timeout: 5_000,
    });

    // Revert the name back to avoid affecting other tests
    await nameInput.clear();
    await nameInput.fill(DEMO_USER.displayName);
    await page.getByTestId("profile-save-btn").click();
    await expect(page.getByText("Profile updated")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Password change validates matching passwords", async ({ page }) => {
    await login(page, DEMO_USER.email, DEMO_USER.password);

    // Open settings
    await page.getByTestId("user-profile-btn").click();
    await page.getByTestId("edit-profile-btn").click();
    await expect(page.getByTestId("profile-settings-modal")).toBeVisible({
      timeout: 5_000,
    });

    // Scroll to password section and fill mismatched passwords
    const currentPw = page.locator("#currentPassword");
    const newPw = page.locator("#newPassword");
    const confirmPw = page.locator("#confirmPassword");

    await currentPw.fill(DEMO_USER.password);
    await newPw.fill("NewPassword123!");
    await confirmPw.fill("DifferentPassword123!");

    // Click Update Password
    await page.getByRole("button", { name: "Update Password" }).click();

    // Should show validation error
    await expect(page.getByText("Passwords do not match")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Clicking username in chat shows profile card", async ({ browser }) => {
    // We need two users: Alice sends a message, Demo sees it and clicks her name
    const ctxAlice = await browser.newContext();
    const pgAlice = await ctxAlice.newPage();
    await login(pgAlice, ALICE.email, ALICE.password);
    await selectServer(pgAlice, serverName);
    await openChannel(pgAlice, "general");
    await waitForWebSocket(pgAlice, "general");

    const msg = uniqueMsg("profile-test");
    await sendMessage(pgAlice, "general", msg);
    await ctxAlice.close();

    // Now Demo opens the same channel
    const ctxDemo = await browser.newContext();
    const pgDemo = await ctxDemo.newPage();
    await login(pgDemo, DEMO_USER.email, DEMO_USER.password);
    await selectServer(pgDemo, serverName);
    await openChannel(pgDemo, "general");
    await waitForWebSocket(pgDemo, "general");

    // Wait for Alice's message to appear
    await expect(pgDemo.getByText(msg)).toBeVisible({ timeout: 10_000 });

    // Click Alice's name on her message
    const authorName = pgDemo
      .getByTestId("message-author-name")
      .filter({ hasText: ALICE.displayName })
      .first();
    await authorName.click();

    // Profile card should appear
    const profileCard = pgDemo.getByTestId("user-profile-card");
    await expect(profileCard).toBeVisible({ timeout: 5_000 });
    await expect(profileCard).toContainText(ALICE.displayName);
    await expect(profileCard).toContainText(`@${ALICE.username}`);

    await ctxDemo.close();
  });

  test("Profile card shows status and member since", async ({ browser }) => {
    // Alice sends message, Demo clicks her name
    const ctxAlice = await browser.newContext();
    const pgAlice = await ctxAlice.newPage();
    await login(pgAlice, ALICE.email, ALICE.password);
    await selectServer(pgAlice, serverName);
    await openChannel(pgAlice, "general");
    await waitForWebSocket(pgAlice, "general");

    const msg = uniqueMsg("card-detail");
    await sendMessage(pgAlice, "general", msg);
    await ctxAlice.close();

    const ctxDemo = await browser.newContext();
    const pgDemo = await ctxDemo.newPage();
    await login(pgDemo, DEMO_USER.email, DEMO_USER.password);
    await selectServer(pgDemo, serverName);
    await openChannel(pgDemo, "general");
    await waitForWebSocket(pgDemo, "general");

    await expect(pgDemo.getByText(msg)).toBeVisible({ timeout: 10_000 });

    const authorName = pgDemo
      .getByTestId("message-author-name")
      .filter({ hasText: ALICE.displayName })
      .first();
    await authorName.click();

    const profileCard = pgDemo.getByTestId("user-profile-card");
    await expect(profileCard).toBeVisible({ timeout: 5_000 });
    // Should show "Member Since" section
    await expect(profileCard).toContainText("Member Since");
    // Should show a status indicator (Online/Away/etc.)
    await expect(
      profileCard.getByText(/Online|Away|Do Not Disturb|Offline/),
    ).toBeVisible();

    await ctxDemo.close();
  });

  test("Profile card Send Message button exists", async ({ browser }) => {
    // Alice sends message, Demo clicks her name to see profile card
    const ctxAlice = await browser.newContext();
    const pgAlice = await ctxAlice.newPage();
    await login(pgAlice, ALICE.email, ALICE.password);
    await selectServer(pgAlice, serverName);
    await openChannel(pgAlice, "general");
    await waitForWebSocket(pgAlice, "general");

    const msg = uniqueMsg("dm-btn-test");
    await sendMessage(pgAlice, "general", msg);
    await ctxAlice.close();

    const ctxDemo = await browser.newContext();
    const pgDemo = await ctxDemo.newPage();
    await login(pgDemo, DEMO_USER.email, DEMO_USER.password);
    await selectServer(pgDemo, serverName);
    await openChannel(pgDemo, "general");
    await waitForWebSocket(pgDemo, "general");

    await expect(pgDemo.getByText(msg)).toBeVisible({ timeout: 10_000 });

    const authorName = pgDemo
      .getByTestId("message-author-name")
      .filter({ hasText: ALICE.displayName })
      .first();
    await authorName.click();

    const profileCard = pgDemo.getByTestId("user-profile-card");
    await expect(profileCard).toBeVisible({ timeout: 5_000 });

    // Send Message button should be visible
    const dmBtn = pgDemo.getByTestId("profile-card-dm-btn");
    await expect(dmBtn).toBeVisible();
    await expect(dmBtn).toContainText("Send Message");

    await ctxDemo.close();
  });

  test("Profile card dismisses on outside click", async ({ browser }) => {
    const ctxAlice = await browser.newContext();
    const pgAlice = await ctxAlice.newPage();
    await login(pgAlice, ALICE.email, ALICE.password);
    await selectServer(pgAlice, serverName);
    await openChannel(pgAlice, "general");
    await waitForWebSocket(pgAlice, "general");

    const msg = uniqueMsg("dismiss-test");
    await sendMessage(pgAlice, "general", msg);
    await ctxAlice.close();

    const ctxDemo = await browser.newContext();
    const pgDemo = await ctxDemo.newPage();
    await login(pgDemo, DEMO_USER.email, DEMO_USER.password);
    await selectServer(pgDemo, serverName);
    await openChannel(pgDemo, "general");
    await waitForWebSocket(pgDemo, "general");

    await expect(pgDemo.getByText(msg)).toBeVisible({ timeout: 10_000 });

    const authorName = pgDemo
      .getByTestId("message-author-name")
      .filter({ hasText: ALICE.displayName })
      .first();
    await authorName.click();

    const profileCard = pgDemo.getByTestId("user-profile-card");
    await expect(profileCard).toBeVisible({ timeout: 5_000 });

    // Click outside the card to dismiss it
    await pgDemo.mouse.click(10, 10);
    await expect(profileCard).not.toBeVisible({ timeout: 5_000 });

    await ctxDemo.close();
  });
});
