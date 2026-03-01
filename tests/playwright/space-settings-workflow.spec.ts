import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function signInWithDemoMode(page: Page, name = "Avery") {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Use demo mode" }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(documents|workspace)$/);
}

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true
  });
}

test.describe("Space Settings Workflow", () => {
  test("navigate to space and modify settings", async ({ page }, testInfo) => {
    // Sign in using real backend demo mode
    await signInWithDemoMode(page);
    
    // Step 1: Navigate to documents page
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").first()).toBeVisible();
    await snap(page, testInfo, "01-documents-page");

    // Step 2: Click on a space in the sidebar
    const spaceLink = page.locator(".space-sidebar-item").filter({ hasNotText: "All Documents" }).first();
    await expect(spaceLink).toBeVisible();
    const spaceName = await spaceLink.textContent() || "Space";
    await spaceLink.click();
    
    // Wait for space page to load
    await expect(page.getByRole("heading").filter({ hasText: spaceName.replace(/\d+$/, "").trim() })).toBeVisible();
    await snap(page, testInfo, "02-space-page");

    // Step 3: Click Settings button
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Space Settings")).toBeVisible();
    await snap(page, testInfo, "03-settings-page");

    // Step 4: Verify General tab is active
    await expect(page.getByLabel("Name")).toBeVisible();
    await snap(page, testInfo, "04-general-tab");

    // Step 5: Click Defaults tab
    await page.getByRole("tab", { name: "Defaults" }).click();
    await expect(page.getByText("Default Settings for New Documents")).toBeVisible();
    await snap(page, testInfo, "05-defaults-tab");

    // Step 6: Click Danger Zone tab
    await page.getByRole("tab", { name: "Danger Zone" }).click();
    await expect(page.getByText("Archive Space")).toBeVisible();
    await snap(page, testInfo, "06-danger-tab");

    // Step 7: Go back to General tab and modify space name
    await page.getByRole("tab", { name: "General" }).click();
    const nameInput = page.getByLabel("Name");
    await nameInput.fill("Test Space Renamed");
    await snap(page, testInfo, "07-name-changed");

    // Step 8: Save changes
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("Settings saved successfully")).toBeVisible();
    await snap(page, testInfo, "08-settings-saved");

    // Step 9: Navigate back to space
    await page.getByRole("button", { name: "Back to space" }).click();
    await expect(page.getByRole("heading", { name: "Test Space Renamed" })).toBeVisible();
    await snap(page, testInfo, "09-back-to-space");
  });
});
