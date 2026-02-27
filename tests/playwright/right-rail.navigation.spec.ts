import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { ChroniclePlaywrightAgent } from "./ChroniclePlaywrightAgent";

async function installAndSignIn(page: Page, options?: ConstructorParameters<typeof ChroniclePlaywrightAgent>[1]) {
  const agent = new ChroniclePlaywrightAgent(page, options);
  await agent.install();
  await agent.signIn("Avery");
  return agent;
}

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true
  });
}

test.describe("UX-001: Right Rail Navigation for Workspace Side Panel", () => {
  test("right panel displays vertical rail on desktop with screenshots", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");
    await expect(page.getByText("Merge Gate Blocked")).toBeVisible();

    // Verify the vertical rail is present
    const rail = page.locator(".cm-panel-tabs-rail");
    await expect(rail).toBeVisible();

    // Verify rail tabs are vertical (Discussion, History, Log)
    await expect(rail.getByRole("tab", { name: "Discussion" })).toBeVisible();
    await expect(rail.getByRole("tab", { name: "History" })).toBeVisible();
    await expect(rail.getByRole("tab", { name: "Log" })).toBeVisible();

    // Verify rail has vertical orientation
    await expect(rail).toHaveAttribute("aria-orientation", "vertical");

    // Screenshot for visual regression
    await snap(page, testInfo, "01-desktop-vertical-rail");

    // Click History and screenshot
    await rail.getByRole("tab", { name: "History" }).click();
    await expect(page.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
    await snap(page, testInfo, "02-rail-history-selected");

    // Click Log and screenshot  
    await rail.getByRole("tab", { name: "Log" }).click();
    await expect(page.getByRole("tab", { name: "Log" })).toHaveAttribute("aria-selected", "true");
    await snap(page, testInfo, "03-rail-log-selected");
  });

  test("vertical rail keyboard navigation with Up/Down arrows and Home/End", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    const rail = page.locator(".cm-panel-tabs-rail");
    await expect(rail).toBeVisible();

    const discussionTab = rail.getByRole("tab", { name: "Discussion" });
    const historyTab = rail.getByRole("tab", { name: "History" });
    const logTab = rail.getByRole("tab", { name: "Log" });

    // Start on Discussion tab
    await discussionTab.click();
    await discussionTab.focus();
    await expect(discussionTab).toHaveAttribute("aria-selected", "true");

    // Press Down to navigate to History (the component calls onTabChange which updates selection)
    await page.keyboard.press("ArrowDown");
    // After ArrowDown, focus should move and tab should be selected
    await expect(historyTab).toHaveAttribute("aria-selected", "true");

    // Press Down to go to Log
    await page.keyboard.press("ArrowDown");
    await expect(logTab).toHaveAttribute("aria-selected", "true");

    // Press Up to go back to History
    await page.keyboard.press("ArrowUp");
    await expect(historyTab).toHaveAttribute("aria-selected", "true");

    // Press Up to go back to Discussion
    await page.keyboard.press("ArrowUp");
    await expect(discussionTab).toHaveAttribute("aria-selected", "true");

    // Test End key goes to last tab (Log)
    await page.keyboard.press("End");
    await expect(logTab).toHaveAttribute("aria-selected", "true");

    // Test Home key goes to first tab (Discussion)
    await page.keyboard.press("Home");
    await expect(discussionTab).toHaveAttribute("aria-selected", "true");
  });

  test("rail collapses to horizontal tabs on mobile viewport with screenshot", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/rfc-auth");
    await expect(page.getByText("Merge Gate Blocked")).toBeVisible();

    // On mobile, the tabs should be horizontal
    const tabs = page.locator('.cm-panel-tabs[aria-orientation="horizontal"], .cm-panel-tabs:not([aria-orientation])').first();
    await expect(tabs).toBeVisible();

    // Verify all tabs are visible and clickable
    await expect(page.getByRole("tab", { name: "Discussion" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Log" })).toBeVisible();

    // Screenshot for mobile visual regression
    await snap(page, testInfo, "04-mobile-horizontal-tabs");
  });

  test("mobile horizontal tabs use Left/Right arrow navigation", async ({ page }) => {
    await installAndSignIn(page);
    
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/rfc-auth");

    const discussionTab = page.getByRole("tab", { name: "Discussion" });
    const historyTab = page.getByRole("tab", { name: "History" });
    const logTab = page.getByRole("tab", { name: "Log" });

    // Start on Discussion
    await discussionTab.click();
    await discussionTab.focus();
    await expect(discussionTab).toHaveAttribute("aria-selected", "true");

    // Use Right arrow on mobile (horizontal layout)
    await page.keyboard.press("ArrowRight");
    await expect(historyTab).toHaveAttribute("aria-selected", "true");
    
    await page.keyboard.press("ArrowRight");
    await expect(logTab).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowLeft");
    await expect(historyTab).toHaveAttribute("aria-selected", "true");
  });

  test("tab switching updates panel content correctly", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    const rail = page.locator(".cm-panel-tabs-rail");
    
    // Start on Discussion - should show thread-related content
    await expect(page.getByText("No open threads")).toBeVisible();

    // Click History - should show commits
    await rail.getByRole("tab", { name: "History" }).click();
    await expect(page.getByText(/main commits|proposal commits/)).toBeVisible();

    // Click Log - should show decision log
    await rail.getByRole("tab", { name: "Log" }).click();
    await expect(page.getByText(/Decision Log|Auto-generated from resolved threads/)).toBeVisible();

    // Back to Discussion
    await rail.getByRole("tab", { name: "Discussion" }).click();
    await expect(page.getByText("No open threads")).toBeVisible();
  });

  test("rail maintains selection state after page interactions", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    const rail = page.locator(".cm-panel-tabs-rail");
    
    // Select History
    await rail.getByRole("tab", { name: "History" }).click();
    await expect(rail.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");

    // Interact with editor
    await page.locator(".cm-editor-wrapper .tiptap p").first().click();
    await page.keyboard.type(" Testing rail persistence.");

    // History tab should still be selected
    await expect(rail.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  });

  test("rail visual states - active tab has accent border", async ({ page }) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    const rail = page.locator(".cm-panel-tabs-rail");
    
    // Click each tab and verify active state styling
    const tabs = ["Discussion", "History", "Log"] as const;
    
    for (const tabName of tabs) {
      const tab = rail.getByRole("tab", { name: tabName });
      await tab.click();
      
      // Verify the tab is marked as selected
      await expect(tab).toHaveAttribute("aria-selected", "true");
      
      // Verify active styling (border-left color for vertical rail)
      await expect(tab).toHaveCSS("border-left-color", "rgb(196, 98, 45)");
    }
  });

  test("workspace flows remain intact with rail navigation", async ({ page }, testInfo) => {
    await installAndSignIn(page);
    await page.goto("/workspace/rfc-auth");

    // Can still perform all workspace actions
    await expect(page.getByText("Merge Gate Blocked")).toBeVisible();
    
    // Navigate through all tabs
    const rail = page.locator(".cm-panel-tabs-rail");
    await rail.getByRole("tab", { name: "History" }).click();
    await rail.getByRole("tab", { name: "Log" }).click();
    await rail.getByRole("tab", { name: "Discussion" }).click();

    // Can still interact with thread area
    await expect(page.getByText("No open threads")).toBeVisible();

    // Screenshot showing full workspace with rail
    await snap(page, testInfo, "05-workspace-with-rail-functional");
  });
});
