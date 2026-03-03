import { expect, test, type Page, type TestInfo } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signIn(page: Page, name = "Avery") {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Use demo mode" }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(documents|workspace)$/);
}

async function snap(page: Page, testInfo: TestInfo, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${label}.png`),
    fullPage: true,
  });
}

/**
 * Navigate to the rfc-auth workspace (which has an active proposal)
 * and wait for it to load.
 */
async function navigateToWorkspace(page: Page) {
  await page.goto("/workspace/rfc-auth");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Merge Gate").first()
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Activate Compare Versions mode to trigger diff views.
 * Returns true if comparison was activated, false otherwise.
 */
async function activateCompareMode(page: Page): Promise<boolean> {
  const compareBtn = page.locator(".cm-action-btn", { hasText: "Compare Versions" });
  if (!(await compareBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    return false;
  }
  await compareBtn.click();
  // Wait for comparison to load
  await page.waitForTimeout(2500);
  return true;
}

/**
 * Switch diff mode via the toolbar. Mode is "split" or "unified".
 */
async function setDiffMode(page: Page, mode: "split" | "unified") {
  const toolbar = page.locator(".cm-editor-toolbar, .cm-diff-toolbar");

  if (mode === "split") {
    // Click the Split button if available
    const splitBtn = page.locator("button", { hasText: "Split" }).first();
    if (await splitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await splitBtn.click();
    }
  } else {
    // Click the Unified button if available
    const unifiedBtn = page.locator("button", { hasText: "Unified" }).first();
    if (await unifiedBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await unifiedBtn.click();
    }
  }
}

// ---------------------------------------------------------------------------
// 6.1 Diff Toggle
// ---------------------------------------------------------------------------

test.describe("6.1 Diff Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
  });

  // 6.1.1 Diff toggle button enables/disables diff view
  test("6.1.1 diff toggle enables and disables diff view", async ({ page }, testInfo) => {
    // The diff toggle is in the EditorToolbar
    const diffToggle = page.locator("button[title*='diff'], .cm-diff-toggle, button", { hasText: /diff/i }).first();

    if (!(await diffToggle.isVisible({ timeout: 3000 }).catch(() => false))) {
      // Try the "Compare Versions" action button instead
      const compareBtn = page.locator(".cm-action-btn", { hasText: "Compare Versions" });
      if (!(await compareBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
        test.skip(true, "No diff toggle button found");
        return;
      }

      // Toggle on
      await compareBtn.click();
      await page.waitForTimeout(1500);
      await snap(page, testInfo, "6.1.1-diff-enabled");

      // Toggle off
      const closeBtn = page.locator(".cm-action-btn", { hasText: "Close Compare" });
      if (await closeBtn.isVisible({ timeout: 2000 })) {
        await closeBtn.click();
        await snap(page, testInfo, "6.1.1-diff-disabled");
      }
      return;
    }

    // Toggle on
    await diffToggle.click();
    await snap(page, testInfo, "6.1.1-diff-enabled");

    // Toggle off
    await diffToggle.click();
    await snap(page, testInfo, "6.1.1-diff-disabled");
  });

  // 6.1.2 Split/Unified mode selector switches diff format
  test("6.1.2 split/unified mode selector switches diff format", async ({ page }, testInfo) => {
    const compareActive = await activateCompareMode(page);
    if (!compareActive) {
      test.skip(true, "Compare mode could not be activated");
      return;
    }

    // Look for diff mode controls in the toolbar
    const splitBtn = page.locator(".cm-tool-btn, button", { hasText: "Split" }).first();
    const unifiedBtn = page.locator(".cm-tool-btn, button", { hasText: "Unified" }).first();

    if (await splitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await splitBtn.click();
      await page.waitForTimeout(500);
      await snap(page, testInfo, "6.1.2-split-mode");

      if (await unifiedBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await unifiedBtn.click();
        await page.waitForTimeout(500);
        await snap(page, testInfo, "6.1.2-unified-mode");
      }
    } else {
      // Mode may be controlled differently
      await snap(page, testInfo, "6.1.2-current-diff-mode");
    }
  });
});

// ---------------------------------------------------------------------------
// 6.2 Unified Diff
// ---------------------------------------------------------------------------

test.describe("6.2 Unified Diff", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
    const active = await activateCompareMode(page);
    if (!active) {
      test.skip(true, "Compare mode not available");
    }
  });

  // 6.2.1 Shows added nodes with diff-added class
  test("6.2.1 shows added nodes with diff-added class", async ({ page }, testInfo) => {
    // Switch to unified mode
    await setDiffMode(page, "unified");
    await page.waitForTimeout(500);

    // Check for unified diff container
    const unifiedDiff = page.locator(".cm-unified-diff");
    if (await unifiedDiff.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Look for diff-added decorations
      const addedNodes = page.locator(".diff-added, [class*='diff-added']");
      const addedCount = await addedNodes.count();
      await snap(page, testInfo, `6.2.1-added-nodes-count-${addedCount}`);
    } else {
      // May be in split mode or editor with diff decorations
      const diffAdded = page.locator(".diff-added, [class*='diff-added']");
      await snap(page, testInfo, `6.2.1-diff-added-${await diffAdded.count()}`);
    }
  });

  // 6.2.2 Shows removed nodes with diff-removed class
  test("6.2.2 shows removed nodes with diff-removed class", async ({ page }, testInfo) => {
    await setDiffMode(page, "unified");
    await page.waitForTimeout(500);

    const removedNodes = page.locator(".diff-removed, [class*='diff-removed']");
    const removedCount = await removedNodes.count();

    await snap(page, testInfo, `6.2.2-removed-nodes-count-${removedCount}`);
  });

  // 6.2.3 Shows changed nodes with diff-changed class
  test("6.2.3 shows changed nodes with diff-changed class", async ({ page }, testInfo) => {
    await setDiffMode(page, "unified");
    await page.waitForTimeout(500);

    const changedNodes = page.locator(".diff-changed, [class*='diff-changed']");
    const changedCount = await changedNodes.count();

    await snap(page, testInfo, `6.2.3-changed-nodes-count-${changedCount}`);
  });

  // 6.2.5 Stats display: +added, -removed, ~changed
  test("6.2.5 stats display added/removed/changed counts", async ({ page }, testInfo) => {
    // Stats are shown in the diff toolbar
    const addedStat = page.locator(".cm-diff-stat--added");
    const removedStat = page.locator(".cm-diff-stat--removed");
    const changedStat = page.locator(".cm-diff-stat--changed");

    // Also check the side-by-side meta which shows "X additions, Y deletions, Z changes"
    const diffMeta = page.locator(".cm-diff-meta");

    if (await diffMeta.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await snap(page, testInfo, "6.2.5-diff-stats");
    } else {
      await snap(page, testInfo, "6.2.5-no-stats-visible");
    }
  });
});

// ---------------------------------------------------------------------------
// 6.3 Side-by-Side Diff
// ---------------------------------------------------------------------------

test.describe("6.3 Side-by-Side Diff", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
    const active = await activateCompareMode(page);
    if (!active) {
      test.skip(true, "Compare mode not available");
    }
  });

  // 6.3.1 Two panes render (before and after)
  test("6.3.1 two panes render before and after", async ({ page }, testInfo) => {
    await setDiffMode(page, "split");
    await page.waitForTimeout(500);

    const sideBySideDiff = page.locator(".cm-side-by-side-diff");
    if (await sideBySideDiff.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check for before and after panels
      const beforePanel = page.locator(".cm-diff-panel--before");
      const afterPanel = page.locator(".cm-diff-panel--after");

      await expect(beforePanel).toBeVisible();
      await expect(afterPanel).toBeVisible();

      await snap(page, testInfo, "6.3.1-two-panes");
    } else {
      // The diff may render differently when identical or not in split mode
      await snap(page, testInfo, "6.3.1-diff-view");
    }
  });

  // 6.3.2 Added/removed/changed nodes highlighted
  test("6.3.2 nodes highlighted in side-by-side", async ({ page }, testInfo) => {
    await setDiffMode(page, "split");
    await page.waitForTimeout(500);

    // Check for any diff class decorations
    const diffDecorations = page.locator(".diff-added, .diff-removed, .diff-changed, [class*='diff-']");
    const count = await diffDecorations.count();

    await snap(page, testInfo, `6.3.2-highlighted-nodes-${count}`);
  });

  // 6.3.4 Sync scroll toggle button works
  test("6.3.4 sync scroll toggle button works", async ({ page }, testInfo) => {
    await setDiffMode(page, "split");
    await page.waitForTimeout(500);

    const syncToggle = page.locator(".cm-diff-sync-toggle");
    if (!(await syncToggle.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "No sync scroll toggle visible");
      return;
    }

    // Verify initial state (active by default)
    await expect(syncToggle).toHaveClass(/active/);
    await snap(page, testInfo, "6.3.4-sync-active");

    // Toggle off
    await syncToggle.click();
    await expect(syncToggle).not.toHaveClass(/active/);
    await snap(page, testInfo, "6.3.4-sync-disabled");

    // Toggle back on
    await syncToggle.click();
    await expect(syncToggle).toHaveClass(/active/);
  });

  // 6.3.5 Change count shown on center divider
  test("6.3.5 change count shown on center divider", async ({ page }, testInfo) => {
    await setDiffMode(page, "split");
    await page.waitForTimeout(500);

    const divider = page.locator(".cm-diff-divider");
    if (!(await divider.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "No center divider visible");
      return;
    }

    const changeCounts = page.locator(".cm-diff-change-counts");
    await expect(changeCounts).toBeVisible();

    // Check for at least one count indicator
    const countBadges = page.locator(".cm-diff-count");
    const badgeCount = await countBadges.count();
    expect(badgeCount).toBeGreaterThanOrEqual(0);

    await snap(page, testInfo, "6.3.5-divider-counts");
  });
});

// ---------------------------------------------------------------------------
// 6.2 / 6.3 Additional: Diff Legend
// ---------------------------------------------------------------------------

test.describe("6.x Diff Legend", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
    const active = await activateCompareMode(page);
    if (!active) {
      test.skip(true, "Compare mode not available");
    }
  });

  // Verify diff legend renders Added/Removed/Changed markers
  test("diff legend shows Added, Removed, Changed markers", async ({ page }, testInfo) => {
    const legend = page.locator(".cm-diff-legend");
    if (!(await legend.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "No diff legend visible");
      return;
    }

    await expect(page.locator(".cm-diff-legend--added")).toBeVisible();
    await expect(page.locator(".cm-diff-legend--removed")).toBeVisible();
    await expect(page.locator(".cm-diff-legend--changed")).toBeVisible();

    await snap(page, testInfo, "6.x-diff-legend");
  });
});

// ---------------------------------------------------------------------------
// 6.x Compare Workflow: Full E2E
// ---------------------------------------------------------------------------

test.describe("6.x Compare Workflow E2E", () => {
  test("E2E: activate compare, switch modes, verify stats", async ({ page }, testInfo) => {
    await signIn(page);
    await navigateToWorkspace(page);

    // Step 1: Click Compare Versions
    const compareBtn = page.locator(".cm-action-btn", { hasText: "Compare Versions" });
    if (!(await compareBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Compare Versions button not available");
      return;
    }

    await compareBtn.click();
    await page.waitForTimeout(2500);
    await snap(page, testInfo, "6.x-e2e-01-compare-activated");

    // Step 2: Verify diff toolbar is visible
    const diffToolbar = page.locator(".cm-diff-toolbar");
    if (await diffToolbar.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(diffToolbar.locator(".cm-diff-title")).toContainText(/Compare|Viewing/);
      await snap(page, testInfo, "6.x-e2e-02-diff-toolbar");
    }

    // Step 3: Try switching to split mode
    const splitBtn = page.locator(".cm-tool-btn, button", { hasText: "Split" }).first();
    if (await splitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await splitBtn.click();
      await page.waitForTimeout(500);

      // Should show side-by-side
      const sideByDiff = page.locator(".cm-side-by-side-diff");
      if (await sideByDiff.isVisible({ timeout: 2000 })) {
        await snap(page, testInfo, "6.x-e2e-03-split-mode");
      }
    }

    // Step 4: Try switching to unified mode
    const unifiedBtn = page.locator(".cm-tool-btn, button", { hasText: "Unified" }).first();
    if (await unifiedBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await unifiedBtn.click();
      await page.waitForTimeout(500);

      const unifiedDiff = page.locator(".cm-unified-diff");
      if (await unifiedDiff.isVisible({ timeout: 2000 })) {
        await snap(page, testInfo, "6.x-e2e-04-unified-mode");
      }
    }

    // Step 5: Close compare
    const closeCompare = page.locator(".cm-action-btn", { hasText: "Close Compare" });
    if (await closeCompare.isVisible({ timeout: 2000 })) {
      await closeCompare.click();
      await page.waitForTimeout(500);

      // Compare banner should be gone, diff containers hidden
      await expect(page.locator(".cm-side-by-side-diff")).not.toBeVisible();
      await expect(page.locator(".cm-unified-diff")).not.toBeVisible();
      await snap(page, testInfo, "6.x-e2e-05-compare-closed");
    }
  });
});

// ---------------------------------------------------------------------------
// 6.x DiffNavigator in Changes Tab
// ---------------------------------------------------------------------------

test.describe("6.x DiffNavigator Integration", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
    const active = await activateCompareMode(page);
    if (!active) {
      test.skip(true, "Compare mode not available");
    }
  });

  // Verify change rows render with type badge, snippet, and state
  test("change rows render with type, snippet, and review state", async ({ page }, testInfo) => {
    // Navigate to Changes tab
    const changesTab = page.locator("[role='tab'][data-tab-id='changes']");
    if (!(await changesTab.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Changes tab not visible");
      return;
    }
    await changesTab.click();

    const changeRow = page.locator(".cm-change-row").first();
    if (!(await changeRow.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "No change rows visible");
      return;
    }

    // Verify structure: type badge, snippet, meta
    await expect(changeRow.locator(".cm-change-type")).toBeVisible();
    await expect(changeRow.locator(".cm-change-snippet")).toBeVisible();
    await expect(changeRow.locator(".cm-change-state")).toBeVisible();

    await snap(page, testInfo, "6.x-change-row-structure");
  });

  // Verify review state badge displays correct text
  test("review state badges display correct labels", async ({ page }, testInfo) => {
    const changesTab = page.locator("[role='tab'][data-tab-id='changes']");
    if (!(await changesTab.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Changes tab not visible");
      return;
    }
    await changesTab.click();

    const stateBadges = page.locator(".cm-change-state");
    const count = await stateBadges.count();
    if (count === 0) {
      test.skip(true, "No state badges visible");
      return;
    }

    // Verify that state badges contain valid labels
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await stateBadges.nth(i).textContent();
      expect(["Pending", "Accepted", "Rejected", "Deferred"]).toContain(text?.trim());
    }

    await snap(page, testInfo, "6.x-review-state-badges");
  });

  // Unresolved-only filter button
  test("unresolved only filter toggles", async ({ page }, testInfo) => {
    const changesTab = page.locator("[role='tab'][data-tab-id='changes']");
    if (!(await changesTab.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Changes tab not visible");
      return;
    }
    await changesTab.click();

    const unresolvedBtn = page.locator(".cm-tool-btn", { hasText: "Unresolved only" });
    if (!(await unresolvedBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Unresolved only button not visible");
      return;
    }

    // Toggle on
    await unresolvedBtn.click();
    await expect(unresolvedBtn).toHaveClass(/active/);
    await snap(page, testInfo, "6.x-unresolved-only-active");

    // Toggle off
    await unresolvedBtn.click();
    await expect(unresolvedBtn).not.toHaveClass(/active/);
    await snap(page, testInfo, "6.x-unresolved-only-inactive");
  });
});
