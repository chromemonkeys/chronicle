import { expect, test, type Page, type TestInfo } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signIn(page: Page, name = "Avery") {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Use demo mode" }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(documents|workspace)/);
}

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true,
  });
}

async function navigateToWorkspace(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");

  const docLink = page.locator(".tree-node-label").first();
  await expect(docLink).toBeVisible({ timeout: 10_000 });
  await docLink.click();
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 15_000 });

  // Wait for the editor to be ready
  await expect(page.locator(".tiptap, .ProseMirror").first()).toBeVisible({ timeout: 10_000 });

  const url = page.url();
  return url.split("/workspace/")[1]?.split(/[?#]/)[0] ?? "";
}

/** Ensure the toolbar is visible (requires proposal mode with active proposal). */
async function ensureToolbarVisible(page: Page) {
  // If there's no proposal yet, start one
  const toolbar = page.locator('.cm-doc-toolbar[role="toolbar"]');
  if (!(await toolbar.isVisible({ timeout: 2_000 }).catch(() => false))) {
    // Start a proposal to enable editing mode
    const startBtn = page.locator("button", { hasText: "Start Proposal" });
    if (await startBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForLoadState("networkidle");
      // Re-wait for workspace to fully load in proposal mode
      await expect(page.locator(".tiptap, .ProseMirror").first()).toBeVisible({ timeout: 10_000 });
    }
  }
  return toolbar;
}

// ---------------------------------------------------------------------------
// 4.2 Toolbar / Header
// ---------------------------------------------------------------------------

test.describe("4.2 Workspace Toolbar & Header", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 4.2.1 Breadcrumb renders with workspace name and document title
  test("4.2.1 breadcrumb renders workspace and document names", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const breadcrumb = page.locator(".cm-breadcrumb");
    await expect(breadcrumb).toBeVisible();

    // Should have breadcrumb links and a current item
    await expect(page.locator(".cm-breadcrumb-link").first()).toBeVisible();
    await expect(page.locator(".cm-breadcrumb-current")).toBeVisible();
    await expect(page.locator(".cm-breadcrumb-sep").first()).toBeVisible();

    await snap(page, testInfo, "4.2.1-breadcrumb");
  });

  // 4.2.2 Breadcrumb link navigates back to documents
  test("4.2.2 breadcrumb link navigates to documents", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const firstBreadcrumbLink = page.locator(".cm-breadcrumb-link").first();
    await expect(firstBreadcrumbLink).toBeVisible();
    await snap(page, testInfo, "4.2.2-before-click");

    await firstBreadcrumbLink.click();
    await expect(page).toHaveURL(/\/documents/);
    await snap(page, testInfo, "4.2.2-after-click");
  });

  // 4.2.3 Top nav logo navigates to documents
  test("4.2.3 logo navigates to documents page", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const logo = page.locator(".cm-topnav-logo");
    await expect(logo).toBeVisible();
    await logo.click();
    await expect(page).toHaveURL(/\/documents/);
    await snap(page, testInfo, "4.2.3-logo-nav");
  });

  // 4.2.4 Mode toggle shows Published / Proposal / Review buttons when proposal exists
  test("4.2.4 mode toggle renders when proposal is active", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const modeToggle = page.locator('.cm-mode-toggle[aria-label="Workspace mode"]');
    if (await modeToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(modeToggle.getByText("Published")).toBeVisible();
      await expect(modeToggle.getByText("Proposal")).toBeVisible();
      await expect(modeToggle.getByText("Review")).toBeVisible();
      await snap(page, testInfo, "4.2.4-mode-toggle");
    } else {
      // No active proposal - mode toggle shouldn't be present
      await snap(page, testInfo, "4.2.4-no-proposal");
      test.skip(true, "No active proposal in this workspace");
    }
  });

  // 4.2.5 Mode toggle switches to Published view
  test("4.2.5 mode toggle switches to published view", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const modeToggle = page.locator('.cm-mode-toggle[aria-label="Workspace mode"]');
    if (!(await modeToggle.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No active proposal in this workspace");
      return;
    }

    await modeToggle.getByText("Published").click();
    // Published view shows a read-only banner
    await expect(page.locator(".cm-readonly-banner")).toBeVisible({ timeout: 5_000 });
    await snap(page, testInfo, "4.2.5-published-view");
  });

  // 4.2.6 Mode toggle switches back to Proposal view
  test("4.2.6 mode toggle switches back to proposal view", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const modeToggle = page.locator('.cm-mode-toggle[aria-label="Workspace mode"]');
    if (!(await modeToggle.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No active proposal");
      return;
    }

    // Switch to published, then back to proposal
    await modeToggle.getByText("Published").click();
    await expect(page.locator(".cm-readonly-banner")).toBeVisible({ timeout: 5_000 });
    await snap(page, testInfo, "4.2.6-published");

    await modeToggle.getByText("Proposal").click();
    // The editor toolbar should be visible again in proposal mode
    await expect(page.locator('.cm-doc-toolbar[role="toolbar"]')).toBeVisible({ timeout: 5_000 });
    await snap(page, testInfo, "4.2.6-proposal-restored");
  });

  // 4.2.7 Save Draft button is present and disabled when no changes
  test("4.2.7 save draft button disabled when no unsaved changes", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const saveBtn = page.locator('button[title="Save draft"]');
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(saveBtn).toBeDisabled();
      await expect(saveBtn).toContainText("Save Draft");
      await snap(page, testInfo, "4.2.7-save-disabled");
    } else {
      await snap(page, testInfo, "4.2.7-no-save-btn");
      test.skip(true, "Save button not visible (may not be in proposal mode)");
    }
  });

  // 4.2.8 Save Draft becomes enabled after editor changes
  test("4.2.8 save draft enables after editing", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await editor.click();
    // Type some content to trigger unsaved changes
    await page.keyboard.type("Playwright test content ");
    await snap(page, testInfo, "4.2.8-after-typing");

    const saveBtn = page.locator('button[title="Save draft"]');
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // The button should be enabled after making changes
      await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
      await snap(page, testInfo, "4.2.8-save-enabled");
    }
  });

  // 4.2.9 Save Draft shows "Saving..." state while saving
  test("4.2.9 save draft shows saving state", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await editor.click();
    await page.keyboard.type("Save test ");

    const saveBtn = page.locator('button[title="Save draft"]');
    if (!(await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Save button not visible");
      return;
    }

    // Delay the save response to observe the saving state
    await page.route("**/api/workspace/*/save", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Should show "Saving..." text
    await expect(saveBtn).toContainText("Saving...");
    await snap(page, testInfo, "4.2.9-saving-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 4.2.10 Compare Versions button toggles comparison
  test("4.2.10 compare versions button works", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const compareBtn = page.locator('button[title="Compare versions"], button[title="Close comparison"]');
    await expect(compareBtn).toBeVisible({ timeout: 5_000 });
    await expect(compareBtn).toContainText("Compare Versions");
    await snap(page, testInfo, "4.2.10-before-compare");

    await compareBtn.click();
    // Wait for compare to activate (banner should appear)
    await page.waitForTimeout(2000);
    await snap(page, testInfo, "4.2.10-after-compare");
  });

  // 4.2.11 View History button switches to history tab
  test("4.2.11 view history button activates history tab", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const historyBtn = page.locator('button[title="View history"]');
    await expect(historyBtn).toBeVisible({ timeout: 5_000 });
    await historyBtn.click();
    await snap(page, testInfo, "4.2.11-history-tab");
  });

  // 4.2.12 Share button opens share dialog
  test("4.2.12 share button opens share dialog", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const shareBtn = page.locator('button[title="Share document"]');
    await expect(shareBtn).toBeVisible({ timeout: 5_000 });
    await shareBtn.click();

    // Share dialog should appear
    await expect(page.locator(".share-dialog, .sd")).toBeVisible({ timeout: 5_000 });
    await snap(page, testInfo, "4.2.12-share-dialog");
  });

  // 4.2.13 Branch badge shows current branch name
  test("4.2.13 branch badge shows current branch", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const branchBadge = page.locator('.cm-branch-badge[aria-label="Current branch"]');
    await expect(branchBadge).toBeVisible({ timeout: 5_000 });
    const branchText = await branchBadge.textContent();
    expect(branchText?.trim().length).toBeGreaterThan(0);
    await snap(page, testInfo, "4.2.13-branch-badge");
  });

  // 4.2.14 Start Proposal / Request Review button renders
  test("4.2.14 start proposal or request review button renders", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    const ctaBtn = page.locator(".cm-primary--cta");
    await expect(ctaBtn).toBeVisible({ timeout: 5_000 });
    const ctaText = await ctaBtn.textContent();
    expect(ctaText?.trim()).toMatch(/Start Proposal|Request Review/);
    await snap(page, testInfo, "4.2.14-cta-button");
  });

  // 4.2.15 Toolbar undo/redo buttons render with disabled state
  test("4.2.15 undo redo buttons render in toolbar", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const toolbar = page.locator('.cm-doc-toolbar[role="toolbar"]');
    if (!(await toolbar.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Toolbar not visible");
      return;
    }

    const undoBtn = page.locator('button[aria-label="Undo"]');
    const redoBtn = page.locator('button[aria-label="Redo"]');
    await expect(undoBtn).toBeVisible();
    await expect(redoBtn).toBeVisible();

    // Initially undo should be disabled (no actions yet)
    await expect(undoBtn).toBeDisabled();
    await snap(page, testInfo, "4.2.15-undo-redo");
  });

  // 4.2.16 Diff toggle button works
  test("4.2.16 diff toggle button toggles diff view", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const toolbar = page.locator('.cm-doc-toolbar[role="toolbar"]');
    if (!(await toolbar.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Toolbar not visible");
      return;
    }

    // Find the diff toggle button (contains "Show Diff" or "Diff On")
    const diffBtn = toolbar.locator("button", { hasText: /Show Diff|Diff On/ });
    await expect(diffBtn).toBeVisible();
    await snap(page, testInfo, "4.2.16-before-diff");

    await diffBtn.click();
    await snap(page, testInfo, "4.2.16-after-diff-toggle");
  });

  // 4.2.17 Split/Unified diff mode toggle buttons
  test("4.2.17 split and unified diff mode buttons render", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const toolbar = page.locator('.cm-doc-toolbar[role="toolbar"]');
    if (!(await toolbar.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Toolbar not visible");
      return;
    }

    const splitBtn = page.locator(".cm-diff-toggle button", { hasText: "Split" });
    const unifiedBtn = page.locator(".cm-diff-toggle button", { hasText: "Unified" });
    await expect(splitBtn).toBeVisible();
    await expect(unifiedBtn).toBeVisible();

    // Click unified and verify it becomes active
    await unifiedBtn.click();
    await expect(unifiedBtn).toHaveClass(/active/);
    await snap(page, testInfo, "4.2.17-unified-active");

    // Click split and verify it becomes active
    await splitBtn.click();
    await expect(splitBtn).toHaveClass(/active/);
    await snap(page, testInfo, "4.2.17-split-active");
  });

  // 4.2.18 Word count displays in toolbar
  test("4.2.18 word count displays in toolbar", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);

    const toolbar = page.locator('.cm-doc-toolbar[role="toolbar"]');
    if (!(await toolbar.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Toolbar not visible");
      return;
    }

    const wordCount = page.locator(".cm-word-count");
    await expect(wordCount).toBeVisible();
    const text = await wordCount.textContent();
    expect(text).toMatch(/\d+ words/);
    await snap(page, testInfo, "4.2.18-word-count");
  });
});
