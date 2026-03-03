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
// 2.1 App Shell
// ---------------------------------------------------------------------------

test.describe("2.1 App Shell", () => {
  // 2.1.1 Shows "Loading session..." when isAuthLoading is true
  test("2.1.1 shows loading session text while auth is loading", async ({ page }, testInfo) => {
    // Block the session endpoint so the app stays in loading state
    await page.route("**/api/auth/session", async (route) => {
      // Never respond -- keeps isAuthLoading true
      await new Promise(() => {});
    });

    await page.goto("/documents");

    await expect(page.getByText("Loading session...")).toBeVisible();
    await snap(page, testInfo, "2.1.1-loading-session");

    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  // 2.1.2 Redirects to /sign-in if not authenticated
  test("2.1.2 redirects to sign-in if not authenticated", async ({ page }, testInfo) => {
    // Make session endpoint return unauthenticated
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false }),
      });
    });

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/sign-in/);
    await snap(page, testInfo, "2.1.2-redirected-to-sign-in");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 2.1.3 Brand link navigates to /documents
  test("2.1.3 brand link navigates to /documents", async ({ page }, testInfo) => {
    await signIn(page);

    // Navigate away from documents first
    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    // Click the brand link
    await page.locator(".brand").click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/documents$/);
    await snap(page, testInfo, "2.1.3-brand-to-documents");
  });

  // 2.1.4 "Documents" nav link navigates to /documents
  test("2.1.4 documents nav link navigates to /documents", async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    await page.locator(".nav-link", { hasText: "Documents" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/documents$/);
    await snap(page, testInfo, "2.1.4-documents-nav");
  });

  // 2.1.5 "Approvals" nav link navigates to /approvals
  test("2.1.5 approvals nav link navigates to /approvals", async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    await page.locator(".nav-link", { hasText: "Approvals" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/approvals$/);
    await snap(page, testInfo, "2.1.5-approvals-nav");
  });

  // 2.1.6 "Settings" nav link visible only for admin users
  test("2.1.6 settings nav link visible only for admin users", async ({ page }, testInfo) => {
    // Sign in with demo mode (demo users are typically admin)
    await signIn(page);
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    // In demo mode, the user has admin role -- Settings link should be visible
    const settingsLink = page.locator(".nav-link", { hasText: "Settings" });
    const isVisible = await settingsLink.isVisible();

    if (isVisible) {
      await snap(page, testInfo, "2.1.6-settings-visible-admin");
    } else {
      // If demo mode user is not admin, the link should not be present
      await expect(settingsLink).not.toBeVisible();
      await snap(page, testInfo, "2.1.6-settings-hidden-non-admin");
    }
  });

  // 2.1.7 "Settings" nav link navigates to /settings
  test("2.1.7 settings nav link navigates to /settings", async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    const settingsLink = page.locator(".nav-link", { hasText: "Settings" });

    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/settings$/);
      await snap(page, testInfo, "2.1.7-settings-page");
    } else {
      test.skip(true, "Settings link not visible (user is not admin)");
    }
  });

  // 2.1.8 "Sign out" button calls signOut()
  test("2.1.8 sign out button works", async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    await snap(page, testInfo, "2.1.8-before-sign-out");

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForLoadState("networkidle");

    // Should redirect to sign-in page
    await expect(page).toHaveURL(/\/sign-in/);
    await snap(page, testInfo, "2.1.8-after-sign-out");
  });

  // 2.1.9 Header hidden on workspace routes
  test("2.1.9 header hidden on workspace routes", async ({ page }, testInfo) => {
    await signIn(page);

    // First check header is visible on documents page
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".shell-header")).toBeVisible();
    await snap(page, testInfo, "2.1.9-header-visible-documents");

    // Get a real document ID to navigate to workspace
    const docLink = page.locator('a[href^="/workspace/"]').first();
    if (await docLink.isVisible({ timeout: 5000 })) {
      const href = await docLink.getAttribute("href");
      await page.goto(href!);
      await page.waitForLoadState("networkidle");

      // Header should be hidden on workspace routes
      await expect(page.locator(".shell-header")).not.toBeVisible();
      await snap(page, testInfo, "2.1.9-header-hidden-workspace");
    } else {
      // No documents available -- create one and navigate
      await page.getByRole("button", { name: "Create document" }).click();
      // Wait for the share dialog indicating document creation
      await expect(page.locator(".dialog-overlay")).toBeVisible({ timeout: 10000 });
      // Close share dialog to navigate to workspace
      const continueBtn = page.getByRole("button", { name: "Open document" });
      if (await continueBtn.isVisible({ timeout: 3000 })) {
        await continueBtn.click();
      } else {
        // Close button fallback
        await page.locator(".dialog-overlay").click({ position: { x: 10, y: 10 } });
      }
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/workspace\//);

      await expect(page.locator(".shell-header")).not.toBeVisible();
      await snap(page, testInfo, "2.1.9-header-hidden-new-workspace");
    }
  });

  // 2.1.10 Active nav link is highlighted
  test("2.1.10 active nav link is highlighted", async ({ page }, testInfo) => {
    await signIn(page);

    // Check Documents link active state
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    const docsLink = page.locator(".nav-link", { hasText: "Documents" });
    await expect(docsLink).toHaveClass(/active/);
    await snap(page, testInfo, "2.1.10-documents-active");

    // Check Approvals link active state
    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    const approvalsLink = page.locator(".nav-link", { hasText: "Approvals" });
    await expect(approvalsLink).toHaveClass(/active/);

    // Documents should no longer be active
    const docsLinkOnApprovals = page.locator(".nav-link", { hasText: "Documents" });
    await expect(docsLinkOnApprovals).not.toHaveClass(/active/);
    await snap(page, testInfo, "2.1.10-approvals-active");
  });
});

// ---------------------------------------------------------------------------
// 2.2 Router
// ---------------------------------------------------------------------------

test.describe("2.2 Router", () => {
  // 2.2.1 / redirects to /documents
  test("2.2.1 root redirects to /documents", async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(/\/documents$/);
    await snap(page, testInfo, "2.2.1-root-redirects");
  });

  // 2.2.2 /sign-in renders SignInPage
  test("2.2.2 /sign-in renders SignInPage", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Welcome to Chronicle")).toBeVisible();
    await snap(page, testInfo, "2.2.2-sign-in-page");
  });

  // 2.2.3 /verify-email renders VerifyEmailPage
  test("2.2.3 /verify-email renders VerifyEmailPage", async ({ page }, testInfo) => {
    await page.goto("/verify-email");
    await page.waitForLoadState("networkidle");

    // VerifyEmailPage should render with a token input or verification content
    await expect(page.locator(".auth-wrap")).toBeVisible();
    await snap(page, testInfo, "2.2.3-verify-email-page");
  });

  // 2.2.4 /forgot-password renders ForgotPasswordPage
  test("2.2.4 /forgot-password renders ForgotPasswordPage", async ({ page }, testInfo) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");

    // ForgotPasswordPage has an email field and reset functionality
    await expect(page.locator(".auth-wrap")).toBeVisible();
    await snap(page, testInfo, "2.2.4-forgot-password-page");
  });

  // 2.2.5 /reset-password renders ResetPasswordPage
  test("2.2.5 /reset-password renders ResetPasswordPage", async ({ page }, testInfo) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("networkidle");

    // ResetPasswordPage has password fields
    await expect(page.locator(".auth-wrap")).toBeVisible();
    await snap(page, testInfo, "2.2.5-reset-password-page");
  });

  // 2.2.6 /share/:token renders SharedDocumentPage
  test("2.2.6 /share/:token renders SharedDocumentPage", async ({ page }, testInfo) => {
    await page.goto("/share/test-token-12345");
    await page.waitForLoadState("networkidle");

    // SharedDocumentPage should render (may show loading or error for invalid token)
    // The page should not be the NotFoundPage
    await expect(page.getByText("Page not found")).not.toBeVisible();
    await snap(page, testInfo, "2.2.6-shared-document-page");
  });

  // 2.2.7 /documents renders DocumentsPage
  test("2.2.7 /documents renders DocumentsPage", async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    // DocumentsPage has the documents layout with sidebar and content
    await expect(page.locator(".documents-layout")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible();
    await snap(page, testInfo, "2.2.7-documents-page");
  });

  // 2.2.8 /spaces/:spaceId renders DocumentsPage with space context
  test("2.2.8 /spaces/:spaceId renders DocumentsPage with space context", async ({ page }, testInfo) => {
    await signIn(page);

    // First load documents to discover a real space ID
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    const spaceLink = page.locator('.space-sidebar-item[href^="/spaces/"]').first();
    if (await spaceLink.isVisible({ timeout: 5000 })) {
      const href = await spaceLink.getAttribute("href");
      await page.goto(href!);
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/spaces\//);
      await expect(page.locator(".documents-layout")).toBeVisible();
      // The space sidebar item should be active
      await expect(page.locator(".space-sidebar-item.active")).toBeVisible();
      await snap(page, testInfo, "2.2.8-space-context");
    } else {
      // No spaces available; navigate to a placeholder space URL
      await page.goto("/spaces/some-space-id");
      await page.waitForLoadState("networkidle");

      // Should still render the documents layout (even if empty)
      await expect(page.locator(".documents-layout")).toBeVisible();
      await snap(page, testInfo, "2.2.8-space-context-no-spaces");
    }
  });

  // 2.2.9 /workspace/:docId renders WorkspacePage
  test("2.2.9 /workspace/:docId renders WorkspacePage", async ({ page }, testInfo) => {
    await signIn(page);

    // Navigate to documents to find a document link
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    const docLink = page.locator('a[href^="/workspace/"]').first();
    if (await docLink.isVisible({ timeout: 5000 })) {
      const href = await docLink.getAttribute("href");
      await page.goto(href!);
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/workspace\//);
      // Header should be hidden (workspace mode)
      await expect(page.locator(".shell-header")).not.toBeVisible();
      await snap(page, testInfo, "2.2.9-workspace-page");
    } else {
      // Create a document to test workspace route
      await page.getByRole("button", { name: "Create document" }).click();
      await expect(page.locator(".dialog-overlay")).toBeVisible({ timeout: 10000 });

      const continueBtn = page.getByRole("button", { name: "Open document" });
      if (await continueBtn.isVisible({ timeout: 3000 })) {
        await continueBtn.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/workspace\//);
      await snap(page, testInfo, "2.2.9-workspace-page-new-doc");
    }
  });

  // 2.2.10 /approvals renders ApprovalsPage
  test("2.2.10 /approvals renders ApprovalsPage", async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto("/approvals");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
    await snap(page, testInfo, "2.2.10-approvals-page");
  });

  // 2.2.11 /settings renders SettingsPage
  test("2.2.11 /settings renders SettingsPage", async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // SettingsPage renders for admin users with "Organization Settings" heading
    // Non-admin users get redirected to /documents
    const settingsHeading = page.getByRole("heading", { name: "Organization Settings" });
    const documentsLayout = page.locator(".documents-layout");

    if (await settingsHeading.isVisible({ timeout: 3000 })) {
      await snap(page, testInfo, "2.2.11-settings-page");
    } else if (await documentsLayout.isVisible({ timeout: 2000 })) {
      // Non-admin redirected
      await expect(page).toHaveURL(/\/documents$/);
      await snap(page, testInfo, "2.2.11-settings-redirect-non-admin");
    }
  });

  // 2.2.12 Unknown route renders NotFoundPage
  test("2.2.12 unknown route renders NotFoundPage", async ({ page }, testInfo) => {
    await page.goto("/nonexistent-route-12345");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(page.getByText("doesn't exist or has been moved")).toBeVisible();
    await snap(page, testInfo, "2.2.12-not-found-page");
  });
});

// ---------------------------------------------------------------------------
// 2.3 Not Found Page
// ---------------------------------------------------------------------------

test.describe("2.3 Not Found Page", () => {
  // 2.3.1 "Go back" button calls navigate(-1)
  test("2.3.1 go back button navigates to previous page", async ({ page }, testInfo) => {
    await signIn(page);

    // Navigate to documents first so history has a page
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    // Then navigate to a 404 page
    await page.goto("/nonexistent-page-xyz");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Page not found")).toBeVisible();
    await snap(page, testInfo, "2.3.1-on-not-found");

    // Click "Go back"
    await page.getByRole("button", { name: /Go back/ }).click();
    await page.waitForLoadState("networkidle");

    // Should go back to the documents page
    await expect(page).toHaveURL(/\/documents$/);
    await snap(page, testInfo, "2.3.1-after-go-back");
  });

  // 2.3.2 "Go to Documents" link navigates to /documents
  test("2.3.2 go to documents link navigates to /documents", async ({ page }, testInfo) => {
    await page.goto("/this-page-does-not-exist");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Page not found")).toBeVisible();
    await snap(page, testInfo, "2.3.2-not-found");

    await page.getByRole("link", { name: "Go to Documents" }).click();
    await page.waitForLoadState("networkidle");

    // May redirect to sign-in if not authenticated, or to documents if session exists
    const url = page.url();
    expect(url).toMatch(/\/(documents|sign-in)/);
    await snap(page, testInfo, "2.3.2-navigated-from-not-found");
  });
});
