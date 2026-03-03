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

async function navigateToWorkspace(page: Page) {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");

  const docLink = page.locator(".tree-node-label").first();
  await expect(docLink).toBeVisible({ timeout: 10_000 });
  await docLink.click();
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 15_000 });
  await expect(page.locator(".tiptap, .ProseMirror").first()).toBeVisible({ timeout: 10_000 });
}

async function ensureToolbarVisible(page: Page) {
  const toolbar = page.locator('.cm-doc-toolbar[role="toolbar"]');
  if (!(await toolbar.isVisible({ timeout: 2_000 }).catch(() => false))) {
    const startBtn = page.locator("button", { hasText: "Start Proposal" });
    if (await startBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".tiptap, .ProseMirror").first()).toBeVisible({ timeout: 10_000 });
    }
  }
}

/**
 * Type known content into the editor, then open Find & Replace bar.
 * Returns the distinct text that was typed so tests can search for it.
 */
async function typeContentAndOpenFind(page: Page): Promise<string> {
  const editor = page.locator(".tiptap, .ProseMirror").first();
  await editor.click();
  await page.keyboard.press("Enter");

  // Type known text to search for
  const uniqueText = `findme_${Date.now()}`;
  await page.keyboard.type(`${uniqueText} hello ${uniqueText} world ${uniqueText}`);
  await page.waitForTimeout(200);

  // Open find bar via toolbar button
  const findBtn = page.locator('button[aria-label="Find and replace"]');
  await findBtn.click();
  await expect(page.locator(".cm-find-bar")).toBeVisible({ timeout: 3_000 });

  return uniqueText;
}

/** Open the find bar using the toolbar button. */
async function openFindBar(page: Page) {
  const findBtn = page.locator('button[aria-label="Find and replace"]');
  await findBtn.click();
  await expect(page.locator(".cm-find-bar")).toBeVisible({ timeout: 3_000 });
}

// ---------------------------------------------------------------------------
// 4.4 Find & Replace
// ---------------------------------------------------------------------------

test.describe("4.4 Find & Replace", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await navigateToWorkspace(page);
    await ensureToolbarVisible(page);
  });

  // 4.4.1 Find & Replace button toggles FindReplaceBar visibility
  test("4.4.1 find replace button toggles bar visibility", async ({ page }, testInfo) => {
    const findBtn = page.locator('button[aria-label="Find and replace"]');
    await expect(findBtn).toBeVisible({ timeout: 5_000 });

    // Open the bar
    await findBtn.click();
    await expect(page.locator(".cm-find-bar")).toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.4.1-bar-open");

    // Close the bar by clicking the button again
    await findBtn.click();
    await expect(page.locator(".cm-find-bar")).not.toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.4.1-bar-closed");
  });

  // 4.4.2 Find input updates search term
  test("4.4.2 find input updates search term", async ({ page }, testInfo) => {
    await openFindBar(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await expect(findInput).toBeVisible();
    await findInput.fill("test search");
    await expect(findInput).toHaveValue("test search");

    await snap(page, testInfo, "4.4.2-search-term");
  });

  // 4.4.3 Matches highlighted inline (case-insensitive)
  test("4.4.3 matches are highlighted inline", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    // Verify decorations are applied
    const highlights = page.locator(".cm-find-match, .cm-find-active");
    await expect(highlights.first()).toBeVisible({ timeout: 3_000 });
    const count = await highlights.count();
    // We typed the text 3 times
    expect(count).toBe(3);

    await snap(page, testInfo, "4.4.3-highlighted-matches");
  });

  // 4.4.4 Match counter shows "X of Y"
  test("4.4.4 match counter shows X of Y", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    const matchCount = page.locator(".cm-find-count");
    await expect(matchCount).toContainText(/1 of 3/);

    await snap(page, testInfo, "4.4.4-match-counter");
  });

  // 4.4.5 Match counter shows "No results" when no matches
  test("4.4.5 match counter shows no results", async ({ page }, testInfo) => {
    await openFindBar(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill("zzzznonexistent_query_xyz");
    await page.waitForTimeout(300);

    const matchCount = page.locator(".cm-find-count");
    await expect(matchCount).toContainText("No results");

    await snap(page, testInfo, "4.4.5-no-results");
  });

  // 4.4.6 Next button navigates to next match
  test("4.4.6 next button navigates to next match", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    const matchCount = page.locator(".cm-find-count");
    await expect(matchCount).toContainText(/1 of 3/);

    // Click the next (down arrow) button
    const nextBtn = page.locator('.cm-find-btn[title="Next (Enter)"]');
    await nextBtn.click();
    await expect(matchCount).toContainText(/2 of 3/);

    await nextBtn.click();
    await expect(matchCount).toContainText(/3 of 3/);

    // Wrap around
    await nextBtn.click();
    await expect(matchCount).toContainText(/1 of 3/);

    await snap(page, testInfo, "4.4.6-next-button");
  });

  // 4.4.7 Previous button navigates to previous match
  test("4.4.7 previous button navigates to previous match", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    const matchCount = page.locator(".cm-find-count");
    await expect(matchCount).toContainText(/1 of 3/);

    // Click previous (up arrow) - should wrap to last
    const prevBtn = page.locator('.cm-find-btn[title="Previous (Shift+Enter)"]');
    await prevBtn.click();
    await expect(matchCount).toContainText(/3 of 3/);

    await prevBtn.click();
    await expect(matchCount).toContainText(/2 of 3/);

    await snap(page, testInfo, "4.4.7-prev-button");
  });

  // 4.4.8 Enter in find input goes to next match
  test("4.4.8 Enter in find input goes to next match", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    const matchCount = page.locator(".cm-find-count");
    await expect(matchCount).toContainText(/1 of 3/);

    // Press Enter in the find input
    await findInput.press("Enter");
    await expect(matchCount).toContainText(/2 of 3/);

    await snap(page, testInfo, "4.4.8-enter-next");
  });

  // 4.4.9 Shift+Enter in find input goes to previous match
  test("4.4.9 Shift+Enter in find input goes to previous match", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    const matchCount = page.locator(".cm-find-count");
    await expect(matchCount).toContainText(/1 of 3/);

    // Press Shift+Enter in the find input (should wrap to last)
    await findInput.press("Shift+Enter");
    await expect(matchCount).toContainText(/3 of 3/);

    await snap(page, testInfo, "4.4.9-shift-enter-prev");
  });

  // 4.4.10 Close button closes bar and clears search
  test("4.4.10 close button closes bar and clears search", async ({ page }, testInfo) => {
    await openFindBar(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill("test");
    await page.waitForTimeout(200);

    // Click close button
    const closeBtn = page.locator('.cm-find-btn[title="Close (Escape)"]');
    await closeBtn.click();

    // Bar should be hidden
    await expect(page.locator(".cm-find-bar")).not.toBeVisible({ timeout: 3_000 });

    // Search highlights should be removed
    await expect(page.locator(".cm-find-match")).not.toBeVisible();
    await expect(page.locator(".cm-find-active")).not.toBeVisible();

    await snap(page, testInfo, "4.4.10-bar-closed");
  });

  // 4.4.11 Escape in find input closes bar
  test("4.4.11 Escape in find input closes bar", async ({ page }, testInfo) => {
    await openFindBar(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill("test");
    await page.waitForTimeout(200);

    // Press Escape
    await findInput.press("Escape");
    await expect(page.locator(".cm-find-bar")).not.toBeVisible({ timeout: 3_000 });

    await snap(page, testInfo, "4.4.11-escape-closed");
  });

  // 4.4.12 Replace input updates replace text
  test("4.4.12 replace input updates replace text", async ({ page }, testInfo) => {
    await openFindBar(page);

    const replaceInput = page.locator('.cm-find-input[placeholder="Replace..."]');
    await expect(replaceInput).toBeVisible();
    await replaceInput.fill("replacement");
    await expect(replaceInput).toHaveValue("replacement");

    await snap(page, testInfo, "4.4.12-replace-input");
  });

  // 4.4.13 "Replace" button replaces current match
  test("4.4.13 replace button replaces current match", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    const matchCount = page.locator(".cm-find-count");
    await expect(matchCount).toContainText(/1 of 3/);

    // Fill in the replacement
    const replaceInput = page.locator('.cm-find-input[placeholder="Replace..."]');
    await replaceInput.fill("REPLACED");

    // Click Replace
    const replaceBtn = page.locator('.cm-find-btn[title="Replace"]');
    await replaceBtn.click();
    await page.waitForTimeout(300);

    // Match count should decrease by 1
    await expect(matchCount).toContainText(/of 2/);

    // Editor should now contain "REPLACED"
    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor).toContainText("REPLACED");

    await snap(page, testInfo, "4.4.13-replace-single");
  });

  // 4.4.14 "All" button replaces all matches
  test("4.4.14 replace all button replaces all matches", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    const matchCount = page.locator(".cm-find-count");
    await expect(matchCount).toContainText(/of 3/);

    // Fill replacement
    const replaceInput = page.locator('.cm-find-input[placeholder="Replace..."]');
    await replaceInput.fill("ALL_REPLACED");

    // Click Replace All
    const replaceAllBtn = page.locator('.cm-find-btn[title="Replace all"]');
    await replaceAllBtn.click();
    await page.waitForTimeout(300);

    // No more matches
    await expect(matchCount).toContainText("No results");

    // Editor should contain "ALL_REPLACED" three times
    const editor = page.locator(".tiptap, .ProseMirror").first();
    const text = await editor.textContent();
    const occurrences = (text?.match(/ALL_REPLACED/g) ?? []).length;
    expect(occurrences).toBe(3);

    await snap(page, testInfo, "4.4.14-replace-all");
  });

  // 4.4.15 Replace/All buttons disabled when no matches
  test("4.4.15 replace buttons disabled when no matches", async ({ page }, testInfo) => {
    await openFindBar(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill("zzz_nonexistent_xyz");
    await page.waitForTimeout(300);

    const replaceBtn = page.locator('.cm-find-btn[title="Replace"]');
    const replaceAllBtn = page.locator('.cm-find-btn[title="Replace all"]');

    await expect(replaceBtn).toBeDisabled();
    await expect(replaceAllBtn).toBeDisabled();

    await snap(page, testInfo, "4.4.15-replace-disabled");
  });

  // 4.4.16 Prev/Next buttons disabled when no matches
  test("4.4.16 prev next buttons disabled when no matches", async ({ page }, testInfo) => {
    await openFindBar(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill("zzz_nonexistent_xyz");
    await page.waitForTimeout(300);

    const prevBtn = page.locator('.cm-find-btn[title="Previous (Shift+Enter)"]');
    const nextBtn = page.locator('.cm-find-btn[title="Next (Enter)"]');

    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeDisabled();

    await snap(page, testInfo, "4.4.16-nav-disabled");
  });

  // 4.4.17 Active match visually distinct from other matches
  test("4.4.17 active match is visually distinct", async ({ page }, testInfo) => {
    const uniqueText = await typeContentAndOpenFind(page);

    const findInput = page.locator('.cm-find-input[placeholder="Find..."]');
    await findInput.fill(uniqueText);
    await page.waitForTimeout(300);

    // Active match should use .cm-find-active, others use .cm-find-match
    const activeMatch = page.locator(".cm-find-active");
    const regularMatches = page.locator(".cm-find-match");

    await expect(activeMatch).toHaveCount(1);
    await expect(regularMatches).toHaveCount(2);

    await snap(page, testInfo, "4.4.17-active-distinct");
  });

  // 4.4.18 Escape in replace input closes bar
  test("4.4.18 Escape in replace input closes bar", async ({ page }, testInfo) => {
    await openFindBar(page);

    const replaceInput = page.locator('.cm-find-input[placeholder="Replace..."]');
    await replaceInput.fill("test");
    await replaceInput.press("Escape");

    await expect(page.locator(".cm-find-bar")).not.toBeVisible({ timeout: 3_000 });
    await snap(page, testInfo, "4.4.18-escape-replace-closes");
  });
});
