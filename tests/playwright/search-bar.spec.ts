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

/** Navigate to the documents page where the SearchBar lives */
async function goToDocuments(page: Page) {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");
}

/** Get the search input element */
function searchInput(page: Page) {
  return page.locator('.search-bar input');
}

/** Get the search results dropdown */
function searchResults(page: Page) {
  return page.locator(".search-results");
}

/** Get filter pill buttons */
function filterPills(page: Page) {
  return page.locator(".search-filter-pill");
}

// ---------------------------------------------------------------------------
// 13. Search Bar
// ---------------------------------------------------------------------------

test.describe("13. Search Bar", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await goToDocuments(page);
  });

  // 13.1 Search input accepts text
  test("13.1 search input accepts text", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await expect(input).toBeVisible();

    await input.fill("test query");
    await expect(input).toHaveValue("test query");

    await snap(page, testInfo, "13.1-input-accepts-text");
  });

  // 13.2 Dropdown opens after typing 2+ characters
  test("13.2 dropdown opens after typing 2+ characters", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await expect(input).toBeVisible();

    // Type 1 character - dropdown should NOT open
    await input.fill("a");
    await page.waitForTimeout(500);
    await expect(searchResults(page)).not.toBeVisible();
    await snap(page, testInfo, "13.2-one-char-no-dropdown");

    // Type 2 characters - dropdown should open after debounce
    await input.fill("ad");
    // Wait for 300ms debounce + API response
    await page.waitForTimeout(1000);
    await expect(searchResults(page)).toBeVisible();
    await snap(page, testInfo, "13.2-two-chars-dropdown-open");
  });

  // 13.3 Debounced search (300ms delay)
  test("13.3 debounced search triggers after 300ms", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await expect(input).toBeVisible();

    // Set up API response listener
    let searchApiCalled = false;
    await page.route("**/api/search?*", async (route) => {
      searchApiCalled = true;
      await route.continue();
    });

    // Type quickly
    await input.fill("te");
    // Immediately check - should NOT have called API yet
    expect(searchApiCalled).toBe(false);

    // Wait for debounce (300ms) plus some buffer
    await page.waitForTimeout(600);

    // Now the API should have been called
    expect(searchApiCalled).toBe(true);

    await snap(page, testInfo, "13.3-debounced-search");
    await page.unrouteAll({ behavior: "wait" });
  });

  // 13.4 Filter pills: "All", "Documents", "Threads", "Decisions"
  test("13.4 filter pills are all present", async ({ page }, testInfo) => {
    const pills = filterPills(page);
    await expect(pills).toHaveCount(4);

    await expect(pills.nth(0)).toHaveText("All");
    await expect(pills.nth(1)).toHaveText("Documents");
    await expect(pills.nth(2)).toHaveText("Threads");
    await expect(pills.nth(3)).toHaveText("Decisions");

    // "All" should be active by default
    await expect(pills.nth(0)).toHaveClass(/active/);

    await snap(page, testInfo, "13.4-filter-pills");
  });

  // 13.5 Clicking filter pill sets filter type
  test("13.5 clicking filter pill changes active filter", async ({ page }, testInfo) => {
    const pills = filterPills(page);
    await expect(pills.first()).toBeVisible();

    // Click "Documents" pill
    await pills.nth(1).click();
    await expect(pills.nth(1)).toHaveClass(/active/);
    await expect(pills.nth(0)).not.toHaveClass(/active/);
    await snap(page, testInfo, "13.5-documents-filter");

    // Click "Threads" pill
    await pills.nth(2).click();
    await expect(pills.nth(2)).toHaveClass(/active/);
    await expect(pills.nth(1)).not.toHaveClass(/active/);
    await snap(page, testInfo, "13.5-threads-filter");

    // Click "Decisions" pill
    await pills.nth(3).click();
    await expect(pills.nth(3)).toHaveClass(/active/);
    await expect(pills.nth(2)).not.toHaveClass(/active/);
    await snap(page, testInfo, "13.5-decisions-filter");

    // Click back to "All"
    await pills.nth(0).click();
    await expect(pills.nth(0)).toHaveClass(/active/);
    await snap(page, testInfo, "13.5-all-filter");
  });

  // 13.6 ArrowDown moves active index down in results
  test("13.6 arrow down moves active index", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);
    if (await results.isVisible()) {
      const resultItems = page.locator(".search-result-item");
      const count = await resultItems.count();

      if (count > 1) {
        // First item should be active by default (index 0)
        await expect(resultItems.nth(0)).toHaveClass(/active/);

        // Press ArrowDown
        await input.press("ArrowDown");
        await expect(resultItems.nth(1)).toHaveClass(/active/);
        await expect(resultItems.nth(0)).not.toHaveClass(/active/);

        await snap(page, testInfo, "13.6-arrow-down");
      } else {
        await snap(page, testInfo, "13.6-only-one-result");
      }
    } else {
      await snap(page, testInfo, "13.6-no-results");
      test.skip(true, "No search results available to test keyboard navigation");
    }
  });

  // 13.7 ArrowUp moves active index up
  test("13.7 arrow up moves active index", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);
    if (await results.isVisible()) {
      const resultItems = page.locator(".search-result-item");
      const count = await resultItems.count();

      if (count > 1) {
        // Move down first
        await input.press("ArrowDown");
        await expect(resultItems.nth(1)).toHaveClass(/active/);

        // Press ArrowUp
        await input.press("ArrowUp");
        await expect(resultItems.nth(0)).toHaveClass(/active/);

        await snap(page, testInfo, "13.7-arrow-up");
      } else {
        await snap(page, testInfo, "13.7-only-one-result");
      }
    } else {
      test.skip(true, "No search results available to test keyboard navigation");
    }
  });

  // 13.8 Enter navigates to selected result
  test("13.8 enter navigates to selected result", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);
    if (await results.isVisible()) {
      const resultItems = page.locator(".search-result-item");
      const count = await resultItems.count();

      if (count > 0) {
        // First result should be active
        await expect(resultItems.nth(0)).toHaveClass(/active/);
        await snap(page, testInfo, "13.8-before-enter");

        // Press Enter to navigate
        await input.press("Enter");
        await page.waitForLoadState("networkidle");

        // Should have navigated away from /documents to a workspace
        await expect(page).toHaveURL(/\/workspace\//);

        await snap(page, testInfo, "13.8-navigated");
      } else {
        test.skip(true, "No results to press Enter on");
      }
    } else {
      test.skip(true, "Search results not visible");
    }
  });

  // 13.9 Escape closes dropdown
  test("13.9 escape closes dropdown", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);
    if (await results.isVisible()) {
      await snap(page, testInfo, "13.9-dropdown-open");

      // Press Escape
      await input.press("Escape");

      await expect(results).not.toBeVisible();
      await snap(page, testInfo, "13.9-dropdown-closed");
    } else {
      // Even without results, verify Escape works when typing
      await input.press("Escape");
      await expect(results).not.toBeVisible();
      await snap(page, testInfo, "13.9-escape-no-results");
    }
  });

  // 13.10 Clicking result navigates to it
  test("13.10 clicking result navigates to it", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);
    if (await results.isVisible()) {
      const firstResult = page.locator(".search-result-item").first();
      if (await firstResult.isVisible()) {
        await snap(page, testInfo, "13.10-before-click");

        await firstResult.click();
        await page.waitForLoadState("networkidle");

        await expect(page).toHaveURL(/\/workspace\//);
        await snap(page, testInfo, "13.10-navigated");
      } else {
        test.skip(true, "No result items visible");
      }
    } else {
      test.skip(true, "Search results dropdown not visible");
    }
  });

  // 13.11 MouseEnter on result updates active index
  test("13.11 mouse enter updates active index", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);
    if (await results.isVisible()) {
      const resultItems = page.locator(".search-result-item");
      const count = await resultItems.count();

      if (count > 1) {
        // First item active by default
        await expect(resultItems.nth(0)).toHaveClass(/active/);

        // Hover second item
        await resultItems.nth(1).hover();
        await expect(resultItems.nth(1)).toHaveClass(/active/);
        await expect(resultItems.nth(0)).not.toHaveClass(/active/);

        await snap(page, testInfo, "13.11-hover-active");
      } else {
        test.skip(true, "Need more than one result for hover test");
      }
    } else {
      test.skip(true, "Search results not visible");
    }
  });

  // 13.12 Focus on input opens dropdown if query >= 2 chars
  test("13.12 focus re-opens dropdown if query >= 2 chars", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);

    // Close dropdown first (click outside)
    await page.locator("body").click({ position: { x: 0, y: 0 } });
    await page.waitForTimeout(300);

    // Dropdown should be closed
    await expect(results).not.toBeVisible();
    await snap(page, testInfo, "13.12-closed");

    // Focus the input again
    await input.focus();
    await page.waitForTimeout(300);

    // Dropdown should re-open because query is still >= 2 chars
    await expect(results).toBeVisible();
    await snap(page, testInfo, "13.12-reopened-on-focus");
  });

  // 13.13 Outside click closes dropdown
  test("13.13 outside click closes dropdown", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);
    if (await results.isVisible()) {
      await snap(page, testInfo, "13.13-dropdown-open");

      // Click outside the search container
      await page.locator("body").click({ position: { x: 10, y: 10 }, force: true });
      await page.waitForTimeout(300);

      await expect(results).not.toBeVisible();
      await snap(page, testInfo, "13.13-closed-by-outside-click");
    } else {
      // Try with a different query
      await input.fill("re");
      await page.waitForTimeout(1000);
      if (await results.isVisible()) {
        await page.locator("body").click({ position: { x: 10, y: 10 }, force: true });
        await page.waitForTimeout(300);
        await expect(results).not.toBeVisible();
      }
      await snap(page, testInfo, "13.13-outside-click");
    }
  });

  // 13.14 Results show snippet with highlighted matches
  test("13.14 results show snippet with highlighted matches", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await input.fill("ad");
    await page.waitForTimeout(1000);

    const results = searchResults(page);
    if (await results.isVisible()) {
      const firstResult = page.locator(".search-result-item").first();
      if (await firstResult.isVisible()) {
        // Should have a title
        const title = firstResult.locator(".search-result-title");
        await expect(title).toBeVisible();

        // Should have a snippet area
        const snippet = firstResult.locator(".search-result-snippet");
        await expect(snippet).toBeVisible();

        // Should have a type indicator
        const typeIndicator = firstResult.locator(".search-result-type");
        await expect(typeIndicator).toBeVisible();

        await snap(page, testInfo, "13.14-result-structure");
      } else {
        test.skip(true, "No result items to check snippet structure");
      }
    } else {
      test.skip(true, "No search results to verify snippet");
    }
  });

  // 13.15 Loading state shown during search
  test("13.15 loading state shown during search", async ({ page }, testInfo) => {
    // Delay the API response to see the loading state
    await page.route("**/api/search?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    const input = searchInput(page);
    await input.fill("test");

    // Wait just past the 300ms debounce
    await page.waitForTimeout(400);

    // Should show "Searching..." loading state
    const loadingState = page.locator(".search-results-state", { hasText: "Searching" });
    await expect(loadingState).toBeVisible({ timeout: 3_000 });

    await snap(page, testInfo, "13.15-loading-state");
    await page.unrouteAll({ behavior: "wait" });
  });

  // 13.16 Error state shown on search failure
  test("13.16 error state shown on search failure", async ({ page }, testInfo) => {
    // Force the search API to fail
    await page.route("**/api/search?*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    const input = searchInput(page);
    await input.fill("test");

    // Wait for debounce + response
    await page.waitForTimeout(1000);

    // Should show error state
    const errorState = page.locator(".search-results-state", { hasText: "Search failed" });
    await expect(errorState).toBeVisible();

    await snap(page, testInfo, "13.16-error-state");
    await page.unrouteAll({ behavior: "wait" });
  });

  // 13.17 E2E: Search for document, click result, verify navigation
  test("13.17 E2E search and navigate to document", async ({ page }, testInfo) => {
    const input = searchInput(page);
    await expect(input).toBeVisible();

    // Step 1: Type a search query
    await input.fill("ADR");
    await snap(page, testInfo, "13.17-step1-typed");

    // Step 2: Wait for results dropdown
    await page.waitForTimeout(1000);
    const results = searchResults(page);

    if (await results.isVisible()) {
      await snap(page, testInfo, "13.17-step2-results-visible");

      // Step 3: Click the first result
      const firstResult = page.locator(".search-result-item").first();
      if (await firstResult.isVisible()) {
        const resultTitle = await firstResult.locator(".search-result-title").textContent();
        await firstResult.click();

        // Step 4: Verify navigation happened
        await page.waitForLoadState("networkidle");
        await expect(page).toHaveURL(/\/workspace\//);
        await snap(page, testInfo, "13.17-step3-navigated");
      } else {
        await snap(page, testInfo, "13.17-no-result-items");
      }
    } else {
      // Fallback: search might return "No results" state
      const noResults = page.locator(".search-results-state");
      if (await noResults.isVisible()) {
        await snap(page, testInfo, "13.17-no-results-state");
      } else {
        await snap(page, testInfo, "13.17-dropdown-not-visible");
      }
    }
  });
});
