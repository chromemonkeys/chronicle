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
 * Creates a new document and opens the ShareDialog that appears after creation.
 * Returns the document ID for further assertions.
 */
async function createDocumentAndOpenShareDialog(page: Page): Promise<string> {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");

  // Click "Create document" and wait for the API to return a new doc
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes("/api/documents") &&
      resp.request().method() === "POST" &&
      resp.status() >= 200 &&
      resp.status() < 300,
  );
  await page.getByRole("button", { name: "Create document" }).click();
  const resp = await createResponse;
  const body = await resp.json();
  const documentId: string = body.document?.id ?? body.id ?? "";

  // ShareDialog opens automatically after document creation
  await expect(page.locator(".dialog-overlay")).toBeVisible();
  // Wait for share data to load
  await page.waitForResponse(
    (r) => r.url().includes("/share") && r.request().method() === "GET",
  );

  return documentId;
}

/** Shortcut to locate the search input inside the ShareDialog */
function shareSearchInput(page: Page) {
  return page.locator('.sd-input-email');
}

// ---------------------------------------------------------------------------
// 9. Share Dialog
// ---------------------------------------------------------------------------

test.describe("9. Share Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 9.1 Dialog opens with document sharing info loaded
  test("9.1 dialog opens with document sharing info loaded", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Dialog title should mention "Share"
    await expect(page.locator(".dialog-header h3")).toContainText("Share");

    // Sections should be visible
    await expect(page.locator(".sd-section-label", { hasText: "General access" })).toBeVisible();
    await expect(page.locator(".sd-section-label", { hasText: "Add people or groups" })).toBeVisible();
    await expect(page.locator(".sd-section-label", { hasText: "People with access" })).toBeVisible();

    // Public links collapsible header should exist
    await expect(page.locator(".sd-collapsible-header", { hasText: "Public links" })).toBeVisible();

    await snap(page, testInfo, "9.1-dialog-loaded");
  });

  // 9.2 General access role dropdown changes access level
  test("9.2 general access role dropdown changes access level", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    const generalSelect = page.locator(".sd-general-access .sd-perm-role-select");
    await expect(generalSelect).toBeVisible();

    // Default should be "viewer" (space members can view)
    await snap(page, testInfo, "9.2-default-access");

    // Change to "No access" (private)
    const modeUpdate = page.waitForResponse(
      (r) => r.url().includes("/share-mode") && r.request().method() === "PUT",
    );
    await generalSelect.selectOption("none");
    await modeUpdate;

    // Label should update to indicate restricted
    await expect(page.locator(".sd-general-access-label small")).toContainText("Restricted");
    await snap(page, testInfo, "9.2-private-access");

    // Change back to viewer
    const modeUpdate2 = page.waitForResponse(
      (r) => r.url().includes("/share-mode") && r.request().method() === "PUT",
    );
    await generalSelect.selectOption("viewer");
    await modeUpdate2;

    await expect(page.locator(".sd-general-access-label small")).toContainText("view");
    await snap(page, testInfo, "9.2-viewer-access-restored");
  });

  // 9.3 Search input triggers debounced user/group search
  test("9.3 search triggers debounced user/group search", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    const searchField = shareSearchInput(page);
    await expect(searchField).toBeVisible();

    // Type a query and wait for the debounced search request
    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/share/search") &&
        resp.url().includes("q=") &&
        resp.request().method() === "GET",
    );
    await searchField.fill("av");
    await searchRequest;

    // Search dropdown should appear with results
    await expect(page.locator(".sd-search-dropdown")).toBeVisible();
    await expect(page.locator(".sd-search-item").first()).toBeVisible();

    await snap(page, testInfo, "9.3-search-results");
  });

  // 9.4 Clicking search result adds to direct permissions
  test("9.4 clicking search result adds user to permissions", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Search for users
    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/share/search") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await shareSearchInput(page).fill("av");
    await searchRequest;

    const firstResult = page.locator(".sd-search-item").first();
    await expect(firstResult).toBeVisible();
    const resultName = await firstResult.locator(".sd-search-item-name").textContent();

    // Click the result to add as a permission
    const grantRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/permissions") &&
        resp.request().method() === "POST",
    );
    await firstResult.click();
    await grantRequest;

    // Wait for share data reload
    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );

    // User should now appear in "People with access" list
    await expect(page.locator(".sd-person", { hasText: resultName! })).toBeVisible();

    // Search input should be cleared
    await expect(shareSearchInput(page)).toHaveValue("");

    await snap(page, testInfo, "9.4-user-added");
  });

  // 9.5 Add role dropdown changes role for new additions
  test("9.5 add role dropdown changes role for new additions", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Change role dropdown to "editor" before searching
    const roleSelect = page.locator(".sd-add-form > .sd-select");
    await roleSelect.selectOption("editor");

    await snap(page, testInfo, "9.5-editor-role-selected");

    // Search and add a user
    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/share/search") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await shareSearchInput(page).fill("av");
    await searchRequest;

    const firstResult = page.locator(".sd-search-item").first();
    if (await firstResult.isVisible({ timeout: 3000 })) {
      const grantRequest = page.waitForResponse(
        (resp) =>
          resp.url().includes("/permissions") &&
          resp.request().method() === "POST",
      );
      await firstResult.click();
      await grantRequest;

      // Wait for share data reload
      await page.waitForResponse(
        (r) => r.url().includes("/share") && r.request().method() === "GET",
      );

      // The added user should have "editor" role in the inline select
      const addedPerson = page.locator(".sd-person").first();
      await expect(addedPerson).toBeVisible();
      await expect(addedPerson.locator(".sd-perm-role-select")).toHaveValue("editor");
    }

    await snap(page, testInfo, "9.5-user-added-as-editor");
  });

  // 9.6 "Add" button grants permission by email (Enter key)
  test("9.6 add by email grants permission", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    const searchField = shareSearchInput(page);
    await searchField.fill("test-share@example.com");

    const addBtn = page.locator(".sd-add-form .sd-btn-primary", { hasText: "Add" });
    await expect(addBtn).toBeEnabled();

    const grantRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/permissions") &&
        resp.request().method() === "POST",
    );
    await addBtn.click();
    await grantRequest;

    // Search input should be cleared after adding
    await expect(shareSearchInput(page)).toHaveValue("");

    await snap(page, testInfo, "9.6-email-invite-sent");
  });

  // 9.7 Per-person role dropdown updates role via API
  test("9.7 inline role dropdown updates role via API", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // First add a user
    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/share/search") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await shareSearchInput(page).fill("av");
    await searchRequest;

    const firstResult = page.locator(".sd-search-item").first();
    if (!(await firstResult.isVisible({ timeout: 3000 }))) {
      test.skip(true, "No search results available to add a user");
      return;
    }

    const grantRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/permissions") &&
        resp.request().method() === "POST",
    );
    await firstResult.click();
    await grantRequest;

    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );

    // Now change the inline role
    const personRow = page.locator(".sd-person").first();
    await expect(personRow).toBeVisible();
    const inlineRoleSelect = personRow.locator(".sd-perm-role-select");

    const roleChangeRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/permissions") &&
        resp.request().method() === "POST",
    );
    await inlineRoleSelect.selectOption("commenter");
    await roleChangeRequest;

    await snap(page, testInfo, "9.7-role-changed-to-commenter");
  });

  // 9.8 Per-person "Remove" button revokes permission
  test("9.8 remove button revokes permission", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Add a user first
    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/share/search") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await shareSearchInput(page).fill("av");
    await searchRequest;

    const firstResult = page.locator(".sd-search-item").first();
    if (!(await firstResult.isVisible({ timeout: 3000 }))) {
      test.skip(true, "No search results available to add a user");
      return;
    }

    const grantRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/permissions") &&
        resp.request().method() === "POST",
    );
    await firstResult.click();
    await grantRequest;

    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );

    // Verify user is listed
    const personRow = page.locator(".sd-person").first();
    await expect(personRow).toBeVisible();
    await snap(page, testInfo, "9.8-before-remove");

    // Click the remove button (X icon with title "Remove access")
    const revokeRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/permissions/") &&
        resp.request().method() === "DELETE",
    );
    await personRow.locator('button[title="Remove access"]').click();
    await revokeRequest;

    // Wait for share data reload
    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );

    // Should show empty state
    await expect(page.locator(".sd-empty", { hasText: "No one has been given specific access yet" })).toBeVisible();
    await snap(page, testInfo, "9.8-after-remove");
  });

  // 9.9 "Create public link" button shows link form
  test("9.9 public links section expands and shows new link form", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Expand the public links section
    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();

    // Should show "New link" button
    const newLinkBtn = page.locator(".sd-btn-ghost", { hasText: "New link" });
    await expect(newLinkBtn).toBeVisible();
    await snap(page, testInfo, "9.9-links-expanded");

    // Click "New link" to show the form
    await newLinkBtn.click();
    await expect(page.locator(".sd-link-form")).toBeVisible();
    await expect(page.locator(".sd-field-label", { hasText: "Access level" })).toBeVisible();
    await expect(page.locator(".sd-field-label", { hasText: "Password" })).toBeVisible();
    await expect(page.locator(".sd-field-label", { hasText: "Expires" })).toBeVisible();

    await snap(page, testInfo, "9.9-link-form-shown");
  });

  // 9.10 Link role dropdown selects viewer/commenter
  test("9.10 link role dropdown selects viewer or commenter", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Expand public links and open form
    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();
    await page.locator(".sd-btn-ghost", { hasText: "New link" }).click();
    await expect(page.locator(".sd-link-form")).toBeVisible();

    const linkRoleSelect = page.locator(".sd-link-form .sd-select").first();

    // Default should be "viewer"
    await expect(linkRoleSelect).toHaveValue("viewer");
    await snap(page, testInfo, "9.10-viewer-default");

    // Change to commenter
    await linkRoleSelect.selectOption("commenter");
    await expect(linkRoleSelect).toHaveValue("commenter");
    await snap(page, testInfo, "9.10-commenter-selected");
  });

  // 9.11 Password input sets optional password
  test("9.11 password input sets optional password", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();
    await page.locator(".sd-btn-ghost", { hasText: "New link" }).click();
    await expect(page.locator(".sd-link-form")).toBeVisible();

    const passwordInput = page.locator('.sd-link-form input[type="password"]');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill("secret123");
    await expect(passwordInput).toHaveValue("secret123");

    await snap(page, testInfo, "9.11-password-set");
  });

  // 9.12 Expiry date input sets optional expiry
  test("9.12 expiry dropdown sets optional expiry", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();
    await page.locator(".sd-btn-ghost", { hasText: "New link" }).click();
    await expect(page.locator(".sd-link-form")).toBeVisible();

    // The expiry select is the last .sd-select inside the link form
    const expirySelect = page.locator(".sd-link-form .sd-field").nth(2).locator(".sd-select");
    await expect(expirySelect).toHaveValue("");

    await expirySelect.selectOption("7d");
    await expect(expirySelect).toHaveValue("7d");

    await snap(page, testInfo, "9.12-expiry-7-days");
  });

  // 9.13 "Create link" button calls createPublicLink()
  test("9.13 create link button creates public link", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Expand and open form
    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();
    await page.locator(".sd-btn-ghost", { hasText: "New link" }).click();
    await expect(page.locator(".sd-link-form")).toBeVisible();

    // Click "Create link"
    const createLinkRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/public-links") &&
        resp.request().method() === "POST",
    );
    await page.locator(".sd-link-form .sd-btn-primary", { hasText: "Create link" }).click();
    await createLinkRequest;

    // Wait for share data reload
    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );

    // Form should close; link should appear in the links list
    await expect(page.locator(".sd-link-form")).not.toBeVisible();
    await expect(page.locator(".sd-link-row").first()).toBeVisible();

    await snap(page, testInfo, "9.13-link-created");
  });

  // 9.14 "Cancel" button hides link form
  test("9.14 cancel button hides link form", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();
    await page.locator(".sd-btn-ghost", { hasText: "New link" }).click();
    await expect(page.locator(".sd-link-form")).toBeVisible();

    await snap(page, testInfo, "9.14-form-visible");

    // Click Cancel
    await page.locator(".sd-link-form-actions .sd-btn-ghost", { hasText: "Cancel" }).click();
    await expect(page.locator(".sd-link-form")).not.toBeVisible();

    await snap(page, testInfo, "9.14-form-hidden");
  });

  // 9.15 Existing links: copy button copies URL to clipboard and shows "Copied!"
  test("9.15 copy button shows Copied feedback", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Create a link first
    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();
    await page.locator(".sd-btn-ghost", { hasText: "New link" }).click();

    const createLinkRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/public-links") &&
        resp.request().method() === "POST",
    );
    await page.locator(".sd-link-form .sd-btn-primary", { hasText: "Create link" }).click();
    await createLinkRequest;

    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );

    // Link row should be visible
    const linkRow = page.locator(".sd-link-row").first();
    await expect(linkRow).toBeVisible();

    // Grant clipboard permissions and click Copy
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const copyBtn = linkRow.locator(".sd-btn-ghost", { hasText: "Copy" });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Should show "Copied" text
    await expect(linkRow.locator(".sd-btn-ghost", { hasText: "Copied" })).toBeVisible();

    await snap(page, testInfo, "9.15-copied-feedback");
  });

  // 9.16 Existing links: "Revoke" button calls revokePublicLink()
  test("9.16 revoke button removes public link", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    // Create a link first
    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();
    await page.locator(".sd-btn-ghost", { hasText: "New link" }).click();

    const createLinkRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/public-links") &&
        resp.request().method() === "POST",
    );
    await page.locator(".sd-link-form .sd-btn-primary", { hasText: "Create link" }).click();
    await createLinkRequest;

    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );

    // Verify link exists
    const linkRow = page.locator(".sd-link-row").first();
    await expect(linkRow).toBeVisible();
    await snap(page, testInfo, "9.16-before-revoke");

    // Click the revoke button (trash icon with title "Revoke link")
    const revokeRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/public-links/") &&
        resp.request().method() === "DELETE",
    );
    await linkRow.locator('button[title="Revoke link"]').click();
    await revokeRequest;

    // Wait for share data reload
    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );

    // Should show "No public links yet"
    await expect(page.locator(".sd-empty", { hasText: "No public links yet" })).toBeVisible();
    await snap(page, testInfo, "9.16-after-revoke");
  });

  // 9.17 Links expand/collapse toggle works
  test("9.17 links expand and collapse toggle", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    const collapseBtn = page.locator(".sd-collapsible-header", { hasText: "Public links" });

    // Initially collapsed - links list not visible
    await expect(page.locator(".sd-links-list")).not.toBeVisible();
    await snap(page, testInfo, "9.17-collapsed");

    // Expand
    await collapseBtn.click();
    await expect(page.locator(".sd-links-list")).toBeVisible();
    await snap(page, testInfo, "9.17-expanded");

    // Collapse again
    await collapseBtn.click();
    await expect(page.locator(".sd-links-list")).not.toBeVisible();
    await snap(page, testInfo, "9.17-re-collapsed");
  });

  // 9.19 Close button closes dialog
  test("9.19 close button closes dialog", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    await expect(page.locator(".dialog-overlay")).toBeVisible();
    await snap(page, testInfo, "9.19-dialog-open");

    // Click the close button in the dialog header
    await page.locator(".dialog-close").click();

    await expect(page.locator(".dialog-overlay")).not.toBeVisible();
    await snap(page, testInfo, "9.19-dialog-closed");
  });

  // 9.20 Escape key closes dialog
  test("9.20 escape key closes dialog", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);

    await expect(page.locator(".dialog-overlay")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator(".dialog-overlay")).not.toBeVisible();
    await snap(page, testInfo, "9.20-escaped");
  });

  // 9.21 E2E: Share document with user, create public link, revoke
  test("9.21 E2E: share document, create link, revoke", async ({ page }, testInfo) => {
    await createDocumentAndOpenShareDialog(page);
    await snap(page, testInfo, "9.21-01-dialog-open");

    // Step 1: Change general access to private
    const generalSelect = page.locator(".sd-general-access .sd-perm-role-select");
    const modeUpdate = page.waitForResponse(
      (r) => r.url().includes("/share-mode") && r.request().method() === "PUT",
    );
    await generalSelect.selectOption("none");
    await modeUpdate;
    await expect(page.locator(".sd-general-access-label small")).toContainText("Restricted");
    await snap(page, testInfo, "9.21-02-private-mode");

    // Step 2: Search and add a user
    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/share/search") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await shareSearchInput(page).fill("av");
    await searchRequest;

    const firstResult = page.locator(".sd-search-item").first();
    if (await firstResult.isVisible({ timeout: 3000 })) {
      const grantRequest = page.waitForResponse(
        (resp) =>
          resp.url().includes("/permissions") &&
          resp.request().method() === "POST",
      );
      await firstResult.click();
      await grantRequest;

      await page.waitForResponse(
        (r) => r.url().includes("/share") && r.request().method() === "GET",
      );
      await expect(page.locator(".sd-person").first()).toBeVisible();
      await snap(page, testInfo, "9.21-03-user-shared");
    }

    // Step 3: Create a public link
    await page.locator(".sd-collapsible-header", { hasText: "Public links" }).click();
    await page.locator(".sd-btn-ghost", { hasText: "New link" }).click();
    await expect(page.locator(".sd-link-form")).toBeVisible();

    const createLinkRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/public-links") &&
        resp.request().method() === "POST",
    );
    await page.locator(".sd-link-form .sd-btn-primary", { hasText: "Create link" }).click();
    await createLinkRequest;

    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );
    await expect(page.locator(".sd-link-row").first()).toBeVisible();
    await snap(page, testInfo, "9.21-04-link-created");

    // Step 4: Revoke the public link
    const revokeRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/public-links/") &&
        resp.request().method() === "DELETE",
    );
    await page.locator(".sd-link-row").first().locator('button[title="Revoke link"]').click();
    await revokeRequest;

    await page.waitForResponse(
      (r) => r.url().includes("/share") && r.request().method() === "GET",
    );
    await expect(page.locator(".sd-empty", { hasText: "No public links yet" })).toBeVisible();
    await snap(page, testInfo, "9.21-05-link-revoked");

    // Step 5: Close the dialog via the "Open document" continue button
    const continueBtn = page.locator(".sd-btn-continue");
    if (await continueBtn.isVisible({ timeout: 2000 })) {
      await continueBtn.click();
      await expect(page.locator(".dialog-overlay")).not.toBeVisible();
      // Should navigate to workspace
      await expect(page).toHaveURL(/\/workspace\//);
    } else {
      await page.locator(".dialog-close").click();
      await expect(page.locator(".dialog-overlay")).not.toBeVisible();
    }
    await snap(page, testInfo, "9.21-06-workflow-complete");
  });
});
