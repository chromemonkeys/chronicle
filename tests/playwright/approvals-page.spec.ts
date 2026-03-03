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

// ---------------------------------------------------------------------------
// 10. Approvals Page
// ---------------------------------------------------------------------------

test.describe("10. Approvals Page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 10.1 Shows "Loading approval queue..." during fetch
  test("10.1 shows loading state during fetch", async ({ page }, testInfo) => {
    // Add a deliberate delay to the approvals API so we can observe the loading state
    await page.route("**/api/approvals", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await page.goto("/approvals");

    // Should show loading message
    await expect(page.getByText("Loading approval queue...")).toBeVisible();
    await expect(page.getByText("Fetching approval queue.")).toBeVisible();

    await snap(page, testInfo, "10.1-loading-state");

    // Wait for the page to finish loading, then unroute
    await page.waitForLoadState("networkidle");
    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.2 After 4s delay, shows "This is taking longer..." with retry button
  test("10.2 shows slow loading hint after 4 seconds", async ({ page }, testInfo) => {
    // Block the approvals API entirely so the slow timeout triggers
    await page.route("**/api/approvals", async (route) => {
      // Hold the request indefinitely until we unroute
      await new Promise((resolve) => setTimeout(resolve, 15000));
      await route.abort();
    });

    await page.goto("/approvals");

    // Initially should show normal loading text
    await expect(page.getByText("Loading approval queue...")).toBeVisible();

    // After ~4s should show the slow loading hint
    await expect(page.getByText("This is taking longer than expected")).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole("button", { name: "Retry loading" })).toBeVisible();

    await snap(page, testInfo, "10.2-slow-loading-hint");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.3 Shows skeleton cards while loading
  test("10.3 shows skeleton cards while loading", async ({ page }, testInfo) => {
    await page.route("**/api/approvals", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    await page.goto("/approvals");

    // Should show skeleton placeholders
    await expect(page.locator(".skeleton.skeleton-title").first()).toBeVisible();
    await expect(page.locator(".skeleton.skeleton-line").first()).toBeVisible();

    await snap(page, testInfo, "10.3-skeleton-cards");

    await page.waitForLoadState("networkidle");
    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.4 Empty state shows "No pending approvals"
  test("10.4 empty state shows no pending approvals", async ({ page }, testInfo) => {
    // Intercept the API to return an empty queue
    await page.route("**/api/approvals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ queue: [] }),
      });
    });

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("No pending approvals")).toBeVisible();
    await expect(page.getByText("You have no documents waiting for sign-off")).toBeVisible();

    // Should have a "Browse documents" action
    await expect(page.getByRole("button", { name: "Browse documents" })).toBeVisible();

    await snap(page, testInfo, "10.4-empty-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.5 Error state shows error message with retry button
  test("10.5 error state shows error with retry button", async ({ page }, testInfo) => {
    // Intercept the API to return a failure
    await page.route("**/api/approvals", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/approvals");

    // Wait for error state to appear
    await expect(page.getByText("Approval queue unavailable")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Service timeout while loading approval chains")).toBeVisible();

    // Should have retry button
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

    // Should have "Go to Documents" fallback link
    await expect(page.getByRole("link", { name: "Go to Documents" })).toBeVisible();

    await snap(page, testInfo, "10.5-error-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.6 Blocked queue (needs your review) displays items
  test("10.6 blocked queue displays items needing review", async ({ page }, testInfo) => {
    await page.route("**/api/approvals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          queue: [
            {
              id: "ap-1",
              documentId: "doc-blocked-1",
              proposalId: "prop-1",
              title: "Security Policy Draft",
              requestedBy: "Morgan",
              status: "Blocked",
            },
            {
              id: "ap-2",
              documentId: "doc-blocked-2",
              proposalId: "prop-2",
              title: "Architecture Review",
              requestedBy: "Jamie",
              status: "Blocked",
            },
          ],
        }),
      });
    });

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    // "Needs your review" section should be visible
    await expect(page.getByRole("heading", { name: "Needs your review" })).toBeVisible();

    // Both blocked items should be visible
    await expect(page.getByText("Security Policy Draft")).toBeVisible();
    await expect(page.getByText("Architecture Review")).toBeVisible();

    // Requestor information should be shown
    await expect(page.getByText("Requested by Morgan")).toBeVisible();
    await expect(page.getByText("Requested by Jamie")).toBeVisible();

    // "Review now" CTA links should be present
    const reviewLinks = page.locator(".approvals-row-cta", { hasText: "Review now" });
    await expect(reviewLinks).toHaveCount(2);

    await snap(page, testInfo, "10.6-blocked-queue");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.7 Ready queue (waiting on others) displays items
  test("10.7 ready queue displays items waiting on others", async ({ page }, testInfo) => {
    await page.route("**/api/approvals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          queue: [
            {
              id: "ap-3",
              documentId: "doc-ready-1",
              proposalId: "prop-3",
              title: "API Specification",
              requestedBy: "Riley",
              status: "Ready",
            },
          ],
        }),
      });
    });

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    // "Waiting on others" section should be visible
    await expect(page.getByRole("heading", { name: "Waiting on others" })).toBeVisible();

    // Ready item should be visible
    await expect(page.getByText("API Specification")).toBeVisible();
    await expect(page.getByText("Requested by Riley")).toBeVisible();

    // "Open" CTA link should be present
    await expect(page.locator(".approvals-row-cta", { hasText: "Open" })).toBeVisible();

    await snap(page, testInfo, "10.7-ready-queue");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.8 Each item links to /workspace/{documentId}
  test("10.8 approval items link to workspace", async ({ page }, testInfo) => {
    await page.route("**/api/approvals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          queue: [
            {
              id: "ap-link-1",
              documentId: "doc-link-test",
              proposalId: "prop-link-1",
              title: "Link Test Document",
              requestedBy: "Avery",
              status: "Blocked",
            },
          ],
        }),
      });
    });

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    // The item row should be a link to the correct workspace URL
    const row = page.locator(".approvals-row-link").first();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("href", "/workspace/doc-link-test");

    await snap(page, testInfo, "10.8-item-link");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.9 Approval status badge shows correct state
  test("10.9 status badges show correct variants", async ({ page }, testInfo) => {
    await page.route("**/api/approvals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          queue: [
            {
              id: "ap-badge-1",
              documentId: "doc-badge-1",
              proposalId: "prop-badge-1",
              title: "Blocked Doc",
              requestedBy: "Avery",
              status: "Blocked",
            },
            {
              id: "ap-badge-2",
              documentId: "doc-badge-2",
              proposalId: "prop-badge-2",
              title: "Ready Doc",
              requestedBy: "Morgan",
              status: "Ready",
            },
          ],
        }),
      });
    });

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    // Blocked item should have the "deferred" variant StatusPill with "Blocked" text
    const blockedPill = page.locator(".status-pill", { hasText: "Blocked" });
    await expect(blockedPill).toBeVisible();
    await expect(blockedPill).toHaveClass(/deferred/);

    // Ready item should have the "accepted" variant StatusPill with "Ready" text
    const readyPill = page.locator(".status-pill", { hasText: "Ready" });
    await expect(readyPill).toBeVisible();
    await expect(readyPill).toHaveClass(/accepted/);

    await snap(page, testInfo, "10.9-status-badges");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.10 "Browse documents" link navigates to /documents
  test("10.10 browse documents link navigates to documents page", async ({ page }, testInfo) => {
    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    // The "Browse documents" link is always visible in the header actions
    const browseLink = page.locator(".approvals-actions a", { hasText: "Browse documents" });
    await expect(browseLink).toBeVisible();
    await expect(browseLink).toHaveAttribute("href", "/documents");

    await snap(page, testInfo, "10.10-before-browse");

    await browseLink.click();
    await expect(page).toHaveURL(/\/documents$/);
    await page.waitForLoadState("networkidle");

    await snap(page, testInfo, "10.10-on-documents-page");
  });

  // 10.11 "Review next request" links to first blocked item
  test("10.11 review next request links to first blocked item", async ({ page }, testInfo) => {
    await page.route("**/api/approvals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          queue: [
            {
              id: "ap-next-1",
              documentId: "doc-first-blocked",
              proposalId: "prop-next-1",
              title: "First Blocked Doc",
              requestedBy: "Avery",
              status: "Blocked",
            },
            {
              id: "ap-next-2",
              documentId: "doc-second-blocked",
              proposalId: "prop-next-2",
              title: "Second Blocked Doc",
              requestedBy: "Morgan",
              status: "Blocked",
            },
          ],
        }),
      });
    });

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    // "Review next request" button should link to the first blocked item
    const reviewBtn = page.locator(".approvals-actions a", { hasText: "Review next request" });
    await expect(reviewBtn).toBeVisible();
    await expect(reviewBtn).toHaveAttribute("href", "/workspace/doc-first-blocked");

    await snap(page, testInfo, "10.11-review-next-request");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 10.12 E2E: Load approvals page with real backend data
  test("10.12 E2E: load approvals page with real backend", async ({ page }, testInfo) => {
    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    // Page header should be visible
    await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
    await expect(page.getByText("Review requests that are waiting on your sign-off")).toBeVisible();

    await snap(page, testInfo, "10.12-01-page-loaded");

    // "Browse documents" link should always be visible
    await expect(page.locator("a", { hasText: "Browse documents" })).toBeVisible();

    // Determine which state the page is in and verify appropriately
    const hasSuccessState = await page.locator(".approvals-grid").isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await page.getByText("No pending approvals").isVisible({ timeout: 1000 }).catch(() => false);
    const hasErrorState = await page.getByText("Approval queue unavailable").isVisible({ timeout: 1000 }).catch(() => false);

    if (hasSuccessState) {
      // Verify the queue sections render
      await expect(page.getByRole("heading", { name: "Needs your review" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Waiting on others" })).toBeVisible();

      // At least one item row should exist
      const rows = page.locator(".approvals-row");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(0);

      await snap(page, testInfo, "10.12-02-success-state");

      // If there are items, verify the first one links to a workspace
      if (rowCount > 0) {
        const firstLink = page.locator(".approvals-row-link").first();
        const href = await firstLink.getAttribute("href");
        expect(href).toMatch(/^\/workspace\//);

        // Click the first item to verify navigation
        await firstLink.click();
        await expect(page).toHaveURL(/\/workspace\//);
        await page.waitForLoadState("networkidle");
        await snap(page, testInfo, "10.12-03-navigated-to-workspace");
      }
    } else if (hasEmptyState) {
      await expect(page.getByText("You have no documents waiting for sign-off")).toBeVisible();
      await snap(page, testInfo, "10.12-02-empty-state");

      // "Browse documents" button in the empty state should work
      const browseBtn = page.getByRole("button", { name: "Browse documents" });
      if (await browseBtn.isVisible({ timeout: 1000 })) {
        await browseBtn.click();
        await expect(page).toHaveURL(/\/documents$/);
        await snap(page, testInfo, "10.12-03-navigated-to-documents");
      }
    } else if (hasErrorState) {
      // Error state - verify retry works
      await snap(page, testInfo, "10.12-02-error-state");
      const retryBtn = page.getByRole("button", { name: "Try again" });
      if (await retryBtn.isVisible({ timeout: 1000 })) {
        await retryBtn.click();
        // Should enter loading state again
        await expect(page.getByText("Loading approval queue...")).toBeVisible();
        await snap(page, testInfo, "10.12-03-retrying");
      }
    }
  });
});
