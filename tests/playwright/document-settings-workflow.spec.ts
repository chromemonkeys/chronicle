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

test.describe("Document Settings Workflow - Visibility Changes", () => {
  test("change document visibility through settings", async ({ page }, testInfo) => {
    // Sign in using real backend demo mode
    await signInWithDemoMode(page);
    
    // Step 1: Navigate to a document
    await page.goto("/workspace/rfc-auth");
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await snap(page, testInfo, "01-document-opened");

    // Step 2: Click Settings button in toolbar
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Document Settings:")).toBeVisible();
    await snap(page, testInfo, "02-settings-dialog-opened");

    // Step 3: Verify General tab is active and Share Mode Selector is visible
    await expect(page.getByText("General Access")).toBeVisible();
    await snap(page, testInfo, "03-general-tab-visible");

    // Step 4: Change visibility to Private
    const shareModeSelect = page.locator(".share-mode-select");
    await shareModeSelect.selectOption("private");
    await snap(page, testInfo, "04-changed-to-private");

    // Step 5: Wait for success message
    await expect(page.getByText(/Share mode updated to.*Private/)).toBeVisible();
    await snap(page, testInfo, "05-private-saved");

    // Step 6: Change visibility to Public Link
    await shareModeSelect.selectOption("link");
    await snap(page, testInfo, "06-changed-to-public-link");

    // Step 7: Wait for success message
    await expect(page.getByText(/Share mode updated to.*Public Link/)).toBeVisible();
    await snap(page, testInfo, "07-public-link-saved");

    // Step 8: Change visibility to Space Members
    await shareModeSelect.selectOption("space");
    await snap(page, testInfo, "08-changed-to-space-members");

    // Step 9: Wait for final success message
    await expect(page.getByText(/Share mode updated to.*Space Members/)).toBeVisible();
    await snap(page, testInfo, "09-space-members-saved");

    // Step 10: Click on Reviewers tab
    await page.getByRole("tab", { name: "Reviewers" }).click();
    await expect(page.getByText("Approval Workflow")).toBeVisible();
    await snap(page, testInfo, "10-reviewers-tab");

    // Step 11: Close settings dialog
    await page.keyboard.press("Escape");
    await expect(page.getByText("Document Settings:")).not.toBeVisible();
    await snap(page, testInfo, "11-settings-closed");
  });
});
