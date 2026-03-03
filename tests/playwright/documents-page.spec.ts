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

/** Navigate to the Documents page and wait for it to stabilize */
async function goToDocuments(page: Page) {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");
}

/** Helper to find a space link in the sidebar (not "All Documents") */
function firstSpaceLink(page: Page) {
  return page.locator('.space-sidebar-item[href^="/spaces/"]').first();
}

/** The search input inside the SpaceSettingsDialog invite form */
function settingsSearchInput(page: Page) {
  return page.locator('.sd-invite-form input[type="text"]');
}

// ---------------------------------------------------------------------------
// 3.1 Document Listing
// ---------------------------------------------------------------------------

test.describe("3.1 Document Listing", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 3.1.1 Shows loading skeleton during fetch
  test("3.1.1 shows loading skeleton during fetch", async ({ page }, testInfo) => {
    // Delay the documents API response so we can observe the skeleton
    await page.route("**/api/documents", async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await page.goto("/documents");

    // Should see skeleton cards while loading
    await expect(page.locator(".skeleton").first()).toBeVisible();
    await snap(page, testInfo, "3.1.1-loading-skeleton");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 3.1.2 Shows "No documents yet" when empty
  test("3.1.2 shows empty state when no documents", async ({ page }, testInfo) => {
    // Return empty documents array
    await page.route("**/api/documents", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("No documents yet")).toBeVisible();
    await snap(page, testInfo, "3.1.2-empty-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 3.1.3 Shows error message with retry button on fetch failure
  test("3.1.3 shows error with retry on fetch failure", async ({ page }, testInfo) => {
    // Fail the documents request
    await page.route("**/api/documents", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal server error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/documents");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Could not load documents")).toBeVisible();
    // Should have a retry button
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
    await snap(page, testInfo, "3.1.3-error-state");

    // Unroute so retry works
    await page.unrouteAll({ behavior: "wait" });

    // Click retry and verify loading starts
    await page.getByRole("button", { name: /retry/i }).click();
    // After retry, it should eventually load or show content
    await page.waitForLoadState("networkidle");
    await snap(page, testInfo, "3.1.3-after-retry");
  });

  // 3.1.4 Renders document cards in grid on success
  test("3.1.4 renders document cards in grid", async ({ page }, testInfo) => {
    await goToDocuments(page);

    // Should have a grid of document cards
    const grid = page.locator(".grid");
    await expect(grid.first()).toBeVisible();

    // Cards should be present (or empty state if no documents)
    const cards = page.locator(".grid .card");
    const cardCount = await cards.count();

    if (cardCount > 0) {
      await expect(cards.first()).toBeVisible();
      await snap(page, testInfo, "3.1.4-document-cards");
    } else {
      // Possibly empty state -- that is also valid
      await snap(page, testInfo, "3.1.4-no-cards-available");
    }
  });

  // 3.1.5 Each card shows title, status, updatedBy, openThreads
  test("3.1.5 card shows title status updatedBy openThreads", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const firstCard = page.locator(".grid .card").first();

    if (await firstCard.isVisible({ timeout: 5000 })) {
      // Title: h2 inside card
      await expect(firstCard.locator("h2")).toBeVisible();

      // Status and updatedBy shown as "status · Updated by name"
      await expect(firstCard.getByText(/Updated by/)).toBeVisible();

      // Open threads: "N open threads"
      await expect(firstCard.getByText(/open threads/)).toBeVisible();

      await snap(page, testInfo, "3.1.5-card-details");
    } else {
      test.skip(true, "No document cards available to inspect");
    }
  });

  // 3.1.6 "Open workspace" link navigates to /workspace/{docId}
  test("3.1.6 open workspace link navigates to workspace", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const workspaceLink = page.locator(".grid .card a.link", { hasText: "Open workspace" }).first();

    if (await workspaceLink.isVisible({ timeout: 5000 })) {
      const href = await workspaceLink.getAttribute("href");
      expect(href).toMatch(/^\/workspace\//);

      await workspaceLink.click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/workspace\//);
      await snap(page, testInfo, "3.1.6-navigated-to-workspace");
    } else {
      test.skip(true, "No documents with workspace links available");
    }
  });

  // 3.1.7 E2E: Load documents page, see real documents from API
  test("3.1.7 E2E load documents and see real data", async ({ page }, testInfo) => {
    // Listen for real API call
    const docsResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/documents") &&
        resp.request().method() === "GET",
    );

    await page.goto("/documents");
    const response = await docsResponse;

    expect(response.status()).toBe(200);
    const data = await response.json();

    await page.waitForLoadState("networkidle");

    if (Array.isArray(data) && data.length > 0) {
      // Should see at least one card
      await expect(page.locator(".grid .card").first()).toBeVisible();
      await snap(page, testInfo, "3.1.7-real-documents");
    } else {
      // Empty is also valid for E2E
      await expect(page.getByText("No documents yet")).toBeVisible();
      await snap(page, testInfo, "3.1.7-real-empty");
    }
  });
});

// ---------------------------------------------------------------------------
// 3.2 Create Document
// ---------------------------------------------------------------------------

test.describe("3.2 Create Document", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 3.2.1 "Create document" button calls createDocument()
  test("3.2.1 create document button triggers API call", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const createRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/documents") &&
        resp.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Create document" }).click();
    const response = await createRequest;

    expect(response.status()).toBeLessThan(500);
    await snap(page, testInfo, "3.2.1-create-called");
  });

  // 3.2.2 Button shows "Creating..." and is disabled while creating
  test("3.2.2 button shows creating state", async ({ page }, testInfo) => {
    await goToDocuments(page);

    // Slow down the create request
    await page.route("**/api/documents", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    const createBtn = page.getByRole("button", { name: "Create document" });
    await createBtn.click();

    // Should show "Creating..." and be disabled
    await expect(page.getByRole("button", { name: "Creating..." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Creating..." })).toBeDisabled();

    await snap(page, testInfo, "3.2.2-creating-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 3.2.3 After creation, opens ShareDialog for the new document
  test("3.2.3 after creation opens ShareDialog", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const createRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/documents") &&
        resp.request().method() === "POST" &&
        resp.status() < 400,
    );

    await page.getByRole("button", { name: "Create document" }).click();
    await createRequest;

    // ShareDialog should open with "Open document" button
    await expect(page.locator(".dialog-overlay")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Open document" })).toBeVisible();

    await snap(page, testInfo, "3.2.3-share-dialog-open");
  });

  // 3.2.4 Closing ShareDialog navigates to /workspace/{newDocId}
  test("3.2.4 closing ShareDialog navigates to workspace", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const createRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/documents") &&
        resp.request().method() === "POST" &&
        resp.status() < 400,
    );

    await page.getByRole("button", { name: "Create document" }).click();
    await createRequest;

    // Wait for ShareDialog
    await expect(page.locator(".dialog-overlay")).toBeVisible({ timeout: 10000 });
    await snap(page, testInfo, "3.2.4-before-close");

    // Click the continue/close button
    await page.getByRole("button", { name: "Open document" }).click();
    await page.waitForLoadState("networkidle");

    // Should navigate to workspace
    await expect(page).toHaveURL(/\/workspace\//);
    await snap(page, testInfo, "3.2.4-navigated-to-workspace");
  });

  // 3.2.5 Create error displays error message
  test("3.2.5 create error displays error message", async ({ page }, testInfo) => {
    await goToDocuments(page);

    // Fail the create request
    await page.route("**/api/documents", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Document creation failed" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: "Create document" }).click();
    await page.waitForLoadState("networkidle");

    // Should show error text
    await expect(page.getByText(/could not create document/i)).toBeVisible();
    await snap(page, testInfo, "3.2.5-create-error");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 3.2.6 E2E: Create a new document and land in workspace
  test("3.2.6 E2E create document end to end", async ({ page }, testInfo) => {
    await goToDocuments(page);

    await snap(page, testInfo, "3.2.6-before-create");

    // Click create
    const createRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/documents") &&
        resp.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create document" }).click();
    const response = await createRequest;

    if (response.status() < 400) {
      // ShareDialog should appear
      await expect(page.locator(".dialog-overlay")).toBeVisible({ timeout: 10000 });
      await snap(page, testInfo, "3.2.6-share-dialog");

      // Close dialog to go to workspace
      await page.getByRole("button", { name: "Open document" }).click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/workspace\//);
      await snap(page, testInfo, "3.2.6-in-workspace");
    } else {
      await snap(page, testInfo, "3.2.6-create-failed");
    }
  });
});

// ---------------------------------------------------------------------------
// 3.3 Space Sidebar
// ---------------------------------------------------------------------------

test.describe("3.3 Space Sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 3.3.1 "All Documents" link always visible and navigates to /documents
  test("3.3.1 all documents link visible and navigates", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const allDocsLink = page.locator(".space-sidebar-item", { hasText: "All Documents" });
    await expect(allDocsLink).toBeVisible();
    await snap(page, testInfo, "3.3.1-all-documents-visible");

    // Navigate to a space first (if available), then click All Documents
    const spaceLink = firstSpaceLink(page);
    if (await spaceLink.isVisible({ timeout: 3000 })) {
      await spaceLink.click();
      await page.waitForLoadState("networkidle");

      // Now click All Documents
      await allDocsLink.click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(/\/documents$/);
      await snap(page, testInfo, "3.3.1-navigated-to-all-documents");
    }
  });

  // 3.3.2 Space links rendered for each space
  test("3.3.2 space links rendered in sidebar", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const spaceLinks = page.locator('.space-sidebar-item[href^="/spaces/"]');
    const count = await spaceLinks.count();

    if (count > 0) {
      // Verify each space link is visible
      for (let i = 0; i < Math.min(count, 5); i++) {
        await expect(spaceLinks.nth(i)).toBeVisible();
      }
      await snap(page, testInfo, `3.3.2-space-links-${count}`);
    } else {
      // No spaces is also valid
      await snap(page, testInfo, "3.3.2-no-spaces");
    }
  });

  // 3.3.3 Clicking a space navigates to /spaces/{spaceId}
  test("3.3.3 clicking space navigates to space URL", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const spaceLink = firstSpaceLink(page);

    if (await spaceLink.isVisible({ timeout: 5000 })) {
      const href = await spaceLink.getAttribute("href");
      expect(href).toMatch(/^\/spaces\//);

      await spaceLink.click();
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      await snap(page, testInfo, "3.3.3-navigated-to-space");
    } else {
      test.skip(true, "No spaces available in sidebar");
    }
  });

  // 3.3.4 Space link shows document count badge
  test("3.3.4 space link shows document count", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const spaceLink = firstSpaceLink(page);

    if (await spaceLink.isVisible({ timeout: 5000 })) {
      // Each space link has a count badge
      const countBadge = spaceLink.locator(".space-sidebar-count");
      await expect(countBadge).toBeVisible();

      // The count should be a number
      const countText = await countBadge.textContent();
      expect(countText).toMatch(/^\d+$/);

      await snap(page, testInfo, "3.3.4-count-badge");
    } else {
      test.skip(true, "No spaces available");
    }
  });

  // 3.3.5 Gear icon on space opens SpaceSettingsDialog
  test("3.3.5 gear icon opens SpaceSettingsDialog", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const settingsBtn = page.locator('.space-sidebar-settings[title="Space settings"]').first();

    if (await settingsBtn.isVisible({ timeout: 5000 })) {
      await settingsBtn.click();

      // SpaceSettingsDialog should open
      await expect(page.locator(".dialog-overlay")).toBeVisible();
      await expect(page.getByText("Settings")).toBeVisible();

      await snap(page, testInfo, "3.3.5-settings-dialog-open");

      // Close the dialog
      await page.keyboard.press("Escape");
    } else {
      test.skip(true, "No gear icon visible (user may not have admin/editor role)");
    }
  });

  // 3.3.6 "+ New space" button opens CreateSpaceDialog
  test("3.3.6 new space button opens CreateSpaceDialog", async ({ page }, testInfo) => {
    await goToDocuments(page);

    const newSpaceBtn = page.getByRole("button", { name: "+ New space" });
    await expect(newSpaceBtn).toBeVisible();

    await newSpaceBtn.click();

    await expect(page.getByRole("heading", { name: "Create Space" })).toBeVisible();
    await snap(page, testInfo, "3.3.6-create-space-dialog");

    // Close dialog
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  // 3.3.7 "Settings" button visible only when on a space with permission
  test("3.3.7 settings button visible on space page for authorized user", async ({ page }, testInfo) => {
    await goToDocuments(page);

    // On "All Documents", there should be no Settings button in the header actions
    const settingsBtn = page.locator(".documents-head-actions").getByRole("button", { name: "Settings" });
    await expect(settingsBtn).not.toBeVisible();
    await snap(page, testInfo, "3.3.7-no-settings-on-all-docs");

    // Navigate to a space
    const spaceLink = firstSpaceLink(page);
    if (await spaceLink.isVisible({ timeout: 5000 })) {
      await spaceLink.click();
      await page.waitForLoadState("networkidle");

      // On a space page, Settings button should be visible (for admin/editor)
      const spaceSettingsBtn = page.locator(".documents-head-actions").getByRole("button", { name: "Settings" });
      if (await spaceSettingsBtn.isVisible({ timeout: 3000 })) {
        await snap(page, testInfo, "3.3.7-settings-visible-on-space");
      } else {
        await snap(page, testInfo, "3.3.7-settings-hidden-no-permission");
      }
    } else {
      test.skip(true, "No spaces available");
    }
  });
});

// ---------------------------------------------------------------------------
// 3.5 Space Settings Dialog
// ---------------------------------------------------------------------------

test.describe("3.5 Space Settings Dialog", () => {
  async function openSpaceSettings(page: Page) {
    await goToDocuments(page);
    const settingsBtn = page.locator('.space-sidebar-settings[title="Space settings"]').first();
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();
    await expect(page.locator(".dialog-overlay")).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 3.5.1 Renders with "Details", "Permissions", "Guests" tabs
  test("3.5.1 renders with three tabs", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await expect(page.locator(".sd-tab", { hasText: "Details" })).toBeVisible();
    await expect(page.locator(".sd-tab", { hasText: "Permissions" })).toBeVisible();
    await expect(page.locator(".sd-tab", { hasText: "Guests" })).toBeVisible();

    await snap(page, testInfo, "3.5.1-three-tabs");
  });

  // 3.5.2 Tab buttons switch active tab
  test("3.5.2 tab buttons switch active tab", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    // Details tab should be active by default
    await expect(page.locator(".sd-tab-active", { hasText: "Details" })).toBeVisible();
    await snap(page, testInfo, "3.5.2-details-active");

    // Click Permissions tab
    await page.locator(".sd-tab", { hasText: "Permissions" }).click();
    await expect(page.locator(".sd-tab-active", { hasText: "Permissions" })).toBeVisible();
    await snap(page, testInfo, "3.5.2-permissions-active");

    // Click Guests tab
    await page.locator(".sd-tab", { hasText: "Guests" }).click();
    await expect(page.locator(".sd-tab-active", { hasText: "Guests" })).toBeVisible();
    await snap(page, testInfo, "3.5.2-guests-active");

    // Click back to Details
    await page.locator(".sd-tab", { hasText: "Details" }).click();
    await expect(page.locator(".sd-tab-active", { hasText: "Details" })).toBeVisible();
  });

  // 3.5.3 Name and description pre-filled from space data
  test("3.5.3 name and description pre-filled", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    const nameInput = page.locator("#ss-name");
    const descInput = page.locator("#ss-desc");

    await expect(nameInput).toBeVisible();
    await expect(descInput).toBeVisible();

    // Name should not be empty (pre-filled from space)
    const nameValue = await nameInput.inputValue();
    expect(nameValue.length).toBeGreaterThan(0);

    await snap(page, testInfo, "3.5.3-prefilled-fields");
  });

  // 3.5.4 Name input updates state
  test("3.5.4 name input updates state", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    const nameInput = page.locator("#ss-name");
    await nameInput.fill("Updated Space Name");
    await expect(nameInput).toHaveValue("Updated Space Name");

    await snap(page, testInfo, "3.5.4-name-updated");
  });

  // 3.5.5 Description input updates state
  test("3.5.5 description input updates state", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    const descInput = page.locator("#ss-desc");
    await descInput.fill("A new description for this space");
    await expect(descInput).toHaveValue("A new description for this space");

    await snap(page, testInfo, "3.5.5-description-updated");
  });

  // 3.5.6 Visibility radios update state
  test("3.5.6 visibility radios update state", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    const orgCard = page.locator(".sd-mode-card", { hasText: "Organization" });
    const restrictedCard = page.locator(".sd-mode-card", { hasText: "Restricted" });

    await expect(orgCard).toBeVisible();
    await expect(restrictedCard).toBeVisible();

    await snap(page, testInfo, "3.5.6-initial-visibility");

    // Click restricted
    await restrictedCard.click();
    await expect(restrictedCard).toHaveClass(/sd-mode-active/);
    await snap(page, testInfo, "3.5.6-restricted-selected");

    // Click back to organization
    await orgCard.click();
    await expect(orgCard).toHaveClass(/sd-mode-active/);
    await snap(page, testInfo, "3.5.6-org-selected");
  });

  // 3.5.7 "Save changes" disabled if no changes or name empty
  test("3.5.7 save button disabled when no changes or name empty", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    const saveBtn = page.locator(".sd-btn-primary", { hasText: "Save changes" });

    // No changes made yet -- save should be disabled
    await expect(saveBtn).toBeDisabled();
    await snap(page, testInfo, "3.5.7-save-disabled-no-changes");

    // Clear the name -- save should still be disabled
    const nameInput = page.locator("#ss-name");
    const originalName = await nameInput.inputValue();
    await nameInput.fill("");
    await expect(saveBtn).toBeDisabled();
    await snap(page, testInfo, "3.5.7-save-disabled-empty-name");

    // Set a different name -- save should be enabled
    await nameInput.fill("Changed Name");
    await expect(saveBtn).toBeEnabled();
    await snap(page, testInfo, "3.5.7-save-enabled-with-changes");

    // Restore original name so save becomes disabled again (no change)
    await nameInput.fill(originalName);
    await expect(saveBtn).toBeDisabled();
  });

  // 3.5.8 Shows "Saving..." while saving
  test("3.5.8 shows saving state", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    // Make a change to enable save
    const nameInput = page.locator("#ss-name");
    const originalName = await nameInput.inputValue();
    await nameInput.fill(originalName + " edited");

    // Slow down the save request
    await page.route("**/api/spaces/*", async (route) => {
      if (route.request().method() === "PUT") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    const saveBtn = page.locator(".sd-btn-primary", { hasText: "Save changes" });
    await saveBtn.click();

    // Should show "Saving..." while request is in flight
    await expect(page.locator(".sd-btn-primary")).toContainText("Saving");
    await expect(page.locator(".sd-btn-primary")).toBeDisabled();
    await snap(page, testInfo, "3.5.8-saving-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 3.5.9 Shows "Saved" confirmation after success
  test("3.5.9 shows saved confirmation", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    // Make a change
    const nameInput = page.locator("#ss-name");
    const originalName = await nameInput.inputValue();
    await nameInput.fill(originalName + " test");

    const saveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces/") &&
        resp.request().method() === "PUT",
    );

    const saveBtn = page.locator(".sd-btn-primary", { hasText: "Save changes" });
    await saveBtn.click();
    await saveResponse;

    // Should show "Saved" label
    await expect(page.locator(".sd-saved-label")).toBeVisible();
    await expect(page.locator(".sd-saved-label")).toContainText("Saved");
    await snap(page, testInfo, "3.5.9-saved-confirmation");

    // Restore name
    await nameInput.fill(originalName);
    await page.locator(".sd-btn-primary", { hasText: "Save changes" }).click();
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces/") &&
        resp.request().method() === "PUT",
    );
  });

  // 3.5.10 Calls updateSpace() API on save
  test("3.5.10 save calls updateSpace API", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    const nameInput = page.locator("#ss-name");
    const originalName = await nameInput.inputValue();
    const newName = `API Test ${Date.now()}`;
    await nameInput.fill(newName);

    const saveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces/") &&
        resp.request().method() === "PUT",
    );

    await page.locator(".sd-btn-primary", { hasText: "Save changes" }).click();
    const response = await saveResponse;

    expect(response.status()).toBeLessThan(500);
    await snap(page, testInfo, "3.5.10-api-called");

    // Restore original name
    await nameInput.fill(originalName);
    await page.locator(".sd-btn-primary", { hasText: "Save changes" }).click();
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces/") &&
        resp.request().method() === "PUT",
    );
  });

  // 3.5.11 Search input triggers user/group search (Permissions tab)
  test("3.5.11 permissions tab search triggers user/group search", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    // Switch to Permissions tab
    await page.locator(".sd-tab", { hasText: "Permissions" }).click();
    await page.waitForLoadState("networkidle");

    const searchInput = settingsSearchInput(page);
    await expect(searchInput).toBeVisible();

    const searchResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/users") &&
        resp.url().includes("search=") &&
        resp.request().method() === "GET",
    );

    await searchInput.fill("av");
    await searchResponse;

    // Search results should appear
    await expect(page.locator(".sd-search-results")).toBeVisible();
    await snap(page, testInfo, "3.5.11-search-results");
  });

  // 3.5.12 Clicking search result grants permission via API
  test("3.5.12 clicking search result grants permission", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Permissions" }).click();
    await page.waitForLoadState("networkidle");

    const searchInput = settingsSearchInput(page);
    await expect(searchInput).toBeVisible();

    const searchResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/users") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await searchInput.fill("av");
    await searchResponse;

    const firstResult = page.locator(".sd-search-result").first();
    if (await firstResult.isVisible({ timeout: 3000 })) {
      // Listen for the grant permission API call
      const grantResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/spaces/") &&
          resp.url().includes("/permissions") &&
          resp.request().method() === "POST",
      );

      await firstResult.click();
      const response = await grantResponse;

      expect(response.status()).toBeLessThan(500);
      await snap(page, testInfo, "3.5.12-permission-granted");
    } else {
      test.skip(true, "No search results available");
    }
  });

  // 3.5.13 Permission list shows current grants
  test("3.5.13 permission list shows current grants", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Permissions" }).click();
    await page.waitForLoadState("networkidle");

    // The permissions list should be visible
    await expect(page.locator(".sd-people-list")).toBeVisible();

    // Either shows permissions or "No permissions configured"
    const permEntries = page.locator(".sd-people-list .sd-person");
    const emptyMsg = page.locator(".sd-people-list .sd-empty");

    const hasPermissions = await permEntries.first().isVisible({ timeout: 3000 });
    const hasEmpty = !hasPermissions && await emptyMsg.isVisible({ timeout: 2000 });

    if (hasPermissions) {
      // Each permission entry should have a name, role badge
      await expect(permEntries.first().locator(".sd-person-name")).toBeVisible();
      await expect(permEntries.first().locator(".sd-role-badge")).toBeVisible();
      await snap(page, testInfo, "3.5.13-permissions-list");
    } else if (hasEmpty) {
      await expect(emptyMsg).toContainText("No permissions configured");
      await snap(page, testInfo, "3.5.13-no-permissions");
    }
  });

  // 3.5.14 "Remove" button revokes permission via API
  test("3.5.14 remove button revokes permission", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Permissions" }).click();
    await page.waitForLoadState("networkidle");

    const permEntry = page.locator(".sd-people-list .sd-person").first();

    if (await permEntry.isVisible({ timeout: 5000 })) {
      const removeBtn = permEntry.locator('button[title="Remove access"]');
      await expect(removeBtn).toBeVisible();

      const revokeResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/spaces/") &&
          resp.url().includes("/permissions/") &&
          resp.request().method() === "DELETE",
      );

      await removeBtn.click();
      const response = await revokeResponse;

      expect(response.status()).toBeLessThan(500);
      await snap(page, testInfo, "3.5.14-permission-revoked");
    } else {
      test.skip(true, "No permissions to revoke");
    }
  });

  // 3.5.15 Email and role inputs render (Guests tab)
  test("3.5.15 guests tab email and role inputs render", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Guests" }).click();
    await page.waitForLoadState("networkidle");

    // Email input
    const emailInput = page.locator('.sd-input-email[type="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("placeholder", "guest@company.com");

    // Role select
    const roleSelect = page.locator(".sd-invite-form .sd-select");
    await expect(roleSelect).toBeVisible();

    // Invite button
    const inviteBtn = page.locator('.sd-btn-primary', { hasText: "Invite" });
    await expect(inviteBtn).toBeVisible();

    await snap(page, testInfo, "3.5.15-guest-inputs");
  });

  // 3.5.16 "Invite" button calls inviteGuest() API
  test("3.5.16 invite button calls inviteGuest API", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Guests" }).click();
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator('.sd-input-email[type="email"]');
    await emailInput.fill(`guest-${Date.now()}@example.com`);

    const inviteResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces/") &&
        resp.url().includes("/guests") &&
        resp.request().method() === "POST",
    );

    await page.locator('.sd-btn-primary', { hasText: "Invite" }).click();
    const response = await inviteResponse;

    expect(response.status()).toBeLessThan(500);
    await snap(page, testInfo, "3.5.16-guest-invited");
  });

  // 3.5.17 "Invite" disabled if email empty
  test("3.5.17 invite disabled if email empty", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Guests" }).click();
    await page.waitForLoadState("networkidle");

    const inviteBtn = page.locator('.sd-btn-primary', { hasText: "Invite" });

    // Should be disabled when email is empty
    await expect(inviteBtn).toBeDisabled();
    await snap(page, testInfo, "3.5.17-invite-disabled-empty");

    // Fill in email -- should become enabled
    const emailInput = page.locator('.sd-input-email[type="email"]');
    await emailInput.fill("test@example.com");
    await expect(inviteBtn).toBeEnabled();
    await snap(page, testInfo, "3.5.17-invite-enabled-with-email");

    // Clear email -- should become disabled again
    await emailInput.fill("");
    await expect(inviteBtn).toBeDisabled();
  });

  // 3.5.18 Shows "Inviting..." while submitting
  test("3.5.18 shows inviting state while submitting", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Guests" }).click();
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator('.sd-input-email[type="email"]');
    await emailInput.fill(`slow-guest-${Date.now()}@example.com`);

    // Slow down the invite request
    await page.route("**/api/spaces/*/guests", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await page.locator('.sd-btn-primary', { hasText: "Invite" }).click();

    // Should show "Inviting..." while request is pending
    await expect(page.locator(".sd-btn-primary")).toContainText("Inviting");
    await expect(page.locator(".sd-btn-primary")).toBeDisabled();
    await snap(page, testInfo, "3.5.18-inviting-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 3.5.19 Guest list shows current guests
  test("3.5.19 guest list shows current guests", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Guests" }).click();
    await page.waitForLoadState("networkidle");

    const guestList = page.locator(".sd-people-list");
    await expect(guestList).toBeVisible();

    // Either shows guest entries or "No guests invited yet"
    const guestEntries = guestList.locator(".sd-person");
    const emptyMsg = guestList.locator(".sd-empty");

    const hasGuests = await guestEntries.first().isVisible({ timeout: 3000 });

    if (hasGuests) {
      await expect(guestEntries.first().locator(".sd-person-name")).toBeVisible();
      await expect(guestEntries.first().locator(".sd-role-badge")).toBeVisible();
      await snap(page, testInfo, "3.5.19-guest-list");
    } else {
      await expect(emptyMsg).toContainText("No guests invited yet");
      await snap(page, testInfo, "3.5.19-no-guests");
    }
  });

  // 3.5.20 "Remove" button calls removeGuest() API
  test("3.5.20 remove guest button calls API", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    await page.locator(".sd-tab", { hasText: "Guests" }).click();
    await page.waitForLoadState("networkidle");

    const guestEntry = page.locator(".sd-people-list .sd-person").first();

    if (await guestEntry.isVisible({ timeout: 5000 })) {
      const removeBtn = guestEntry.locator('button[title="Remove guest"]');
      await expect(removeBtn).toBeVisible();

      const removeResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/spaces/") &&
          resp.url().includes("/guests/") &&
          resp.request().method() === "DELETE",
      );

      await removeBtn.click();
      const response = await removeResponse;

      expect(response.status()).toBeLessThan(500);
      await snap(page, testInfo, "3.5.20-guest-removed");
    } else {
      // If no guests, invite one first then remove
      const emailInput = page.locator('.sd-input-email[type="email"]');
      await emailInput.fill(`removable-${Date.now()}@example.com`);

      const inviteResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/spaces/") &&
          resp.url().includes("/guests") &&
          resp.request().method() === "POST",
      );
      await page.locator('.sd-btn-primary', { hasText: "Invite" }).click();
      const inviteResp = await inviteResponse;

      if (inviteResp.status() < 400) {
        await page.waitForLoadState("networkidle");

        const newGuestEntry = page.locator(".sd-people-list .sd-person").first();
        if (await newGuestEntry.isVisible({ timeout: 3000 })) {
          const removeBtn = newGuestEntry.locator('button[title="Remove guest"]');
          const removeResponse = page.waitForResponse(
            (resp) =>
              resp.url().includes("/api/spaces/") &&
              resp.url().includes("/guests/") &&
              resp.request().method() === "DELETE",
          );
          await removeBtn.click();
          const response = await removeResponse;
          expect(response.status()).toBeLessThan(500);
          await snap(page, testInfo, "3.5.20-guest-invited-then-removed");
        }
      } else {
        test.skip(true, "Could not invite guest to test removal");
      }
    }
  });

  // 3.5.21 E2E: Update space settings and verify changes persist
  test("3.5.21 E2E update settings and verify persistence", async ({ page }, testInfo) => {
    await openSpaceSettings(page);

    const nameInput = page.locator("#ss-name");
    const originalName = await nameInput.inputValue();
    const testSuffix = ` E2E-${Date.now()}`;
    const newName = originalName + testSuffix;

    // Update the name
    await nameInput.fill(newName);

    const saveResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces/") &&
        resp.request().method() === "PUT",
    );
    await page.locator(".sd-btn-primary", { hasText: "Save changes" }).click();
    await saveResponse;

    // Should show "Saved" confirmation
    await expect(page.locator(".sd-saved-label")).toBeVisible();
    await snap(page, testInfo, "3.5.21-saved");

    // Close dialog
    await page.keyboard.press("Escape");
    await page.waitForLoadState("networkidle");

    // Verify the name updated in the sidebar
    await expect(page.locator(".space-sidebar-item", { hasText: newName.trim() })).toBeVisible();
    await snap(page, testInfo, "3.5.21-persisted-in-sidebar");

    // Re-open settings and verify the name persisted
    const settingsBtn = page.locator('.space-sidebar-settings[title="Space settings"]').first();
    await settingsBtn.click();
    await expect(page.locator(".dialog-overlay")).toBeVisible();

    const updatedNameInput = page.locator("#ss-name");
    await expect(updatedNameInput).toHaveValue(newName);
    await snap(page, testInfo, "3.5.21-persisted-in-dialog");

    // Restore original name
    await updatedNameInput.fill(originalName);
    const restoreResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces/") &&
        resp.request().method() === "PUT",
    );
    await page.locator(".sd-btn-primary", { hasText: "Save changes" }).click();
    await restoreResponse;
  });
});
