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

/**
 * Navigate to a workspace by opening the documents page, clicking
 * through to the first available document, and landing on the workspace.
 * Returns the document id extracted from the URL.
 */
async function navigateToWorkspace(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");

  // Click the first document in the tree
  const docLink = page.locator(".tree-node-label").first();
  await expect(docLink).toBeVisible({ timeout: 10_000 });
  await docLink.click();

  // Wait for workspace to load (URL should contain /workspace/)
  await expect(page).toHaveURL(/\/workspace\//, { timeout: 15_000 });
  const url = page.url();
  const docId = url.split("/workspace/")[1]?.split(/[?#]/)[0] ?? "";
  return docId;
}

// ---------------------------------------------------------------------------
// 4.1 Page Loading
// ---------------------------------------------------------------------------

test.describe("4.1 Workspace Page Loading", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 4.1.1 Shows loading state during fetchWorkspace()
  test("4.1.1 shows loading state during workspace fetch", async ({ page }, testInfo) => {
    // Delay the workspace API response so we can observe the loading state
    await page.route("**/api/workspace/*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    // Navigate to a workspace URL (we need a valid doc id, so get one first)
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    const docLink = page.locator(".tree-node-label").first();
    await expect(docLink).toBeVisible({ timeout: 10_000 });
    await docLink.click();

    // During the delayed fetch, the loading state should be visible
    await expect(page.getByText("Loading workspace...")).toBeVisible({ timeout: 5_000 });
    await snap(page, testInfo, "4.1.1-loading-state");

    // Clean up route
    await page.unrouteAll({ behavior: "wait" });
  });

  // 4.1.2 Shows error state on fetch failure
  test("4.1.2 shows error state on fetch failure", async ({ page }, testInfo) => {
    // Intercept workspace fetch and fail it
    await page.route("**/api/workspace/*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    const docLink = page.locator(".tree-node-label").first();
    await expect(docLink).toBeVisible({ timeout: 10_000 });
    await docLink.click();

    // Error state should show
    await expect(page.getByText("Workspace failed to load")).toBeVisible({ timeout: 10_000 });
    await snap(page, testInfo, "4.1.2-error-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 4.1.3 Renders editor with document content on success
  test("4.1.3 renders editor with document content on success", async ({ page }, testInfo) => {
    await navigateToWorkspace(page);

    // Editor area should be visible
    await expect(page.locator(".cm-doc-area")).toBeVisible({ timeout: 10_000 });
    // The TipTap editor renders inside .tiptap or .ProseMirror
    await expect(page.locator(".tiptap, .ProseMirror").first()).toBeVisible({ timeout: 10_000 });
    await snap(page, testInfo, "4.1.3-editor-rendered");
  });

  // 4.1.4 Legacy content auto-converted via legacyContentToDoc()
  test("4.1.4 legacy content is rendered in editor", async ({ page }, testInfo) => {
    // Navigate to workspace and verify doc content is present
    await navigateToWorkspace(page);

    const editor = page.locator(".tiptap, .ProseMirror").first();
    await expect(editor).toBeVisible({ timeout: 10_000 });

    // Verify the editor has some text content (legacy content was converted)
    const textContent = await editor.textContent();
    // Editor should not be completely empty once loaded with document data
    expect(textContent?.length).toBeGreaterThan(0);
    await snap(page, testInfo, "4.1.4-legacy-content");
  });

  // 4.1.5 E2E: Open workspace for an existing document
  test("4.1.5 E2E open workspace for existing document", async ({ page }, testInfo) => {
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await snap(page, testInfo, "4.1.5-step1-documents");

    // Click on the first document
    const docLink = page.locator(".tree-node-label").first();
    await expect(docLink).toBeVisible({ timeout: 10_000 });
    const docTitle = await docLink.textContent();
    await docLink.click();

    // Should navigate to workspace
    await expect(page).toHaveURL(/\/workspace\//, { timeout: 15_000 });
    await snap(page, testInfo, "4.1.5-step2-workspace-loaded");

    // Breadcrumb should show the document title
    if (docTitle) {
      await expect(page.locator(".cm-breadcrumb-current")).toContainText(docTitle.trim().slice(0, 20));
    }

    // Editor should be present
    await expect(page.locator(".tiptap, .ProseMirror").first()).toBeVisible({ timeout: 10_000 });

    // Status bar should be present
    await expect(page.locator(".cm-statusbar")).toBeVisible();
    await snap(page, testInfo, "4.1.5-step3-full-workspace");
  });
});
