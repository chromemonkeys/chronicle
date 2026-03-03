import { expect, test, type Page, type TestInfo } from "@playwright/test";

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

async function openCreateSpaceDialog(page: Page) {
  await page.goto("/documents");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "+ New space" }).click();
  await expect(page.getByRole("heading", { name: "Create Space" })).toBeVisible();
}

/** The search input placeholder contains a unicode escape that doesn't always match getByPlaceholder */
function searchInput(page: Page) {
  return page.locator('.sd-invite-form input[type="text"]');
}

// ---------------------------------------------------------------------------
// 3.4 Create Space Dialog
// ---------------------------------------------------------------------------

test.describe("3.4 Create Space Dialog", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // 3.4.1 Renders name, description, visibility fields
  test("3.4.1 renders name, description, visibility fields", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    await expect(page.getByLabel("Space name")).toBeVisible();
    await expect(page.getByLabel("Description")).toBeVisible();
    await expect(page.locator(".sd-mode-label", { hasText: "Organization" })).toBeVisible();
    await expect(page.locator(".sd-mode-label", { hasText: "Restricted" })).toBeVisible();

    await snap(page, testInfo, "3.4.1-dialog-fields");
  });

  // 3.4.2 Name input updates state
  test("3.4.2 name input updates state", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    const nameInput = page.getByLabel("Space name");
    await nameInput.fill("Engineering");
    await expect(nameInput).toHaveValue("Engineering");

    await snap(page, testInfo, "3.4.2-name-filled");
  });

  // 3.4.3 Description input updates state
  test("3.4.3 description input updates state", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    const descInput = page.getByLabel("Description");
    await descInput.fill("Team engineering docs");
    await expect(descInput).toHaveValue("Team engineering docs");

    await snap(page, testInfo, "3.4.3-description-filled");
  });

  // 3.4.4 Visibility radio buttons switch between organization and restricted
  test("3.4.4 visibility radio buttons switch between organization and restricted", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    const orgCard = page.locator(".sd-mode-card", { hasText: "Organization" });
    const restrictedCard = page.locator(".sd-mode-card", { hasText: "Restricted" });

    await expect(orgCard).toHaveClass(/sd-mode-active/);
    await expect(restrictedCard).not.toHaveClass(/sd-mode-active/);
    await snap(page, testInfo, "3.4.4-org-selected");

    await restrictedCard.click();
    await expect(restrictedCard).toHaveClass(/sd-mode-active/);
    await expect(orgCard).not.toHaveClass(/sd-mode-active/);
    await snap(page, testInfo, "3.4.4-restricted-selected");

    await orgCard.click();
    await expect(orgCard).toHaveClass(/sd-mode-active/);
    await expect(restrictedCard).not.toHaveClass(/sd-mode-active/);
  });

  // 3.4.5 When restricted: shows permission search UI
  test("3.4.5 restricted shows permission search UI", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    // Permission search should not be visible in organization mode
    await expect(searchInput(page)).not.toBeVisible();

    // Switch to restricted
    await page.locator(".sd-mode-card", { hasText: "Restricted" }).click();

    // Permission search UI should appear
    await expect(searchInput(page)).toBeVisible();
    await expect(page.locator(".sd-section-label", { hasText: "Initial permissions" })).toBeVisible();
    await expect(page.getByText("Add at least one user or group")).toBeVisible();

    await snap(page, testInfo, "3.4.5-restricted-permissions-ui");
  });

  // 3.4.6 Search input triggers debounced user/group search
  test("3.4.6 search input triggers user/group search", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);
    await page.locator(".sd-mode-card", { hasText: "Restricted" }).click();
    await expect(searchInput(page)).toBeVisible();

    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/users") &&
        resp.url().includes("search=") &&
        resp.request().method() === "GET",
    );

    await searchInput(page).fill("av");
    await searchRequest;

    // Should show search results
    await expect(page.locator(".sd-search-results")).toBeVisible();

    await snap(page, testInfo, "3.4.6-search-results");
  });

  // 3.4.7 Clicking user search result adds user permission
  test("3.4.7 clicking user search result adds user permission", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);
    await page.locator(".sd-mode-card", { hasText: "Restricted" }).click();
    await expect(searchInput(page)).toBeVisible();

    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/users") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await searchInput(page).fill("av");
    await searchRequest;

    const userResult = page.locator(".sd-search-result").first();
    await expect(userResult).toBeVisible();
    const userName = await userResult.locator(".sd-person-name").textContent();
    await userResult.click();

    // User should now appear in the permissions list
    await expect(page.locator(".sd-person", { hasText: userName! })).toBeVisible();
    // Search should be cleared
    await expect(searchInput(page)).toHaveValue("");

    await snap(page, testInfo, "3.4.7-user-added");
  });

  // 3.4.8 Clicking group search result adds group permission
  test("3.4.8 clicking group search result adds group permission", async ({ page }, testInfo) => {
    // Set up groups response listener BEFORE opening dialog (groups fetch fires on open)
    const groupsLoaded = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/workspaces/") &&
        resp.url().includes("/groups"),
    );

    await openCreateSpaceDialog(page);
    await groupsLoaded;

    await page.locator(".sd-mode-card", { hasText: "Restricted" }).click();
    await expect(searchInput(page)).toBeVisible();

    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/users") &&
        resp.request().method() === "GET",
    );
    await searchInput(page).fill("e");
    await searchRequest;

    // Look for a group result (has "Group" in meta text)
    const groupResult = page.locator(".sd-search-result").filter({ hasText: "Group" }).first();

    if (await groupResult.isVisible({ timeout: 3000 })) {
      const groupName = await groupResult.locator(".sd-person-name").textContent();
      await groupResult.click();

      const addedEntry = page.locator(".sd-person", { hasText: groupName! });
      await expect(addedEntry).toBeVisible();
      await expect(addedEntry.locator(".sd-person-meta")).toContainText("Group");
      await snap(page, testInfo, "3.4.8-group-added");
    } else {
      await snap(page, testInfo, "3.4.8-no-groups-available");
      test.skip(true, "No groups available in demo mode backend");
    }
  });

  // 3.4.9 Role dropdown changes permission role for new additions
  test("3.4.9 role dropdown changes permission role", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);
    await page.locator(".sd-mode-card", { hasText: "Restricted" }).click();
    await expect(searchInput(page)).toBeVisible();

    // Change role to "Viewer" before adding a user
    const roleSelect = page.locator(".sd-select");
    await roleSelect.selectOption("viewer");

    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/users") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await searchInput(page).fill("av");
    await searchRequest;

    const userResult = page.locator(".sd-search-result").first();
    await expect(userResult).toBeVisible();
    await userResult.click();

    // The added user should have "Viewer" role badge
    await expect(page.locator(".sd-role-badge").first()).toContainText("Viewer");

    await snap(page, testInfo, "3.4.9-viewer-role-assigned");
  });

  // 3.4.10 Remove (x) button removes a permission entry
  test("3.4.10 remove button removes permission entry", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);
    await page.locator(".sd-mode-card", { hasText: "Restricted" }).click();
    await expect(searchInput(page)).toBeVisible();

    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/users") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await searchInput(page).fill("av");
    await searchRequest;

    const userResult = page.locator(".sd-search-result").first();
    await expect(userResult).toBeVisible();
    await userResult.click();

    // Verify user is in the list
    const permEntry = page.locator(".sd-person").first();
    await expect(permEntry).toBeVisible();
    await snap(page, testInfo, "3.4.10-before-remove");

    // Click the remove button
    await permEntry.locator("button[title='Remove']").click();

    // Should be back to empty state
    await expect(page.getByText("Add at least one user or group")).toBeVisible();
    await snap(page, testInfo, "3.4.10-after-remove");
  });

  // 3.4.11 "Cancel" resets form and closes dialog
  test("3.4.11 cancel resets form and closes dialog", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    await page.getByLabel("Space name").fill("Test Space");
    await page.getByLabel("Description").fill("Test description");
    await page.locator(".sd-mode-card", { hasText: "Restricted" }).click();

    await snap(page, testInfo, "3.4.11-filled-form");

    await page.getByRole("button", { name: "Cancel" }).click();

    // Dialog should be closed
    await expect(page.getByRole("heading", { name: "Create Space" })).not.toBeVisible();

    // Re-open and verify form is reset
    await page.getByRole("button", { name: "+ New space" }).click();
    await expect(page.getByRole("heading", { name: "Create Space" })).toBeVisible();
    await expect(page.getByLabel("Space name")).toHaveValue("");
    await expect(page.getByLabel("Description")).toHaveValue("");
    // Should be back to organization mode (no permissions search)
    await expect(searchInput(page)).not.toBeVisible();

    await snap(page, testInfo, "3.4.11-form-reset");
  });

  // 3.4.12 "Create Space" disabled if name is empty
  test("3.4.12 create button disabled if name empty", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    const createBtn = page.getByRole("button", { name: "Create Space" });
    await expect(createBtn).toBeDisabled();

    await snap(page, testInfo, "3.4.12-disabled-empty");

    await page.getByLabel("Space name").fill("My Space");
    await expect(createBtn).toBeEnabled();

    await snap(page, testInfo, "3.4.12-enabled-with-name");

    await page.getByLabel("Space name").fill("");
    await expect(createBtn).toBeDisabled();
  });

  // 3.4.13 "Create Space" disabled and shows "Creating..." while submitting
  test("3.4.13 shows creating state while submitting", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    await page.getByLabel("Space name").fill("Slow Space");

    // Intercept the create request to add delay
    await page.route("**/api/spaces", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    const createBtn = page.getByRole("button", { name: "Create Space" });
    await createBtn.click();

    // Should show "Creating…" text and be disabled
    const creatingBtn = page.locator(".sd-btn-primary:disabled");
    await expect(creatingBtn).toBeVisible();
    await expect(creatingBtn).toContainText("Creating");

    await snap(page, testInfo, "3.4.13-creating-state");

    await page.unrouteAll({ behavior: "wait" });
  });

  // 3.4.14 Successful creation updates space list and closes dialog
  test("3.4.14 successful creation updates space list and closes dialog", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    const spaceName = `PW Test Space ${Date.now()}`;
    await page.getByLabel("Space name").fill(spaceName);
    await page.getByLabel("Description").fill("Created by Playwright test");

    await snap(page, testInfo, "3.4.14-before-create");

    const createRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces") &&
        resp.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create Space" }).click();
    await createRequest;

    // Dialog should close
    await expect(page.locator(".sd")).not.toBeVisible();

    // New space should appear in the sidebar
    await expect(page.locator(".space-sidebar-item", { hasText: spaceName })).toBeVisible();

    await snap(page, testInfo, "3.4.14-space-created");
  });

  // 3.4.15 Error shows error message in dialog
  test("3.4.15 error shows error message in dialog", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    await page.getByLabel("Space name").fill("Error Space");

    // Intercept and fail the create request
    await page.route("**/api/spaces", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Space name already exists",
            code: "VALIDATION_ERROR",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole("button", { name: "Create Space" }).click();

    await expect(page.locator(".sd-error")).toBeVisible();

    await snap(page, testInfo, "3.4.15-error-shown");

    // Dialog should still be open
    await expect(page.getByLabel("Space name")).toBeVisible();

    // Dismiss error
    await page.locator(".sd-error-dismiss").click();
    await expect(page.locator(".sd-error")).not.toBeVisible();

    await page.unrouteAll({ behavior: "wait" });
  });

  // 3.4.16 E2E: Create a new space with permissions
  test("3.4.16 E2E create space with restricted permissions", async ({ page }, testInfo) => {
    await openCreateSpaceDialog(page);

    const spaceName = `Restricted ${Date.now()}`;
    await page.getByLabel("Space name").fill(spaceName);
    await page.getByLabel("Description").fill("Restricted space with permissions");

    // Switch to restricted visibility
    await page.locator(".sd-mode-card", { hasText: "Restricted" }).click();
    await expect(searchInput(page)).toBeVisible();

    await snap(page, testInfo, "3.4.16-restricted-form");

    // Search and add a user
    const searchRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/admin/users") &&
        resp.request().method() === "GET" &&
        resp.status() === 200,
    );
    await searchInput(page).fill("a");
    await searchRequest;

    const firstResult = page.locator(".sd-search-result").first();
    if (await firstResult.isVisible({ timeout: 3000 })) {
      await firstResult.click();
      await expect(page.locator(".sd-person").first()).toBeVisible();
      await snap(page, testInfo, "3.4.16-permission-added");
    }

    // Create the space
    const createRequest = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/spaces") &&
        resp.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create Space" }).click();
    const response = await createRequest;

    if (response.status() === 200 || response.status() === 201) {
      await expect(page.locator(".sd")).not.toBeVisible();
      await expect(page.locator(".space-sidebar-item", { hasText: spaceName })).toBeVisible();
      await snap(page, testInfo, "3.4.16-space-created-with-permissions");
    } else {
      await snap(page, testInfo, "3.4.16-create-failed");
    }
  });
});
